import { useEffect, useState } from "react";
import Card from "../ui/Card.jsx";
import Button from "../ui/Button.jsx";
import Badge from "../ui/Badge.jsx";
import Field from "../ui/Field.jsx";
import Select from "../ui/Select.jsx";
import Input from "../ui/Input.jsx";
import MoneyInput from "../ui/MoneyInput.jsx";
import WarningCallout from "../ui/WarningCallout.jsx";
import InfoCallout from "../ui/InfoCallout.jsx";
import LoadingState from "../ui/LoadingState.jsx";
import ConfirmationDialog from "../ui/ConfirmationDialog.jsx";
import { ttzPalette, TYPE_SCALE } from "../theme.js";
import { formatMoney as money, formatPercent as percent } from "../formatting.js";
import { presentedOwnerLabel } from "../../../domain/tracktozero/ownership.js";
import { PLAN_DESTINATIONS, resolvePlanDestination, buildPlanPath, navigateToPlanDestination } from "./planRouting.js";

const GAP = "var(--ttz-space-4, 16px)";

function PlanMetric({ label, value, tone = "default" }) {
  const colors = {
    default: { bg: ttzPalette.surf2, border: ttzPalette.border, color: ttzPalette.tx },
    accent: { bg: ttzPalette.acS, border: ttzPalette.ac, color: ttzPalette.ac },
    warning: { bg: "#fff7ed", border: "#fed7aa", color: "#c2410c" },
    success: { bg: "#f0fdf4", border: "#bbf7d0", color: "#166534" },
  }[tone] || { bg: ttzPalette.surf2, border: ttzPalette.border, color: ttzPalette.tx };

  return (
    <div style={{ padding: 14, borderRadius: 14, border: `1px solid ${colors.border}`, background: colors.bg }}>
      <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>{label}</div>
      <div style={{ ...TYPE_SCALE.metricSm, color: colors.color, marginTop: 6 }}>{value}</div>
    </div>
  );
}

function formatMonthLabel(value) {
  if (!value) return "n/a";
  const date = new Date(`${value}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(date);
}

// Presentation-only date-label arithmetic - both inputs are already-computed
// "Mon YYYY" strings from trusted service output (payoffSimulate's own
// month labels), so comparing them is not new payoff math, just display.
function monthLabelDeltaText(fromLabel, toLabel) {
  if (!fromLabel || !toLabel) return "";
  const from = new Date(`1 ${fromLabel}`);
  const to = new Date(`1 ${toLabel}`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return "";
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (months === 0) return "Same payoff time as your current plan";
  const count = Math.abs(months);
  const unit = `month${count === 1 ? "" : "s"}`;
  return months < 0 ? `${count} ${unit} sooner than your current plan` : `${count} ${unit} later than your current plan`;
}

function PayoffOrderList({ debts = [], isHousehold = false, highlightFirst = false }) {
  if (!debts.length) return <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>No debts included in this preview.</p>;

  return (
    <ol style={{ display: "grid", gap: 10, paddingLeft: 20, margin: 0 }}>
      {debts.map((debt, index) => (
        <li key={debt.id} style={{ display: "grid", gap: 4, fontWeight: highlightFirst && index === 0 ? 700 : 500 }}>
          <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx }}>
            <span style={{ fontWeight: 700 }}>{index + 1}.</span> {debt.name}
          </div>
          <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx2 }}>
            {money(debt.currentBalance || 0)}
            {debt.aprStatus === "unknown" ? " · Unknown APR" : ` · ${percent(debt.apr)}`}
            {isHousehold ? ` · ${presentedOwnerLabel(debt)}` : ""}
            {debt.projectedZeroDate ? ` · ${formatMonthLabel(debt.projectedZeroDate)}` : ""}
          </div>
        </li>
      ))}
    </ol>
  );
}

function StrategyHeader({ title, subtitle, isActive, status }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>{title}</div>
          <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx, marginTop: 4 }}>{subtitle}</div>
        </div>
        {isActive ? <Badge tone="success">Active strategy</Badge> : <Badge tone="neutral">Preview</Badge>}
      </div>
      {status ? <WarningCallout title="Watch this">{status}</WarningCallout> : null}
    </div>
  );
}

function MyPlanView({ snapshot, service, refresh, runAction, writeState }) {
  const activeVersion = snapshot?.activeContext?.version;
  const targetDebt = snapshot.targetDebt || snapshot.payoffQueue?.[0];
  const goTo = navigateToPlanDestination;

  if (!activeVersion) {
    return (
      <Card variant="default">
        <div style={{ display: "grid", gap: 18 }}>
          <div>
            <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>My Plan</div>
            <div style={{ ...TYPE_SCALE.pageTitle, color: ttzPalette.tx, marginTop: 6 }}>Build your path to $0</div>
          </div>
          <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, margin: 0 }}>
            You haven&apos;t activated a payoff plan yet. See what Snowball and Avalanche would look like with your debts,
            compare the tradeoffs, or test another path before choosing the plan you want to follow.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button variant="primary" onClick={() => goTo("compare")}>Compare Snowball vs Avalanche</Button>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {PLAN_DESTINATIONS.filter((item) => item.key !== "my-plan").slice(0, 4).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => goTo(item.key)}
                  style={{ border: `1px solid ${ttzPalette.border}`, background: "transparent", color: ttzPalette.tx2, borderRadius: 999, padding: "8px 12px", cursor: "pointer" }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>
    );
  }

  const strategyLabel = activeVersion.strategy === "snowball" ? "Snowball" : "Avalanche";
  // The active plan's payoff queue reflects activeVersion.startingDebtSnapshot,
  // frozen at the last activation/reforecast - deliberately, so an activated
  // plan never silently absorbs a newly added debt without an explicit
  // reforecast. Comparing today's live, still-included debts against that
  // frozen queue is presentation-only (a set difference, not new payoff
  // math) so My Plan can honestly say a debt exists outside the plan
  // instead of just going quiet about it.
  const queuedIds = new Set((snapshot.payoffQueue || []).map((debt) => debt.id));
  const debtsAwaitingReforecast = (snapshot.debts || []).filter((debt) => debt.status === "active" && debt.includedInCorePayoffPlan !== false && !queuedIds.has(debt.id));

  return (
    <div style={{ display: "grid", gap: GAP }}>
      {debtsAwaitingReforecast.length ? (
        <WarningCallout title="New debts aren't in this plan yet">
          {debtsAwaitingReforecast.map((debt) => debt.name).join(", ")} {debtsAwaitingReforecast.length === 1 ? "was" : "were"} added after this plan was last set, so {debtsAwaitingReforecast.length === 1 ? "it isn't" : "they aren't"} reflected below yet. Reforecast to include {debtsAwaitingReforecast.length === 1 ? "it" : "them"}.
        </WarningCallout>
      ) : null}
      <Card variant="default" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>My Plan</div>
            <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx, marginTop: 4 }}>Active</div>
          </div>
          <Badge tone="success">Active</Badge>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: GAP, marginTop: GAP }}>
          <PlanMetric label="Projected debt-free" value={snapshot.projectedZeroDate || "n/a"} tone="accent" />
          <PlanMetric label="Strategy" value={strategyLabel} />
          <PlanMetric label="Monthly commitment" value={money(activeVersion.extraMonthlyPayment || 0)} />
          <PlanMetric label="Current target" value={targetDebt?.name || "n/a"} />
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(260px, 0.8fr)", gap: GAP }}>
        <Card variant="default">
          <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Your path to $0</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, overflowX: "auto", paddingTop: 14 }}>
            {snapshot.payoffQueue?.map((debt, index) => (
              <div key={debt.id} style={{ minWidth: 120, textAlign: "center" }}>
                <div style={{ width: 16, height: 16, borderRadius: 999, background: index === 0 ? ttzPalette.ac : ttzPalette.border, margin: "0 auto 8px", border: `2px solid ${ttzPalette.surf}` }} />
                <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.tx, fontWeight: 700 }}>{debt.name}</div>
                <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted }}>
                  {debt.projectedZeroDate ? formatMonthLabel(debt.projectedZeroDate) : index === 0 ? "Current target" : "Up next"}
                </div>
              </div>
            )) || <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>No payoff order yet.</div>}
          </div>
        </Card>

        <Card variant="default">
          <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>Current target</div>
          <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx, marginTop: 8 }}>{targetDebt?.name || "No target"}</div>
          <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 4 }}>{money(targetDebt?.currentBalance || 0)} remaining</div>
          <div style={{ marginTop: GAP, display: "grid", gap: 6 }}>
            <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted }}>Interest: {targetDebt?.aprStatus === "unknown" ? "Unknown APR" : percent(targetDebt?.apr || 0)}</div>
            <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted }}>Owner: {presentedOwnerLabel(targetDebt)}</div>
          </div>
        </Card>
      </div>

      <Card variant="default">
        <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Payoff order</div>
        <div style={{ marginTop: GAP }}>
          <PayoffOrderList debts={snapshot.payoffQueue || []} isHousehold={snapshot.workspace.type === "household"} highlightFirst />
        </div>
      </Card>

      {snapshot.warnings?.length ? (
        <WarningCallout title="Plan status">{snapshot.warnings.map((warning) => warning.message || warning.code).join(" ")}</WarningCallout>
      ) : null}

      <ManagePlanCard snapshot={snapshot} service={service} refresh={refresh} runAction={runAction} writeState={writeState} activeVersion={activeVersion} />
    </div>
  );
}

// UX-4.1 Part 10: My Plan's secondary actions - reforecast, change
// strategy, and a lightweight plan history (not the full UX-7 milestone
// system, explicitly deferred). Reforecast reuses the exact same
// previewReforecast/applyReforecast primitives as everywhere else in the
// Plan Hub; changing strategy just links to the standalone Snowball/
// Avalanche pages, which already own that confirm-before-apply flow.
function ManagePlanCard({ snapshot, service, refresh, runAction, writeState, activeVersion }) {
  const [draftExtra, setDraftExtra] = useState(String(activeVersion.extraMonthlyPayment || 0));
  const [preview, setPreview] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [history, setHistory] = useState(null);
  const workspaceId = snapshot.workspace.id;

  useEffect(() => {
    let active = true;
    service.listPlanHistory(workspaceId).then((result) => { if (active) setHistory(result || []); });
    return () => { active = false; };
  }, [service, workspaceId, writeState.success]);

  const hasChanges = (Number(draftExtra) || 0) !== Number(activeVersion.extraMonthlyPayment || 0);

  const previewChanges = () => runAction("preview reforecast", async () => {
    setPreview(await service.previewReforecast(workspaceId, { extraMonthlyPayment: Number(draftExtra) || 0 }));
  }, { write: false });

  const applyChanges = () => runAction("apply reforecast", async () => {
    await service.applyReforecast(workspaceId, { extraMonthlyPayment: Number(draftExtra) || 0 });
    setPreview(null);
    setConfirmOpen(false);
    await refresh();
  });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: GAP }}>
      <Card variant="default">
        <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Reforecast</div>
        <p style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted, marginTop: 4 }}>Adjust your monthly extra payment. Preview before you apply.</p>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginTop: GAP }}>
          <Field label="Extra monthly payment">
            <MoneyInput value={draftExtra} min="0" step="0.01" onChange={(event) => { setDraftExtra(event.target.value); setPreview(null); }} />
          </Field>
          <Button variant="secondary" disabled={!hasChanges || writeState.inProgress} loading={writeState.action === "preview reforecast"} onClick={previewChanges}>Preview</Button>
        </div>
        {preview ? (
          <div style={{ marginTop: GAP }}>
            <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx }}>
              Payoff moves from <strong>{preview.oldProjectedZeroDate || "n/a"}</strong> to <strong>{preview.proposedZeroDate || "n/a"}</strong>.
            </p>
            <Button variant="primary" disabled={writeState.inProgress} onClick={() => setConfirmOpen(true)} style={{ marginTop: 8 }}>Apply</Button>
          </div>
        ) : null}
        <ConfirmationDialog
          open={confirmOpen}
          title="Apply this to your real plan?"
          confirmLabel={writeState.action === "apply reforecast" ? "Applying..." : "Apply"}
          onConfirm={applyChanges}
          onCancel={() => setConfirmOpen(false)}
        >
          <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx }}>This creates a new plan version. Your current plan is kept in your plan history, never overwritten.</p>
          {preview ? (
            <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 8 }}>
              Estimated payoff moves from <strong>{preview.oldProjectedZeroDate || "n/a"}</strong> to <strong>{preview.proposedZeroDate || "n/a"}</strong>.
            </p>
          ) : null}
        </ConfirmationDialog>
      </Card>

      <Card variant="default">
        <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Change strategy</div>
        <p style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted, marginTop: 4 }}>Compare Snowball and Avalanche side by side, or inspect either one directly.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: GAP }}>
          <Button variant="secondary" onClick={() => navigateToPlanDestination("snowball")}>Snowball</Button>
          <Button variant="secondary" onClick={() => navigateToPlanDestination("avalanche")}>Avalanche</Button>
          <Button variant="secondary" onClick={() => navigateToPlanDestination("compare")}>Compare</Button>
        </div>
      </Card>

      <Card variant="default">
        <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Plan history</div>
        {history === null ? (
          <LoadingState label="Loading plan history..." />
        ) : !history.length ? (
          <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 8 }}>No plan history yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 8, marginTop: GAP }}>
            {history.map((version) => (
              <div key={version.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, borderBottom: `1px solid ${ttzPalette.border}`, paddingBottom: 8 }}>
                <div>
                  <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx, fontWeight: 700 }}>
                    Version {version.versionNumber} · {version.strategy === "snowball" ? "Snowball" : "Avalanche"}
                    {version.id === activeVersion.id ? <Badge tone="success" style={{ marginLeft: 6 }}>Current</Badge> : null}
                  </div>
                  <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted, marginTop: 2 }}>
                    {version.createdBecause === "activation" ? "Activated" : version.createdBecause === "reforecast" ? "Reforecast" : "Updated"} · {money(version.extraMonthlyPayment)}/mo extra
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// UX-4.1: applying a strategy always requires explicit confirmation with a
// before/after figure - never an implicit apply-on-click. The confirm step
// lives here, once, so Snowball/Avalanche (and anything else that reaches
// this component) can't accidentally skip it.
function StrategyExperience({ title, subtitle, result, isActive, isHousehold, onApply, onInspect, useLabel, applyActionLabel, runAction, writeState, currentZeroDate }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const canUse = !!onApply && !isActive;

  const confirmApply = () => runAction(applyActionLabel, async () => {
    await onApply();
    setConfirmOpen(false);
  });

  return (
    <Card variant={isActive ? "highlight" : "default"}>
      <StrategyHeader title={title} subtitle={subtitle} isActive={isActive} status={result?.warnings?.length ? result.warnings[0]?.message : ""} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: GAP, marginTop: GAP }}>
        <PlanMetric label="Projected $0" value={result?.projectedZeroDate || "n/a"} tone="accent" />
        <PlanMetric label="Months to $0" value={String(result?.monthsToZero ?? "n/a")} />
        <PlanMetric label="First target" value={result?.payoffOrder?.[0]?.name || "n/a"} />
        <PlanMetric label="Projected interest" value={money(result?.estimatedInterest || 0)} />
      </div>

      <div style={{ marginTop: GAP }}>
        <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted, marginBottom: 6 }}>Payoff order</div>
        <PayoffOrderList debts={result?.payoffOrder || []} isHousehold={isHousehold} highlightFirst />
      </div>

      {onApply && !isActive ? (
        <div style={{ marginTop: GAP, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Button variant="primary" onClick={() => setConfirmOpen(true)} disabled={writeState?.inProgress}>
            {useLabel}
          </Button>
        </div>
      ) : onInspect ? (
        <div style={{ marginTop: GAP }}>
          <Button variant={isActive ? "secondary" : "primary"} onClick={onInspect}>
            {useLabel}
          </Button>
        </div>
      ) : null}

      {canUse ? (
        <ConfirmationDialog
          open={confirmOpen}
          title={`Switch to ${title}?`}
          confirmLabel={writeState?.action === applyActionLabel ? "Applying..." : "Apply"}
          onConfirm={confirmApply}
          onCancel={() => setConfirmOpen(false)}
        >
          <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx }}>This creates a new plan version. Your current plan is kept in your plan history, never overwritten.</p>
          <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 8 }}>
            Estimated payoff moves from <strong>{currentZeroDate || "n/a"}</strong> to <strong>{result?.projectedZeroDate || "n/a"}</strong>.
          </p>
        </ConfirmationDialog>
      ) : null}
    </Card>
  );
}

function SnowballView({ snapshot, service, refresh, runAction, writeState }) {
  const [result, setResult] = useState(null);
  const workspaceId = snapshot.workspace.id;

  useEffect(() => {
    let active = true;
    service.compareStrategies(workspaceId).then((data) => {
      if (active) setResult(data);
    });
    return () => {
      active = false;
    };
  }, [service, workspaceId]);

  if (!result) return <LoadingState label="Loading Snowball" />;

  const isActive = (snapshot.activeContext?.version?.strategy || "") === "snowball";
  return (
    <StrategyExperience
      title="Snowball"
      subtitle="Smallest balance first"
      result={result.snowball}
      isActive={isActive}
      isHousehold={snapshot.workspace.type === "household"}
      useLabel="Use Snowball"
      applyActionLabel="use snowball"
      runAction={runAction}
      writeState={writeState}
      currentZeroDate={snapshot.projectedZeroDate}
      onApply={async () => {
        await service.applyReforecast(workspaceId, { strategy: "snowball" });
        await refresh();
      }}
    />
  );
}

function AvalancheView({ snapshot, service, refresh, runAction, writeState }) {
  const [result, setResult] = useState(null);
  const workspaceId = snapshot.workspace.id;

  useEffect(() => {
    let active = true;
    service.compareStrategies(workspaceId).then((data) => {
      if (active) setResult(data);
    });
    return () => {
      active = false;
    };
  }, [service, workspaceId]);

  if (!result) return <LoadingState label="Loading Avalanche" />;

  const isActive = (snapshot.activeContext?.version?.strategy || "") === "avalanche";
  return (
    <StrategyExperience
      title="Avalanche"
      subtitle="Highest APR first"
      result={result.avalanche}
      isActive={isActive}
      isHousehold={snapshot.workspace.type === "household"}
      useLabel="Use Avalanche"
      applyActionLabel="use avalanche"
      runAction={runAction}
      writeState={writeState}
      currentZeroDate={snapshot.projectedZeroDate}
      onApply={async () => {
        await service.applyReforecast(workspaceId, { strategy: "avalanche" });
        await refresh();
      }}
    />
  );
}

function CompareStrategiesView({ snapshot, service }) {
  const [result, setResult] = useState(null);
  const workspaceId = snapshot.workspace.id;

  useEffect(() => {
    let active = true;
    service.compareStrategies(workspaceId).then((data) => {
      if (active) setResult(data);
    });
    return () => {
      active = false;
    };
  }, [service, workspaceId]);

  if (!result) return <LoadingState label="Comparing strategies" />;

  const interestSavings = (result.snowball.estimatedInterest || 0) - (result.avalanche.estimatedInterest || 0);
  const snowballFaster = (result.snowball.monthsToZero || 0) < (result.avalanche.monthsToZero || 0);

  return (
    <div style={{ display: "grid", gap: GAP }}>
      <Card variant="default">
        <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Snowball vs Avalanche</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: GAP, marginTop: GAP }}>
          <PlanMetric label="Snowball $0" value={result.snowball.projectedZeroDate || "n/a"} tone="accent" />
          <PlanMetric label="Avalanche $0" value={result.avalanche.projectedZeroDate || "n/a"} tone="accent" />
          <PlanMetric label="Snowball months" value={String(result.snowball.monthsToZero ?? "n/a")} />
          <PlanMetric label="Avalanche months" value={String(result.avalanche.monthsToZero ?? "n/a")} />
          <PlanMetric label="Snowball interest" value={money(result.snowball.estimatedInterest || 0)} />
          <PlanMetric label="Avalanche interest" value={money(result.avalanche.estimatedInterest || 0)} />
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: GAP }}>
        <StrategyExperience title="Snowball" subtitle="Smallest balance first" result={result.snowball} isActive={result.activeStrategy === "snowball"} isHousehold={snapshot.workspace.type === "household"} useLabel="Inspect Snowball" onInspect={() => navigateToPlanDestination("snowball")} />
        <StrategyExperience title="Avalanche" subtitle="Highest APR first" result={result.avalanche} isActive={result.activeStrategy === "avalanche"} isHousehold={snapshot.workspace.type === "household"} useLabel="Inspect Avalanche" onInspect={() => navigateToPlanDestination("avalanche")} />
      </div>

      <InfoCallout>
        {snowballFaster
          ? `Snowball is projected to reach $0 in ${result.snowball.monthsToZero} months, while Avalanche is ${result.avalanche.monthsToZero}. This tradeoff is about momentum vs interest savings.`
          : `Avalanche is projected to save about ${money(Math.abs(interestSavings))} in interest and finish in ${result.avalanche.monthsToZero} months.`}
      </InfoCallout>
    </div>
  );
}

function WhatIfView({ snapshot, service, runAction, writeState }) {
  const [mode, setMode] = useState("recurring");
  const [extra, setExtra] = useState("100");
  const [amount, setAmount] = useState("500");
  const [targetDebtId, setTargetDebtId] = useState("");
  const [preview, setPreview] = useState(null);
  const [previewNotice, setPreviewNotice] = useState("");
  const [scenarioName, setScenarioName] = useState("");
  const workspaceId = snapshot.workspace.id;
  const hasActivePlan = !!snapshot.activeContext?.version;
  const debtOptions = [{ id: "", name: "All included debts" }, ...(snapshot.payoffQueue || [])];

  // UX-4.1: every preview branch is now zero-write AND resilient - a targeted
  // "add money every month" preview works even before any plan is active
  // (via previewCustomTarget's optional extraMonthlyPayment override), and
  // the untargeted "All" case honestly explains why it needs an active plan
  // instead of silently doing nothing. runAction (not a bare async
  // onClick) means any real failure surfaces in the shared error banner
  // instead of vanishing as an unhandled rejection.
  const runPreview = () => runAction("preview what-if", async () => {
    setPreviewNotice("");
    setPreview(null);
    if (mode === "recurring") {
      const addition = Number(extra) || 0;
      const currentExtra = Number(snapshot.activeContext?.version?.extraMonthlyPayment || 0);
      const nextExtra = currentExtra + addition;
      if (targetDebtId) {
        const result = await service.previewCustomTarget(workspaceId, { targetDebtId, extraMonthlyPayment: nextExtra });
        if (!result) { setPreviewNotice("That debt could not be found."); return; }
        setPreview({ baseline: snapshot.projectedZeroDate, scenario: result.custom.projectedZeroDate, interest: result.custom.estimatedInterest });
        return;
      }
      if (!hasActivePlan) {
        setPreviewNotice("Build and activate a plan first (try Compare) so there's a current payment to add to - or pick a specific debt above to preview targeting extra money at it right away.");
        return;
      }
      const result = await service.previewReforecast(workspaceId, { extraMonthlyPayment: nextExtra });
      setPreview({ baseline: result.oldProjectedZeroDate, scenario: result.proposedZeroDate, interest: result.projection.reduce((sum, row) => sum + Number(row.total_interest || 0), 0) });
      return;
    }

    if (mode === "one-time") {
      const result = await service.previewOneTimePayment(workspaceId, { amount: Number(amount) || 0, targetDebtId });
      if (!result) { setPreviewNotice("Enter an amount and choose a debt to preview."); return; }
      setPreview({ baseline: result.baseline.projectedZeroDate, scenario: result.withLumpSum.projectedZeroDate, interest: result.withLumpSum.estimatedInterest });
      return;
    }

    if (!targetDebtId) { setPreviewNotice("Choose a debt to target first."); return; }
    const result = await service.previewCustomTarget(workspaceId, { targetDebtId });
    if (!result) { setPreviewNotice("That debt could not be found."); return; }
    setPreview({ baseline: result.baseline.projectedZeroDate, scenario: result.custom.projectedZeroDate, interest: result.custom.estimatedInterest });
  }, { write: false });

  const saveScenario = () => runAction("save scenario", async () => {
    const name = scenarioName.trim() || `Scenario ${new Date().toLocaleDateString()}`;
    if (mode === "recurring") {
      const currentExtra = Number(snapshot.activeContext?.version?.extraMonthlyPayment || 0);
      const nextExtra = currentExtra + (Number(extra) || 0);
      // Targeted at one debt -> the same preview-only "custom" pseudo-
      // strategy category as the Custom scenario mode below (never a real,
      // applicable PLAN_STRATEGIES value); untargeted -> a real, applicable
      // plan-wide extra payment.
      if (targetDebtId) {
        await service.saveScenario(workspaceId, { name, type: "custom_target", inputs: { targetDebtId, extraMonthlyPayment: nextExtra } });
      } else {
        await service.saveScenario(workspaceId, { name, type: "recurring_extra", inputs: { extraMonthlyPayment: nextExtra } });
      }
    }
    if (mode === "one-time") {
      await service.saveScenario(workspaceId, { name, type: "one_time", inputs: { amount: Number(amount) || 0, targetDebtId } });
    }
    if (mode === "custom") {
      await service.saveScenario(workspaceId, { name, type: "custom_target", inputs: { targetDebtId } });
    }
    setScenarioName("");
  });

  return (
    <div style={{ display: "grid", gap: GAP }}>
      <Card variant="default">
        <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>What do you want to test?</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: GAP }}>
          {[
            { key: "recurring", label: "Add money every month" },
            { key: "one-time", label: "Make a one-time payment" },
            { key: "target", label: "Target another debt" },
            { key: "custom", label: "Custom scenario" },
          ].map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => { setMode(option.key); setPreview(null); setPreviewNotice(""); }}
              style={{
                border: `1px solid ${mode === option.key ? ttzPalette.ac : ttzPalette.border}`,
                background: mode === option.key ? ttzPalette.acS : "transparent",
                color: mode === option.key ? ttzPalette.ac : ttzPalette.tx2,
                padding: "8px 12px",
                borderRadius: 999,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1.4fr)", gap: GAP }}>
        <Card variant="default">
          <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Choose scenario</div>
          {mode === "recurring" ? (
            <div style={{ display: "grid", gap: GAP, marginTop: GAP }}>
              <Field label="Extra per month">
                <MoneyInput value={extra} onChange={(event) => { setExtra(event.target.value); setPreview(null); setPreviewNotice(""); }} />
              </Field>
              <Field label="Apply toward" help="Leave on All to add it to your overall plan payment - your strategy decides where it goes.">
                <Select value={targetDebtId} onChange={(event) => { setTargetDebtId(event.target.value); setPreview(null); setPreviewNotice(""); }}>
                  {debtOptions.map((debt) => (
                    <option key={debt.id || "all-included"} value={debt.id}>{debt.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : null}

          {mode === "one-time" ? (
            <div style={{ display: "grid", gap: GAP, marginTop: GAP }}>
              <Field label="Apply toward">
                <Select value={targetDebtId} onChange={(event) => setTargetDebtId(event.target.value)}>
                  {debtOptions.map((debt) => (
                    <option key={debt.id || "all-included"} value={debt.id}>{debt.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="One-time payment">
                <MoneyInput value={amount} onChange={(event) => setAmount(event.target.value)} />
              </Field>
            </div>
          ) : null}

          {mode === "target" || mode === "custom" ? (
            <div style={{ display: "grid", gap: GAP, marginTop: GAP }}>
              <Field label="Target debt">
                <Select value={targetDebtId} onChange={(event) => setTargetDebtId(event.target.value)}>
                  {debtOptions.map((debt) => (
                    <option key={debt.id || "all-included"} value={debt.id}>{debt.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : null}

          <div style={{ marginTop: GAP, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button variant="primary" onClick={runPreview} disabled={writeState.inProgress} loading={writeState.action === "preview what-if"}>Preview impact</Button>
            <Button variant="secondary" onClick={saveScenario} disabled={writeState.inProgress} loading={writeState.action === "save scenario"}>Save scenario</Button>
          </div>
          <div style={{ marginTop: GAP }}>
            <Input value={scenarioName} placeholder="Scenario name" onChange={(event) => setScenarioName(event.target.value)} />
          </div>
        </Card>

        <Card variant="default">
          <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Current vs scenario</div>
          {preview ? (
            <div style={{ display: "grid", gap: GAP, marginTop: GAP }}>
              <PlanMetric label="Current plan" value={preview.baseline || "n/a"} />
              <PlanMetric label="Scenario" value={preview.scenario || "n/a"} />
              <PlanMetric label="Projected interest" value={money(preview.interest || 0)} tone="success" />
              <InfoCallout>This is a hypothetical preview only. It will not create a PaymentEvent.</InfoCallout>
            </div>
          ) : previewNotice ? (
            <WarningCallout style={{ marginTop: GAP }}>{previewNotice}</WarningCallout>
          ) : (
            <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: GAP }}>Choose a scenario and preview what would happen before saving or applying.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function FinishByView({ snapshot, service, refresh, runAction, writeState }) {
  const [targetMonth, setTargetMonth] = useState("");
  const [targetDebtId, setTargetDebtId] = useState("");
  const [result, setResult] = useState(null);
  const [scenarioName, setScenarioName] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const workspaceId = snapshot.workspace.id;
  const debtOptions = [{ id: "", name: "All included debts" }, ...(snapshot.payoffQueue || [])];

  const check = () => runAction("check feasibility", async () => {
    if (!targetMonth) return;
    const preview = await service.previewGoalDate(workspaceId, { targetMonth, targetDebtId: targetDebtId || undefined });
    setResult(preview);
  }, { write: false });

  const applyIt = () => runAction("apply finish by", async () => {
    await service.applyReforecast(workspaceId, { extraMonthlyPayment: result.requiredMonthlyExtra });
    setConfirmOpen(false);
    setResult(null);
    await refresh();
  });

  const saveScenarioIt = () => runAction("save scenario", async () => {
    const name = scenarioName.trim() || `Finish by ${formatMonthLabel(targetMonth)}`;
    await service.saveScenario(workspaceId, { name, type: "goal_date", inputs: { targetMonth, targetDebtId: targetDebtId || undefined } });
    setScenarioName("");
  });

  return (
    <div style={{ display: "grid", gap: GAP }}>
      <Card variant="default">
        <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>When do you want to reach $0?</div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.1fr)", gap: GAP, marginTop: GAP }}>
          <Field label="Target debt-free month">
            <Input type="month" value={targetMonth} onChange={(event) => { setTargetMonth(event.target.value); setResult(null); }} />
          </Field>
          <Field label="Debt (optional - defaults to all included debts)">
            <Select value={targetDebtId} onChange={(event) => { setTargetDebtId(event.target.value); setResult(null); }}>
              {debtOptions.map((debt) => (
                <option key={debt.id || "all-included"} value={debt.id}>{debt.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div style={{ display: "grid", alignContent: "end", marginTop: GAP }}>
          <Button variant="primary" onClick={check} disabled={!targetMonth || writeState.inProgress} loading={writeState.action === "check feasibility"}>Check feasibility</Button>
        </div>
      </Card>

      {result && result.valid === false ? (
        <WarningCallout>{result.reason || "Choose a target date in the future."}</WarningCallout>
      ) : null}

      {result && result.valid !== false ? (
        <Card variant={result.feasible ? "highlight" : "default"}>
          {result.feasible ? (
            <div style={{ display: "grid", gap: GAP }}>
              <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>Target planning</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: GAP }}>
                <PlanMetric label="Target date" value={formatMonthLabel(result.targetMonth)} />
                <PlanMetric label="Current projected $0" value={result.projectedZeroDate || "n/a"} />
                <PlanMetric label="Current payment" value={money(result.currentMonthlyExtra || 0)} />
                <PlanMetric label="Required payment" value={money(result.requiredMonthlyExtra || 0)} />
                <PlanMetric label="Additional needed" value={money(Math.max(0, result.additionalNeeded || 0))} tone={result.additionalNeeded > 0 ? "warning" : "success"} />
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                {result.additionalNeeded > 0 ? (
                  <Button variant="primary" onClick={() => setConfirmOpen(true)} disabled={writeState.inProgress}>Apply this payment increase</Button>
                ) : (
                  <Badge tone="success">Already on pace</Badge>
                )}
                <Input value={scenarioName} placeholder="Scenario name" onChange={(event) => setScenarioName(event.target.value)} style={{ minWidth: 180 }} />
                <Button variant="secondary" onClick={saveScenarioIt} disabled={writeState.inProgress} loading={writeState.action === "save scenario"}>Save scenario</Button>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: GAP }}>
              <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>That target is not realistic right now</div>
              <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, margin: 0 }}>{result.reason || "The current plan would need a larger payment than is realistic."}</p>
              <PlanMetric label="Nearest feasible date at your current pace" value={result.nearestFeasibleZeroDate || "n/a"} />
            </div>
          )}
        </Card>
      ) : null}

      <ConfirmationDialog
        open={confirmOpen}
        title="Apply this to your real plan?"
        confirmLabel={writeState.action === "apply finish by" ? "Applying..." : "Apply"}
        onConfirm={applyIt}
        onCancel={() => setConfirmOpen(false)}
      >
        <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx }}>This creates a new plan version. Your current plan is kept in your plan history, never overwritten.</p>
        {result ? (
          <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 8 }}>
            Extra payment becomes <strong>{money(result.requiredMonthlyExtra)}/mo</strong>, projected payoff <strong>{result.projectedZeroDate}</strong>.
          </p>
        ) : null}
      </ConfirmationDialog>
    </div>
  );
}

function SavedScenariosView({ snapshot, service, refresh, runAction, writeState }) {
  const [scenarios, setScenarios] = useState(null);
  const workspaceId = snapshot.workspace.id;

  useEffect(() => {
    let active = true;
    service.listWorkspaceScenarios(workspaceId).then((result) => {
      if (active) setScenarios(result || []);
    });
    return () => {
      active = false;
    };
  }, [service, workspaceId]);

  if (scenarios === null) return <LoadingState label="Loading saved scenarios" />;

  if (!scenarios.length) {
    return (
      <Card variant="default">
        <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx }}>No saved scenarios yet</div>
        <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 8 }}>
          Save a what-if, goal-date, or strategy idea to compare it later. Saved scenarios stay preview-only until you explicitly apply one.
        </p>
      </Card>
    );
  }

  return (
    <div style={{ display: "grid", gap: GAP }}>
      {scenarios.map((scenario) => (
        <ScenarioCard
          key={scenario.id}
          scenario={scenario}
          service={service}
          workspaceId={workspaceId}
          currentZeroDate={snapshot.projectedZeroDate}
          runAction={runAction}
          writeState={writeState}
          refresh={refresh}
          onChanged={() => setScenarios((current) => current?.filter((item) => item.id !== scenario.id) ?? current)}
        />
      ))}
    </div>
  );
}

const APPLICABLE_SCENARIO_TYPES = ["recurring_extra", "strategy_comparison", "goal_date"];
const SCENARIO_TYPE_LABELS = {
  recurring_extra: "Recurring extra payment",
  one_time: "One-time payment",
  custom_target: "Custom target debt",
  goal_date: "Finish-by date",
  strategy_comparison: "Strategy switch",
};

// Each scenario type's preview comes back in its own natural shape
// (previewReforecast/previewOneTimePayment/previewCustomTarget/
// previewGoalDate/compareStrategies each already return exactly what their
// own tab shows) - this just picks the one "where would this land"
// headline figure out of that shape rather than reshaping the trusted
// service output into something new.
const scenarioProjectedZeroDate = (scenario, preview) => {
  if (!preview) return "";
  if (scenario.type === "recurring_extra") return preview.proposedZeroDate || "";
  if (scenario.type === "one_time") return preview.withLumpSum?.projectedZeroDate || "";
  if (scenario.type === "custom_target") return preview.custom?.projectedZeroDate || "";
  if (scenario.type === "goal_date") return preview.projectedZeroDate || preview.nearestFeasibleZeroDate || "";
  if (scenario.type === "strategy_comparison") return preview[scenario.inputs?.strategy]?.projectedZeroDate || "";
  return "";
};

function ScenarioCard({ scenario, service, workspaceId, currentZeroDate, runAction, writeState, refresh, onChanged }) {
  const [loaded, setLoaded] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const canApply = APPLICABLE_SCENARIO_TYPES.includes(scenario.type);

  const load = () => runAction("preview scenario", async () => {
    setLoaded(await service.getScenarioPreview(workspaceId, scenario.id));
  }, { write: false });

  const archive = () => runAction("archive scenario", async () => {
    await service.archiveScenario(workspaceId, scenario.id);
    onChanged();
  });

  const apply = () => runAction("apply scenario", async () => {
    await service.applyScenario(workspaceId, scenario.id);
    setConfirmOpen(false);
    setLoaded(null);
    await refresh();
  });

  const previewZeroDate = scenarioProjectedZeroDate(scenario, loaded?.preview);
  const deltaText = monthLabelDeltaText(currentZeroDate, previewZeroDate);

  return (
    <Card variant="default">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>{scenario.name}</div>
          <Badge tone="neutral" style={{ marginTop: 6 }}>{SCENARIO_TYPE_LABELS[scenario.type] || scenario.type}</Badge>
        </div>
        {loaded?.isStale ? <Badge tone="warning">Plan changed since saved</Badge> : null}
      </div>

      {loaded ? (
        <div style={{ marginTop: GAP, display: "grid", gap: GAP }}>
          {loaded.isStale ? (
            <WarningCallout>Your plan has changed since this was saved, so these numbers may no longer reflect where you actually stand. Re-preview before applying.</WarningCallout>
          ) : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: GAP }}>
            <PlanMetric label="Projected $0" value={previewZeroDate || "n/a"} tone="accent" />
            <PlanMetric label="Vs. your current plan" value={deltaText || "n/a"} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {canApply ? (
              <Button variant="primary" size="sm" disabled={writeState.inProgress} onClick={() => setConfirmOpen(true)}>Apply</Button>
            ) : (
              <p style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted, alignSelf: "center" }}>This kind of scenario is preview-only and can&apos;t be applied directly.</p>
            )}
            <Button variant="ghost" size="sm" disabled={writeState.inProgress} onClick={archive}>Archive</Button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: GAP, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="secondary" size="sm" disabled={writeState.inProgress} loading={writeState.action === "preview scenario"} onClick={load}>View</Button>
          <Button variant="ghost" size="sm" disabled={writeState.inProgress} onClick={archive}>Archive</Button>
        </div>
      )}

      <ConfirmationDialog
        open={confirmOpen}
        title="Apply this to your real plan?"
        confirmLabel={writeState.action === "apply scenario" ? "Applying..." : "Apply"}
        onConfirm={apply}
        onCancel={() => setConfirmOpen(false)}
      >
        <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx }}>This creates a new plan version. Your current plan is kept in your plan history, never overwritten.</p>
        {loaded?.isStale ? <WarningCallout style={{ marginTop: 8 }}>Your plan has changed since this scenario was saved - the numbers above were just re-checked, but double-check they still look right.</WarningCallout> : null}
      </ConfirmationDialog>
    </Card>
  );
}

export default function PlanSection({ snapshot, service, refresh, runAction, writeState }) {
  const [destination, setDestination] = useState(() => resolvePlanDestination(typeof window !== "undefined" ? window.location.pathname : "/plan/my-plan"));

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const syncDestination = () => setDestination(resolvePlanDestination(window.location.pathname));
    window.addEventListener("popstate", syncDestination);
    syncDestination();
    return () => window.removeEventListener("popstate", syncDestination);
  }, []);

  const navigate = (nextDestination) => {
    const path = buildPlanPath(nextDestination);
    if (typeof window !== "undefined") {
      const currentPath = window.location.pathname;
      if (currentPath !== path) {
        window.history.pushState({}, "", path);
      }
    }
    setDestination(nextDestination);
  };

  const viewProps = { snapshot, service, refresh, runAction, writeState };
  let currentView;
  switch (destination) {
    case "snowball": currentView = <SnowballView {...viewProps} />; break;
    case "avalanche": currentView = <AvalancheView {...viewProps} />; break;
    case "compare": currentView = <CompareStrategiesView {...viewProps} />; break;
    case "what-if": currentView = <WhatIfView {...viewProps} />; break;
    case "finish-by": currentView = <FinishByView {...viewProps} />; break;
    case "scenarios": currentView = <SavedScenariosView {...viewProps} />; break;
    case "my-plan":
    default: currentView = <MyPlanView {...viewProps} />;
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ ...TYPE_SCALE.sectionTitle, color: ttzPalette.tx }}>Your path to $0</div>

      <div role="tablist" aria-label="Plan sections" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {PLAN_DESTINATIONS.map((item) => {
          const active = destination === item.key;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => navigate(item.key)}
              style={{
                ...TYPE_SCALE.supporting,
                minHeight: 32,
                border: `1px solid ${active ? ttzPalette.ac : ttzPalette.border}`,
                background: active ? ttzPalette.acS : "transparent",
                color: active ? ttzPalette.ac : ttzPalette.tx2,
                padding: "0 12px",
                borderRadius: 999,
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div>{currentView}</div>
    </div>
  );
}
