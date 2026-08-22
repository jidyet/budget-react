import React from "react";
import { ttzPalette, TYPE_SCALE } from "../../theme.js";
import { formatMoney as money, formatPercent as percent } from "../../formatting.js";
import { disambiguationSuffixForDebt, presentedOwnerLabel } from "../../../../domain/tracktozero/ownership.js";
import LenderIdentity from "../../debts/LenderIdentity.jsx";
import Badge from "../../ui/Badge.jsx";
import MomentumDots from "./MomentumDots.jsx";
import { useIsMobile } from "../../useViewport.js";

// GATE-10B.1E: replaces the old numbered-card PayoffOrderList with the
// referenced table (# / Debt+Lender / Owner / Balance / APR / Payoff
// timing). Real lender logos come from LenderIdentity (already wired to
// lenderRegistry.js's bundled marks - no new asset work). The Payoff
// timing column only renders a real date when perDebt (from
// payoffSimulateDetailed, via a detailed:true preview call) is actually
// supplied - GATE-10B.1D made a genuine per-debt zero-crossing date
// possible; before that, this column would have been fabricated, which is
// exactly why the old PayoffOrderList's own comment said it could never show
// one. Falls back to "-" (never a guessed date) when perDebt has no entry.
export default function PayoffOrderTable({ debts = [], isHousehold = false, highlightFirst = false, perDebt = {}, showPayoffTiming = true, showMomentum = false }) {
  const palette = ttzPalette;
  const isMobile = useIsMobile();
  if (!debts.length) return <p style={{ ...TYPE_SCALE.body, color: palette.tx2 }}>No debts included in this preview.</p>;

  const thStyle = { textAlign: "left", padding: "10px 12px", ...TYPE_SCALE.overline, color: palette.tx2, borderBottom: `1px solid ${palette.border}` };
  const tdStyle = { padding: "12px", ...TYPE_SCALE.body, color: palette.tx, borderBottom: `1px solid ${palette.border}`, verticalAlign: "middle" };

  // Tables are useful at desktop width, but reducing seven financial columns
  // into a 360px viewport makes names wrap character-by-character. On phones
  // we keep the same facts in a scan-friendly debt card instead of asking the
  // user to pinch, horizontally scroll, or read clipped values.
  if (isMobile) {
    return <PayoffOrderMobileList debts={debts} isHousehold={isHousehold} highlightFirst={highlightFirst} perDebt={perDebt} showPayoffTiming={showPayoffTiming} showMomentum={showMomentum} />;
  }

  return (
    <div style={{ overflowX: "auto hidden" }}>
      <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: showMomentum ? 0 : 520, tableLayout: "fixed" }}>
        <thead>
          <tr>
            <th style={thStyle}>#</th>
            <th style={thStyle}>Debt / Lender</th>
            {isHousehold ? <th style={thStyle}>Owner</th> : null}
            <th style={thStyle}>Balance</th>
            <th style={thStyle}>APR</th>
            {showPayoffTiming ? <th style={thStyle}>Payoff timing</th> : null}
            {showMomentum ? <th style={thStyle}>Momentum</th> : null}
          </tr>
        </thead>
        <tbody>
          {debts.map((debt, index) => {
            const isFirst = highlightFirst && index === 0;
            const suffix = disambiguationSuffixForDebt(debt, debts, { isHousehold });
            const timing = perDebt[debt.id]?.payoffMonth;
            return (
              <tr key={debt.id} style={{ background: isFirst ? palette.acS : "transparent" }}>
                <td style={tdStyle}>
                  <span
                    aria-hidden="true"
                    style={{
                      display: "inline-grid", placeItems: "center", width: 24, height: 24, borderRadius: 999,
                      background: isFirst ? palette.ac : palette.surf2, color: isFirst ? "#fff" : palette.tx2,
                      fontWeight: 700, fontSize: 12,
                    }}
                  >
                    {index + 1}
                  </span>
                </td>
                <td style={tdStyle}><LenderIdentity creditorName={debt.name} disambiguator={suffix} size="sm" /></td>
                {isHousehold ? <td style={tdStyle}><Badge tone="neutral">{presentedOwnerLabel(debt)}</Badge></td> : null}
                <td style={tdStyle}>{money(debt.currentBalance || 0)}</td>
                <td style={tdStyle}>{debt.aprStatus === "unknown" ? "Unknown APR" : percent(debt.apr)}</td>
                {showPayoffTiming ? <td style={tdStyle}>{timing || "-"}</td> : null}
                {showMomentum ? <td style={tdStyle}><MomentumDots index={index} total={debts.length} /></td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function PayoffOrderMobileList({ debts, isHousehold, highlightFirst, perDebt, showPayoffTiming, showMomentum }) {
  const palette = ttzPalette;
  return (
    <div aria-label="Payoff order" style={{ display: "grid", gap: 10 }}>
      {debts.map((debt, index) => {
        const isFirst = highlightFirst && index === 0;
        const suffix = disambiguationSuffixForDebt(debt, debts, { isHousehold });
        const timing = perDebt[debt.id]?.payoffMonth;
        const factCount = 2 + (showPayoffTiming ? 1 : 0) + (showMomentum ? 1 : 0);
        return (
          <article
            key={debt.id}
            style={{
              display: "grid",
              gap: 12,
              padding: 12,
              border: `1px solid ${isFirst ? palette.ac : palette.border}`,
              borderRadius: 14,
              background: isFirst ? palette.acS : palette.surf,
              minWidth: 0,
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "28px minmax(0, 1fr) auto", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span aria-hidden="true" style={{ display: "inline-grid", placeItems: "center", width: 24, height: 24, borderRadius: 999, background: isFirst ? palette.ac : palette.surf2, color: isFirst ? "#fff" : palette.tx2, fontWeight: 700, fontSize: 12 }}>{index + 1}</span>
              <div style={{ minWidth: 0, overflow: "hidden" }}><LenderIdentity creditorName={debt.name} disambiguator={suffix} size="sm" /></div>
              {isHousehold ? <Badge tone="neutral">{presentedOwnerLabel(debt)}</Badge> : null}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: factCount === 4 ? "repeat(2, minmax(0, 1fr))" : `repeat(${factCount}, minmax(0, 1fr))`, gap: 8 }}>
              <MobileFact label="Balance" value={money(debt.currentBalance || 0)} palette={palette} />
              <MobileFact label="APR" value={debt.aprStatus === "unknown" ? "Unknown" : percent(debt.apr)} palette={palette} />
              {showPayoffTiming ? <MobileFact label="Payoff" value={timing || "—"} palette={palette} /> : null}
              {showMomentum ? <MobileFact label="Momentum" value={<MomentumDots index={index} total={debts.length} />} palette={palette} /> : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function MobileFact({ label, value, palette }) {
  return (
    <div style={{ minWidth: 0, display: "grid", gap: 4 }}>
      <div style={{ ...TYPE_SCALE.caption, color: palette.tx2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      <div style={{ ...TYPE_SCALE.body, color: palette.tx, fontWeight: 750, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}
