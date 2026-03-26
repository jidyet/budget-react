import { LAUNCH_COPY } from "../config/launchCopy";

export default function BetaHelpPage({
  mounted,
  c,
  isMobile,
  appVersionLabel,
  billingEnabled,
  openFeedback,
  copyToClipboard,
}) {
  return (
    <div style={{ opacity: mounted ? 1 : 0, transition: "opacity .3s", display: "grid", gap: 14 }}>
      <div
        style={{
          background: `linear-gradient(135deg, ${c.ac}18, ${c.surf} 34%, ${c.surf2} 80%, ${c.wa}10)`,
          border: `1px solid ${c.border}`,
          borderRadius: 24,
          padding: isMobile ? "18px 18px" : "22px 24px",
          display: "grid",
          gap: 10,
          boxShadow: `0 18px 42px ${c.ac}10`,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted }}>
          Closed beta
        </div>
        <div style={{ fontSize: isMobile ? 26 : 30, fontWeight: 900, color: c.tx }}>
          Help us smooth the launch
        </div>
        <div style={{ fontSize: 14, color: c.tx2, lineHeight: 1.6, maxWidth: 700 }}>
          You already have full tester access. This page keeps the small things clear: what to try, how to send feedback,
          and what to expect during beta.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
          <button
            type="button"
            onClick={() => openFeedback("beta")}
            style={{
              padding: "11px 16px",
              borderRadius: 999,
              border: "none",
              background: c.ac,
              color: "#001014",
              fontSize: 13,
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Send feedback
          </button>
          <button
            type="button"
            onClick={() => copyToClipboard(appVersionLabel, "Version copied")}
            style={{
              padding: "11px 16px",
              borderRadius: 999,
              border: `1px solid ${c.border2}`,
              background: c.surf,
              color: c.tx,
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Copy version
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.1fr 0.9fr", gap: 12 }}>
        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 20, padding: "18px", display: "grid", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>
              What to try
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: c.tx }}>A few small checks</div>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {LAUNCH_COPY.betaChecklist.map((item) => (
              <div
                key={item}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "11px 12px",
                  borderRadius: 14,
                  background: c.surf2,
                  border: `1px solid ${c.border}`,
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.ac, flexShrink: 0 }} />
                <div style={{ fontSize: 13, color: c.tx }}>{item}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 20, padding: "18px", display: "grid", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>
              Build details
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: c.tx }}>What this beta includes</div>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ padding: "12px 14px", borderRadius: 14, background: c.surf2, border: `1px solid ${c.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: c.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                App version
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: c.tx }}>{appVersionLabel}</div>
            </div>
            <div style={{ padding: "12px 14px", borderRadius: 14, background: c.surf2, border: `1px solid ${c.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: c.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                Billing
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: c.tx }}>
                {billingEnabled ? "Ready when launch is closer" : "Off for testers"}
              </div>
              <div style={{ fontSize: 12, color: c.tx2, marginTop: 4 }}>
                Premium features stay open while you test.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 20, padding: "18px", display: "grid", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>
              Help and trust
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: c.tx }}>What testers should know</div>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {LAUNCH_COPY.betaSupportItems.map((item) => (
              <div key={item.title} style={{ padding: "12px 14px", borderRadius: 14, background: c.surf2, border: `1px solid ${c.border}` }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: c.tx, marginBottom: 4 }}>{item.title}</div>
                <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.6 }}>{item.detail}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 20, padding: "18px", display: "grid", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>
              Known notes
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: c.tx }}>A few things to expect</div>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {LAUNCH_COPY.betaKnownNotes.map((item) => (
              <div
                key={item}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "11px 12px",
                  borderRadius: 14,
                  background: c.surf2,
                  border: `1px solid ${c.border}`,
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.wa, flexShrink: 0 }} />
                <div style={{ fontSize: 13, color: c.tx }}>{item}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: c.muted, lineHeight: 1.6 }}>
            If a flow feels unclear or gets stuck, send feedback from here or from Settings. Short notes are enough.
          </div>
        </div>
      </div>
    </div>
  );
}
