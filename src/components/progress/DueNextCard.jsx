import { fx } from "../../utils/budgetUtils";
import { getBillDisplayName } from "../../services/billModel";

export default function DueNextCard({ palette: c, allDueSoon, onMarkPaid, onOpenBill }) {
  // Pick the soonest-due bill — sort ascending by d_left, take first
  const sorted = [...(allDueSoon || [])].sort(
    (a, b) => Number(a.d_left ?? 999) - Number(b.d_left ?? 999)
  );
  const bill = sorted[0] ?? null;
  if (!bill) return null;

  const dLeft = Number(bill.d_left ?? bill.daysUntilDue ?? 999);
  const minDue = Number(bill.min_due_v ?? bill.budgeted_min ?? 0);

  const dueTiming =
    dLeft < 0  ? `${Math.abs(dLeft)}d overdue`
    : dLeft === 0 ? "Due today"
    : dLeft === 1 ? "Due tomorrow"
    : `Due in ${dLeft} days`;

  const timingColor =
    dLeft < 0  ? c.da
    : dLeft === 0 ? c.da
    : dLeft <= 3  ? c.wa
    : c.muted;

  return (
    <div
      style={{
        borderRadius: 18,
        border: `1px solid ${c.border}`,
        background: `linear-gradient(135deg, ${c.surf2} 0%, ${c.surf} 55%, ${c.ac}08)`,
        padding: "16px 18px",
        boxShadow: `0 12px 28px rgba(0,0,0,0.07)`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Label */}
      <div
        style={{
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: c.muted,
          marginBottom: 5,
          fontFamily: "'Instrument Sans',sans-serif",
        }}
      >
        Due next
      </div>

      {/* Bill name */}
      <div
        style={{
          fontSize: 17,
          fontWeight: 900,
          color: c.tx,
          marginBottom: 6,
          lineHeight: 1.2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {getBillDisplayName(bill)}
      </div>

      {/* Due timing */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 900,
          color: timingColor,
          marginBottom: 14,
          fontFamily: "'Instrument Sans',sans-serif",
        }}
      >
        {dueTiming}
      </div>

      {/* Numbers row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              color: c.muted,
              marginBottom: 2,
              fontFamily: "'Instrument Sans',sans-serif",
            }}
          >
            Amount due
          </div>
          <div
            style={{ fontSize: 18, fontWeight: 900, color: c.tx, fontFamily: "'DM Mono',monospace" }}
          >
            {minDue > 0 ? fx(minDue) : "$0.00"}
          </div>
        </div>
        {bill.owner ? (
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                color: c.muted,
                marginBottom: 2,
                fontFamily: "'Instrument Sans',sans-serif",
              }}
            >
              Owner
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: c.tx2,
                paddingTop: 3,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {bill.owner}
            </div>
          </div>
        ) : null}
      </div>

      {/* Quick actions */}
      <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
        <button
          type="button"
          onClick={() => onMarkPaid?.(bill)}
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 10,
            border: "none",
            background: c.go,
            color: "#fff",
            fontSize: 12,
            fontWeight: 900,
            cursor: "pointer",
            fontFamily: "'Instrument Sans',sans-serif",
          }}
        >
          Mark paid
        </button>
        <button
          type="button"
          onClick={() => onOpenBill?.(bill.id)}
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 10,
            border: `1px solid ${c.border2}`,
            background: c.surf2,
            color: c.tx,
            fontSize: 12,
            fontWeight: 800,
            cursor: "pointer",
            fontFamily: "'Instrument Sans',sans-serif",
          }}
        >
          Open bill
        </button>
      </div>
    </div>
  );
}
