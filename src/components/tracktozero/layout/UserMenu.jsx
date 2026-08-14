import React, { useEffect, useRef, useState } from "react";
import { ttzPalette, TYPE_SCALE } from "../theme.js";

// Compact account menu (UX-1 Part 25) - replaces the old header's permanent
// "Signed in as owner" / "Current role: owner" text. Email and role now live
// here, one click away, instead of dominating the primary header at all
// times.
export default function UserMenu({ name, email, role, onGoToSettings, onSignOut }) {
  const palette = ttzPalette;
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const initial = (name || email || "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: `1px solid ${palette.border2}`,
          background: palette.ac,
          color: "#ffffff",
          fontFamily: "var(--ttz-font-body, 'Instrument Sans', sans-serif)",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {initial}
      </button>
      {open ? (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: 44,
            minWidth: 220,
            background: palette.surf,
            border: `1px solid ${palette.border}`,
            borderRadius: "var(--ttz-radius-md, 12px)",
            boxShadow: "var(--ttz-shadow-lg, 0 18px 40px rgba(10,34,54,0.12))",
            padding: 12,
            zIndex: 40,
            display: "grid",
            gap: 8,
          }}
        >
          <div>
            {name ? <div style={{ ...TYPE_SCALE.cardTitle, color: palette.tx }}>{name}</div> : null}
            {email ? <div style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>{email}</div> : null}
            {role ? <div style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>Role: {role}</div> : null}
          </div>
          {onGoToSettings ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onGoToSettings();
              }}
              style={{ ...TYPE_SCALE.supporting, textAlign: "left", background: "transparent", border: "none", padding: "6px 0", color: palette.tx, cursor: "pointer" }}
            >
              Workspace settings
            </button>
          ) : null}
          {onSignOut ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
              style={{ ...TYPE_SCALE.supporting, textAlign: "left", background: "transparent", border: "none", padding: "6px 0", color: palette.da, cursor: "pointer", fontWeight: 700 }}
            >
              Sign out
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
