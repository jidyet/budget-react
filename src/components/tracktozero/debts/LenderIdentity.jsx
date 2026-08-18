import React, { useState } from "react";
import { ttzPalette, TYPE_SCALE } from "../theme.js";
import { DEBT_TYPE_OPTIONS } from "./debtCategoryConfig.js";
import { getLenderIdentity } from "../../../domain/tracktozero/lenderRegistry.js";

const DEBT_TYPE_LABELS = new Map(DEBT_TYPE_OPTIONS);

const SIZES = {
  sm: { badge: 32, fontSize: 12, gap: 8, name: TYPE_SCALE.caption },
  md: { badge: 48, fontSize: 15, gap: 10, name: TYPE_SCALE.body },
  lg: { badge: 64, fontSize: 19, gap: 12, name: TYPE_SCALE.cardTitle },
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
// UX-8.4: renders a real local lender wordmark (see lenderRegistry.js's
// logoAsset, sourced only from verified, locally-bundled assets - never a
// remote URL, see src/assets/lenders/PROVENANCE.md) when one exists for the
// matched lender; every other lender (unmatched, or matched but without a
// verified asset) falls back to the UX-8.3 neutral initials badge. The
// FRAME (size/background/border/radius) is identical either way - only the
// content inside it changes - so real logos with inconsistent aspect
// ratios never distort the surrounding layout. object-fit: contain keeps
// artwork proportions intact (never stretched or cropped). If a bundled
// asset ever fails to decode, onError flips this instance to the initials
// fallback - a broken-image icon is never shown.
//
// showName controls whether the canonical name renders as its own visible
// text block (the default, used everywhere the name isn't already present
// in surrounding copy). Activity entries already compose a full sentence
// containing the debt's name ("Bank of America balance confirmed") - there,
// callers pass showName={false} so only the badge renders. When a real logo
// image renders standalone, the image itself carries the accessible name
// (native alt text); when the initials fallback renders standalone, the
// span carries role="img"/aria-label instead - either way, a screen reader
// gets exactly one announcement of the lender name, never zero and never two.
//
// layout="row" (default) places the badge beside the name, for compact/
// inline contexts (Plan rows, Activity, Debt Edit header). layout="column"
// stacks the badge above the name so a larger logo has room to be genuinely
// recognizable without the name text competing for horizontal space next to
// it - used for card-style contexts (Debt Explorer cards) where the logo is
// meant to be the primary visual anchor.
export default function LenderIdentity({ creditorName, debtType, lastFour, disambiguator = "", size = "md", showType = false, showName = true, layout = "row" }) {
  const identity = getLenderIdentity(creditorName);
  const [imageFailed, setImageFailed] = useState(false);
  const dims = SIZES[size] || SIZES.md;
  const typeLabel = showType ? DEBT_TYPE_LABELS.get(debtType) : "";
  const secondaryParts = [typeLabel, lastFour ? `••••${lastFour}` : ""].filter(Boolean);
  const useLogo = !!identity.logoAsset && !imageFailed;

  // UX-8.4: real logos render on a plain white plate with a light shadow
  // instead of the tinted/bordered initials-badge treatment - direct
  // feedback was that the muted surf2 background + border + heavy padding
  // made real marks look dull and cramped. The initials fallback keeps its
  // original tinted/bordered look (it still needs a visible container to
  // read as intentional, since there's no artwork filling the frame).
  const badge = (
    <span
      {...(useLogo ? {} : (showName ? { "aria-hidden": "true" } : { role: "img", "aria-label": identity.canonicalName }))}
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: dims.badge,
        height: dims.badge,
        borderRadius: 10,
        background: useLogo ? "#ffffff" : ttzPalette.surf2,
        border: useLogo ? "1px solid rgba(15, 23, 42, 0.08)" : `1px solid ${ttzPalette.border}`,
        boxShadow: useLogo ? "0 1px 3px rgba(15, 23, 42, 0.10)" : "none",
        color: ttzPalette.tx2,
        fontWeight: 700,
        fontSize: dims.fontSize,
        letterSpacing: 0.5,
        padding: useLogo ? Math.round(dims.badge * 0.08) : 0,
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {useLogo ? (
        <img
          src={identity.logoAsset}
          alt={showName ? "" : identity.canonicalName}
          onError={() => setImageFailed(true)}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      ) : (
        identity.initials
      )}
    </span>
  );

  if (!showName) return badge;

  return (
    <div style={{ display: "flex", flexDirection: layout === "column" ? "column" : "row", alignItems: layout === "column" ? "flex-start" : "center", gap: dims.gap, minWidth: 0 }}>
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
