import React from "react";
import { ClipboardCheck, Home, Plus, Target, Wallet } from "lucide-react";
import { ttzPalette, TYPE_SCALE } from "../theme.js";
import { useHasMobileBottomNav } from "../useViewport.js";

// Review is a first-class mobile destination. It cannot be hidden behind a
// desktop-only nav or a secondary action sheet: unresolved import/debt items
// must always have an obvious, one-tap route on a phone. Activity remains
// available from the desktop nav and page links; review is more urgent on the
// compact, task-oriented mobile bar.
//
// Uses the EXACT SAME activeTab/onSelectTab authority PrimaryNav already
// consumes - no second tab-router, no independent state. aria-current and
// real text labels (never color/icon alone) mark the active item.
const ITEMS = [
  { key: "home", label: "Home", Icon: Home },
  { key: "review", label: "Review", Icon: ClipboardCheck },
  { key: "debts", label: "Debts", Icon: Wallet },
  { key: "plan", label: "Plan", Icon: Target },
];

// Exported separately from the viewport-gated default export so it can be
// unit-tested directly (this repo's tests run in a Node - not jsdom -
// environment, where useIsMobile() always resolves to false and the
// default export would always render null; MobileBottomNavContent has no
// such gate, only the actual nav markup/logic).
export function MobileBottomNavContent({ activeTab, onSelectTab, badges = {}, onOpenQuickActions }) {
  const palette = ttzPalette;
  const firstHalf = ITEMS.slice(0, 2);
  const secondHalf = ITEMS.slice(2);

  const renderItem = (item) => {
    const { key, label } = item;
    const Icon = item.Icon;
    const active = activeTab === key;
    const count = badges[key] || 0;
    return (
      <button
        key={key}
        type="button"
        aria-current={active ? "page" : undefined}
        className="ttz-focus-ring"
        onClick={() => onSelectTab(key)}
        style={{
          all: "unset",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          flex: 1,
          minHeight: 48,
          padding: "6px 4px",
          cursor: "pointer",
          // The active state is visible through weight/aria state. Keep the
          // mobile labels monochrome like desktop navigation.
          color: active ? palette.tx : palette.tx2,
        }}
      >
        <span style={{ position: "relative", display: "inline-flex" }}>
          <Icon size={20} aria-hidden="true" />
          {count > 0 ? (
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                top: -4,
                right: -6,
                minWidth: 14,
                height: 14,
                borderRadius: 999,
                background: palette.wa,
                color: "#ffffff",
                fontSize: 9,
                fontWeight: 800,
                display: "grid",
                placeItems: "center",
                padding: "0 3px",
              }}
            >
              {count > 9 ? "9+" : count}
            </span>
          ) : null}
        </span>
        <span style={{ ...TYPE_SCALE.caption, fontSize: 11, fontWeight: active ? 800 : 500, color: "inherit" }}>{label}</span>
      </button>
    );
  };

  return (
    <nav
      aria-label="Primary"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: "var(--ttz-z-sticky, 30)",
        background: palette.surf,
        borderTop: `1px solid ${palette.border}`,
        display: "flex",
        alignItems: "stretch",
        // Safe-area handling (iPhone home indicator / Android gesture bar) -
        // never a hardcoded device-specific number, falls back to 0 on
        // platforms without the inset.
        paddingBottom: "max(var(--ttz-space-2, 8px), env(safe-area-inset-bottom, 0px))",
      }}
    >
      {firstHalf.map(renderItem)}

      <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", padding: "4px 0" }}>
        <button
          type="button"
          aria-label="Quick actions"
          className="ttz-focus-ring"
          onClick={onOpenQuickActions}
          style={{
            width: 52,
            height: 52,
            borderRadius: "50%",
            border: "none",
            background: palette.go,
            color: "#ffffff",
            display: "grid",
            placeItems: "center",
            boxShadow: "var(--ttz-shadow-md, 0 8px 24px rgba(10,34,54,0.08))",
            cursor: "pointer",
            transform: "translateY(-14px)",
          }}
        >
          <Plus size={24} aria-hidden="true" />
        </button>
      </div>

      {secondHalf.map(renderItem)}
    </nav>
  );
}

export default function MobileBottomNav(props) {
  const hasMobileBottomNav = useHasMobileBottomNav();
  if (!hasMobileBottomNav) return null;
  return <MobileBottomNavContent {...props} />;
}
