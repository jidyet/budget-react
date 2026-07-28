import ProgressRing from "./ProgressRing";
import { getBillDisplayName } from "../../services/billModel";

const CONFETTI = [
  { left: "15%", color: "#39a844", size: 5, delay: "0s",    dur: "1.1s" },
  { left: "35%", color: "#18a7e1", size: 4, delay: "0.12s", dur: "1.3s" },
  { left: "55%", color: "#ff8a1c", size: 6, delay: "0.05s", dur: "1.0s" },
  { left: "72%", color: "#a78bfa", size: 4, delay: "0.2s",  dur: "1.2s" },
  { left: "88%", color: "#f9e952", size: 5, delay: "0.08s", dur: "1.15s" },
];

export default function ProgressDebtList({ palette, debts = [], activity = [], reducedMotion = false }) {
  const c = palette;
  const visibleDebts = debts.slice(0, 4);
  const animate = !reducedMotion;

  const isCleared = (debt) =>
    Number(debt.ratio || 0) >= 0.999 ||
    String(debt.currentBalanceLabel || "").trim() === "$0";

  const completedCount = visibleDebts.filter(isCleared).length;
  const almostCount = visibleDebts.filter((d) => d.almostDone && !isCleared(d)).length;

  const headline =
    completedCount >= 3
      ? "You're flying"
      : completedCount >= 1
        ? "Wins are stacking up"
        : "Keep this momentum going";

  // Match activity to debts by name fragment
  const getDebtActivity = (debt) =>
    (activity || []).find((a) =>
      a?.title && debt &&
      a.title.toLowerCase().includes(getBillDisplayName(debt).toLowerCase().split(" ")[0])
    );

  return (
    <div style={{
      position: "relative",
      overflow: "hidden",
      height: "100%",
      minHeight: 410,
      padding: "20px 20px 18px",
      borderRadius: 24,
      background: `radial-gradient(560px 220px at 12% 0%, ${c.in}16 0%, transparent 72%), radial-gradient(360px 180px at 88% 100%, ${c.go}18 0%, transparent 70%), linear-gradient(145deg, ${c.in}14 0%, ${c.surf} 34%, ${c.surf2} 72%, ${c.go}12 100%)`,
      border: `1.5px solid ${c.in}38`,
      display: "grid",
      gridTemplateRows: "auto auto 1fr auto",
      gap: 14,
      boxShadow: `0 18px 42px ${c.in}14`,
    }}>
      <div style={{ position: "absolute", top: -34, right: -42, width: 180, height: 180, borderRadius: "50%", background: `${c.in}10`, filter: "blur(8px)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -26, left: -18, width: 140, height: 140, borderRadius: "50%", background: `${c.go}14`, filter: "blur(8px)", pointerEvents: "none" }} />

      <div>
        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.in, marginBottom: 4 }}>Progress by debt</div>
        <div style={{ fontSize: 12, color: c.tx2 }}>
          {completedCount > 0
            ? `${completedCount} cleared — the closest wins stay front and center.`
            : "Quick rings for the debts closest to a win."}
        </div>
      </div>

      {!!visibleDebts.length && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{
            fontSize: 24,
            fontWeight: 900,
            color: completedCount > 0 ? c.go : c.tx,
            animation: animate && completedCount > 0 ? "riseFade 400ms ease both" : "none",
          }}>
            {headline}
          </div>
          {completedCount > 0 && (
            <div style={{
              padding: "7px 11px",
              borderRadius: 999,
              background: `${c.go}18`,
              border: `1.5px solid ${c.go}55`,
              fontSize: 11,
              fontWeight: 900,
              color: c.go,
              boxShadow: `0 4px 14px ${c.go}30`,
              animation: animate ? "milestonePop 500ms cubic-bezier(.22,.8,.36,1) both" : "none",
            }}>
              🎉 {completedCount} {completedCount === 1 ? "win" : "wins"} at $0
            </div>
          )}
        </div>
      )}

      {!visibleDebts.length ? (
        <div style={{ fontSize: 12, color: c.tx2 }}>Add a debt to start seeing progress here.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: visibleDebts.length === 1 ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 14, alignContent: "stretch" }}>
          {visibleDebts.map((debt, i) => {
            const cleared = isCleared(debt);
            const ringColor = cleared ? c.go : debt.almostDone ? c.wa : c.in;
            const recentActivity = getDebtActivity(debt);
            return (
              <div key={debt.id} style={{
                position: "relative",
                display: "grid",
                alignItems: "center",
                minHeight: 178,
                padding: "16px 12px 12px",
                borderRadius: 20,
                background: cleared
                  ? `linear-gradient(160deg, ${c.go}20, ${c.go}08 50%, ${c.surf2})`
                  : `linear-gradient(180deg, ${c.surf}F3, ${c.surf2})`,
                border: cleared
                  ? `2px solid ${c.go}66`
                  : `1px solid ${debt.almostDone ? c.wa + "44" : c.in + "28"}`,
                boxShadow: cleared
                  ? `0 0 0 1px ${c.go}22, 0 16px 36px ${c.go}30`
                  : `0 14px 28px ${debt.almostDone ? c.wa : c.in}14`,
                animation: animate && cleared
                  ? `ringPop 480ms cubic-bezier(.22,.8,.36,1) ${i * 80}ms both`
                  : "none",
                overflow: "hidden",
              }}>
                {/* Shimmer sweep on cleared */}
                {animate && cleared && (
                  <div style={{
                    position: "absolute",
                    inset: 0,
                    background: `linear-gradient(105deg, transparent 30%, ${c.go}22 50%, transparent 70%)`,
                    animation: "shimmerSweep 2.2s ease-in-out 0.5s infinite",
                    pointerEvents: "none",
                    borderRadius: 20,
                  }} />
                )}

                {/* Confetti dots on cleared */}
                {animate && cleared && CONFETTI.map((dot, di) => (
                  <span key={di} aria-hidden="true" style={{
                    position: "absolute",
                    bottom: 10,
                    left: dot.left,
                    width: dot.size,
                    height: dot.size,
                    borderRadius: "50%",
                    background: dot.color,
                    animation: `floatUp ${dot.dur} ${dot.delay} ease-out forwards`,
                    pointerEvents: "none",
                    zIndex: 2,
                  }} />
                ))}

                {/* Cleared badge */}
                {cleared && (
                  <div style={{
                    position: "absolute",
                    top: 10,
                    right: 10,
                    padding: "3px 8px",
                    borderRadius: 999,
                    background: c.go,
                    fontSize: 10,
                    fontWeight: 900,
                    color: "#fff",
                    letterSpacing: "0.06em",
                    boxShadow: `0 2px 10px ${c.go}55`,
                    zIndex: 3,
                  }}>
                    ✓ Cleared
                  </div>
                )}

                {/* Almost done badge */}
                {!cleared && debt.almostDone && (
                  <div style={{
                    position: "absolute",
                    top: 10,
                    right: 10,
                    padding: "3px 8px",
                    borderRadius: 999,
                    background: `${c.wa}18`,
                    border: `1px solid ${c.wa}44`,
                    fontSize: 10,
                    fontWeight: 900,
                    color: c.wa,
                    zIndex: 3,
                  }}>
                    Almost!
                  </div>
                )}

                <ProgressRing
                  palette={c}
                  ratio={debt.ratio}
                  label={getBillDisplayName(debt)}
                  value={cleared ? "Cleared" : debt.currentBalanceLabel}
                  tone={ringColor}
                  size={102}
                  cleared={cleared}
                />

                {/* Activity chip below ring */}
                {recentActivity && (
                  <div style={{
                    marginTop: 6,
                    padding: "4px 8px",
                    borderRadius: 999,
                    background: `${c.surf}CC`,
                    border: `1px solid ${c.border}`,
                    fontSize: 10,
                    fontWeight: 700,
                    color: c.tx2,
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}>
                    {recentActivity.timestamp}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!!visibleDebts.length && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", paddingTop: 2 }}>
          <div style={{ fontSize: 12, color: c.tx2 }}>
            The closest wins stay up front so progress feels real.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {completedCount > 0 && (
              <span style={{ padding: "6px 10px", borderRadius: 999, background: `${c.go}18`, border: `1.5px solid ${c.go}44`, fontSize: 11, fontWeight: 800, color: c.go, boxShadow: `0 2px 8px ${c.go}22` }}>
                {completedCount} cleared
              </span>
            )}
            {almostCount > 0 && (
              <span style={{ padding: "6px 10px", borderRadius: 999, background: `${c.wa}12`, border: `1px solid ${c.wa}33`, fontSize: 11, fontWeight: 800, color: c.wa }}>
                {almostCount} almost there
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
