import { useMemo, useState } from "react";
import { requestAICoachSummary } from "../../services/aiCoachClient";

export default function AICoachCard({
  palette: c,
  isMobile,
  requestPayload,
  featureEnabled = false,
  accessAllowed = false,
  scopeLabel = "this page",
  testerOnly = false,
  quickPrompts = [],
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [coach, setCoach] = useState(null);
  const [activePromptKey, setActivePromptKey] = useState("");

  const buildLocalFallbackCoach = (askSubType = "") => {
    const askType = String(requestPayload?.askType || "overview");
    const trendSummary = requestPayload?.trendSummary || {};
    const payoffSummary = requestPayload?.payoffSummary || {};
    const billsSummary = requestPayload?.billsSummary || {};
    const billMix = requestPayload?.billMix || {};
    const overviewSummary = requestPayload?.overviewSummary || {};

    if (askType === "trends") {
      const interest = Number(trendSummary?.monthlyInterest || 0);
      const principal = Number(trendSummary?.principalReduction || 0);
      const monthlyCount = Number(billMix?.monthlyCount || 0);
      const monthlyNotCovered = Number(billMix?.monthlyNotCoveredCount || 0);
      const highestRateDebt = Array.isArray(trendSummary?.highestRateDebts) ? trendSummary.highestRateDebts[0] : null;
      if (askSubType === "trends_progress") {
        return {
          headline: "Is your progress real?",
          summary: principal > 0
            ? `Yes, your current trend data shows ${principal.toLocaleString(undefined, { style: "currency", currency: "USD" })} reducing balances this month.`
            : "Your current trend data does not yet show strong balance reduction this month.",
          bullets: [
            interest > 0 ? `${interest.toLocaleString(undefined, { style: "currency", currency: "USD" })} is still going to interest this month.` : "Interest is not the main issue in the current trend view.",
            monthlyNotCovered > 0 ? `${monthlyNotCovered} monthly bill${monthlyNotCovered === 1 ? "" : "s"} still need coverage.` : "Your monthly bills look covered in the current view.",
          ].filter(Boolean),
          mainInsight: principal > 0
            ? "Your progress looks real when balances are actually going down, not just being reshuffled."
            : "The current month needs more true balance reduction before the progress feels solid.",
          whyThisMatters: "Real progress comes from reducing balances after bills and interest are handled.",
          nextStep: monthlyNotCovered > 0
            ? "Cover the monthly bills that still need attention, then push extra money toward the debt costing you the most."
            : "Keep the current bills covered, then focus extra money where it reduces balances the fastest.",
          confidence: "medium",
          disclaimer: "I used only the current data shown in your app. This is not financial, tax, or legal advice.",
        };
      }
      if (askSubType === "trends_drag") {
        return {
          headline: "What is slowing you down?",
          summary: highestRateDebt
            ? `${highestRateDebt.name} is the biggest visible drag right now because it is still charging the most interest in your current trend view.`
            : "Interest is the biggest visible drag in your current trend view.",
          bullets: [
            interest > principal ? "More of your current payment effort is going to interest than to real balance reduction." : "Some of your payment effort is still being absorbed before it fully reduces debt.",
            monthlyNotCovered > 0 ? `Uncovered monthly bills are also using budget room this month.` : "",
          ].filter(Boolean),
          mainInsight: "The biggest drag is whatever is absorbing money before it meaningfully reduces debt.",
          whyThisMatters: "Removing the main drag first helps progress show up faster.",
          nextStep: highestRateDebt?.name
            ? `Keep current bills covered, then focus extra money on ${highestRateDebt.name}.`
            : "Keep current bills covered, then focus extra money on the debt charging you the most interest.",
          confidence: "medium",
          disclaimer: "I used only the current data shown in your app. This is not financial, tax, or legal advice.",
        };
      }
      if (askSubType === "trends_balance_up") {
        return {
          headline: "Why did your balance go up?",
          summary: "The current trend data suggests something in your bills or balances may have increased, or the latest numbers may still need updating.",
          bullets: [
            interest > 0 ? "Interest can make balances feel sticky even when you are paying." : "",
            monthlyNotCovered > 0 ? "Monthly bills that restart each month can also keep pressure on the current totals." : "",
          ].filter(Boolean),
          mainInsight: "A balance increase usually needs a fresh bill update or a closer look at what changed this month.",
          whyThisMatters: "One outdated or rising bill can distort how the whole month looks.",
          nextStep: "Review the bills that changed recently, then update any balance or payment that looks out of date.",
          confidence: "medium",
          disclaimer: "I used only the current data shown in your app. This is not financial, tax, or legal advice.",
        };
      }
      return {
        headline: "Current debt trends",
        summary: interest > 0
          ? `Your current trend data shows ${interest.toLocaleString(undefined, { style: "currency", currency: "USD" })} going to interest this month and ${principal.toLocaleString(undefined, { style: "currency", currency: "USD" })} reducing balances.`
          : "Your current trend data shows how much is reducing balances this month and whether bills still need attention.",
        bullets: monthlyCount > 0 && monthlyNotCovered > 0
          ? [
              `${monthlyNotCovered} monthly bill${monthlyNotCovered === 1 ? "" : "s"} still need coverage this month.`,
              "Interest-heavy debt is still taking a share of this month's payment effort.",
            ]
          : [
              "The current trend view is based on this month's app data.",
              "Interest and principal together show whether progress is real.",
            ],
        mainInsight: monthlyCount > 0 && monthlyNotCovered > 0
          ? `${monthlyNotCovered} monthly bill${monthlyNotCovered === 1 ? "" : "s"} still need coverage this month.`
          : interest > principal
            ? "Interest is taking a big share of this month's payment effort."
            : "Your current payments are still moving balances in the right direction.",
        whyThisMatters: monthlyCount > 0 && monthlyNotCovered > 0
          ? "Monthly bills restart each month, so staying covered protects room in your budget."
          : "The split between interest and balance reduction affects how real your progress feels.",
        nextStep: monthlyCount > 0 && monthlyNotCovered > 0
          ? "Cover the monthly bills that still need attention, then focus extra money on the debt costing you the most."
          : "Check the highest-interest debt and the next bill due, then decide where your next extra dollar should go.",
        confidence: "medium",
        disclaimer: "I used only the current data shown in your app. This is not financial, tax, or legal advice.",
      };
    }

    if (askType === "payoff") {
      const target = payoffSummary?.recommendedTarget?.name || "your current payoff target";
      if (askSubType === "payoff_priority") {
        return {
          headline: "What should you pay first?",
          summary: `Your current payoff view points to ${target} as the clearest debt to focus on first.`,
          bullets: [
            "Monthly bills still need to stay covered first.",
            "After that, the current payoff target should get the extra money.",
          ],
          mainInsight: `${target} is the current priority debt.`,
          whyThisMatters: "Putting extra money in one clear place usually speeds progress up more than spreading it around.",
          nextStep: `Keep monthly bills covered, then put your extra payment toward ${target}.`,
          confidence: "medium",
          disclaimer: "I used only the current data shown in your app. This is not financial, tax, or legal advice.",
        };
      }
      if (askSubType === "payoff_reason") {
        return {
          headline: "Why this bill first?",
          summary: `${target} matters most because it is the debt your current payoff plan is already treating as the best target.`,
          bullets: [
            "The current plan already points here first.",
            "Monthly bills are separate and should stay covered, not treated as the payoff target.",
          ],
          mainInsight: "A clear target works better when you keep the plan aligned instead of splitting attention.",
          whyThisMatters: "Changing targets too often can slow visible payoff progress.",
          nextStep: `Stick with ${target} as your extra-payment target unless your balances or due priorities change.`,
          confidence: "medium",
          disclaimer: "I used only the current data shown in your app. This is not financial, tax, or legal advice.",
        };
      }
      if (askSubType === "payoff_extra") {
        return {
          headline: "What if you add more?",
          summary: `Any extra money should help most when it goes toward ${target} after your monthly bills are covered.`,
          bullets: [
            "Extra money helps most when it is concentrated.",
            "Covered monthly bills protect the rest of your plan first.",
          ],
          mainInsight: "Adding more usually works best when it strengthens the current target instead of being spread around.",
          whyThisMatters: "Concentrated extra payments usually shorten the payoff path faster.",
          nextStep: `If you can add more this month, put it toward ${target} after your regular bills are handled.`,
          confidence: "medium",
          disclaimer: "I used only the current data shown in your app. This is not financial, tax, or legal advice.",
        };
      }
      return {
        headline: "Current payoff plan",
        summary: "Your current payoff view already shows the debt the app is focusing on first.",
        bullets: [
          `The clearest payoff target right now is ${target}.`,
          "Monthly bills still need coverage first, but they are not your long-term debt target.",
        ],
        mainInsight: `The clearest target right now is ${target}.`,
        whyThisMatters: "Keeping one clear target usually makes payoff progress easier to sustain.",
        nextStep: `Keep monthly bills covered, then put extra money toward ${target}.`,
        confidence: "medium",
        disclaimer: "I used only the current data shown in your app. This is not financial, tax, or legal advice.",
      };
    }

    if (askType === "bills") {
      const dueSoon = Number(billsSummary?.dueSoonCount || 0);
      const unpaid = Number(billsSummary?.unpaidCount || 0);
      const monthlyCovered = Number(billMix?.monthlyCoveredCount || 0);
      const monthlyNotCovered = Number(billMix?.monthlyNotCoveredCount || 0);
      if (askSubType === "bills_attention") {
        return {
          headline: "Which bills need attention?",
          summary: dueSoon > 0
            ? `${dueSoon} bill${dueSoon === 1 ? "" : "s"} are due soon, and ${unpaid} still need attention overall.`
            : `${unpaid} bill${unpaid === 1 ? "" : "s"} still need attention in the current view.`,
          bullets: [
            dueSoon > 0 ? "Due-soon bills come first." : "Start with the bills that are still open or uncovered.",
            monthlyNotCovered > 0 ? `${monthlyNotCovered} monthly bill${monthlyNotCovered === 1 ? "" : "s"} are not yet covered this month.` : "",
          ].filter(Boolean),
          mainInsight: "The bills needing attention first are the ones closest to due or still uncovered this month.",
          whyThisMatters: "Staying current on bills protects the rest of your plan.",
          nextStep: dueSoon > 0
            ? "Handle the due-soon bills first, then review any monthly bills that still need coverage."
            : "Review the unpaid or uncovered bills first, then clean up anything marked as needing an update.",
          confidence: "medium",
          disclaimer: "I used only the current data shown in your app. This is not financial, tax, or legal advice.",
        };
      }
      if (askSubType === "bills_due_soon") {
        return {
          headline: "What is due soon?",
          summary: dueSoon > 0
            ? `${dueSoon} bill${dueSoon === 1 ? "" : "s"} need attention soon in the current bills view.`
            : "Nothing in the current bills view looks due soon right now.",
          bullets: [
            dueSoon > 0 ? "The due-soon bills should come before lower-urgency updates." : "You can focus on cleanup, ownership, or payoff priorities next.",
          ],
          mainInsight: dueSoon > 0
            ? "The next bills due are the highest-urgency items right now."
            : "Your immediate pressure looks lower, so you can focus on the next best cleanup or payoff move.",
          whyThisMatters: "Due-soon bills can disrupt momentum if they are missed.",
          nextStep: dueSoon > 0
            ? "Open the bills due soon and make sure they are covered first."
            : "Since nothing looks due soon, review open bills that still need attention or updates.",
          confidence: "medium",
          disclaimer: "I used only the current data shown in your app. This is not financial, tax, or legal advice.",
        };
      }
      if (askSubType === "bills_monthly_coverage") {
        return {
          headline: "Which monthly bills are covered?",
          summary: monthlyNotCovered > 0
            ? `${monthlyCovered} monthly bill${monthlyCovered === 1 ? "" : "s"} look covered, and ${monthlyNotCovered} still need attention this month.`
            : monthlyCovered > 0
              ? `Your current monthly bills look covered this month.`
              : "There are no clear monthly coverage items in the current bills view.",
          bullets: [
            "Monthly bills start over each month.",
            "They should be treated as covered this month, not paid off forever.",
          ],
          mainInsight: monthlyNotCovered > 0
            ? "The monthly bills that are not yet covered are the clearest bills task right now."
            : "Your monthly coverage looks stable in the current view.",
          whyThisMatters: "Monthly bills reset and can keep pressure on your budget every month.",
          nextStep: monthlyNotCovered > 0
            ? "Cover the monthly bills that still need attention before shifting extra money to longer-term debt."
            : "Keep the monthly bills covered, then focus extra effort on your pay-down debts.",
          confidence: "medium",
          disclaimer: "I used only the current data shown in your app. This is not financial, tax, or legal advice.",
        };
      }
      return {
        headline: "Current bills view",
        summary: dueSoon > 0
          ? `You have ${dueSoon} bill${dueSoon === 1 ? "" : "s"} due soon and ${unpaid} that still need attention.`
          : `You currently have ${unpaid} bill${unpaid === 1 ? "" : "s"} that still need attention.`,
        bullets: dueSoon > 0
          ? [
              `${dueSoon} bill${dueSoon === 1 ? "" : "s"} need attention soon.`,
              "Due-soon items should come before lower-urgency updates.",
            ]
          : [
              "The unpaid or uncovered bills are the best place to focus first.",
            ],
        mainInsight: dueSoon > 0
          ? "Your due-soon items should come before lower-urgency updates."
          : "The bills that are not yet covered are the best place to focus first.",
        whyThisMatters: "Staying current on bills protects momentum for the rest of your plan.",
        nextStep: dueSoon > 0
          ? "Handle the due-soon bills first, then review anything marked as needing an update."
          : "Review unpaid or uncovered bills first, then correct any owner or amount that looks off.",
        confidence: "medium",
        disclaimer: "I used only the current data shown in your app. This is not financial, tax, or legal advice.",
      };
    }

    if (askSubType === "overview_focus") {
      return {
        headline: "What should you focus on?",
        summary: "The clearest next move is the item that needs attention soonest or is costing you the most right now.",
        bullets: [
          "Start with what is due soon.",
          "Then focus extra effort on the debt costing you the most.",
        ],
        mainInsight: "Urgency first, then cost.",
        whyThisMatters: "It protects the month while still moving your longer-term debt plan forward.",
        nextStep: "Handle the due-soon item first, then focus extra money on the debt with the biggest cost drag.",
        confidence: "medium",
        disclaimer: "I used only the current data shown in your app. This is not financial, tax, or legal advice.",
      };
    }
    if (askSubType === "overview_change") {
      return {
        headline: "What changed this month?",
        summary: "The biggest things to watch this month are the balances that changed, the bills due soon, and whether your progress is still holding.",
        bullets: [
          overviewSummary?.paidThisMonth ? `${Number(overviewSummary.paidThisMonth).toLocaleString(undefined, { style: "currency", currency: "USD" })} has been paid this month.` : "",
          overviewSummary?.dueWithinThreeDaysCount ? `${overviewSummary.dueWithinThreeDaysCount} bill${overviewSummary.dueWithinThreeDaysCount === 1 ? "" : "s"} are due within three days.` : "",
        ].filter(Boolean),
        mainInsight: "This month’s story is about what changed in your balances and what needs attention next.",
        whyThisMatters: "Even one changed bill can affect both your trend view and your payoff plan.",
        nextStep: "Review the bills that changed or are due soon, then update anything that looks out of date.",
        confidence: "medium",
        disclaimer: "I used only the current data shown in your app. This is not financial, tax, or legal advice.",
      };
    }
    if (askSubType === "overview_track") {
      return {
        headline: "Are you on track?",
        summary: overviewSummary?.projectedPayoffDate
          ? `Right now, your app still shows you on track for ${overviewSummary.projectedPayoffDate}.`
          : "Your app still shows forward movement, but the clearest answer depends on keeping the current data up to date.",
        bullets: [
          overviewSummary?.dueWithinThreeDaysCount ? `${overviewSummary.dueWithinThreeDaysCount} bill${overviewSummary.dueWithinThreeDaysCount === 1 ? "" : "s"} still need attention soon.` : "No immediate due-soon pressure is standing out right now.",
          "Keeping balances current helps the track signal stay trustworthy.",
        ],
        mainInsight: "You stay on track by keeping current bills handled and your balances up to date.",
        whyThisMatters: "Stale bill data can make the plan look safer than it really is.",
        nextStep: "Make sure the next bills due are covered, then confirm your latest balances so the plan stays trustworthy.",
        confidence: "medium",
        disclaimer: "I used only the current data shown in your app. This is not financial, tax, or legal advice.",
      };
    }
    return {
      headline: "Current monthly overview",
      summary: "Your app already shows the key balances, bills due soon, and progress this month.",
      bullets: [
        "Start with what needs attention soonest.",
        "Then focus extra effort on the debt costing you the most.",
      ],
      mainInsight: "The best next move is the item that needs attention soonest or costs the most to carry.",
      whyThisMatters: "Timely updates keep your payoff plan and trend view trustworthy.",
      nextStep: "Check what is due soon first, then put extra focus on the debt costing you the most.",
      confidence: "medium",
      disclaimer: "I used only the current data shown in your app. This is not financial, tax, or legal advice.",
    };
  };

  const payloadReady = useMemo(
    () => Boolean(
      requestPayload
      && requestPayload?.coachState?.ready !== false
      && Array.isArray(requestPayload.accounts)
      && requestPayload.accounts.length > 0
    ),
    [requestPayload]
  );
  const emptyMessage = requestPayload?.coachState?.message || "Add at least one debt to get AI guidance.";
  const limitedMessage = (() => {
    const limitations = Array.isArray(requestPayload?.coachState?.limitations) ? requestPayload.coachState.limitations : [];
    if (limitations.includes("only_monthly_bills")) return "Most of your current items are monthly bills, so this next step is mainly about coverage priorities.";
    if (limitations.includes("missing_payoff_target")) return "Your payoff data is incomplete, so this next step is limited.";
    if (limitations.includes("missing_trend_context")) return "Your trend data is incomplete, so this next step is limited.";
    if (limitations.includes("missing_balances")) return "Some bill balances look incomplete, so this next step is limited.";
    return "";
  })();

  const toFriendlyError = (err) => {
    const code = String(err?.code || "");
    const message = String(err?.message || "").toLowerCase();
    if (code.includes("unauthenticated") || message.includes("sign in to use tracktozero guide")) {
      return "Sign in to use TrackToZero Guide.";
    }
    if (code.includes("resource-exhausted") || message.includes("daily limit")) {
      return "You've reached today's TrackToZero Guide limit. Try again tomorrow.";
    }
    if (code.includes("permission-denied") || message.includes("tester access only")) {
      return "TrackToZero Guide is not available right now.";
    }
    if (code.includes("failed-precondition") || message.includes("disabled") || message.includes("not configured")) {
      return "TrackToZero Guide is not available right now.";
    }
    if (message.includes("at least one debt")) {
      return "Add at least one debt to get AI guidance.";
    }
    return "TrackToZero Guide is not available right now.";
  };

  if (!featureEnabled || !accessAllowed) return null;

  const handleAsk = async (prompt = null) => {
    if (!payloadReady || loading) return;
    setLoading(true);
    setError("");
    const nextPromptKey = prompt?.key || requestPayload?.askSubType || "";
    setActivePromptKey(nextPromptKey);
    try {
      const next = await requestAICoachSummary({
        ...requestPayload,
        askSubType: nextPromptKey,
        askPromptLabel: prompt?.label || "",
      });
      setCoach(next);
      setOpen(true);
    } catch (err) {
      const friendly = toFriendlyError(err);
      const canUseLocalFallback = !(
        friendly === "Sign in to use TrackToZero Guide."
        || friendly === "You've reached today's TrackToZero Guide limit. Try again tomorrow."
      );
      if (payloadReady && canUseLocalFallback) {
        setCoach(buildLocalFallbackCoach(nextPromptKey));
        setError("");
      } else {
        setError(friendly);
      }
      setOpen(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${c.surf}, ${c.surf2})`,
        border: `1px solid ${c.border}`,
        borderRadius: 16,
        padding: isMobile ? "14px 16px" : "16px 18px",
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>
            TrackToZero Guide
          </div>
          <div style={{ fontSize: 16, fontWeight: 900, color: c.tx, marginBottom: 4 }}>
            See what matters next in your path to zero
          </div>
          <div style={{ fontSize: 12, color: c.tx2, lineHeight: 1.5 }}>
            Uses your current data to highlight what needs attention next.
          </div>
          {testerOnly && (
            <div style={{ marginTop: 8 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 8px",
                  borderRadius: 999,
                  background: c.surf,
                  border: `1px solid ${c.border}`,
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: c.muted,
                }}
              >
                Tester only
              </span>
            </div>
          )}
          {!!quickPrompts.length && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {quickPrompts.map((prompt) => {
                const active = activePromptKey === prompt.key;
                return (
                  <button
                    key={prompt.key}
                    type="button"
                    onClick={() => handleAsk(prompt)}
                    disabled={!payloadReady || loading}
                    style={{
                      padding: "7px 10px",
                      borderRadius: 999,
                      border: `1px solid ${active ? c.ac : c.border2}`,
                      background: active ? c.acD : c.surf,
                      color: active ? c.ac : c.tx2,
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: !payloadReady || loading ? "default" : "pointer",
                      opacity: !payloadReady || loading ? 0.65 : 1,
                    }}
                  >
                    {prompt.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: `1px solid ${c.border2}`,
              background: c.surf,
              color: c.tx,
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {open ? "Hide Guide" : "Open Guide"}
          </button>
          <button
            type="button"
            onClick={handleAsk}
            disabled={!payloadReady || loading}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "none",
              background: !payloadReady || loading ? c.border2 : c.ac,
              color: !payloadReady || loading ? c.muted : "#062532",
              fontSize: 12,
              fontWeight: 900,
              cursor: !payloadReady || loading ? "default" : "pointer",
            }}
          >
            {loading ? "Thinking..." : coach ? "Refresh TrackToZero Guide" : "Open TrackToZero Guide"}
          </button>
        </div>
      </div>

      {open && (
        <div
          style={{
            marginTop: 14,
            padding: "14px 16px",
            borderRadius: 12,
            background: c.surf,
            border: `1px solid ${c.border}`,
          }}
        >
          {!payloadReady && (
            <div style={{ fontSize: 13, color: c.muted, lineHeight: 1.6 }}>
              {emptyMessage}
            </div>
          )}

          {!!error && (
            <div style={{ fontSize: 13, color: c.da, lineHeight: 1.6 }}>
              {error}
            </div>
          )}

          {!error && payloadReady && !coach && !loading && (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.6 }}>
                Open TrackToZero Guide to see what stands out and what to do next.
              </div>
              {!!limitedMessage && (
                <div style={{ fontSize: 12, color: c.muted, lineHeight: 1.5 }}>
                  {limitedMessage}
                </div>
              )}
            </div>
          )}

          {!error && coach && (
            <div>
              {!!limitedMessage && (
                <div style={{ fontSize: 12, color: c.muted, lineHeight: 1.5, marginBottom: 10 }}>
                  {limitedMessage}
                </div>
              )}
              <div style={{ fontSize: 18, fontWeight: 900, color: c.tx, marginBottom: 8 }}>{coach.headline}</div>
              <div style={{ fontSize: 13, color: c.tx2, lineHeight: 1.7, marginBottom: 10 }}>{coach.summary}</div>
              {Array.isArray(coach.bullets) && coach.bullets.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  {coach.bullets.slice(0, 3).map((bullet, index) => (
                    <div key={`${bullet}-${index}`} style={{ fontSize: 12, color: c.tx2, lineHeight: 1.6, marginBottom: 6 }}>
                      • {bullet}
                    </div>
                  ))}
                </div>
              )}
              {!!coach.mainInsight && (
                <div style={{ fontSize: 13, color: c.tx, lineHeight: 1.6, marginBottom: 10 }}>
                  <strong>What stands out:</strong> {coach.mainInsight}
                </div>
              )}
              {!!coach.whyThisMatters && (
                <div style={{ fontSize: 12, color: c.tx2, lineHeight: 1.6, marginBottom: 10 }}>
                  <strong>Why:</strong> {coach.whyThisMatters}
                </div>
              )}
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: c.acD,
                  border: `1px solid ${c.ac}33`,
                  fontSize: 12,
                  color: c.tx,
                  marginBottom: 10,
                }}
              >
                <strong>Next step:</strong> {coach.nextStep}
              </div>
              <div style={{ fontSize: 11, color: c.muted, lineHeight: 1.5 }}>
                {coach.disclaimer}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
