import { useEffect, useState } from "react";
import { fx, moneyFieldLabel } from "../utils/budgetUtils";

const normalizeAprDecimal = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return numeric > 1 ? numeric / 100 : numeric;
};

const normalizeMonthInput = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/^(\d{4})-(\d{2})$/);
  if (match) return raw;
  const alt = raw.match(/^(\d{1,2})\/(\d{4})$/);
  if (alt) return `${alt[2]}-${alt[1].padStart(2, "0")}`;
  return "";
};

export default function EditPanel({ a, theme, allCategories, onSave, onClose }) {
  const baseBalance = Number(a.base_bal_v ?? Number(a.cur_bal ?? 0) + Number(a.paid_v ?? 0) - Number(a.purch_v ?? 0));
  const aprDecimal = normalizeAprDecimal(a.apr_v ?? a.apr ?? 0);
  const promoAprDecimal = normalizeAprDecimal(a.promo_apr ?? 0);
  const aprAfterPromoDecimal = normalizeAprDecimal(a.apr_after_promo ?? a.apr ?? 0);

  const buildInitialVals = () => ({
    min_due_v: String(a.min_due_v ?? 0),
    planned_v: String(a.planned_v ?? 0),
    paid_v: String(a.paid_v ?? 0),
    cur_bal: String(a.cur_bal ?? 0),
    purch_v: String(a.purch_v ?? 0),
    interest_paid_v: String(a.interest_paid_v ?? 0),
    apr_pct: String((aprDecimal * 100).toFixed(4).replace(/\.?0+$/, "") || "0"),
    // account metadata
    category: String(a.category ?? ""),
    due_day: String(a.due_day ?? 0),
    interest_type: String(a.interest_type ?? "variable_apr"),
    promo_apr_pct: String((promoAprDecimal * 100).toFixed(4).replace(/\.?0+$/, "") || "0"),
    promo_until: normalizeMonthInput(a.promo_until ?? ""),
    apr_after_promo_pct: String((aprAfterPromoDecimal * 100).toFixed(4).replace(/\.?0+$/, "") || "0"),
  });

  const [vals, setVals] = useState(buildInitialVals);
  const [manualBalEdited, setManualBalEdited] = useState(false);

  const projectedBal = Math.max(0, baseBalance - (Number(vals.paid_v) || 0) + (Number(vals.purch_v) || 0));
  const effectiveCurBal = manualBalEdited ? vals.cur_bal : projectedBal.toFixed(2);
  const currentAprDec = (parseFloat(vals.apr_pct) || 0) / 100;
  const plannedAmount = Number(vals.planned_v) || 0;
  const actualPaidAmount = Number(vals.paid_v) || 0;
  // Breakdown always shows planned; actual only affects balance when explicitly set
  const breakdownPayment = plannedAmount > 0 ? plannedAmount : actualPaidAmount;
  const monthlyInterest = (currentAprDec / 12) * (Number(effectiveCurBal) || 0);
  const interestApplied = Math.min(breakdownPayment, monthlyInterest);
  const principalApplied = Math.max(0, breakdownPayment - interestApplied);
  const minCoversInterest = (Number(vals.min_due_v) || 0) >= monthlyInterest;

  const D = theme === "dark";
  const c = {
    surf:    D ? "#122235" : "#f7fbff",
    border2: D ? "#294462" : "#c4d6ee",
    surf2:   D ? "#0a1626" : "#ffffff",
    tx:      D ? "#eaf3ff" : "#0f1a2b",
    muted:   D ? "#8aa0bd" : "#6b7f99",
    ac:      "#14d7b6",
    amber:   D ? "#ffb347" : "#c07000",
    red:     D ? "#ff6b6b" : "#c0392b",
    green:   D ? "#4ade80" : "#15803d",
  };

  const inp = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 7,
    border: `1.5px solid ${c.border2}`,
    background: c.surf2,
    color: c.tx,
    fontSize: 16,
    fontFamily: "'DM Mono',monospace",
    outline: "none",
    boxSizing: "border-box",
  };

  const sel = {
    ...inp,
    fontSize: 14,
    fontFamily: "'Instrument Sans',sans-serif",
    cursor: "pointer",
    appearance: "auto",
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const updateField = (key, value) => {
    setVals((v) => ({ ...v, [key]: value }));
    if (key === "cur_bal") setManualBalEdited(true);
  };

  // recordFields no longer used — replaced by structured sections below

  const sectionLabel = (text) => (
    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 3, fontFamily: "'Instrument Sans',sans-serif" }}>
      {text}
    </div>
  );

  const promoUntilNormalized = normalizeMonthInput(vals.promo_until);
  const promoUntilValid = !vals.promo_until.trim() || !!promoUntilNormalized;

  return (
    <div style={{ marginTop: 8, padding: "12px 14px", borderRadius: 10, background: c.surf, border: `1px solid ${c.border2}` }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, fontFamily: "'Instrument Sans',sans-serif" }}>
          Edit values
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ padding: "10px 16px", borderRadius: 6, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 14, fontWeight: 700, cursor: "pointer", minHeight: 44 }}
        >
          Close
        </button>
      </div>

      {/* ── Payment fields ── */}
      <div style={{ borderRadius: 8, border: `1px solid ${c.border2}`, background: c.surf2, padding: "10px 12px", marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 10, fontFamily: "'Instrument Sans',sans-serif" }}>
          Payments
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <div>
            {sectionLabel(moneyFieldLabel("Minimum Due"))}
            <input type="number" step="0.01" style={inp} value={vals.min_due_v} onChange={(e) => updateField("min_due_v", e.target.value)} />
            <div style={{ fontSize: 10, color: c.muted, marginTop: 3 }}>Required by lender — constant</div>
          </div>
          <div>
            {sectionLabel(moneyFieldLabel("Planned Payment"))}
            <input type="number" step="0.01" style={{ ...inp, color: c.ac }} value={vals.planned_v} onChange={(e) => updateField("planned_v", e.target.value)} />
            <div style={{ fontSize: 10, color: c.muted, marginTop: 3 }}>What you intend to pay — drives projections</div>
          </div>
        </div>
        <div>
          {sectionLabel(moneyFieldLabel("Actual Paid (optional)"))}
          <input type="number" step="0.01" style={{ ...inp, color: actualPaidAmount > 0 ? c.ac : undefined }} value={vals.paid_v} onChange={(e) => updateField("paid_v", e.target.value)} />
          <div style={{ fontSize: 10, color: c.muted, marginTop: 3 }}>
            Only set if different from planned — overrides balance calc.
            {actualPaidAmount === 0 && plannedAmount > 0 && <span style={{ color: c.ac }}> System will use {fx(plannedAmount)} as paid.</span>}
          </div>
        </div>
      </div>

      {/* ── Balance fields ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div>
          {sectionLabel(moneyFieldLabel("Updated Balance"))}
          <input type="number" step="0.01" style={{ ...inp, color: c.ac }} value={effectiveCurBal} onChange={(e) => updateField("cur_bal", e.target.value)} />
        </div>
        <div>
          {sectionLabel(moneyFieldLabel("New Purchases"))}
          <input type="number" step="0.01" style={inp} value={vals.purch_v} onChange={(e) => updateField("purch_v", e.target.value)} />
        </div>
        <div>
          {sectionLabel(moneyFieldLabel("Interest Paid"))}
          <input type="number" step="0.01" style={inp} value={vals.interest_paid_v} onChange={(e) => updateField("interest_paid_v", e.target.value)} />
        </div>
        <div>
          {sectionLabel("APR (%)")}
          <input type="number" step="0.001" style={{ ...inp, color: c.amber }} value={vals.apr_pct} onChange={(e) => updateField("apr_pct", e.target.value)} />
        </div>
        <div>
          {sectionLabel(moneyFieldLabel("Auto Balance Preview"))}
          <input type="number" step="0.01" style={{ ...inp, background: c.surf, color: c.ac }} value={projectedBal.toFixed(2)} readOnly />
          <div style={{ fontSize: 10, color: c.muted, marginTop: 3 }}>Edit "Updated Balance" to override.</div>
        </div>
      </div>

      {/* Payment Breakdown */}
      <div style={{ borderRadius: 8, border: `1px solid ${c.border2}`, background: c.surf2, padding: "10px 12px", marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 8, fontFamily: "'Instrument Sans',sans-serif" }}>
          Payment Breakdown {breakdownPayment > 0 ? `(based on ${fx(breakdownPayment)} planned)` : ""}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: c.muted, marginBottom: 3, fontFamily: "'Instrument Sans',sans-serif", textTransform: "uppercase", letterSpacing: "0.06em" }}>Interest Applied</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: c.amber, fontFamily: "'DM Mono',monospace" }}>
              {fx(interestApplied)}
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: c.muted, marginBottom: 3, fontFamily: "'Instrument Sans',sans-serif", textTransform: "uppercase", letterSpacing: "0.06em" }}>To Principal</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: principalApplied > 0 ? c.green : c.muted, fontFamily: "'DM Mono',monospace" }}>
              {fx(principalApplied)}
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: c.muted, marginBottom: 3, fontFamily: "'Instrument Sans',sans-serif", textTransform: "uppercase", letterSpacing: "0.06em" }}>Min Covers Int?</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: minCoversInterest ? c.green : c.red, fontFamily: "'Instrument Sans',sans-serif" }}>
              {monthlyInterest === 0 ? "—" : minCoversInterest ? "Yes" : "No"}
            </div>
          </div>
        </div>
      </div>

      {/* Bill Settings */}
      <div style={{ borderRadius: 8, border: `1px solid ${c.border2}`, background: c.surf2, padding: "10px 12px", marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 10, fontFamily: "'Instrument Sans',sans-serif" }}>
          Bill Settings
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            {sectionLabel("Category")}
            <select
              style={sel}
              value={vals.category}
              onChange={(e) => updateField("category", e.target.value)}
            >
              {(allCategories || []).map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
              {vals.category && !(allCategories || []).includes(vals.category) && (
                <option value={vals.category}>{vals.category}</option>
              )}
            </select>
          </div>
          <div>
            {sectionLabel("Due Day (1–31)")}
            <input
              type="number"
              min="0"
              max="31"
              step="1"
              style={inp}
              value={vals.due_day}
              onChange={(e) => updateField("due_day", e.target.value)}
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            {sectionLabel("Interest Type")}
            <select
              style={sel}
              value={vals.interest_type}
              onChange={(e) => updateField("interest_type", e.target.value)}
            >
              <option value="variable_apr">Variable APR (Credit Cards)</option>
              <option value="fixed_apr">Fixed APR (Student / Personal Loans)</option>
              <option value="simple">Simple Interest (Auto Loans)</option>
              <option value="fixed_monthly">Fixed Monthly Fee</option>
              <option value="promo_zero">0% Promotional</option>
              <option value="interest_free">Interest-Free</option>
            </select>
          </div>
          <div>
            {sectionLabel("Promo APR (%)")}
            <input
              type="number"
              step="0.001"
              min="0"
              style={{ ...inp, color: c.amber }}
              value={vals.promo_apr_pct}
              onChange={(e) => updateField("promo_apr_pct", e.target.value)}
            />
          </div>
          <div>
            {sectionLabel("Promo End (YYYY-MM)")}
            <input
              type="text"
              placeholder="e.g. 2025-06"
              style={{ ...inp, fontSize: 14, borderColor: !promoUntilValid ? c.red : c.border2 }}
              value={vals.promo_until}
              onChange={(e) => updateField("promo_until", e.target.value)}
            />
            {!promoUntilValid && (
              <div style={{ fontSize: 11, color: c.red, marginTop: 3 }}>Use YYYY-MM format</div>
            )}
          </div>
          <div>
            {sectionLabel("APR After Promo (%)")}
            <input
              type="number"
              step="0.001"
              min="0"
              style={{ ...inp, color: c.amber }}
              value={vals.apr_after_promo_pct}
              onChange={(e) => updateField("apr_after_promo_pct", e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 8 }}>
        <button
          type="button"
          onClick={onClose}
          style={{ width: "100%", padding: "14px", borderRadius: 8, background: c.surf2, border: `1px solid ${c.border2}`, color: c.tx, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Instrument Sans',sans-serif", minHeight: 48 }}
        >
          Cancel (Esc)
        </button>
        <button
          type="button"
          style={{ width: "100%", padding: "14px", borderRadius: 8, background: c.ac, border: "none", color: "#001014", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Instrument Sans',sans-serif", minHeight: 48 }}
          onClick={() => onSave({ ...vals, cur_bal: effectiveCurBal, promo_until: promoUntilNormalized })}
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}
