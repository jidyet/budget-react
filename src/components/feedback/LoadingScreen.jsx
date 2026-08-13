import { buildPalette } from "../../config/palette";

export default function LoadingScreen({ label, palette }) {
  const c = palette || buildPalette("light");
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `radial-gradient(900px 500px at 10% 10%, ${c.acD}, transparent 60%), linear-gradient(180deg, ${c.bg}, ${c.bg2})`,
        color: c.muted,
        fontFamily: "'Instrument Sans',sans-serif",
        fontSize: 14,
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <style>{'@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'}</style>
      <div style={{ position: 'relative', width: 56, height: 56 }}>
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
          <circle cx="28" cy="28" r="22" stroke={c.border2} strokeWidth="4" />
          <circle cx="28" cy="28" r="22" stroke={c.ac} strokeWidth="4" strokeLinecap="round" strokeDasharray="30 110" />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: c.ac, fontFamily: "'Syne',sans-serif", fontWeight: 800 }}>
          *
        </div>
      </div>
      <div style={{ color: c.tx2, fontWeight: 600 }}>{label}</div>
    </div>
  );
}
