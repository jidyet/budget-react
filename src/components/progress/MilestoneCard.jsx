/**
 * MilestoneCard — Phase 7
 *
 * Rules:
 * - Returns null when there are no milestones — no empty placeholder on homepage
 * - Top milestone gets a full celebration treatment (larger, shimmer, bold copy)
 * - Secondary milestones (2 & 3) are quieter rows beneath
 * - "success" tone (cleared debt) is always promoted to top position
 */

const TONE_COLOR = (c, tone) =>
  tone === "success" ? c.go : tone === "accent" ? c.ac : c.tx2;

const TONE_BG = (c, tone) =>
  tone === "success" ? `${c.go}14` : tone === "accent" ? `${c.ac}12` : c.surf2;

const TONE_BORDER = (c, tone) =>
  tone === "success" ? `${c.go}50` : tone === "accent" ? `${c.ac}40` : c.border;

// Sort so "success" (cleared debt) always leads
const sortMilestones = (milestones) => {
  const order = { success: 0, accent: 1, default: 2 };
  return [...milestones].sort((a, b) => (order[a.tone] ?? 2) - (order[b.tone] ?? 2));
};

export default function MilestoneCard({
  palette,
  milestones = [],
  reducedMotion = false,
  isMobile = false,
}) {
  const c = palette;
  const animate = !reducedMotion;

  if (!milestones.length) return null;

  const sorted = sortMilestones(milestones);
  const lead = sorted[0];
  const rest = sorted.slice(1);
  const leadColor = TONE_COLOR(c, lead.tone);

  return (
    <div
      style={{
        borderRadius: 20,
        overflow: "hidden",
        border: `1.5px solid ${TONE_BORDER(c, lead.tone)}`,
        boxShadow: lead.tone === "success"
          ? `0 10px 30px ${c.go}20`
          : `0 8px 24px ${c.ac}14`,
        animation: animate ? "milestonePop 420ms cubic-bezier(.22,.8,.36,1) both" : "none",
      }}
    >
      {/* ── Lead milestone — bold celebration ──────────────────────────── */}
      <div
        style={{
          position: "relative",
          padding: isMobile ? "16px 16px" : "18px 20px",
          background: TONE_BG(c, lead.tone),
          overflow: "hidden",
        }}
      >
        {/* Shimmer sweep for cleared debts */}
        {animate && lead.tone === "success" && (
          <div style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(105deg, transparent 25%, ${c.go}18 50%, transparent 75%)`,
            animation: "shimmerSweep 2.8s ease-in-out 0.4s infinite",
            pointerEvents: "none",
          }} />
        )}

        {/* Left accent bar */}
        <div style={{
          position: "absolute",
          top: 0, left: 0, bottom: 0,
          width: 4,
          background: leadColor,
        }} />

        <div style={{ paddingLeft: 12 }}>
          {/* Eyebrow */}
          <div style={{
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: leadColor,
            marginBottom: 8,
            opacity: 0.9,
          }}>
            {lead.tone === "success" ? "A win" : lead.tone === "accent" ? "Getting closer" : "Nice work"}
          </div>

          {/* Headline — the body is the celebration moment */}
          <div style={{
            fontSize: isMobile ? 17 : 19,
            fontWeight: 900,
            color: leadColor,
            lineHeight: 1.25,
            marginBottom: lead.title ? 4 : 0,
            letterSpacing: "-0.01em",
          }}>
            {lead.body || lead.title}
          </div>

          {/* Supporting line */}
          {lead.body && lead.title && (
            <div style={{ fontSize: 12, color: c.tx2, lineHeight: 1.4 }}>
              {lead.title}
            </div>
          )}
        </div>
      </div>

      {/* ── Secondary milestones — quieter rows ────────────────────────── */}
      {rest.map((milestone, i) => {
        const color = TONE_COLOR(c, milestone.tone);
        return (
          <div
            key={milestone.id}
            style={{
              padding: isMobile ? "10px 16px 10px 28px" : "11px 20px 11px 32px",
              background: c.surf,
              borderTop: `1px solid ${c.border}`,
              display: "flex",
              alignItems: "center",
              gap: 8,
              animation: animate
                ? `riseFade 300ms ease ${80 + i * 60}ms both`
                : "none",
            }}
          >
            <span style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: color,
              flexShrink: 0,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12,
                fontWeight: 800,
                color: c.tx,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {milestone.body || milestone.title}
              </div>
              {milestone.body && milestone.title && (
                <div style={{ fontSize: 11, color: c.muted }}>{milestone.title}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
