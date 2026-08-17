import React, { useRef } from "react";
import { CreditCard, PiggyBank, Plus, Receipt, X } from "lucide-react";
import Card from "../ui/Card.jsx";
import IconButton from "../ui/IconButton.jsx";
import { useDialogFocus } from "../ui/useDialogFocus.js";
import { ttzPalette, TYPE_SCALE } from "../theme.js";
import useReducedMotion from "../../../hooks/useReducedMotion.js";

// UX-8's mobile center action - a bottom sheet (slides up, respects safe
// area), distinct from the existing side ui/Drawer.jsx. Deliberately no new
// business logic: every action here just asks the caller to navigate to
// Debts with an intent (see TrackToZeroV2App.jsx/DebtsCenter.jsx's
// `initialAction`) and open whatever already-existing modal/rail handles
// it (AddDebtModal, ImportCenter, QuickUpdateRail) - the sheet itself never
// records a payment, adds a debt, or touches the repository.
//
// Actions are gated by the SAME permissions/mode check DebtsCenter.jsx
// already uses (canManage/canObserve + snapshot.mode !== "legacy_preview"),
// never a second permission model - a Viewer sees fewer options, never a
// disabled-but-visible trap.
const ACTIONS = [
  { key: "record-payment", label: "Record payment", Icon: Receipt, requires: "observe" },
  { key: "update-balance", label: "Update balance", Icon: PiggyBank, requires: "observe" },
  { key: "add-debt", label: "Add debt", Icon: CreditCard, requires: "manage" },
  { key: "import-statement", label: "Import statement", Icon: Plus, requires: "manage" },
];

export default function QuickActionSheet({ open, onClose, onSelectAction, canManage, canObserve }) {
  const palette = ttzPalette;
  const reducedMotion = useReducedMotion();
  const containerRef = useRef(null);
  const closeRef = useRef(null);

  useDialogFocus({ open, containerRef, initialFocusRef: closeRef });

  React.useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const available = ACTIONS.filter((action) => (action.requires === "manage" ? canManage : canObserve));

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: "var(--ttz-z-modal, 50)",
        background: "rgba(7,19,31,0.36)",
        display: "flex",
        alignItems: "flex-end",
      }}
      onClick={onClose}
    >
      <Card
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ttz-quick-actions-title"
        variant="elevated"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "100%",
          borderRadius: "var(--ttz-radius-lg, 16px) var(--ttz-radius-lg, 16px) 0 0",
          paddingBottom: "max(var(--ttz-space-5, 24px), env(safe-area-inset-bottom, 0px))",
          transition: reducedMotion ? "none" : "transform 180ms ease",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <h2 id="ttz-quick-actions-title" style={{ ...TYPE_SCALE.sectionTitle, color: palette.tx, margin: 0 }}>Quick actions</h2>
          <IconButton ref={closeRef} label="Close" variant="ghost" size="sm" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </IconButton>
        </div>

        {available.length ? (
          <div style={{ display: "grid", gap: 8 }}>
            {available.map((action) => {
              const Icon = action.Icon;
              return (
                <button
                  key={action.key}
                  type="button"
                  className="ttz-focus-ring"
                  onClick={() => onSelectAction(action.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    width: "100%",
                    boxSizing: "border-box",
                    minHeight: 52,
                    padding: "12px 14px",
                    borderRadius: "var(--ttz-radius-md, 12px)",
                    border: `1px solid ${palette.border}`,
                    background: palette.surf,
                    color: palette.tx,
                    cursor: "pointer",
                    ...TYPE_SCALE.body,
                    fontWeight: 600,
                    textAlign: "left",
                  }}
                >
                  <Icon size={20} aria-hidden="true" color={palette.info} />
                  {action.label}
                </button>
              );
            })}
          </div>
        ) : (
          <p style={{ ...TYPE_SCALE.body, color: palette.tx2, margin: 0 }}>
            Your role is read-only in this workspace, so there are no quick actions available here.
          </p>
        )}
      </Card>
    </div>
  );
}
