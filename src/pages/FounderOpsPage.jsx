import {
  TRIAGE_GUIDE,
  STATUS_FLOW,
  buildReleaseNotesDraft,
  buildSupportSnapshot,
} from "../services/founderOpsService";

const NEXT_ACTIONS = [
  "Review new feedback",
  "Check anything marked critical now",
  "Confirm billing still stays off for testers",
  "Keep release notes short and clear",
];

export default function FounderOpsPage({
  mounted,
  c,
  isMobile,
  appVersionLabel,
  supportEmail,
  launchFlags,
  softLaunchSummary,
  feedbackSentCount,
  copyToClipboard,
}) {
  const releaseNotesDraft = buildReleaseNotesDraft({ appVersionLabel, launchFlags });
  const supportSnapshot = buildSupportSnapshot({
    appVersionLabel,
    supportEmail,
    launchFlags,
    softLaunchSummary,
    feedbackSentCount,
  });

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
          Founder ops
        </div>
        <div style={{ fontSize: isMobile ? 26 : 30, fontWeight: 900, color: c.tx }}>
          Keep launch management light
        </div>
        <div style={{ fontSize: 14, color: c.tx2, lineHeight: 1.6, maxWidth: 720 }}>
          This page keeps launch operations simple: what to review, how to triage, and what version is live right now.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
          <button
            type="button"
            onClick={() => copyToClipboard(releaseNotesDraft, "Release notes copied")}
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
            Copy release notes
          </button>
          <button
            type="button"
            onClick={() => copyToClipboard(supportSnapshot, "Support snapshot copied")}
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
            Copy support snapshot
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 20, padding: "18px", display: "grid", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>
              Launch snapshot
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: c.tx }}>What is live right now</div>
          </div>
          {[
            ["Version", appVersionLabel],
            ["Support", supportEmail],
            ["Billing", launchFlags?.billingEnabled ? "Ready later" : "Off for testers"],
            ["Launch pulse", softLaunchSummary],
            ["Feedback from this device", String(feedbackSentCount)],
          ].map(([label, value]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: `1px solid ${c.border}` }}>
              <span style={{ fontSize: 12, color: c.muted, fontWeight: 700 }}>{label}</span>
              <span style={{ fontSize: 12, color: c.tx, fontWeight: 800, textAlign: "right" }}>{value}</span>
            </div>
          ))}
        </div>

        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 20, padding: "18px", display: "grid", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>
              Next checks
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: c.tx }}>A simple founder loop</div>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {NEXT_ACTIONS.map((item) => (
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
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 20, padding: "18px", display: "grid", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>
              Triage guide
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: c.tx }}>Sort feedback fast</div>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {TRIAGE_GUIDE.map((item) => (
              <div key={item.label} style={{ padding: "12px 14px", borderRadius: 14, background: c.surf2, border: `1px solid ${c.border}` }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: c.tx, marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.6 }}>{item.detail}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 20, padding: "18px", display: "grid", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>
              Status flow
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: c.tx }}>Keep issue status simple</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {STATUS_FLOW.map((item) => (
              <div
                key={item}
                style={{
                  padding: "9px 12px",
                  borderRadius: 999,
                  border: `1px solid ${c.border2}`,
                  background: c.surf2,
                  color: c.tx,
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                {item}
              </div>
            ))}
          </div>
          <div style={{ padding: "12px 14px", borderRadius: 14, background: c.surf2, border: `1px solid ${c.border}`, fontSize: 13, color: c.tx2, lineHeight: 1.6 }}>
            Keep the workflow light: new → reviewing → planned → fixed → closed. That is usually enough for a solo founder to stay clear and consistent.
          </div>
        </div>
      </div>
    </div>
  );
}
