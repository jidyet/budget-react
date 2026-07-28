import { fx0, isSystemIncomeSource } from '../utils/budgetUtils';

/**
 * HouseholdHomePage — Phase 8 update
 *
 * HouseholdHeroCard removed — HomepageHero (Phase 2) covers debt left + progress bar.
 * NextMoveCard removed — NextStepCard (Phase 4) covers next action.
 * Snapshot card removed — merged into the income block below.
 *
 * This component now only renders the "Is this month covered?" income card.
 */
export default function HouseholdHomePage({
  palette,
  householdId,
  totalIncome = 0,
  receivedIncomeTotal = 0,
  netAfterBills = 0,
  recurringIncomeEntries = [],
  recurringPayPeriods = [],
  incomeReceipts = {},
  onOpenIncome,
}) {
  const c = palette;

  if (!householdId) return null;

  const totalIncomeNum      = Number(totalIncome || 0);
  const receivedIncomeNum   = Number(receivedIncomeTotal || 0);
  const netAfterBillsNum    = Number(netAfterBills || 0);
  const isCovered           = netAfterBillsNum >= 0;
  const hasIncomeData       = totalIncomeNum > 0 || receivedIncomeNum > 0;

  const receivedPaychecks   = recurringPayPeriods.filter((p) => !!incomeReceipts?.[p.key]).length;
  const pendingPaychecks    = recurringPayPeriods.filter((p) => !incomeReceipts?.[p.key]).length;
  const recurringSources    = recurringIncomeEntries.filter((e) => isSystemIncomeSource(e.src));

  if (!hasIncomeData && !recurringSources.length) return null;

  const statusColor  = isCovered ? c.go : c.wa;
  const statusLabel  = isCovered
    ? `✓ Covered — ${fx0(netAfterBillsNum)} left after bills`
    : `Short by ${fx0(Math.abs(netAfterBillsNum))} this month`;

  return (
    <div
      style={{
        background: c.surf,
        border: `1px solid ${c.border}`,
        borderRadius: 18,
        padding: '16px 18px',
        marginBottom: 14,
      }}
    >
      {/* ── Header row ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.muted }}>
          Is this month covered?
        </div>
        {/* Paycheck pills */}
        {!!recurringPayPeriods.length && (
          <div style={{ display: 'flex', gap: 6 }}>
            {receivedPaychecks > 0 && (
              <span style={{ padding: '4px 9px', borderRadius: 999, background: `${c.go}12`, border: `1px solid ${c.go}30`, color: c.go, fontSize: 11, fontWeight: 800 }}>
                {receivedPaychecks} received
              </span>
            )}
            {pendingPaychecks > 0 && (
              <span style={{ padding: '4px 9px', borderRadius: 999, background: `${c.wa}12`, border: `1px solid ${c.wa}30`, color: c.wa, fontSize: 11, fontWeight: 800 }}>
                {pendingPaychecks} pending
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Status answer — the one emotional line ───────────────────────── */}
      <div
        style={{
          fontSize: 15,
          fontWeight: 900,
          color: statusColor,
          marginBottom: 12,
          lineHeight: 1.3,
        }}
      >
        {statusLabel}
      </div>

      {/* ── Three-column breakdown ───────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
        {[
          { label: 'Income expected', value: fx0(totalIncomeNum), color: c.tx },
          { label: 'Received so far', value: fx0(receivedIncomeNum), color: c.go },
          { label: 'After bills', value: fx0(netAfterBillsNum), color: isCovered ? c.go : c.wa },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              background: c.surf2,
              border: `1px solid ${c.border}`,
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 800, color: c.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
              {label}
            </div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 16, fontWeight: 700, color }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Open income link ────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={onOpenIncome || undefined}
        disabled={!onOpenIncome}
        style={{
          background: 'none',
          border: 'none',
          color: c.muted,
          fontSize: 12,
          fontWeight: 700,
          cursor: onOpenIncome ? 'pointer' : 'default',
          padding: 0,
          textDecoration: 'underline',
          textDecorationStyle: 'dotted',
          opacity: onOpenIncome ? 1 : 0.5,
        }}
      >
        See full income breakdown
      </button>
    </div>
  );
}
