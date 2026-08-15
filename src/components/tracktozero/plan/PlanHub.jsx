/**
 * PlanHub.jsx
 *
 * UX-4: PLAN HUB
 *
 * One coherent destination for everything payoff-strategy related, once an
 * active plan exists (the no-active-plan path stays FirstPlanBuilder, in
 * TrackToZeroV2App.jsx, unchanged). Every number here comes from the
 * trusted service/engine layer (v2AsyncApplicationService's compareStrategies/
 * previewOneTimePayment/previewCustomTarget/previewGoalDate/applyReforecast/
 * applyScenario) - this file only arranges and labels what those calls
 * return. It never sorts, simulates, or estimates payoff math itself.
 *
 * The four things this UI must never blur (see each tab):
 *   - Previewing (Compare/What If/Finish By) is always zero-write.
 *   - A Scenario is not a Draft Plan is not the Active Plan.
 *   - Applying always shows before/after and asks for explicit confirmation,
 *     and always goes through applyReforecast/applyScenario - never a
 *     parallel activation path.
 *   - Unknown APR is surfaced honestly, never silently treated as 0% or as
 *     confirmed.
 */

import { useEffect, useState } from "react";
import Card from "../ui/Card.jsx";
import Button from "../ui/Button.jsx";
import Tabs from "../ui/Tabs.jsx";
import Badge from "../ui/Badge.jsx";
import Field from "../ui/Field.jsx";
import Select from "../ui/Select.jsx";
import Input from "../ui/Input.jsx";
import MoneyInput from "../ui/MoneyInput.jsx";
import WarningCallout from "../ui/WarningCallout.jsx";
import InfoCallout from "../ui/InfoCallout.jsx";
import ConfirmationDialog from "../ui/ConfirmationDialog.jsx";
import LoadingState from "../ui/LoadingState.jsx";
import { ttzPalette, TYPE_SCALE } from "../theme.js";
import { formatMoney as money, formatPercent as percent } from "../formatting.js";
import { presentedOwnerLabel } from "../../../domain/tracktozero/ownership.js";
import * as copy from "./planCopy.js";

const GAP = "var(--ttz-space-4, 16px)";

function PayoffOrderList({ debts = [], isHousehold, emphasizeFirst = false }) {
  const palette = ttzPalette;
  if (!debts.length) return <p style={{ ...TYPE_SCALE.body, color: palette.tx2 }}>No debts included in this preview.</p>;
  return (
    <ol style={{ display: "grid", gap: 8, paddingLeft: 20, margin: 0 }}>
      {debts.map((debt, index) => (
        <li key={debt.id} style={{ ...TYPE_SCALE.body, color: palette.tx, fontWeight: emphasizeFirst && index === 0 ? 700 : 500 }}>
          {debt.name} · {money(debt.currentBalance)} · {debt.aprStatus === "unknown" ? <Badge tone="warning">Unknown APR</Badge> : percent(debt.apr)}
          {isHousehold && <> · {presentedOwnerLabel(debt)}</>}
        </li>
      ))}
    </ol>
  );
}

function AprWarnings({ warnings = [] }) {
  const unknownAprWarnings = warnings.filter((warning) => warning.code === "unknown_apr");
  if (!unknownAprWarnings.length) return null;
  return (
    <WarningCallout title={copy.unknownAprCalloutTitle()}>
      {copy.unknownAprCalloutBody(unknownAprWarnings.length)}
    </WarningCallout>
  );
}

// ── Adjust Plan (reforecast + strategy + lightweight Plan History) ────────
function AdjustPlanTab({ snapshot, service, refresh, runAction, writeState, canPlan, workspaceId }) {
  const activeVersion = snapshot.activeContext.version;
  const [draftExtra, setDraftExtra] = useState(String(activeVersion.extraMonthlyPayment || 0));
  const [draftStrategy, setDraftStrategy] = useState(activeVersion.strategy);
  const [preview, setPreview] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [history, setHistory] = useState(null);

  useEffect(() => {
    let cancelled = false;
    service.listPlanHistory(workspaceId).then((result) => { if (!cancelled) setHistory(result); });
    return () => { cancelled = true; };
  }, [service, workspaceId, writeState.success]);

  const overrides = { extraMonthlyPayment: Number(draftExtra) || 0, strategy: draftStrategy };
  const hasChanges = overrides.extraMonthlyPayment !== Number(activeVersion.extraMonthlyPayment || 0) || overrides.strategy !== activeVersion.strategy;

  const previewChanges = () => runAction("preview reforecast", async () => {
    setPreview(await service.previewReforecast(workspaceId, overrides));
  }, { write: false });

  const applyChanges = () => runAction("apply reforecast", async () => {
    await service.applyReforecast(workspaceId, overrides);
    setPreview(null);
    setConfirmOpen(false);
    await refresh();
  });

  return (
    <div style={{ display: "grid", gap: GAP }}>
      <Card variant="default">
        <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx, marginBottom: GAP }}>Adjust your plan</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: GAP }}>
          <Field label="Strategy">
            <Select value={draftStrategy} onChange={(event) => { setDraftStrategy(event.target.value); setPreview(null); }} disabled={!canPlan}>
              <option value="avalanche">Avalanche - highest APR first</option>
              <option value="snowball">Snowball - smallest balance first</option>
            </Select>
          </Field>
          <Field label="Extra monthly payment (beyond minimums)">
            <MoneyInput value={draftExtra} min="0" step="0.01" onChange={(event) => { setDraftExtra(event.target.value); setPreview(null); }} disabled={!canPlan} />
          </Field>
        </div>
        <div style={{ marginTop: GAP }}>
          <Button variant="secondary" disabled={!canPlan || !hasChanges || writeState.inProgress} loading={writeState.action === "preview reforecast"} onClick={previewChanges}>
            Preview changes
          </Button>
        </div>
        {preview && (
          <Card variant="highlight" style={{ marginTop: GAP }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: GAP }}>
              <div>
                <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>Current estimate</div>
                <div style={{ ...TYPE_SCALE.metricSm, color: ttzPalette.tx, marginTop: 4 }}>{preview.oldProjectedZeroDate || "n/a"}</div>
              </div>
              <div>
                <div style={{ ...TYPE_SCALE.overline, color: ttzPalette.muted }}>New estimate</div>
                <div style={{ ...TYPE_SCALE.metricSm, color: ttzPalette.ac, marginTop: 4 }}>{preview.proposedZeroDate || "n/a"}</div>
              </div>
            </div>
            <AprWarnings warnings={preview.warnings} />
            <p style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted, marginTop: GAP }}>{copy.previewOnlyNotice()}</p>
            <Button variant="primary" disabled={!canPlan || writeState.inProgress} loading={writeState.action === "apply reforecast"} onClick={() => setConfirmOpen(true)} style={{ marginTop: 8 }}>
              Apply to my plan
            </Button>
          </Card>
        )}
        {!canPlan && <p style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted, marginTop: GAP }}>Your role can view plans, but cannot change one.</p>}
      </Card>

      <Card variant="default">
        <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx, marginBottom: GAP }}>Plan history</div>
        {history === null ? (
          <LoadingState label="Loading plan history..." />
        ) : !history.length ? (
          <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>{copy.planHistoryEmpty()}</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {history.map((version) => (
              <div key={version.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: GAP, borderBottom: `1px solid ${ttzPalette.border}`, paddingBottom: 10 }}>
                <div>
                  <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx, fontWeight: 700 }}>
                    Version {version.versionNumber} · {copy.strategyLabel(version.strategy)}
                    {version.id === activeVersion.id && <> <Badge tone="success" style={{ marginLeft: 6 }}>{copy.planHistoryCurrentBadge()}</Badge></>}
                  </div>
                  <div style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted, marginTop: 2 }}>
                    {copy.planHistoryBecause(version.createdBecause)} · {money(version.extraMonthlyPayment)}/mo extra
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ConfirmationDialog
        open={confirmOpen}
        title={copy.applyConfirmTitle()}
        confirmLabel={writeState.action === "apply reforecast" ? "Applying..." : "Apply"}
        onConfirm={applyChanges}
        onCancel={() => setConfirmOpen(false)}
      >
        <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx }}>{copy.applyConfirmBody()}</p>
        {preview && (
          <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 8 }}>
            Estimated payoff moves from <strong>{preview.oldProjectedZeroDate || "n/a"}</strong> to <strong>{preview.proposedZeroDate || "n/a"}</strong>.
          </p>
        )}
      </ConfirmationDialog>
    </div>
  );
}

// ── Compare Strategies (Snowball vs Avalanche, read-only) ─────────────────
function StrategyPreviewCard({ label, previewResult, isActive, isHousehold }) {
  return (
    <Card variant={isActive ? "highlight" : "default"}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: GAP }}>
        <div>
          <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>{label}</div>
          <p style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted, margin: "4px 0 0" }}>{copy.strategyExplainer(previewResult.strategy)}</p>
        </div>
        {isActive && <Badge tone="success">Your current strategy</Badge>}
      </div>
      <div style={{ display: "grid", gap: 6, marginBottom: GAP }}>
        <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx }}><strong>Projected $0:</strong> {previewResult.projectedZeroDate || "n/a"}</div>
        <div style={{ ...TYPE_SCALE.body, color: ttzPalette.tx }}><strong>Estimated interest:</strong> {money(previewResult.estimatedInterest)}</div>
      </div>
      <AprWarnings warnings={previewResult.warnings} />
      <div style={{ marginTop: GAP }}>
        <PayoffOrderList debts={previewResult.payoffOrder} isHousehold={isHousehold} emphasizeFirst />
      </div>
    </Card>
  );
}

function CompareStrategiesTab({ snapshot, service, refresh, runAction, writeState, canPlan, workspaceId }) {
  const [result, setResult] = useState(null);
  const [confirmStrategy, setConfirmStrategy] = useState(null);
  const isHousehold = snapshot.workspace.type === "household";

  useEffect(() => {
    let cancelled = false;
    service.compareStrategies(workspaceId).then((data) => { if (!cancelled) setResult(data); });
    return () => { cancelled = true; };
  }, [service, workspaceId, writeState.success]);

  const applySwitch = () => runAction("switch strategy", async () => {
    await service.applyReforecast(workspaceId, { strategy: confirmStrategy });
    setConfirmStrategy(null);
    await refresh();
  });

  if (!result) return <LoadingState label="Comparing strategies..." />;

  const other = result.activeStrategy === "snowball" ? "avalanche" : "snowball";
  const otherPreview = result[other];

  return (
    <div style={{ display: "grid", gap: GAP }}>
      <InfoCallout>{copy.compareIntro()}</InfoCallout>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: GAP }}>
        <StrategyPreviewCard label="Snowball" previewResult={result.snowball} isActive={result.activeStrategy === "snowball"} isHousehold={isHousehold} />
        <StrategyPreviewCard label="Avalanche" previewResult={result.avalanche} isActive={result.activeStrategy === "avalanche"} isHousehold={isHousehold} />
      </div>
      {result.activeStrategy && (
        <div>
          <Button variant="secondary" disabled={!canPlan || writeState.inProgress} onClick={() => setConfirmStrategy(other)}>
            Switch to {copy.strategyLabel(other)}
          </Button>
        </div>
      )}
      <ConfirmationDialog
        open={!!confirmStrategy}
        title={`Switch to ${copy.strategyLabel(confirmStrategy || "")}?`}
        confirmLabel={writeState.action === "switch strategy" ? "Switching..." : "Switch"}
        onConfirm={applySwitch}
        onCancel={() => setConfirmStrategy(null)}
      >
        <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx }}>{copy.applyConfirmBody()}</p>
        {otherPreview && (
          <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 8 }}>
            Estimated payoff moves to <strong>{otherPreview.projectedZeroDate || "n/a"}</strong>, estimated interest {money(otherPreview.estimatedInterest)}.
          </p>
        )}
      </ConfirmationDialog>
    </div>
  );
}

// ── What If (recurring extra / one-time / custom target - all preview) ────
function SaveScenarioButton({ service, workspaceId, runAction, writeState, canPlan, buildScenario, disabled }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  if (!canPlan) return null;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: GAP }}>
      <Input placeholder="Name this scenario" value={name} onChange={(event) => setName(event.target.value)} style={{ minWidth: 200 }} />
      <Button
        variant="secondary"
        disabled={disabled || !name.trim() || writeState.inProgress || saving}
        onClick={() => {
          setSaving(true);
          runAction("save scenario", async () => {
            const { name: scenarioName, type, inputs } = buildScenario(name.trim());
            await service.saveScenario(workspaceId, { name: scenarioName, type, inputs });
            setName("");
          }).finally(() => setSaving(false));
        }}
      >
        Save this scenario
      </Button>
    </div>
  );
}

function RecurringExtraWhatIf({ snapshot, service, workspaceId, runAction, writeState, canPlan }) {
  const activeVersion = snapshot.activeContext.version;
  const [delta, setDelta] = useState("50");
  const [preview, setPreview] = useState(null);

  const previewIt = () => runAction("preview what-if extra", async () => {
    const nextExtra = Number(activeVersion.extraMonthlyPayment || 0) + (Number(delta) || 0);
    setPreview(await service.previewReforecast(workspaceId, { extraMonthlyPayment: nextExtra }));
  }, { write: false });

  return (
    <div style={{ display: "grid", gap: GAP }}>
      <Field label="Additional extra per month">
        <MoneyInput value={delta} min="0" step="0.01" onChange={(event) => { setDelta(event.target.value); setPreview(null); }} />
      </Field>
      <div><Button variant="secondary" loading={writeState.action === "preview what-if extra"} onClick={previewIt}>Preview</Button></div>
      {preview && (
        <Card variant="highlight">
          <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx }}>
            Payoff moves from <strong>{preview.oldProjectedZeroDate || "n/a"}</strong> to <strong>{preview.proposedZeroDate || "n/a"}</strong>.
          </p>
          <AprWarnings warnings={preview.warnings} />
          <SaveScenarioButton
            service={service} workspaceId={workspaceId} runAction={runAction} writeState={writeState} canPlan={canPlan}
            buildScenario={(name) => ({ name, type: "recurring_extra", inputs: { extraMonthlyPayment: Number(activeVersion.extraMonthlyPayment || 0) + (Number(delta) || 0) } })}
          />
        </Card>
      )}
    </div>
  );
}

function OneTimeWhatIf({ snapshot, service, workspaceId, runAction, writeState, canPlan }) {
  const [targetDebtId, setTargetDebtId] = useState(snapshot.targetDebt?.id || snapshot.payoffQueue[0]?.id || "");
  const [amount, setAmount] = useState("500");
  const [preview, setPreview] = useState(null);

  const previewIt = () => runAction("preview one-time payment", async () => {
    setPreview(await service.previewOneTimePayment(workspaceId, { amount: Number(amount) || 0, targetDebtId }));
  }, { write: false });

  return (
    <div style={{ display: "grid", gap: GAP }}>
      <InfoCallout>{copy.oneTimeIntro()}</InfoCallout>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: GAP }}>
        <Field label="Apply toward">
          <Select value={targetDebtId} onChange={(event) => { setTargetDebtId(event.target.value); setPreview(null); }}>
            {snapshot.payoffQueue.map((debt) => <option key={debt.id} value={debt.id}>{debt.name}</option>)}
          </Select>
        </Field>
        <Field label="One-time payment amount">
          <MoneyInput value={amount} min="0" step="0.01" onChange={(event) => { setAmount(event.target.value); setPreview(null); }} />
        </Field>
      </div>
      <div><Button variant="secondary" disabled={!targetDebtId} loading={writeState.action === "preview one-time payment"} onClick={previewIt}>Preview</Button></div>
      {preview && (
        <Card variant="highlight">
          <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx }}>
            Without this payment: <strong>{preview.baseline.projectedZeroDate || "n/a"}</strong>. With it: <strong>{preview.withLumpSum.projectedZeroDate || "n/a"}</strong>.
          </p>
          <p style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted }}>{copy.oneTimeNeverAPayment()}</p>
          <SaveScenarioButton
            service={service} workspaceId={workspaceId} runAction={runAction} writeState={writeState} canPlan={canPlan}
            buildScenario={(name) => ({ name, type: "one_time", inputs: { amount: Number(amount) || 0, targetDebtId } })}
          />
        </Card>
      )}
    </div>
  );
}

function CustomTargetWhatIf({ snapshot, service, workspaceId, runAction, writeState, canPlan }) {
  const isHousehold = snapshot.workspace.type === "household";
  const [targetDebtId, setTargetDebtId] = useState(snapshot.payoffQueue[0]?.id || "");
  const [preview, setPreview] = useState(null);

  const previewIt = () => runAction("preview custom target", async () => {
    setPreview(await service.previewCustomTarget(workspaceId, { targetDebtId }));
  }, { write: false });

  return (
    <div style={{ display: "grid", gap: GAP }}>
      <InfoCallout>{copy.customTargetIntro()}</InfoCallout>
      <Field label="Send extra payment to">
        <Select value={targetDebtId} onChange={(event) => { setTargetDebtId(event.target.value); setPreview(null); }}>
          {snapshot.payoffQueue.map((debt) => <option key={debt.id} value={debt.id}>{debt.name}</option>)}
        </Select>
      </Field>
      <div><Button variant="secondary" disabled={!targetDebtId} loading={writeState.action === "preview custom target"} onClick={previewIt}>Preview</Button></div>
      {preview && (
        <Card variant="highlight">
          <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx }}>
            Your plan's order: <strong>{preview.baseline.projectedZeroDate || "n/a"}</strong>. This order: <strong>{preview.custom.projectedZeroDate || "n/a"}</strong>.
          </p>
          <PayoffOrderList debts={preview.custom.payoffOrder} isHousehold={isHousehold} emphasizeFirst />
          <p style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted, marginTop: GAP }}>{copy.customTargetNeverAStrategy()}</p>
          <SaveScenarioButton
            service={service} workspaceId={workspaceId} runAction={runAction} writeState={writeState} canPlan={canPlan}
            buildScenario={(name) => ({ name, type: "custom_target", inputs: { targetDebtId } })}
          />
        </Card>
      )}
    </div>
  );
}

function WhatIfTab(props) {
  const [mode, setMode] = useState("recurring_extra");
  return (
    <div style={{ display: "grid", gap: GAP }}>
      <Tabs
        label="What if mode"
        activeKey={mode}
        onChange={setMode}
        items={[
          { key: "recurring_extra", label: "Recurring extra" },
          { key: "one_time", label: "One-time payment" },
          { key: "custom_target", label: "Custom target debt" },
        ]}
      />
      {mode === "recurring_extra" && <RecurringExtraWhatIf {...props} />}
      {mode === "one_time" && <OneTimeWhatIf {...props} />}
      {mode === "custom_target" && <CustomTargetWhatIf {...props} />}
    </div>
  );
}

// ── Finish By (goal date) ──────────────────────────────────────────────────
function FinishByTab({ snapshot, service, refresh, runAction, writeState, canPlan, workspaceId }) {
  const [targetMonth, setTargetMonth] = useState("");
  const [targetDebtId, setTargetDebtId] = useState("");
  const [result, setResult] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const check = () => runAction("preview finish by", async () => {
    setResult(await service.previewGoalDate(workspaceId, { targetMonth, targetDebtId: targetDebtId || undefined }));
  }, { write: false });

  const applyIt = () => runAction("apply finish by", async () => {
    await service.applyReforecast(workspaceId, { extraMonthlyPayment: result.requiredMonthlyExtra });
    setConfirmOpen(false);
    setResult(null);
    await refresh();
  });

  return (
    <div style={{ display: "grid", gap: GAP }}>
      <InfoCallout>{copy.finishByIntro()}</InfoCallout>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: GAP }}>
        <Field label="Target debt-free month">
          <Input type="month" value={targetMonth} onChange={(event) => { setTargetMonth(event.target.value); setResult(null); }} />
        </Field>
        <Field label="Debt (optional - defaults to all included debts)">
          <Select value={targetDebtId} onChange={(event) => { setTargetDebtId(event.target.value); setResult(null); }}>
            <option value="">All included debts</option>
            {snapshot.payoffQueue.map((debt) => <option key={debt.id} value={debt.id}>{debt.name}</option>)}
          </Select>
        </Field>
      </div>
      <div><Button variant="secondary" disabled={!targetMonth} loading={writeState.action === "preview finish by"} onClick={check}>Check feasibility</Button></div>
      {result && !result.valid && <WarningCallout>{result.reason}</WarningCallout>}
      {result?.valid && !result.feasible && (
        <Card variant="warning">
          <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx }}>{copy.finishByInfeasible()}</p>
          {result.nearestFeasibleZeroDate && <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>Nearest realistic date at your current payment: <strong>{result.nearestFeasibleZeroDate}</strong>.</p>}
        </Card>
      )}
      {result?.valid && result.feasible && (
        <Card variant="highlight">
          <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx }}>
            {result.additionalNeeded > 0 ? copy.finishByFeasible(money(result.requiredMonthlyExtra), result.projectedZeroDate) : copy.finishByAlreadyOnPace()}
          </p>
          {result.additionalNeeded > 0 && (
            <p style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted }}>That's {money(result.additionalNeeded)}/mo more than your current extra payment.</p>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: GAP }}>
            {result.additionalNeeded > 0 && canPlan && (
              <Button variant="primary" onClick={() => setConfirmOpen(true)} disabled={writeState.inProgress}>Apply this payment increase</Button>
            )}
            <SaveScenarioButton
              service={service} workspaceId={workspaceId} runAction={runAction} writeState={writeState} canPlan={canPlan}
              buildScenario={(name) => ({ name, type: "goal_date", inputs: { targetMonth, targetDebtId: targetDebtId || undefined } })}
            />
          </div>
        </Card>
      )}
      <ConfirmationDialog
        open={confirmOpen}
        title={copy.applyConfirmTitle()}
        confirmLabel={writeState.action === "apply finish by" ? "Applying..." : "Apply"}
        onConfirm={applyIt}
        onCancel={() => setConfirmOpen(false)}
      >
        <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx }}>{copy.applyConfirmBody()}</p>
        {result && (
          <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2, marginTop: 8 }}>
            Extra payment becomes <strong>{money(result.requiredMonthlyExtra)}/mo</strong>, projected payoff <strong>{result.projectedZeroDate}</strong>.
          </p>
        )}
      </ConfirmationDialog>
    </div>
  );
}

// ── Saved Scenarios ─────────────────────────────────────────────────────────
const APPLICABLE_SCENARIO_TYPES = ["recurring_extra", "strategy_comparison", "goal_date"];
const SCENARIO_TYPE_LABELS = {
  recurring_extra: "Recurring extra payment",
  one_time: "One-time payment",
  custom_target: "Custom target debt",
  goal_date: "Finish-by date",
  strategy_comparison: "Strategy switch",
};

function ScenarioCard({ scenario, service, workspaceId, runAction, writeState, canPlan, refresh, onChanged }) {
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
    await refresh();
    onChanged();
  });

  return (
    <Card variant="default">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: GAP }}>
        <div>
          <div style={{ ...TYPE_SCALE.cardTitle, color: ttzPalette.tx }}>{scenario.name}</div>
          <Badge tone="neutral" style={{ marginTop: 6 }}>{SCENARIO_TYPE_LABELS[scenario.type] || scenario.type}</Badge>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="ghost" size="sm" disabled={writeState.inProgress} onClick={load}>Preview</Button>
          <Button variant="ghost" size="sm" disabled={writeState.inProgress} onClick={archive}>Archive</Button>
        </div>
      </div>
      {loaded && (
        <div style={{ marginTop: GAP }}>
          {loaded.isStale && <WarningCallout>{copy.scenarioStaleWarning()}</WarningCallout>}
          {loaded.preview?.proposedZeroDate && (
            <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx, marginTop: 8 }}>
              Projected payoff: <strong>{loaded.preview.proposedZeroDate}</strong>
            </p>
          )}
          {canApply ? (
            <Button variant="primary" size="sm" disabled={!canPlan || writeState.inProgress} onClick={() => setConfirmOpen(true)} style={{ marginTop: 8 }}>
              Apply
            </Button>
          ) : (
            <p style={{ ...TYPE_SCALE.caption, color: ttzPalette.muted, marginTop: 8 }}>{copy.scenarioApplyUnavailable()}</p>
          )}
        </div>
      )}
      <ConfirmationDialog
        open={confirmOpen}
        title={copy.applyConfirmTitle()}
        confirmLabel={writeState.action === "apply scenario" ? "Applying..." : "Apply"}
        onConfirm={apply}
        onCancel={() => setConfirmOpen(false)}
      >
        <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx }}>{copy.applyConfirmBody()}</p>
        {loaded?.isStale && <WarningCallout style={{ marginTop: 8 }}>{copy.scenarioStaleWarning()}</WarningCallout>}
      </ConfirmationDialog>
    </Card>
  );
}

function SavedScenariosTab({ service, refresh, runAction, writeState, canPlan, workspaceId }) {
  const [scenarios, setScenarios] = useState(null);
  const [reloadSeq, setReloadSeq] = useState(0);

  useEffect(() => {
    let cancelled = false;
    service.listWorkspaceScenarios(workspaceId).then((result) => { if (!cancelled) setScenarios(result); });
    return () => { cancelled = true; };
  }, [service, workspaceId, reloadSeq]);

  if (scenarios === null) return <LoadingState label="Loading saved scenarios..." />;

  return (
    <div style={{ display: "grid", gap: GAP }}>
      <InfoCallout>{copy.scenariosIntro()}</InfoCallout>
      {!scenarios.length ? (
        <p style={{ ...TYPE_SCALE.body, color: ttzPalette.tx2 }}>{copy.scenarioEmptyState()}</p>
      ) : (
        scenarios.map((scenario) => (
          <ScenarioCard
            key={scenario.id}
            scenario={scenario}
            service={service}
            workspaceId={workspaceId}
            runAction={runAction}
            writeState={writeState}
            canPlan={canPlan}
            refresh={refresh}
            onChanged={() => setReloadSeq((seq) => seq + 1)}
          />
        ))
      )}
    </div>
  );
}

// ── Orchestrator ────────────────────────────────────────────────────────────
export default function PlanHub({ snapshot, service, refresh, runAction, writeState }) {
  const [tab, setTab] = useState("adjust");
  const canPlan = snapshot.permissions.managePlans && snapshot.mode !== "legacy_preview";
  const workspaceId = snapshot.workspace.id;
  const sharedProps = { snapshot, service, refresh, runAction, writeState, canPlan, workspaceId };

  return (
    <Card variant="default" style={{ marginTop: 16 }}>
      <Tabs
        label={copy.tabLabels().myPlan}
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: "adjust", label: "Adjust Plan" },
          { key: "compare", label: copy.tabLabels().compare },
          { key: "whatIf", label: copy.tabLabels().whatIf },
          { key: "finishBy", label: copy.tabLabels().finishBy },
          { key: "scenarios", label: copy.tabLabels().scenarios },
        ]}
      />
      <div style={{ marginTop: GAP }}>
        {tab === "adjust" && <AdjustPlanTab {...sharedProps} />}
        {tab === "compare" && <CompareStrategiesTab {...sharedProps} />}
        {tab === "whatIf" && <WhatIfTab {...sharedProps} />}
        {tab === "finishBy" && <FinishByTab {...sharedProps} />}
        {tab === "scenarios" && <SavedScenariosTab {...sharedProps} />}
      </div>
    </Card>
  );
}
