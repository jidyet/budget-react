export default function SuccessToast({ toast, palette, reducedMotion = false }) {
  if (!toast) return null;
  const c = palette;
  const tone = toast.type === "error" ? c.da : toast.type === "calm" ? c.ac : c.go;

  return (
    <div
      className="toast-wrap"
      style={{
        position: "fixed",
        bottom: 28,
        left: "50%",
        transform: "translateX(-50%)",
        background: toast.type === "error"
          ? `linear-gradient(135deg, ${c.da}, ${c.da}cc)`
          : `linear-gradient(135deg, ${c.go}, ${c.ac})`,
        color: "#fff",
        padding: "11px 22px 11px 16px",
        borderRadius: 16,
        fontSize: 13,
        fontWeight: 700,
        boxShadow: "0 12px 32px rgba(0,0,0,.22)",
        zIndex: 1200,
        fontFamily: "'Instrument Sans',sans-serif",
        whiteSpace: "nowrap",
        display: "flex",
        alignItems: "center",
        gap: 10,
        backdropFilter: "blur(10px)",
        border: "1px solid rgba(255,255,255,.22)",
        animation: reducedMotion ? "none" : "toastIn .28s cubic-bezier(.34,1.56,.64,1) both",
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          display: "inline-grid",
          placeItems: "center",
          background: "rgba(255,255,255,0.14)",
          color: "#fff",
          flexShrink: 0,
        }}
      >
        {toast.type === "error" ? "!" : "✓"}
      </span>
      <span>{toast.msg}</span>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: tone, boxShadow: `0 0 0 4px rgba(255,255,255,0.16)` }} />
    </div>
  );
}

