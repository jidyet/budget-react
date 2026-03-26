import { LAUNCH_COPY } from "../config/launchCopy";

export default function SupportPage({
  mounted,
  c,
  isMobile,
  supportEmail,
  openFeedback,
  copyToClipboard,
}) {
  return (
    <div style={{ opacity: mounted ? 1 : 0, transition: "opacity .3s", display: "grid", gap: 14 }}>
      <div
        style={{
          background: `linear-gradient(135deg, ${c.ac}14, ${c.surf} 34%, ${c.surf2} 82%, ${c.wa}10)`,
          border: `1px solid ${c.border}`,
          borderRadius: 24,
          padding: isMobile ? "18px 18px" : "22px 24px",
          display: "grid",
          gap: 10,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted }}>
          Help & FAQ
        </div>
        <div style={{ fontSize: isMobile ? 26 : 30, fontWeight: 900, color: c.tx }}>
          Quick answers, calm support
        </div>
        <div style={{ fontSize: 14, color: c.tx2, lineHeight: 1.6, maxWidth: 720 }}>
          This app is meant to stay easy to scan and easy to trust. If something feels unclear, use feedback or reach out directly.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
          <button
            type="button"
            onClick={() => openFeedback("support")}
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
            onClick={() => copyToClipboard(supportEmail, "Support email copied")}
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
            Copy support email
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 20, padding: "18px", display: "grid", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>
              Support
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: c.tx }}>Need a real person?</div>
          </div>
          <div style={{ padding: "12px 14px", borderRadius: 14, background: c.surf2, border: `1px solid ${c.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: c.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
              Support contact
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: c.tx }}>{supportEmail}</div>
            <div style={{ fontSize: 12, color: c.tx2, marginTop: 4 }}>
              Use this for bugs, confusion, or anything that blocks your flow.
            </div>
          </div>
          <div style={{ fontSize: 12, color: c.muted, lineHeight: 1.6 }}>
            Feedback inside the app is usually the fastest route. It includes version and timing details automatically.
          </div>
        </div>

        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 20, padding: "18px", display: "grid", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>
              FAQ
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: c.tx }}>Common questions</div>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {LAUNCH_COPY.faqItems.map((item) => (
              <div key={item.question} style={{ padding: "12px 14px", borderRadius: 14, background: c.surf2, border: `1px solid ${c.border}` }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: c.tx, marginBottom: 4 }}>{item.question}</div>
                <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.6 }}>{item.answer}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
