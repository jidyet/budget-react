import React from "react";
import Modal from "./Modal.jsx";
import Button from "./Button.jsx";

export default function ConfirmationDialog({ open, title = "Are you sure?", children, confirmLabel = "Confirm", cancelLabel = "Cancel", onConfirm, onCancel, destructive = false }) {
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      <div style={{ display: "grid", gap: 16 }}>
        <div>{children}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          <Button variant="secondary" onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={destructive ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </Modal>
  );
}
