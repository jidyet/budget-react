import { useState } from "react";
import PlanStatusCard from "../components/billing/PlanStatusCard";
import UpgradeCard from "../components/billing/UpgradeCard";

const PLAN_OPTIONS = [
  {
    id: "monthly",
    label: "Monthly",
    price: "$3.99/mo",
    note: "Keep the shared flow simple.",
  },
  {
    id: "yearly",
    label: "Yearly",
    price: "$44.99/yr",
    note: "Save a little and keep going.",
  },
];

// [label, free, premium]
const FEATURE_COMPARISON = [
  ["Track bills & balances",         true,  true],
  ["Payoff planner",                 true,  true],
  ["Monthly trends",                 true,  true],
  ["Household sharing",              "2 people", "Up to 12"],
  ["Advanced progress visuals",      false, true],
  ["Bill reminders & nudges",        false, true],
  ["Weekly summaries",               false, true],
  ["Export & backup tools",          false, true],
];

export default function BillingPage({
  mounted,
  c,
  isMobile,
  subscription,
  stripeReady,
  onStartCheckout,
  onManageBilling,
}) {
  const [interval, setInterval] = useState("monthly");
  const billingComingSoon = !subscription?.billingEnabled;
  const testerUnlocked = subscription?.testerMode && subscription?.premiumUnlockedForTesters;

  return (
    <div style={{ opacity: mounted ? 1 : 0, transition: "opacity .3s", display: "grid", gap: 14 }}>
      <div
        style={{
          background: `linear-gradient(135deg, ${c.ac}18, ${c.surf} 32%, ${c.surf2} 78%, ${c.wa}14)`,
          border: `1px solid ${c.border}`,
          borderRadius: 24,
          padding: isMobile ? "18px 18px" : "22px 24px",
          display: "grid",
          gap: 10,
          boxShadow: `0 18px 42px ${c.ac}10`,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted }}>
          Billing
        </div>
        <div style={{ fontSize: isMobile ? 26 : 30, fontWeight: 900, color: c.tx }}>
          Keep your momentum going
        </div>
        <div style={{ fontSize: 14, color: c.tx2, lineHeight: 1.6, maxWidth: 660 }}>
          {billingComingSoon
            ? "Early testers have full access right now. Billing stays quiet until launch."
            : "Keep the core flow free. Upgrade when you want more shared progress, richer insights, and a little more support around the edges."}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
        <PlanStatusCard
          palette={c}
          subscription={subscription}
          onManageBilling={onManageBilling}
          onUpgrade={() => onStartCheckout(interval)}
          billingReady={stripeReady}
        />

        <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 20, padding: "18px 18px", display: "grid", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>
              Choose your pace
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: c.tx }}>Go further together</div>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {PLAN_OPTIONS.map((option) => {
              const selected = interval === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setInterval(option.id)}
                  style={{
                    textAlign: "left",
                    padding: "14px 16px",
                    borderRadius: 16,
                    border: `1px solid ${selected ? c.ac : c.border}`,
                    background: selected ? `${c.ac}14` : c.surf2,
                    color: c.tx,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "center",
                    cursor: "pointer",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 900 }}>{option.label}</div>
                    <div style={{ fontSize: 12, color: c.tx2 }}>{option.note}</div>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: selected ? c.ac : c.tx }}>
                    {option.price}
                  </div>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => onStartCheckout(interval)}
            disabled={!stripeReady || billingComingSoon}
            style={{
              padding: "12px 16px",
              borderRadius: 999,
              border: "none",
              background: stripeReady && !billingComingSoon ? c.ac : c.border2,
              color: stripeReady && !billingComingSoon ? "#001014" : c.tx2,
              fontSize: 13,
              fontWeight: 900,
              cursor: stripeReady && !billingComingSoon ? "pointer" : "not-allowed",
            }}
          >
            {billingComingSoon
              ? "Coming soon"
              : stripeReady
              ? (subscription?.premium ? "Change plan" : "Unlock shared progress")
              : "Billing setup soon"}
          </button>
          {billingComingSoon ? (
            <div style={{ fontSize: 12, color: c.muted, lineHeight: 1.5 }}>
              Billing is turned off for early testers. Everything stays open while you help shape the app.
            </div>
          ) : !stripeReady ? (
            <div style={{ fontSize: 12, color: c.muted, lineHeight: 1.5 }}>
              Billing stays off during soft launch while checkout and subscription syncing are being finalized.
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 20, padding: "18px 18px", display: "grid", gap: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginBottom: 4 }}>
            Free vs Premium
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: c.tx }}>Same calm flow. More depth.</div>
        </div>
        <div style={{ display: "grid", gap: 0, borderRadius: 14, overflow: "hidden", border: `1px solid ${c.border}` }}>
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px", background: c.surf2, padding: "10px 14px", borderBottom: `1px solid ${c.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: c.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>Feature</div>
            <div style={{ fontSize: 11, fontWeight: 800, color: c.muted, letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "center" }}>Free</div>
            <div style={{ fontSize: 11, fontWeight: 800, color: c.ac, letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "center" }}>Pro</div>
          </div>
          {FEATURE_COMPARISON.map(([label, free, premium], i) => (
            <div
              key={label}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 80px 80px",
                padding: "10px 14px",
                borderBottom: i < FEATURE_COMPARISON.length - 1 ? `1px solid ${c.border}` : "none",
                background: i % 2 === 0 ? c.surf : c.surf2,
                alignItems: "center",
              }}
            >
              <div style={{ fontSize: 13, color: c.tx }}>{label}</div>
              <div style={{ textAlign: "center", fontSize: 13 }}>
                {free === true
                  ? <span style={{ color: "#2b8e37", fontWeight: 800 }}>✓</span>
                  : free === false
                    ? <span style={{ color: c.muted }}>—</span>
                    : <span style={{ fontSize: 11, color: c.tx2, fontWeight: 700 }}>{free}</span>}
              </div>
              <div style={{ textAlign: "center", fontSize: 13 }}>
                {premium === true
                  ? <span style={{ color: c.ac, fontWeight: 800 }}>✓</span>
                  : premium === false
                    ? <span style={{ color: c.muted }}>—</span>
                    : <span style={{ fontSize: 11, color: c.ac, fontWeight: 800 }}>{premium}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <UpgradeCard
        palette={c}
        title="See more of your progress"
        detail={testerUnlocked
          ? "You already have the full tester path open. Billing will show up here later when launch is closer."
          : "The free plan keeps the basics open. Premium adds richer progress, more shared room, and cleaner support when you want it."}
        cta={billingComingSoon ? "Coming soon" : (subscription?.premium ? "Manage billing" : (stripeReady ? "Start premium" : "Billing setup soon"))}
        onClick={billingComingSoon ? undefined : (subscription?.premium ? onManageBilling : (stripeReady ? () => onStartCheckout(interval) : undefined))}
        disabled={billingComingSoon || (!subscription?.premium && !stripeReady)}
      />
    </div>
  );
}
