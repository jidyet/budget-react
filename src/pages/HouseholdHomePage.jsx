import HouseholdHeroCard from '../components/household/HouseholdHeroCard';
import NextMoveCard from '../components/household/NextMoveCard';
import useHouseholdDashboard from '../hooks/useHouseholdDashboard';
import { buildHouseholdNextMove } from '../services/householdService';
import { fx0, isSystemIncomeSource } from '../utils/budgetUtils';

export default function HouseholdHomePage({
  palette,
  householdId,
  monthKey,
  householdProfile,
  householdMembers = [],
  dueSoon,
  totalBal,
  totalPaid,
  totalDue,
  remaining,
  progress,
  activity = [],
  totalIncome = 0,
  receivedIncomeTotal = 0,
  netAfterBills = 0,
  recurringIncomeEntries = [],
  recurringPayPeriods = [],
  incomeReceipts = {},
  onOpenIncome,
}) {
  const c = palette;
  const { dashboard, loading: dashboardLoading } = useHouseholdDashboard(householdId, monthKey);

  if (!householdId) return null;

  const totalDebtLeft = progress?.totalDebtLeftLabel || dashboard?.totalBalanceLabel || fx0(Number(totalBal || 0));
  const paidThisMonth = progress?.paidThisMonthLabel || dashboard?.paidLabel || fx0(Number(totalPaid || 0));
  const expectedIncomeLabel = fx0(Number(totalIncome || 0));
  const receivedIncomeLabel = fx0(Number(receivedIncomeTotal || 0));
  const afterBillsLabel = fx0(Number(netAfterBills || 0));
  const recurringSources = recurringIncomeEntries.filter((entry) => isSystemIncomeSource(entry.src));
  const pendingPaychecks = recurringPayPeriods.filter((period) => !incomeReceipts?.[period.key]).length;
  const receivedPaychecks = recurringPayPeriods.filter((period) => !!incomeReceipts?.[period.key]).length;
  const nextMove = buildHouseholdNextMove({ dueSoon, totalDue, remaining });

  // Derive identity context
  const updatedTodayCount = activity.filter((a) => {
    if (!a?.createdAt) return false;
    const ts = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
    const now = new Date();
    return ts.getFullYear() === now.getFullYear() &&
      ts.getMonth() === now.getMonth() &&
      ts.getDate() === now.getDate();
  }).length;

  // Combined week + momentum summary values
  return (
    <div style={{ display: 'grid', gap: 14, marginBottom: 18 }}>
      <HouseholdHeroCard
        palette={c}
        householdName={householdProfile?.activeHousehold?.name}
        totalDebtLeft={totalDebtLeft}
        paidThisMonth={paidThisMonth}
        memberCount={householdMembers.length}
        updatedTodayCount={updatedTodayCount}
      />

      {/* Next Move + Quick Snapshot — 2 col */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        <NextMoveCard palette={c} nextMove={nextMove} />

        {/* Tightened snapshot card */}
        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 18, padding: '16px 18px', display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.muted }}>Snapshot</div>
          {dashboardLoading ? (
            <div style={{ fontSize: 13, color: c.muted }}>Loading...</div>
          ) : (
            <>
              <div style={{ fontSize: 20, fontWeight: 900, color: c.go }}>{paidThisMonth}</div>
              <div style={{ fontSize: 12, color: c.tx2, lineHeight: 1.5 }}>
                {dashboard?.remainingLabel && Number(dashboard?.remaining || 0) > 0
                  ? `${dashboard.remainingLabel} still to cover.`
                  : 'Paid this month — the month is in a good spot.'}
              </div>
              {activity.length > 0 && (
                <div style={{ fontSize: 11, fontWeight: 800, color: c.tx2 }}>
                  {activity.length} update{activity.length !== 1 ? 's' : ''} since you last checked
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Income this month */}
      <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 18, padding: '16px 18px', display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.muted, marginBottom: 4 }}>
              Income this month
            </div>
            <div style={{ fontSize: 13, color: c.tx2 }}>Paychecks in view alongside your month totals.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {recurringSources.map((entry, i) => (
              <span
                key={entry.src}
                style={{
                  padding: '6px 10px',
                  borderRadius: 999,
                  background: `${i === 0 ? c.go : c.ac}12`,
                  border: `1px solid ${i === 0 ? c.go : c.border2}`,
                  color: i === 0 ? c.go : c.tx,
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                {String(entry.src).replace(/^_/, "").toUpperCase()}
              </span>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <div style={{ padding: '12px 14px', borderRadius: 14, background: c.surf2, border: `1px solid ${c.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: c.muted, marginBottom: 4 }}>Expected</div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 20, fontWeight: 700, color: c.tx }}>{expectedIncomeLabel}</div>
          </div>
          <div style={{ padding: '12px 14px', borderRadius: 14, background: c.surf2, border: `1px solid ${c.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: c.muted, marginBottom: 4 }}>Received</div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 20, fontWeight: 700, color: c.go }}>{receivedIncomeLabel}</div>
          </div>
          <div style={{ padding: '12px 14px', borderRadius: 14, background: c.surf2, border: `1px solid ${c.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: c.muted, marginBottom: 4 }}>After bills</div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 20, fontWeight: 700, color: Number(netAfterBills || 0) >= 0 ? c.go : c.re }}>{afterBillsLabel}</div>
          </div>
        </div>
        {!!recurringPayPeriods.length && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ padding: '6px 10px', borderRadius: 999, background: `${c.go}12`, border: `1px solid ${c.go}33`, color: c.go, fontSize: 11, fontWeight: 800 }}>
              {receivedPaychecks} received
            </span>
            <span style={{ padding: '6px 10px', borderRadius: 999, background: `${c.wa}12`, border: `1px solid ${c.wa}33`, color: c.wa, fontSize: 11, fontWeight: 800 }}>
              {pendingPaychecks} pending
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={onOpenIncome || undefined}
          disabled={!onOpenIncome}
          style={{
            padding: '10px 14px',
            borderRadius: 12,
            border: `1px solid ${c.border2}`,
            background: c.surf2,
            color: c.tx,
            fontSize: 12,
            fontWeight: 800,
            cursor: onOpenIncome ? 'pointer' : 'not-allowed',
            opacity: onOpenIncome ? 1 : 0.6,
            width: 'fit-content',
          }}
        >
          Open income
        </button>
      </div>
    </div>
  );
}
