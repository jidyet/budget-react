import { describe, expect, it } from "vitest";
import { debtToEngineAccount } from "./tracktozeroCalcAdapter.js";

const debt = (overrides = {}) => ({
  id: "d1",
  name: "Capital One Card",
  currentBalance: 2400,
  minimumRequiredPayment: 85,
  apr: 0.2499,
  aprStatus: "known",
  ...overrides,
});

describe("GATE-10B.1D: debtToEngineAccount minimumPaymentRule/aprStatus pass-through", () => {
  it("carries minimumPaymentRule through unchanged when present", () => {
    const rule = { ruleType: "percentage_of_balance", percentageComponent: 0.02 };
    const account = debtToEngineAccount(debt({ minimumPaymentRule: rule }));
    expect(account.minimumPaymentRule).toBe(rule);
  });

  it("defaults minimumPaymentRule to null when the debt has none", () => {
    const account = debtToEngineAccount(debt({ minimumPaymentRule: undefined }));
    expect(account.minimumPaymentRule).toBeNull();
  });

  it("carries aprStatus through unchanged", () => {
    const account = debtToEngineAccount(debt({ aprStatus: "promotional" }));
    expect(account.aprStatus).toBe("promotional");
  });

  it("defaults aprStatus to 'unknown' when missing, matching the rest of the mapping's own unknown-APR convention", () => {
    const account = debtToEngineAccount(debt({ aprStatus: undefined }));
    expect(account.aprStatus).toBe("unknown");
  });

  it("does not change any pre-existing field in the mapped shape", () => {
    const account = debtToEngineAccount(debt());
    expect(account).toMatchObject({
      id: "d1",
      name: "Capital One Card",
      cur_bal: 2400,
      min_due_v: 85,
      planned_v: 0,
      paid_v: 0,
      apr_v: 0.2499,
      promo_apr: null,
      promo_until: "",
      apr_after_promo: 0.2499,
    });
  });
});
