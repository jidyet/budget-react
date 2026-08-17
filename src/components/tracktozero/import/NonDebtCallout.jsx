import React, { useState } from "react";
import Card from "../ui/Card.jsx";
import Button from "../ui/Button.jsx";
import { TYPE_SCALE, ttzPalette } from "../theme.js";

const TYPE_LABELS = {
  UTILITY: "Utilities",
  SUBSCRIPTION: "Subscriptions",
  INSURANCE: "Insurance",
  HOME_EXPENSE: "Home expenses",
  STORAGE_EXPENSE: "Storage",
  SAVINGS: "Savings",
  INCOME: "Income",
  BILL_OR_RECURRING_EXPENSE: "Other bills",
  HEADER_OR_SECTION: "Section headers",
  SUBTOTAL_OR_SUMMARY: "Subtotals",
  UNKNOWN: "Unclear",
};

// UX-6.1: the highest-leverage requirement in this phase - DATA-2 already
// classifies non-debt rows (utilities/subscriptions/insurance/savings/
// income/etc.) instead of silently dropping or misfiling them, but until
// now nothing in the product ever showed the user that work. "TrackToZero
// understood them. They're simply outside the debt product" - never called
// "failed." Classification is never irreversible: "Add as debt instead"
// deep-links into AddDebtModal with the item's label pre-filled, letting
// the human override DATA-2's read without any pipeline surgery.
export default function NonDebtCallout({ nonDebtItems = [], onAddAsDebt }) {
  const [expanded, setExpanded] = useState(false);
  const palette = ttzPalette;
  if (!nonDebtItems.length) return null;

  const byType = new Map();
  for (const item of nonDebtItems) {
    const type = item.financialItemType || "UNKNOWN";
    byType.set(type, (byType.get(type) || 0) + 1);
  }

  return (
    <Card variant="default" style={{ borderStyle: "dashed" }}>
      <p style={{ ...TYPE_SCALE.cardTitle, color: palette.tx, margin: "0 0 4px" }}>Not debt — we won&apos;t add these</p>
      <p style={{ ...TYPE_SCALE.supporting, color: palette.tx2, margin: "0 0 10px" }}>
        We recognized these items in your file, but TrackToZero only tracks debt payoff.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px", marginBottom: 10 }}>
        {[...byType.entries()].map(([type, count]) => (
          <div key={type} style={{ ...TYPE_SCALE.supporting, color: palette.tx }}>
            {TYPE_LABELS[type] || type} <strong>{count}</strong>
          </div>
        ))}
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded((state) => !state)}>
        {expanded ? "Hide items" : "View excluded items"}
      </Button>
      {expanded ? (
        <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
          {nonDebtItems.map((item, index) => (
            <div key={`${item.sheetIndex}-${item.row}-${index}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: "var(--ttz-radius-sm, 8px)", background: palette.surf2 }}>
              <span style={{ ...TYPE_SCALE.supporting, color: palette.tx }}>{item.label}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>{TYPE_LABELS[item.financialItemType] || item.financialItemType}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => onAddAsDebt?.(item.label)}>This should be a debt</Button>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
