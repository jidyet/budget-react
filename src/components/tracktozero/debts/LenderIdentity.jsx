import React from "react";
import { ttzPalette, TYPE_SCALE } from "../theme.js";
import { DEBT_TYPE_OPTIONS } from "./debtCategoryConfig.js";
import { getLenderIdentity } from "../../../domain/tracktozero/lenderRegistry.js";

const DEBT_TYPE_LABELS = new Map(DEBT_TYPE_OPTIONS);

const SIZES = {
  sm: { badge: 24, fontSize: 10, gap: 8, name: TYPE_SCALE.caption },
  md: { badge: 34, fontSize: 12, gap: 10, name: TYPE_SCALE.body },
  lg: { badge: 48, fontSize: 15, gap: 12, name: TYPE_SCALE.cardTitle },
};

// UX-8.3: the ONE place a debt's lender is recognized and presented -
// Home/Debts/Plan/Review/Activity all render through this component instead
// of each re-deriving canonical-name/logo/fallback logic. Deliberately
// takes plain display fields (never a Debt object or the full debts array)
// so it stays a pure presentation leaf; any duplicate-name disambiguation
// is computed by the caller via disambiguationSuffixForDebt (ownership.js)
// exactly as PayoffOrderList already does, and passed in as `disambiguator`
// - this component never re-implements that logic.
//
// No <img> is ever rendered in this phase (see lenderRegistry.js's
// logoAsset: null - "Logo Sourcing" in the UX-8.3 results doc) - every
// lender, recognized or not, shows the same neutral initials badge.
//
// showName controls whether the canonical name renders as its own visible
// text block (the default, used everywhere the name isn't already present
// in surrounding copy). Activity entries already compose a full sentence
// containing the debt's name ("Bank of America balance confirmed") - there,
// callers pass showName={false} so only the badge renders, and the badge
// itself carries the accessible name (role="img" aria-label) instead of
// being decorative, so a screen reader still gets exactly one announcement
// of the lender name, never zero and never two.
export default function LenderIdentity({ creditorName, debtType, lastFour, disambiguator = "", size = "md", showType = false, showName = true }) {
  const identity = getLenderIdentity(creditorName);
  const dims = SIZES[size] || SIZES.md;
  const typeLabel = showType ? DEBT_TYPE_LABELS.get(debtType) : "";
  const secondaryParts = [typeLabel, lastFour ? `••••${lastFour}` : ""].filter(Boolean);

  const badge = (
    <span
      {...(showName ? { "aria-hidden": "true" } : { role: "img", "aria-label": identity.canonicalName })}
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: dims.badge,
        height: dims.badge,
        borderRadius: 10,
        background: ttzPalette.surf2,
        border: `1px solid ${ttzPalette.border}`,
        color: ttzPalette.tx2,
        fontWeight: 700,
        fontSize: dims.fontSize,
        letterSpacing: 0.5,
      }}
    >
      {identity.initials}
    </span>
  );

  if (!showName) return badge;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: dims.gap, minWidth: 0 }}>
      {badge}
      <div style={{ minWidth: 0, display: "grid", gap: 2 }}>
        <div style={{ ...dims.name, color: ttzPalette.tx, fontWeight: dims.name.fontWeight || 600, overflowWrap: "break-word" }}>
          {identity.canonicalName}
          {disambiguator ? <span style={{ color: ttzPalette.tx2, fontWeight: 500 }}> ({disambiguator})</span> : null}
        </div>
        {secondaryParts.length ? (
          <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>{secondaryParts.join(" · ")}</div>
        ) : null}
      </div>
    </div>
  );
}
