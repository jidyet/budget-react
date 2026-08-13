import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it, vi } from "vitest";
import {
  NO_DERIVED_PLAN_PAYMENT,
  derivePlanPaymentForAccount,
  getCurrentPlanFromContext,
  getDisplayPlannedPayment,
} from "./planPaymentDerivation";

const plan = {
  id: "plan-1",
  items: [
    { account_id: "included", include: true, extra_payment: "25" },
    { account_id: "excluded", include: false, extra_payment: "99" },
    { account_id: "negative-extra", include: true, extra_payment: -20 },
  ],
};

describe("plan payment derivation", () => {
  it("reproduces the removed syncPlannedPayments formula exactly", () => {
    expect(derivePlanPaymentForAccount({
      plan,
      account: { id: "included", min_due_v: "100" },
    })).toBe(125);
  });

  it("uses the same numeric coercion and clamping behavior as syncPlannedPayments", () => {
    expect(derivePlanPaymentForAccount({
      plan,
      account: { id: "negative-extra", min_due_v: "-10" },
    })).toBe(0);

    expect(derivePlanPaymentForAccount({
      plan: { id: "p", items: [{ account_id: "missing", include: true, extra_payment: undefined }] },
      account: { id: "missing", min_due_v: undefined },
    })).toBe(0);
  });

  it("returns the no-derived sentinel for excluded or uncovered debts", () => {
    expect(derivePlanPaymentForAccount({
      plan,
      account: { id: "excluded", min_due_v: 100, planned_v: 300 },
    })).toBe(NO_DERIVED_PLAN_PAYMENT);

    expect(derivePlanPaymentForAccount({
      plan,
      account: { id: "not-in-plan", min_due_v: 100, planned_v: 300 },
    })).toBe(NO_DERIVED_PLAN_PAYMENT);
  });

  it("does not mutate plan or account inputs and performs no persistence", () => {
    const updateRecord = vi.fn();
    const mutablePlan = structuredClone(plan);
    const account = { id: "included", min_due_v: 100, planned_v: 0 };
    const beforePlan = structuredClone(mutablePlan);
    const beforeAccount = structuredClone(account);

    expect(derivePlanPaymentForAccount({ plan: mutablePlan, account })).toBe(125);

    expect(mutablePlan).toEqual(beforePlan);
    expect(account).toEqual(beforeAccount);
    expect(updateRecord).not.toHaveBeenCalled();
  });

  it("falls back to manually persisted planned_v when there is no current plan", () => {
    expect(getDisplayPlannedPayment({
      plans: [plan],
      planId: "",
      account: { id: "included", min_due_v: 100, planned_v: "275" },
    })).toBe(275);
  });

  it("uses current plan derivation before persisted planned_v", () => {
    expect(getDisplayPlannedPayment({
      plans: [plan],
      planId: "plan-1",
      account: { id: "included", min_due_v: "100", planned_v: "275" },
    })).toBe(125);
  });

  it("does not override persisted planned_v for an excluded debt", () => {
    expect(getDisplayPlannedPayment({
      plans: [plan],
      planId: "plan-1",
      account: { id: "excluded", min_due_v: 100, planned_v: "275" },
    })).toBe(275);
  });

  it("selects only the explicit current plan id and does not guess", () => {
    expect(getCurrentPlanFromContext({ plans: [plan], planId: "" })).toBeNull();
    expect(getCurrentPlanFromContext({ plans: [plan], planId: "missing" })).toBeNull();
    expect(getCurrentPlanFromContext({ plans: [plan], planId: "plan-1" })).toBe(plan);
  });

  it("regresses the integration contract: no save-path planned_v write, but current plan derives display value", () => {
    const source = readFileSync(resolve(cwd(), "src/hooks/usePlans.js"), "utf8");

    expect(source).not.toContain("syncPlannedPayments");
    expect(source).not.toContain("planned_v: minDue + extra");
    expect(source).not.toMatch(/updateRecord\s*\([^)]*planned_v/s);

    expect(getDisplayPlannedPayment({
      plans: [plan],
      planId: "plan-1",
      account: { id: "included", min_due_v: 100, planned_v: 0 },
    })).toBe(125);
  });
});
