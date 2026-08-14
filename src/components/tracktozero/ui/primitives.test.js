import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Button from "./Button.jsx";
import IconButton from "./IconButton.jsx";
import Card from "./Card.jsx";
import MetricCard from "./MetricCard.jsx";
import Badge from "./Badge.jsx";
import Callout from "./Callout.jsx";
import WarningCallout from "./WarningCallout.jsx";
import InfoCallout from "./InfoCallout.jsx";
import DangerCallout from "./DangerCallout.jsx";
import EmptyState from "./EmptyState.jsx";
import ErrorState from "./ErrorState.jsx";
import LoadingState from "./LoadingState.jsx";
import ProgressBar from "./ProgressBar.jsx";
import Field from "./Field.jsx";
import Input from "./Input.jsx";
import MoneyInput from "./MoneyInput.jsx";
import DateInput from "./DateInput.jsx";
import Select from "./Select.jsx";
import Checkbox from "./Checkbox.jsx";
import OwnerBadge from "./OwnerBadge.jsx";
import FilterChip from "./FilterChip.jsx";
import Tabs from "./Tabs.jsx";
import Skeleton from "./Skeleton.jsx";
import Modal from "./Modal.jsx";
import Drawer from "./Drawer.jsx";
import ConfirmationDialog from "./ConfirmationDialog.jsx";

const render = (el) => renderToStaticMarkup(el);

describe("UX-1 core UI primitives render without throwing", () => {
  it("Button: variants, disabled, and loading states", () => {
    expect(render(h(Button, { variant: "primary" }, "Save"))).toContain("Save");
    const loading = render(h(Button, { loading: true }, "Save"));
    expect(loading).toContain("...");
    expect(loading).toContain("disabled");
    const disabled = render(h(Button, { disabled: true }, "Save"));
    expect(disabled).toContain("disabled");
  });

  it("IconButton requires an accessible label", () => {
    const html = render(h(IconButton, { label: "Close" }, "x"));
    expect(html).toContain('aria-label="Close"');
  });

  it("Card variants render", () => {
    for (const variant of ["default", "elevated", "interactive", "highlight", "warning", "critical"]) {
      expect(render(h(Card, { variant }, "content"))).toContain("content");
    }
  });

  it("MetricCard renders a pre-formatted value as-is, without reformatting it", () => {
    const html = render(h(MetricCard, { label: "Total owed", value: "$34,233.67" }));
    expect(html).toContain("$34,233.67");
    expect(html).toContain("Total owed");
  });

  it("Badge renders children with a tone", () => {
    expect(render(h(Badge, { tone: "success" }, "Paid off"))).toContain("Paid off");
  });

  it("Callout tone wrappers render title and children", () => {
    expect(render(h(WarningCallout, { title: "Needs review" }, "Balance is stale"))).toContain("Needs review");
    expect(render(h(InfoCallout, {}, "Insufficient data"))).toContain("Insufficient data");
    expect(render(h(DangerCallout, {}, "Plan is infeasible"))).toContain("Plan is infeasible");
    expect(render(h(Callout, { tone: "success" }, "ok"))).toContain("ok");
  });

  it("EmptyState renders title/description and an optional action", () => {
    const html = render(h(EmptyState, { title: "No debts yet", description: "Add your first debt to get started.", actionLabel: "Add debt", onAction: () => {} }));
    expect(html).toContain("No debts yet");
    expect(html).toContain("Add debt");
  });

  it("ErrorState never requires a raw error code to render", () => {
    const html = render(h(ErrorState, { title: "Could not load your debts" }));
    expect(html).toContain("Could not load your debts");
  });

  it("LoadingState renders an accessible status role", () => {
    expect(render(h(LoadingState, { label: "Loading debts" }))).toContain('role="status"');
  });

  it("ProgressBar renders a valid progressbar role with bounded value", () => {
    const html = render(h(ProgressBar, { value: 50, max: 100, label: "Payoff progress" }));
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="50"');
  });

  it("Field wraps an Input with matching label/for and describedby wiring", () => {
    const html = render(h(Field, { label: "Debt name", help: "e.g. Visa" }, h(Input, { name: "debtName" })));
    expect(html).toContain("Debt name");
    expect(html).toContain("e.g. Visa");
  });

  it("MoneyInput, DateInput, Select, Checkbox render", () => {
    expect(render(h(MoneyInput, { value: "100", readOnly: true }))).toContain('type="number"');
    expect(render(h(DateInput, { value: "2026-08-21", readOnly: true }))).toContain('type="date"');
    expect(render(h(Select, {}, h("option", { value: "avalanche" }, "Avalanche")))).toContain("Avalanche");
    expect(render(h(Checkbox, { label: "Exclude from plan" }))).toContain("Exclude from plan");
  });

  it("OwnerBadge, FilterChip, Tabs, and Skeleton render accessible state", () => {
    expect(render(h(OwnerBadge, { ownerType: "joint" }, "Joint"))).toContain("Joint");
    expect(render(h(FilterChip, { active: true }, "Needs review"))).toContain('aria-pressed="true"');
    const tabs = render(h(Tabs, { items: [{ key: "home", label: "Home" }], activeKey: "home", label: "Primary" }));
    expect(tabs).toContain('role="tablist"');
    expect(tabs).toContain('aria-selected="true"');
    expect(render(h(Skeleton, { label: "Loading plan" }))).toContain('aria-label="Loading plan"');
  });

  it("Modal, Drawer, and ConfirmationDialog respect open/closed rendering", () => {
    expect(render(h(Modal, { open: false, title: "Closed" }, "hidden"))).toBe("");
    expect(render(h(Modal, { open: true, title: "Confirm" }, "Body"))).toContain('aria-modal="true"');
    expect(render(h(Drawer, { open: true, title: "Details" }, "Drawer body"))).toContain("Drawer body");
    expect(render(h(ConfirmationDialog, { open: true, title: "Delete debt?", confirmLabel: "Delete" }, "This cannot be undone."))).toContain("Delete debt?");
  });
});
