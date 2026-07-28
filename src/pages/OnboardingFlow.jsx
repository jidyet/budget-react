import { useState } from "react";
import StatementUpload from "../StatementUpload";

const STEP_LABELS = ["Get started", "First bill", "Ready"];

export default function OnboardingFlow({
  c,
  isMobile,
  step,
  setStep,
  completeOnboarding,
  currencyCode = "USD",
  currencyOptions = [],
  onCurrencyChange,
  newAcct,
  setNewAcct,
  addCustomAccount,
  allAccts = [],
  updateRecord,
  handleUpload,
  theme,
}) {
  const [billError, setBillError] = useState("");
  const [billSaved, setBillSaved] = useState(false);
  const [entryMode, setEntryMode] = useState("manual");

  if (step <= 0) return null;

  const inputStyle = {
    width: "100%",
    padding: "11px 13px",
    borderRadius: 10,
    border: `1px solid ${c.border}`,
    background: c.surf2,
    color: c.tx,
    fontSize: 14,
    fontWeight: 600,
    outline: "none",
    boxSizing: "border-box",
  };

  const handleAddBill = async () => {
    const name = String(newAcct?.name || "").trim();
    const bal = Number(newAcct?.bal || 0);
    const min = Number(newAcct?.min || 0);
    if (!name) { setBillError("Give your bill a name."); return; }
    if (bal <= 0) { setBillError("Enter a balance greater than zero."); return; }
    setBillError("");
    // Pass overrides directly so addCustomAccount reads fresh values, not stale state
    try {
      await addCustomAccount({ name, bal: String(bal), min: String(min), category: "DEBT" });
      setBillSaved(true);
      setStep(3);
    } catch {
      setBillError("Could not save. Try again.");
    }
  };

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(0,0,0,0.68)" }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%,-50%)",
        zIndex: 601,
        background: c.surf,
        borderRadius: 24,
        padding: isMobile ? "28px 20px" : "34px 38px",
        width: isMobile ? "92vw" : 480,
        maxHeight: "90vh",
        overflowY: "auto",
        boxShadow: "0 24px 90px rgba(0,0,0,0.34)",
        border: `1px solid ${c.border}`,
      }}>

        {/* Step indicator */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <div style={{ display: "flex", gap: 6, flex: 1 }}>
            {[1, 2, 3].map((n) => (
              <div key={n} style={{ flex: 1, height: 4, borderRadius: 999, background: n <= step ? c.ac : c.border2, transition: "background 0.2s" }} />
            ))}
          </div>
          <div style={{ marginLeft: 12, fontSize: 11, fontWeight: 800, color: c.muted, whiteSpace: "nowrap" }}>
            {step} of 3
          </div>
        </div>

        {/* ── Step 1 ── */}
        {step === 1 && (
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <div style={{ fontSize: isMobile ? 26 : 30, fontWeight: 900, color: c.tx, lineHeight: 1.15, marginBottom: 10 }}>
                Get to Zero faster
              </div>
              <div style={{ fontSize: 14, color: c.tx2, lineHeight: 1.65 }}>
                Add one bill. We'll show your payoff path instantly.
              </div>
            </div>

            {/* Currency picker */}
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: c.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Your currency
              </div>
              <select
                value={currencyCode}
                onChange={(e) => onCurrencyChange?.(e.target.value)}
                style={{ ...inputStyle, background: c.surf }}
              >
                {currencyOptions.map((opt) => (
                  <option key={opt.code} value={opt.code}>{opt.code} — {opt.label}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => setStep(2)}
              style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: c.ac, color: "#001014", fontSize: 15, fontWeight: 900, cursor: "pointer", marginTop: 4 }}
            >
              Start in 30 seconds
            </button>
          </div>
        )}

        {/* ── Step 2 ── */}
        {step === 2 && (
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <div style={{ fontSize: isMobile ? 22 : 26, fontWeight: 900, color: c.tx, lineHeight: 1.2, marginBottom: 8 }}>
                Add your first bill
              </div>
              <div style={{ fontSize: 14, color: c.tx2, lineHeight: 1.65 }}>
                Type it in, or upload a statement or screenshot and let the app prefill it for you.
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { id: "manual", label: "Type it in" },
                { id: "pdf", label: "Upload PDF" },
                { id: "other", label: "Upload image/file" },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => { setEntryMode(option.id); setBillError(""); }}
                  style={{
                    padding: "9px 12px",
                    borderRadius: 999,
                    border: `1px solid ${entryMode === option.id ? c.ac : c.border}`,
                    background: entryMode === option.id ? `${c.ac}18` : c.surf2,
                    color: entryMode === option.id ? c.ac : c.tx,
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {entryMode === "manual" ? (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gap: 5 }}>
                  <label style={{ fontSize: 11, fontWeight: 800, color: c.muted, letterSpacing: "0.07em", textTransform: "uppercase" }}>Bill name</label>
                  <input
                    type="text"
                    placeholder="e.g. Chase Visa"
                    value={newAcct?.name || ""}
                    onChange={(e) => { setNewAcct((p) => ({ ...p, name: e.target.value })); setBillError(""); }}
                    style={inputStyle}
                    autoFocus
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={{ display: "grid", gap: 5 }}>
                    <label style={{ fontSize: 11, fontWeight: 800, color: c.muted, letterSpacing: "0.07em", textTransform: "uppercase" }}>Balance</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={newAcct?.bal || ""}
                      onChange={(e) => { setNewAcct((p) => ({ ...p, bal: e.target.value })); setBillError(""); }}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ display: "grid", gap: 5 }}>
                    <label style={{ fontSize: 11, fontWeight: 800, color: c.muted, letterSpacing: "0.07em", textTransform: "uppercase" }}>Minimum due</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={newAcct?.min || ""}
                      onChange={(e) => setNewAcct((p) => ({ ...p, min: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>
                </div>
                {billError && (
                  <div style={{ fontSize: 12, color: c.da, fontWeight: 700 }}>{billError}</div>
                )}

                <button
                  type="button"
                  onClick={handleAddBill}
                  style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: c.ac, color: "#001014", fontSize: 15, fontWeight: 900, cursor: "pointer" }}
                >
                  Continue
                </button>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ padding: "10px 12px", borderRadius: 12, background: c.surf2, border: `1px solid ${c.border}`, fontSize: 12, color: c.tx2, lineHeight: 1.6 }}>
                  Upload a statement, screenshot, or other bill image. If the company is detected and no bill exists yet, TrackToZero can create the bill for you.
                </div>
                <StatementUpload
                  accounts={allAccts}
                  theme={theme}
                  sourceMode={entryMode === "pdf" ? "pdf" : "other"}
                  onCreateAccount={addCustomAccount}
                  onSaved={async (id, updates) => {
                    await updateRecord?.(id, updates);
                  }}
                  onUpload={handleUpload}
                  onComplete={({ accountName }) => {
                    setNewAcct((current) => ({ ...current, name: accountName || current?.name || "" }));
                    setBillSaved(true);
                    setStep(3);
                  }}
                />
              </div>
            )}
            <button
              type="button"
              onClick={() => setStep(3)}
              style={{ width: "100%", padding: "10px", borderRadius: 10, border: "none", background: "none", color: c.muted, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              Skip for now
            </button>
          </div>
        )}

        {/* ── Step 3 ── */}
        {step === 3 && (
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <div style={{ fontSize: isMobile ? 26 : 30, fontWeight: 900, color: c.tx, lineHeight: 1.15, marginBottom: 10 }}>
                {billSaved ? `${String(newAcct?.name || "Your bill").trim()} added.` : "You're ready"}
              </div>
              <div style={{ fontSize: 14, color: c.tx2, lineHeight: 1.65 }}>
                Track your progress and build your payoff plan.
              </div>
            </div>

            <div style={{ display: "grid", gap: 8, padding: "14px 16px", borderRadius: 14, background: `${c.ac}0f`, border: `1px solid ${c.ac}30` }}>
              {["Where you stand, at a glance", "Your payoff path, calculated for you", "Progress you can actually see"].map((line) => (
                <div key={line} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: c.tx }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: c.ac, flexShrink: 0 }} />
                  {line}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={completeOnboarding}
              style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: c.ac, color: "#001014", fontSize: 15, fontWeight: 900, cursor: "pointer", marginTop: 4 }}
            >
              Go to dashboard
            </button>
          </div>
        )}
      </div>
    </>
  );
}
