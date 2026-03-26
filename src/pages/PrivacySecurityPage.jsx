import { LAUNCH_COPY } from "../config/launchCopy";

export default function PrivacySecurityPage({ mounted, c, isMobile }) {
  return (
    <div style={{ opacity: mounted ? 1 : 0, transition: "opacity .3s", display: "grid", gap: 14 }}>
      <div
        style={{
          background: `linear-gradient(135deg, ${c.ac}16, ${c.surf} 34%, ${c.surf2} 82%, ${c.go}10)`,
          border: `1px solid ${c.border}`,
          borderRadius: 24,
          padding: isMobile ? "18px 18px" : "22px 24px",
          display: "grid",
          gap: 10,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted }}>
          {LAUNCH_COPY.privacyHero.eyebrow}
        </div>
        <div style={{ fontSize: isMobile ? 26 : 30, fontWeight: 900, color: c.tx }}>
          {LAUNCH_COPY.privacyHero.title}
        </div>
        <div style={{ fontSize: 14, color: c.tx2, lineHeight: 1.6, maxWidth: 720 }}>
          {LAUNCH_COPY.privacyHero.detail}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.1fr 0.9fr", gap: 12 }}>
        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 20, padding: "18px", display: "grid", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>
              Who sees what
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: c.tx }}>How sharing works</div>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {LAUNCH_COPY.privacyItems.map((item) => (
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
              A quick summary
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: c.tx }}>What the app protects</div>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {LAUNCH_COPY.securityItems.map((item) => (
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
          <div style={{ fontSize: 12, color: c.muted, lineHeight: 1.6 }}>
            This page is a short guide to what stays private, what gets shared, and who can see it.
          </div>
        </div>
      </div>
    </div>
  );
}
