import { useEffect, useState } from "react";

const normalizeAprDecimal = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return numeric > 1 ? numeric / 100 : numeric;
};

export default function EditPanel({ a, theme, onSave, onClose }) {
  const baseBalance = Number(a.base_bal_v ?? Number(a.cur_bal ?? 0) + Number(a.paid_v ?? 0) - Number(a.purch_v ?? 0));
  const aprDecimal = normalizeAprDecimal(a.apr_v ?? a.apr ?? 0);
  const buildInitialVals = () => ({
    paid_v: String(a.paid_v ?? 0),
    min_due_v: String(a.min_due_v ?? 0),
    cur_bal: String(a.cur_bal ?? 0),
    purch_v: String(a.purch_v ?? 0),
    interest_paid_v: String(a.interest_paid_v ?? 0),
    apr_pct: String((aprDecimal * 100).toFixed(4).replace(/\.?0+$/, "") || "0"),
  });

  const [vals, setVals] = useState(buildInitialVals);
  const [manualBalEdited, setManualBalEdited] = useState(false);

  const projectedBal = Math.max(0, baseBalance - (Number(vals.paid_v) || 0) + (Number(vals.purch_v) || 0));
  const effectiveCurBal = manualBalEdited ? vals.cur_bal : projectedBal.toFixed(2);
  const currentAprDec = (parseFloat(vals.apr_pct) || 0) / 100;
  const paymentAmount = Number(vals.paid_v) || 0;
  const monthlyInterest = (currentAprDec / 12) * (Number(effectiveCurBal) || 0);
  const interestApplied = Math.min(paymentAmount, monthlyInterest);
  const principalApplied = Math.max(0, paymentAmount - interestApplied);
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

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const updateField = (key, value) => {
    setVals((v) => ({ ...v, [key]: value }));
    if (key === "cur_bal") setManualBalEdited(true);
  };

  const fields = [
    { key: "paid_v",    label: "Actual Paid ($)" },
    { key: "min_due_v", label: "Min Due ($)" },
    { key: "cur_bal",   label: "Updated Balance ($)" },
    { key: "purch_v",   label: "New Purchases ($)" },
    { key: "interest_paid_v", label: "Interest Paid ($)" },
    { key: "apr_pct",   label: "APR (%)", step: "0.001" },
  ];

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

      {/* Input grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        {fields.map(({ key, label, step = "0.01" }) => (
          <div key={key}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 3, fontFamily: "'Instrument Sans',sans-serif" }}>
              {label}
            </div>
            <input
              type="number"
              step={step}
              style={{
                ...inp,
                ...(key === "cur_bal"  ? { color: c.ac }    : {}),
                ...(key === "apr_pct"  ? { color: c.amber }  : {}),
              }}
              value={key === "cur_bal" ? effectiveCurBal : vals[key]}
              onChange={(e) => updateField(key, e.target.value)}
            />
          </div>
        ))}

        {/* Auto Balance Preview */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 3, fontFamily: "'Instrument Sans',sans-serif" }}>
            Auto Balance Preview ($)
          </div>
          <input
            type="number"
            step="0.01"
            style={{ ...inp, background: c.surf, color: c.ac }}
            value={projectedBal.toFixed(2)}
            readOnly
          />
          <div style={{ fontSize: 11, color: c.muted, marginTop: 4, lineHeight: 1.4 }}>
            Edit "Updated Balance" directly for a manual override.
          </div>
        </div>
      </div>

      {/* Payment Breakdown */}
      <div style={{ borderRadius: 8, border: `1px solid ${c.border2}`, background: c.surf2, padding: "10px 12px", marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 8, fontFamily: "'Instrument Sans',sans-serif" }}>
          Payment Breakdown
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: c.muted, marginBottom: 3, fontFamily: "'Instrument Sans',sans-serif", textTransform: "uppercase", letterSpacing: "0.06em" }}>Interest Applied</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: c.amber, fontFamily: "'DM Mono',monospace" }}>
              ${interestApplied.toFixed(2)}
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: c.muted, marginBottom: 3, fontFamily: "'Instrument Sans',sans-serif", textTransform: "uppercase", letterSpacing: "0.06em" }}>To Principal</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: principalApplied > 0 ? c.green : c.muted, fontFamily: "'DM Mono',monospace" }}>
              ${principalApplied.toFixed(2)}
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
          onClick={() => onSave({ ...vals, cur_bal: effectiveCurBal })}
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}
