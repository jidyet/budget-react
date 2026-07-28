import { fx, moneyFieldLabel } from "../../utils/budgetUtils";

const IncomeModal = ({
  c,
  isMobile,
  incomeReceipts,
  boaPayPeriods,
  eagleviewPayPeriods,
  boaLabel = "Paycheck A",
  eagleviewLabel = "Paycheck B",
  updateIncomeReceipt,
  recurringIncomeEntries,
  manualIncomeEntries,
  newInc,
  setNewInc,
  incomeSources,
  lblStyle,
  selStyle,
  inputStyle,
  saveBtnStyle,
  addIncome,
  saveCurrentAsIncomeSchedule,
  applyIncomeSchedule,
  incomeTemplates,
  onClose,
}) => (
  <>
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 175, background: "rgba(0,0,0,0.45)", transform: "translateZ(0)" }}
    />
    <div style={{
      position: "fixed", top: "50%", left: "50%",
      transform: "translate(-50%,-50%) translateZ(0)",
      zIndex: 176, background: c.surf, borderRadius: 18,
      padding: isMobile ? "20px 16px" : 28,
      width: isMobile ? "92vw" : 520,
      maxHeight: "80vh", overflowY: "auto",
      boxShadow: "0 8px 48px rgba(0,0,0,0.25)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <span style={{ fontSize: 17, fontWeight: 800, color: c.tx }}>Income This Month</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: c.tx2, fontSize: 24, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.15fr .85fr", gap: 16 }}>
        <div>
          {/* Paycheck tracker — only shown if the user has set up paycheck amounts in Settings */}
          {[...boaPayPeriods, ...eagleviewPayPeriods].length > 0 ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 8 }}>Paycheck Receipt Tracker</div>
              <div style={{ display: "grid", gap: 8 }}>
                {[[boaLabel, boaPayPeriods], [eagleviewLabel, eagleviewPayPeriods]].filter(([, periods]) => periods.length > 0).map(([label, periods]) => (
                  <div key={label} style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid ${c.border}`, background: c.surf2 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 800, fontSize: 13 }}>{label}</div>
                      <div style={{ fontSize: 12, color: c.muted }}>
                        {periods.length} pay period{periods.length === 1 ? "" : "s"} · {fx(periods.reduce((sum, period) => sum + period.amount, 0))}
                      </div>
                    </div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {periods.map((period) => {
                        const isReceived = !!incomeReceipts?.[period.key];
                        return (
                          <div key={period.key} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.2fr .8fr 1fr", gap: 8, alignItems: "center" }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 12 }}>{period.label}</div>
                              <div style={{ fontSize: 11, color: c.muted }}>
                                {period.holidayCount > 0 ? `${period.holidayCount} calendar adjustment` : "Normal pay period"}
                              </div>
                            </div>
                            <div style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700 }}>{fx(period.amount)}</div>
                            <div style={{ display: "flex", gap: 8, justifyContent: isMobile ? "stretch" : "flex-end", flexWrap: "wrap" }}>
                              <button type="button" onClick={() => updateIncomeReceipt(period.key, "pending")}
                                style={{ flex: isMobile ? 1 : "0 0 auto", minWidth: isMobile ? 0 : 104, padding: "9px 12px", borderRadius: 999, border: `1px solid ${!isReceived ? c.wa : c.border2}`, background: !isReceived ? `${c.wa}18` : c.surf, color: !isReceived ? c.wa : c.tx2, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                                {!isReceived ? "Pending" : "Marked pending"}
                              </button>
                              <button type="button" onClick={() => updateIncomeReceipt(period.key, "received")}
                                style={{ flex: isMobile ? 1 : "0 0 auto", minWidth: isMobile ? 0 : 104, padding: "9px 12px", borderRadius: 999, border: `1px solid ${isReceived ? c.go : c.border2}`, background: isReceived ? `${c.go}16` : c.surf, color: isReceived ? c.go : c.tx2, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                                {isReceived ? "✓ Received" : "Received"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ padding: "14px 16px", borderRadius: 10, border: `1px solid ${c.border}`, background: c.surf2, fontSize: 13, color: c.tx2, lineHeight: 1.5 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Set up paycheck tracking</div>
              Go to <strong>Settings → Bills & Budget</strong> to add your paycheck amount and schedule. Once set up, each pay period will appear here so you can mark when you've been paid.
            </div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 8 }}>Income This Month</div>
          <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
            {[...recurringIncomeEntries, ...manualIncomeEntries].map((entry, index) => (
              <div key={`${entry.src}-${index}`} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${c.border}`, fontSize: 13 }}>
                <span style={{ color: c.tx }}>{entry.src.startsWith("_") ? (entry.src === "_paycheckA" ? boaLabel : entry.src === "_paycheckB" ? eagleviewLabel : entry.src) : entry.src}</span>
                <span style={{ fontFamily: "'DM Mono',monospace", color: c.tx }}>{fx(entry.amt)}</span>
              </div>
            ))}
            {([...recurringIncomeEntries, ...manualIncomeEntries].length === 0) && (
              <div style={{ fontSize: 12, color: c.muted }}>No income added yet.</div>
            )}
          </div>
          <div style={lblStyle}>Income source</div>
          <select style={{ ...selStyle, marginBottom: 8 }} value={newInc.src} onChange={e => setNewInc(v => ({ ...v, src: e.target.value }))}>
            {incomeSources.map(o => <option key={o}>{o}</option>)}
          </select>
          <div style={lblStyle}>{moneyFieldLabel("Amount")}</div>
          <input type="number" style={{ ...inputStyle, marginBottom: 8 }} placeholder="0.00" value={newInc.amt} onChange={e => setNewInc(v => ({ ...v, amt: e.target.value }))} />
          <button type="button" style={saveBtnStyle} onClick={addIncome}>Add This Month</button>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            <button type="button" onClick={saveCurrentAsIncomeSchedule} style={{ padding: "8px", borderRadius: 8, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx2, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              Save as recurring
            </button>
            <button type="button" onClick={applyIncomeSchedule} style={{ padding: "8px", borderRadius: 8, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx2, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              Apply recurring
            </button>
          </div>
        </div>
      </div>
    </div>
  </>
);

export default IncomeModal;
