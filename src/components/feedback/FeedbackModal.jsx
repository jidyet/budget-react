import { FEEDBACK_CATEGORIES } from "../../services/feedbackService";

const fieldStyle = (c) => ({
  width: "100%",
  padding: "11px 12px",
  borderRadius: 12,
  border: `1px solid ${c.border}`,
  background: c.surf2,
  color: c.tx,
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
});

export default function FeedbackModal({
  open,
  palette,
  isMobile,
  values,
  sending,
  error,
  onClose,
  onChange,
  onSubmit,
}) {
  if (!open) return null;
  const c = palette;

  return (
    <>
      <div onClick={sending ? undefined : onClose} style={{ position: "fixed", inset: 0, zIndex: 230, background: "rgba(0,0,0,0.44)" }} />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          zIndex: 231,
          width: isMobile ? "94vw" : 560,
          maxHeight: "min(88vh, 88dvh)",
          overflowY: "auto",
          background: c.surf,
          border: `1px solid ${c.border}`,
          borderRadius: 24,
          boxShadow: "0 26px 72px rgba(0,0,0,0.30)",
          padding: isMobile ? "18px 16px" : "22px 22px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 6 }}>
              Send feedback
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: c.tx, marginBottom: 6 }}>
              What should change?
            </div>
            <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.55 }}>
              Short notes help most. Tell us what felt helpful, confusing, or worth improving.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            style={{ border: "none", background: "transparent", color: c.muted, fontSize: 22, cursor: sending ? "default" : "pointer", lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, color: c.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
              Pick one
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {FEEDBACK_CATEGORIES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => onChange("category", item.value)}
                  style={{
                    padding: "9px 12px",
                    borderRadius: 999,
                    border: `1px solid ${values.category === item.value ? c.ac : c.border2}`,
                    background: values.category === item.value ? c.acD : c.surf2,
                    color: values.category === item.value ? c.ac : c.tx,
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 900, color: c.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
              Quick rating
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onChange("rating", values.rating === value ? null : value)}
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 14,
                    border: `1px solid ${values.rating === value ? c.ac : c.border}`,
                    background: values.rating === value ? c.acD : c.surf2,
                    color: values.rating === value ? c.ac : c.tx,
                    fontSize: 14,
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 900, color: c.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
              Your note
            </div>
            <textarea
              value={values.message}
              onChange={(event) => onChange("message", event.target.value)}
              placeholder="What happened, what felt off, or what would help?"
              rows={4}
              style={{ ...fieldStyle(c), resize: "vertical", minHeight: 110, lineHeight: 1.55 }}
            />
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <input
              value={values.whatConfused}
              onChange={(event) => onChange("whatConfused", event.target.value)}
              placeholder="What confused you?"
              style={fieldStyle(c)}
            />
            <input
              value={values.whatHelped}
              onChange={(event) => onChange("whatHelped", event.target.value)}
              placeholder="What helped?"
              style={fieldStyle(c)}
            />
            <input
              value={values.whatShouldChange}
              onChange={(event) => onChange("whatShouldChange", event.target.value)}
              placeholder="What should change?"
              style={fieldStyle(c)}
            />
          </div>

          {error ? (
            <div style={{ padding: "11px 12px", borderRadius: 12, background: c.daD, border: `1px solid ${c.da}`, color: c.da, fontSize: 12, lineHeight: 1.5 }}>
              {error}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              style={{
                flex: 1,
                padding: "12px 14px",
                borderRadius: 12,
                border: `1px solid ${c.border2}`,
                background: c.surf2,
                color: c.tx,
                fontSize: 13,
                fontWeight: 700,
                cursor: sending ? "default" : "pointer",
              }}
            >
              Not now
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={sending}
              style={{
                flex: 1,
                padding: "12px 14px",
                borderRadius: 12,
                border: "none",
                background: c.ac,
                color: "#001014",
                fontSize: 13,
                fontWeight: 900,
                cursor: sending ? "default" : "pointer",
                opacity: sending ? 0.75 : 1,
              }}
            >
              {sending ? "Sending..." : "Send feedback"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
