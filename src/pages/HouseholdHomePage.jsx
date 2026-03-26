import ErrorState from '../components/feedback/ErrorState';
import HouseholdActivityFeed from '../components/household/HouseholdActivityFeed';
import HouseholdHeroCard from '../components/household/HouseholdHeroCard';
import HouseholdMembersRow from '../components/household/HouseholdMembersRow';
import NextMoveCard from '../components/household/NextMoveCard';
import WeeklySummaryCard from '../components/habit/WeeklySummaryCard';
import useHouseholdDashboard from '../hooks/useHouseholdDashboard';
import { buildHouseholdNextMove } from '../services/householdService';

export default function HouseholdHomePage({
  palette,
  householdId,
  monthKey,
  householdProfile,
  householdMembers,
  householdRequests = [],
  canManageHousehold = false,
  handleApproveHouseholdRequest,
  handleRejectHouseholdRequest,
  dueSoon,
  totalBal,
  totalPaid,
  totalDue,
  remaining,
  progress,
  activity = [],
  activityLoading = false,
  momentum,
  weeklySummary,
}) {
  const c = palette;
  const { dashboard, loading: dashboardLoading } = useHouseholdDashboard(householdId, monthKey);

  if (!householdId) return null;

  const money = new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:0 });
  const totalDebtLeft = progress?.totalDebtLeftLabel || dashboard?.totalBalanceLabel || money.format(Number(totalBal || 0));
  const paidThisMonth = progress?.paidThisMonthLabel || dashboard?.paidLabel || money.format(Number(totalPaid || 0));
  const nextMove = buildHouseholdNextMove({ dueSoon, totalDue, remaining });
  const pendingRequests = (householdRequests || []).filter((request) => request?.status === 'pending');

  return (
    <div style={{ display:'grid', gap:14, marginBottom:18 }}>
      <HouseholdHeroCard palette={c} householdName={householdProfile?.activeHousehold?.name} totalDebtLeft={totalDebtLeft} paidThisMonth={paidThisMonth} memberCount={householdMembers.length} />
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))', gap:12 }}>
        <NextMoveCard palette={c} nextMove={nextMove} />
        <div style={{ background:c.surf, border:`1px solid ${c.border}`, borderRadius:18, padding:'16px 18px', display:'grid', gap:10 }}>
          <div style={{ fontSize:11, fontWeight:800, letterSpacing:'0.1em', textTransform:'uppercase', color:c.muted }}>One quick look</div>
          {dashboardLoading ? (
            <div style={{ fontSize:13, color:c.muted }}>Loading shared progress...</div>
          ) : (
            <>
              <div style={{ fontSize:18, fontWeight:800, color:c.tx }}>Where you are now</div>
              <div style={{ fontSize:13, color:c.tx2, lineHeight:1.6 }}>
                {dashboard?.remainingLabel && Number(dashboard?.remaining || 0) > 0 ? `${dashboard.remainingLabel} still left for this month.` : 'You moved forward. The month is in a better spot than before.'}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div style={{ padding:'10px 12px', borderRadius:12, background:c.surf2, border:`1px solid ${c.border}` }}>
                  <div style={{ fontSize:10, fontWeight:800, letterSpacing:'0.08em', textTransform:'uppercase', color:c.muted, marginBottom:4 }}>Paid this month</div>
                  <div style={{ fontFamily:"'DM Mono',monospace", fontSize:18, fontWeight:700, color:c.go }}>{paidThisMonth}</div>
                </div>
                <div style={{ padding:'10px 12px', borderRadius:12, background:c.surf2, border:`1px solid ${c.border}` }}>
                  <div style={{ fontSize:10, fontWeight:800, letterSpacing:'0.08em', textTransform:'uppercase', color:c.muted, marginBottom:4 }}>Recent updates</div>
                  <div style={{ fontSize:18, fontWeight:700, color:c.tx }}>{activity.length}</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:12 }}>
        <WeeklySummaryCard palette={c} summary={weeklySummary} />
        <div style={{ background:`linear-gradient(135deg, ${c.go}10, ${c.surf} 42%, ${c.surf2})`, border:`1px solid ${c.border}`, borderRadius:20, padding:'16px 18px', display:'grid', gap:10, boxShadow:`0 12px 28px ${c.go}10` }}>
          <div style={{ fontSize:10, fontWeight:900, letterSpacing:'0.1em', textTransform:'uppercase', color:c.muted }}>Shared momentum</div>
          <div style={{ fontSize:22, fontWeight:900, color:c.tx }}>{momentum?.title || "Keep going"}</div>
          <div style={{ fontSize:13, color:c.tx2, lineHeight:1.5 }}>{momentum?.detail || "One small move keeps the week alive."}</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <span style={{ padding:'6px 9px', borderRadius:999, background:`${c.surf}CC`, border:`1px solid ${c.border}`, fontSize:11, fontWeight:800, color:c.go }}>
              {momentum?.weeklyHandled || 0} moved this week
            </span>
            <span style={{ padding:'6px 9px', borderRadius:999, background:`${c.surf}CC`, border:`1px solid ${c.border}`, fontSize:11, fontWeight:800, color:c.tx2 }}>
              {activity.length ? "Someone updated" : "You're on track"}
            </span>
          </div>
        </div>
      </div>
      <HouseholdMembersRow palette={c} members={householdMembers} />
      {!!pendingRequests.length && canManageHousehold && (
        <div style={{ background:c.surf, border:`1px solid ${c.border}`, borderRadius:18, padding:'16px 18px', display:'grid', gap:12 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, flexWrap:'wrap' }}>
            <div>
              <div style={{ fontSize:11, fontWeight:800, letterSpacing:'0.1em', textTransform:'uppercase', color:c.muted, marginBottom:4 }}>
                Waiting to join
              </div>
              <div style={{ fontSize:13, color:c.tx2, lineHeight:1.5 }}>
                Keep it easy. Let in the people you trust.
              </div>
            </div>
            <div style={{ fontSize:12, color:c.muted }}>
              {pendingRequests.length} pending
            </div>
          </div>
          <div style={{ display:'grid', gap:10 }}>
            {pendingRequests.slice(0, 3).map((request) => {
              const requestId = request.uid || request.id;
              return (
                <div
                  key={requestId}
                  style={{
                    display:'flex',
                    justifyContent:'space-between',
                    alignItems:'center',
                    gap:12,
                    flexWrap:'wrap',
                    padding:'14px 14px',
                    borderRadius:16,
                    border:`1px solid ${c.border}`,
                    background:c.surf2,
                  }}
                >
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:15, fontWeight:800, color:c.tx }}>
                      {request.displayName || request.email || 'New member'}
                    </div>
                    {!!request.email && (
                      <div style={{ fontSize:12, color:c.tx2, marginTop:2 }}>
                        {request.email}
                      </div>
                    )}
                  </div>
                  <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleApproveHouseholdRequest?.(requestId)}
                      style={{
                        padding:'10px 14px',
                        borderRadius:12,
                        border:'none',
                        background:c.ac,
                        color:'#000',
                        fontSize:13,
                        fontWeight:800,
                        cursor:'pointer',
                      }}
                    >
                      Let them in
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRejectHouseholdRequest?.(requestId)}
                      style={{
                        padding:'10px 14px',
                        borderRadius:12,
                        border:`1px solid ${c.re}`,
                        background:c.surf,
                        color:c.re,
                        fontSize:13,
                        fontWeight:800,
                        cursor:'pointer',
                      }}
                    >
                      Not now
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {activityLoading && !activity.length ? (
        <div style={{ background:c.surf, border:`1px solid ${c.border}`, borderRadius:18, padding:'16px 18px', fontSize:13, color:c.muted }}>Loading recent updates...</div>
      ) : householdId ? (
        <HouseholdActivityFeed palette={c} activity={activity} loading={activityLoading} />
      ) : (
        <ErrorState palette={c} title='Household unavailable' message='We could not load shared updates right now.' />
      )}
    </div>
  );
}
