/**
 * UrgentBillBanner — Phase 3
 *
 * Shows when one or more bills are due within 3 days.
 * - Single bill: full detail + "Mark as paid" + "Open bill" buttons
 * - Multiple bills: lead bill shown, "+N more this week" expands the rest
 * - Visually the loudest element on the page after the hero number
 */

import { useState } from "react";
import { isBillSettledThisCycle } from "../../services/billModel";

function daysLabel(bill) {
  const d = Number(bill.d_left ?? bill.daysUntilDue ?? 99);
  if (d <= 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  return `Due in ${d} days`;
}

function amountLabel(bill) {
  const amt = Number(bill.amount || bill.min_due_v || bill.planned_v || 0);
  return amt > 0 ? `$${amt.toLocaleString()}` : null;
}

function BillRow({ bill, isLead, c, isMobile, onMarkPaid, onOpenBill }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        ...(isLead ? {} : {
          paddingTop: 12,
          marginTop: 12,
          borderTop: `1px solid ${c.wa}30`,
        }),
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: isLead ? 11 : 10,
            fontWeight: 900,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: c.wa,
            marginBottom: isLead ? 5 : 3,
          }}
        >
          {daysLabel(bill)}
        </div>
        <div
          style={{
            fontSize: isLead ? (isMobile ? 20 : 22) : 15,
            fontWeight: 900,
            color: c.tx,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            marginBottom: 2,
          }}
        >
          {bill.name}
        </div>
        {amountLabel(bill) && (
          <div style={{ fontSize: isLead ? 14 : 12, fontWeight: 700, color: c.tx2 }}>
            {amountLabel(bill)}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
        {onMarkPaid && !isBillSettledThisCycle(bill) && (
          <button
            type="button"
            onClick={() => onMarkPaid(bill)}
            style={{
              padding: isLead ? "10px 14px" : "7px 11px",
              borderRadius: 10,
              border: `1.5px solid ${c.wa}`,
              background: "transparent",
              color: c.wa,
              fontSize: isLead ? 12 : 11,
              fontWeight: 900,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Mark as paid
          </button>
        )}
        <button
          type="button"
          onClick={() => onOpenBill(bill.id)}
          style={{
            padding: isLead ? "10px 14px" : "7px 11px",
            borderRadius: 10,
            border: "none",
            background: c.wa,
            color: "#001014",
            fontSize: isLead ? 12 : 11,
            fontWeight: 900,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Open bill
        </button>
      </div>
    </div>
  );
}

export default function UrgentBillBanner({
  palette,
  isMobile,
  urgentBills = [],
  onOpenBill,
  onMarkPaid,
}) {
  const c = palette;
  const [expanded, setExpanded] = useState(false);

  if (!urgentBills.length) return null;

  const lead = urgentBills[0];
  const rest = urgentBills.slice(1);

  return (
    <div
      style={{
        marginBottom: 16,
        background: `linear-gradient(135deg, ${c.wa}1A, ${c.surf} 60%)`,
        border: `1.5px solid ${c.wa}`,
        borderRadius: 20,
        padding: isMobile ? "16px 16px" : "18px 22px",
        boxShadow: `0 8px 28px ${c.wa}22`,
      }}
    >
      <BillRow bill={lead} isLead c={c} isMobile={isMobile} onMarkPaid={onMarkPaid} onOpenBill={onOpenBill} />

      {rest.length > 0 && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          style={{
            marginTop: 12,
            background: "none",
            border: "none",
            color: c.wa,
            fontSize: 12,
            fontWeight: 900,
            cursor: "pointer",
            padding: 0,
            textDecoration: "underline",
            textDecorationStyle: "dotted",
          }}
        >
          +{rest.length} more due this week
        </button>
      )}

      {rest.length > 0 && expanded && rest.map((bill) => (
        <BillRow key={bill.id} bill={bill} isLead={false} c={c} isMobile={isMobile} onMarkPaid={onMarkPaid} onOpenBill={onOpenBill} />
      ))}
    </div>
  );
}
