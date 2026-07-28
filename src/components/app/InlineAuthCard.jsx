import AuthModal from "../modals/AuthModal";

export default function InlineAuthCard(props) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 760,
        margin: "0 auto",
        borderRadius: 24,
        background: `linear-gradient(135deg, ${props.palette.acD}, ${props.palette.surf} 45%, ${props.palette.surf2})`,
        border: `1px solid ${props.palette.border}`,
        padding: props.isMobile ? "14px" : "24px",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", inset: "auto -36px -40px auto", width: 140, height: 140, borderRadius: "50%", background: `radial-gradient(circle, ${props.palette.wa}18, transparent 70%)`, pointerEvents: "none" }} />
      <div style={{ position: "relative", display: "grid", gap: 12 }}>
        <div>
          <div style={{ fontSize: props.isMobile ? 22 : 40, lineHeight: 1.04, fontFamily: "'Syne',sans-serif", color: props.palette.tx, marginBottom: 2, textWrap: "balance" }}>
            Start your path to zero.
          </div>
        </div>
        <AuthModal {...props} embedded />
      </div>
    </div>
  );
}
