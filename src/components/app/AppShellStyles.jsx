export default function AppShellStyles({ c, dark }) {
  return (
    <style>{`
      *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
      html, body, #root { width:100%; min-height:100vh; min-height:100dvh; overflow-x:hidden; }
      body {
        background:
          radial-gradient(1400px 700px at -8% -12%, ${c.acD}, transparent 58%),
          radial-gradient(1000px 600px at 108% 2%, ${c.waD}, transparent 52%),
          radial-gradient(700px 400px at 50% 100%, ${dark ? "rgba(0,201,167,.10)" : "rgba(24,167,225,.12)"}, transparent 70%),
          linear-gradient(180deg, ${c.bg}, ${c.bg2});
      }
      input[type=number]::-webkit-inner-spin-button { opacity:.4; }
      select option { background:${c.surf}; color:${c.tx}; }
      input, select, button, textarea { transition: border-color .15s, box-shadow .15s, background .15s, color .15s !important; }
      input:focus-visible, select:focus-visible, button:focus-visible, textarea:focus-visible {
        outline: none !important;
        box-shadow: 0 0 0 3px ${c.acD}, 0 0 0 1.5px ${c.ac} !important;
      }
      select:focus { outline: none !important; box-shadow: 0 0 0 3px ${c.acD}, 0 0 0 1.5px ${c.ac} !important; }
      input:focus  { outline: none !important; box-shadow: 0 0 0 3px ${c.acD}, 0 0 0 1.5px ${c.ac} !important; }
      input:hover:not(:focus), select:hover:not(:focus) { border-color: ${c.border2} !important; }

      @keyframes slideUp   { from{transform:translateX(-50%) translateY(20px);opacity:0} to{transform:translateX(-50%) translateY(0);opacity:1} }
      @keyframes fadeInUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
      @keyframes shimmer   { 0%{transform:translateX(-100%)} 100%{transform:translateX(250%)} }
      @keyframes spin      { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      @keyframes urgentPulse { 0%,100%{box-shadow:0 0 0 0 ${c.da}55} 50%{box-shadow:0 0 0 6px ${c.da}00} }
      @keyframes todayPulse  { 0%,100%{box-shadow:0 0 0 0 ${c.wa}66} 50%{box-shadow:0 0 0 7px ${c.wa}00} }
      @keyframes overduePulse {
        0%,100% { box-shadow: 0 0 0 0 rgba(212,40,40,0); }
        50% { box-shadow: 0 0 0 6px rgba(212,40,40,0.2); }
      }
      @keyframes toastIn   { from{transform:translateX(-50%) translateY(24px) scale(.94);opacity:0} to{transform:translateX(-50%) translateY(0) scale(1);opacity:1} }
      @keyframes riseFade  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
      @keyframes softGlow  { 0%{box-shadow:0 0 0 rgba(0,0,0,0)} 100%{box-shadow:0 16px 32px rgba(0,0,0,0.12)} }
      @keyframes badgePop  { 0%{transform:scale(.85)} 60%{transform:scale(1.08)} 100%{transform:scale(1)} }
      @keyframes pageIn    { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes pageOut   { from { opacity: 1; } to { opacity: 0; } }

      .kpi-card { animation: fadeInUp .36s cubic-bezier(.34,1.56,.64,1) both; transition: transform .2s, box-shadow .2s !important; cursor:default; }
      .kpi-card:hover { transform: translateY(-5px) scale(1.015) !important; box-shadow: 0 24px 48px rgba(0,201,167,.18), 0 4px 18px rgba(0,0,0,.14) !important; }
      .bill-card { position:relative; overflow:hidden; transition: transform .17s, box-shadow .17s !important; }
      .bill-card::after { content:""; position:absolute; inset:0; border-radius:inherit; opacity:0; background:linear-gradient(135deg, ${c.acD} 0%, transparent 55%); transition:opacity .22s; pointer-events:none; }
      .bill-card:hover { transform: translateY(-3px); box-shadow: 0 0 0 1.5px ${c.ac}80, 0 18px 40px ${c.ac}28 !important; }
      .bill-card:hover::after { opacity:1; }
      .bill-overdue { animation: overduePulse 1.6s infinite; }
      .bill-today   { animation: todayPulse 2.2s ease-in-out infinite; }
      .mark-toggle { border-radius:8px; transition: background .15s !important; }
      .mark-toggle:hover { background: ${c.acD} !important; }
      .mark-toggle:hover .mark-box { border-color: ${c.ac} !important; box-shadow: 0 0 0 3px ${c.acD}; background:${c.acD} !important; }
      .mark-toggle:hover span { color: ${c.ac} !important; }
      .edit-action { transition: all .15s !important; }
      .edit-action:hover { border-color: ${c.ac} !important; color: ${c.ac} !important; background: ${c.acD} !important; transform:translateY(-1px); box-shadow:0 4px 12px ${c.ac}22; }
      .nav-btn { position:relative; transition: all .2s cubic-bezier(.4,0,.2,1) !important; overflow:hidden; }
      .nav-btn::before { content:""; position:absolute; inset:0; opacity:0; background:linear-gradient(180deg, ${c.ac}18, transparent); transition:opacity .2s; pointer-events:none; border-radius:inherit; }
      .nav-btn::after  { content:""; position:absolute; bottom:0; left:50%; width:0; height:3px; background:linear-gradient(90deg, ${c.ac}, ${c.go}); border-radius:99px 99px 0 0; transform:translateX(-50%); transition:width .25s cubic-bezier(.34,1.56,.64,1); }
      .nav-btn.active::after  { width:60%; }
      .nav-btn.active::before { opacity:1; }
      .nav-btn:not(.active):hover { color:${c.tx} !important; background:${c.surf} !important; border-color:${c.border2} !important; }
      .nav-btn:not(.active):hover::before { opacity:.5; }
      .top-nav { -ms-overflow-style:none; scrollbar-width:none; }
      .top-nav::-webkit-scrollbar { display:none; width:0; height:0; }
      .nav-urgent { display:inline-flex; align-items:center; justify-content:center; min-width:17px; height:17px; padding:0 4px; border-radius:99px; background:${c.da}; color:#fff; font-size:9px; font-weight:800; margin-left:5px; vertical-align:middle; animation: badgePop .4s cubic-bezier(.34,1.56,.64,1); }
      .progress-fill { position:relative; overflow:hidden; }
      .progress-fill::after { content:""; position:absolute; inset:0; background:linear-gradient(90deg, transparent 0%, rgba(255,255,255,.38) 50%, transparent 100%); animation: shimmer 2.6s ease-in-out infinite; }
      .cat-group { transition: box-shadow .18s, transform .18s !important; }
      .cat-group:hover { box-shadow: 0 6px 24px rgba(0,0,0,.1) !important; transform:translateY(-1px); }
      .section-label { display:flex; align-items:center; gap:8px; font-size:10px; font-weight:800; letter-spacing:.1em; text-transform:uppercase; color:${c.muted}; margin-bottom:10px; }
      .section-label::after { content:""; flex:1; height:1px; background:linear-gradient(90deg,${c.border},transparent); border-radius:99px; }
      .btn-primary { background:linear-gradient(135deg, ${c.ac}, ${dark ? "#00a88a" : "#00b396"}) !important; color:#000 !important; font-weight:800 !important; border:none !important; box-shadow:0 4px 14px ${c.ac}40 !important; transition:all .18s !important; }
      .btn-primary:hover { transform:translateY(-2px) !important; box-shadow:0 8px 22px ${c.ac}55 !important; filter:brightness(1.07); }
      .btn-primary:active { transform:translateY(0) !important; }
      .btn-ghost { background:${c.surf} !important; border:1.5px solid ${c.border} !important; color:${c.tx2} !important; transition:all .15s !important; }
      .btn-ghost:hover { border-color:${c.ac} !important; color:${c.ac} !important; background:${c.acD} !important; }
      .btn-danger { background:${c.daD} !important; border:1.5px solid ${c.da} !important; color:${c.da} !important; transition:all .15s !important; }
      .btn-danger:hover { background:${c.da} !important; color:#fff !important; }
      .tbl-row { transition: background .14s !important; cursor:pointer; }
      .tbl-row:hover { background: ${c.surf2} !important; }
      .tbl-row:hover .tbl-name { color:${c.ac} !important; }
      .toast-wrap { animation: toastIn .28s cubic-bezier(.34,1.56,.64,1) both; }
      ::-webkit-scrollbar { width:10px; height:10px; }
      ::-webkit-scrollbar-track { background:transparent; }
      ::-webkit-scrollbar-thumb { background:${c.border2}; border-radius:99px; border:2px solid transparent; background-clip:padding-box; }
      ::-webkit-scrollbar-thumb:hover { background:${c.ac}; background-clip:padding-box; }
      * { transition: background-color .18s, border-color .18s, color .18s; }
      img, svg, canvas, video { transition: none !important; }
      * { -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; }
      input, select, textarea { -webkit-appearance: none; appearance: none; font-size: 16px !important; }
      button { -webkit-appearance: none; cursor: pointer; }
      .scroll-x { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    `}</style>
  );
}
