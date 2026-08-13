import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, getFirebaseConfig, getFirebaseStatus, login, logout, signup } from "../../firebase";
import {
  createTrackToZeroRepository,
  ensureTrackToZeroV2EmulatorActor,
  TRACKTOZERO_V2_REPOSITORY_MODES,
} from "../../services/tracktozero/repositoryRuntime";
import { createTrackToZeroV2AsyncAppService, getUserSafeTrackToZeroError } from "../../services/tracktozero/v2AsyncApplicationService";
import { V2_TEST_ACTOR_ID, V2_TEST_NOW } from "../../services/tracktozero/v2SeedData";
import { getLaunchFlags } from "../../config/launchFlags";

const money = (value) =>
  Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

const percent = (value) => value == null ? "Unknown APR" : `${(Number(value || 0) * 100).toFixed(2)}% APR`;
const todayInputValue = () => new Date().toISOString().slice(0, 10);
const dateInputToIso = (value) => value ? `${value}T00:00:00.000Z` : "";
const newDebtDraft = () => ({
  clientRequestId: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name: "",
  debtType: "credit_card",
  currentBalance: "",
  balanceAsOf: todayInputValue(),
  aprStatus: "unknown",
  apr: "",
  minimumRequiredPayment: "",
  dueDate: "",
  ownerLabel: "",
  includedInCorePayoffPlan: true,
});

const styles = {
  shell: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #eaf6ff 0%, #f8fbff 48%, #effdf5 100%)",
    color: "#10263d",
    fontFamily: "'Instrument Sans', system-ui, sans-serif",
  },
  wrap: { maxWidth: 1180, margin: "0 auto", padding: "28px 18px 48px" },
  card: {
    background: "rgba(255,255,255,0.86)",
    border: "1px solid #b9dcf8",
    borderRadius: 22,
    padding: 20,
    boxShadow: "0 18px 40px rgba(22, 86, 139, 0.08)",
  },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 14 },
  button: {
    border: "1px solid #72b8ef",
    borderRadius: 14,
    background: "#fff",
    color: "#10263d",
    fontWeight: 800,
    padding: "10px 14px",
    cursor: "pointer",
  },
  primaryButton: {
    border: "1px solid #0ea5e9",
    borderRadius: 14,
    background: "#0ea5e9",
    color: "#071523",
    fontWeight: 900,
    padding: "10px 14px",
    cursor: "pointer",
  },
  disabledButton: {
    border: "1px solid #c7d7e6",
    borderRadius: 14,
    background: "#edf4fb",
    color: "#64788d",
    fontWeight: 800,
    padding: "10px 14px",
    cursor: "not-allowed",
  },
  input: {
    border: "1px solid #a7cff1",
    borderRadius: 12,
    padding: "10px 12px",
    font: "inherit",
    minWidth: 0,
  },
  label: { display: "grid", gap: 5, fontSize: 13, fontWeight: 800, color: "#2f6289" },
  pill: { border: "1px solid #9bd0f7", borderRadius: 999, padding: "6px 10px", background: "#e7f6ff", fontWeight: 800 },
};

function Section({ title, eyebrow, children }) {
  return (
    <section style={{ ...styles.card, marginTop: 16 }}>
      {eyebrow && <p style={{ margin: "0 0 6px", letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 900, color: "#2f6289", fontSize: 12 }}>{eyebrow}</p>}
      <h2 style={{ margin: "0 0 12px", fontSize: 24 }}>{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }) {
  return <label style={styles.label}><span>{label}</span>{children}</label>;
}

function AuthScreen({ onSubmit, state, setState, error, busy, firebaseReady }) {
  const title = state.mode === "signup" ? "Create your TrackToZero beta account" : "Sign in to TrackToZero beta";
  return (
    <main style={styles.shell}>
      <div style={styles.wrap}>
        <Section title={firebaseReady ? title : "TrackToZero beta is temporarily unavailable"} eyebrow="Clean beta">
          {!firebaseReady ? (
            <p>Production Firebase is not configured for this release. The app is in a safe disabled state.</p>
          ) : (
            <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, maxWidth: 460 }}>
              <p>Start fresh in the V2 command center. No demo debts are loaded.</p>
              <Field label="Email">
                <input style={styles.input} type="email" value={state.email} onChange={(event) => setState({ ...state, email: event.target.value })} required />
              </Field>
              <Field label="Password">
                <input style={styles.input} type="password" value={state.password} onChange={(event) => setState({ ...state, password: event.target.value })} minLength={6} required />
              </Field>
              {error && <p role="alert" style={{ color: "#991b1b", fontWeight: 800 }}>{error}</p>}
              <button type="submit" disabled={busy} style={busy ? styles.disabledButton : styles.primaryButton}>
                {busy ? "Please wait..." : state.mode === "signup" ? "Create account" : "Sign in"}
              </button>
              <button
                type="button"
                style={styles.button}
                onClick={() => setState({ ...state, mode: state.mode === "signup" ? "login" : "signup" })}
              >
                {state.mode === "signup" ? "I already have an account" : "Create a new account"}
              </button>
            </form>
          )}
        </Section>
      </div>
    </main>
  );
}

function OnboardingScreen({ busy, error, onChooseWorkspace, onSignOut }) {
  return (
    <main style={styles.shell}>
      <div style={styles.wrap}>
        <section style={styles.card}>
          <p style={{ margin: "0 0 6px", letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 900, color: "#2f6289", fontSize: 12 }}>Welcome to TrackToZero</p>
          <h1 style={{ margin: "0 0 10px", fontSize: 32 }}>First, choose how you want to track debt.</h1>
          <p style={{ color: "#365a78" }}>You can start alone or create a household workspace. Either way, debts, balances, plans, and progress use the same V2 payoff model.</p>
          {error && <p role="alert" style={{ color: "#991b1b", fontWeight: 800 }}>{error}</p>}
          <div style={{ ...styles.grid, marginTop: 18 }}>
            <article style={{ ...styles.card, boxShadow: "none" }}>
              <h2>Personal</h2>
              <p>Use this if you are tracking your own debts and payoff plan.</p>
              <button type="button" disabled={busy} style={busy ? styles.disabledButton : styles.primaryButton} onClick={() => onChooseWorkspace("personal")}>
                Create personal workspace
              </button>
            </article>
            <article style={{ ...styles.card, boxShadow: "none" }}>
              <h2>Household</h2>
              <p>Create a shared payoff workspace. Inviting members requires a secure follow-up acceptance flow; raw email invites do not grant access.</p>
              <button type="button" disabled={busy} style={busy ? styles.disabledButton : styles.primaryButton} onClick={() => onChooseWorkspace("household")}>
                Create household workspace
              </button>
            </article>
          </div>
          {onSignOut && <button type="button" style={{ ...styles.button, marginTop: 18 }} onClick={onSignOut}>Sign out</button>}
        </section>
      </div>
    </main>
  );
}

function StatusBadge({ status }) {
  const palette = {
    ahead: ["#dcfce7", "#166534"],
    on_track: ["#dcfce7", "#166534"],
    slightly_behind: ["#fef3c7", "#92400e"],
    needs_review: ["#fee2e2", "#991b1b"],
    needs_balance_update: ["#e0f2fe", "#075985"],
    insufficient_data: ["#f1f5f9", "#475569"],
  }[status?.code] || ["#f1f5f9", "#475569"];
  return (
    <span aria-label={`Plan status: ${status?.label || "Unknown"}`} style={{ ...styles.pill, background: palette[0], color: palette[1], borderColor: palette[1] }}>
      {status?.label || "Unknown"}
    </span>
  );
}

function WorkspaceBar({
  workspaces,
  workspaceId,
  setWorkspaceId,
  members,
  actorId,
  setActorId,
  membership,
  mode,
  repositoryMode,
  allowNonMemberPreview = false,
  canSwitchWorkspace = true,
  canSwitchRole = true,
  onSignOut = null,
}) {
  const previewMembers = allowNonMemberPreview
    ? [...members, { uid: "seed-outsider", role: "non-member", displayName: "Non-member" }]
    : members;
  const modeLabel = repositoryMode === TRACKTOZERO_V2_REPOSITORY_MODES.firebaseProduction
    ? "Clean beta workspace"
    : mode === "legacy_preview" ? "Read-only legacy preview" : "Interactive seed workspace";
  return (
    <div style={{ ...styles.card, display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center" }}>
      <div>
        <p style={{ margin: 0, color: "#2f6289", fontWeight: 900 }}>TrackToZero 2.0 - {modeLabel}</p>
        <h1 style={{ margin: "4px 0 0", fontSize: 30 }}>Debt payoff command center</h1>
        <p style={{ margin: "8px 0 0", color: "#365a78" }}>Planning estimates only — not lender payoff quotes.</p>
      </div>
      <div style={{ display: "grid", gap: 8, minWidth: 260 }}>
        {canSwitchWorkspace ? (
          <Field label="Workspace">
            <select style={styles.input} value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>{workspace.type === "household" ? "Household" : "Personal"} · {workspace.id}</option>
              ))}
            </select>
          </Field>
        ) : <span style={styles.pill}>Workspace: Personal beta</span>}
        {canSwitchRole ? (
          <Field label="Role preview">
            <select style={styles.input} value={actorId} onChange={(event) => setActorId(event.target.value)}>
              {previewMembers.map((member) => (
                <option key={member.uid} value={member.uid}>{member.displayName || member.uid} · {member.role}</option>
              ))}
            </select>
          </Field>
        ) : <span style={styles.pill}>Signed in as owner</span>}
        <span style={styles.pill}>Current role: {membership?.role || "viewer"}</span>
        {onSignOut && <button type="button" style={styles.button} onClick={onSignOut}>Sign out</button>}
      </div>
    </div>
  );
}

function Home({ snapshot, scenario, onScenario }) {
  const target = snapshot.targetDebt;
  if (!snapshot.debts.length) {
    return (
      <Section title="Add your first debt" eyebrow="Home">
        <p>Start by adding a credit card, loan, line of credit, medical debt, or another balance you want to pay to $0.</p>
        <p>Once your first debt is saved, TrackToZero will guide you toward a payoff plan.</p>
      </Section>
    );
  }
  if (!snapshot.activeContext?.version) {
    return (
      <Section title="Build your payoff plan" eyebrow="Home">
        <p>You have debts in this workspace. Next, choose Snowball or Avalanche and activate your first payoff plan.</p>
        <div style={styles.grid}>
          <p><strong>Total debt entered:</strong> {money(snapshot.debts.reduce((sum, debt) => sum + Number(snapshot.latestSnapshotsByDebt[debt.id]?.balance ?? debt.currentBalance ?? 0), 0))}</p>
          <p><strong>Included in core payoff:</strong> {snapshot.includedDebts.length}</p>
          <p><strong>Plan status:</strong> Not started yet</p>
        </div>
      </Section>
    );
  }
  const nextPayment = Number(target?.minimumRequiredPayment || 0) + Number(snapshot.activeContext?.version?.extraMonthlyPayment || 0);
  return (
    <>
      <Section title={target ? `Next move: pay ${money(nextPayment)} to ${target.name}` : "Next move: create a payoff plan"} eyebrow="Home">
        <div style={styles.grid}>
          <div>
            <StatusBadge status={snapshot.status} />
            <p>{snapshot.status.message}</p>
            {target && <p><strong>Why this debt:</strong> {snapshot.activeContext?.version?.strategy === "snowball" ? "Snowball target — smallest included balance." : "Avalanche target — highest APR included debt."}</p>}
          </div>
          <div>
            <p><strong>Total included debt:</strong> {money(snapshot.totalIncludedDebt)}</p>
            <p><strong>Estimated debt-free date:</strong> {snapshot.projectedZeroDate || "Needs plan"}</p>
            <p><strong>Workspace:</strong> {snapshot.workspace.type === "household" ? "Household shared payoff" : "Personal payoff"}</p>
          </div>
          <div>
            <p><strong>One improvement prompt:</strong></p>
            <p>{snapshot.warnings[0]?.message || "Try previewing +$100/month before applying anything."}</p>
            <button style={styles.primaryButton} onClick={() => onScenario(100)}>Preview +$100/mo</button>
          </div>
        </div>
      </Section>
      {scenario && (
        <Section title="What-if preview: current plan vs scenario" eyebrow="Scenario · side-effect-free">
          <p>Adds temporary extra payment only in the preview. It does not mutate the active plan.</p>
          <div style={styles.grid}>
            <p><strong>Months saved:</strong> {scenario.monthsSaved}</p>
            <p><strong>Estimated interest saved:</strong> {money(scenario.interestSaved)}</p>
            <p><strong>Scenario length:</strong> {scenario.scenarioMonths} months</p>
          </div>
        </Section>
      )}
    </>
  );
}

function Debts({ snapshot, service, refresh, runAction, writeState }) {
  const [payment, setPayment] = useState({ debtId: snapshot.debts[0]?.id || "", amount: "" });
  const [balance, setBalance] = useState({ debtId: snapshot.debts[0]?.id || "", amount: "" });
  const [newDebt, setNewDebt] = useState(newDebtDraft);
  const canManage = snapshot.permissions.manageDebts && snapshot.mode !== "legacy_preview";
  const canObserve = snapshot.permissions.recordObservations && snapshot.mode !== "legacy_preview";

  return (
    <>
      <Section title="What you owe" eyebrow="Debts">
        <div style={styles.grid}>
          {snapshot.debts.map((debt) => (
            <article key={debt.id} style={{ border: "1px solid #c7e3f8", borderRadius: 18, padding: 14, background: debt.status === "paid_off" ? "#f0fdf4" : "#fff" }}>
              <h3 style={{ margin: 0 }}>{debt.name}</h3>
              <p>{money(snapshot.latestSnapshotsByDebt[debt.id]?.balance ?? debt.currentBalance)} · {debt.aprStatus === "unknown" ? "Unknown APR" : percent(debt.apr)}</p>
              <p>Required payment: {money(debt.minimumRequiredPayment)} · Due day: {debt.dueDay || "not set"}</p>
              <p>Owner: {debt.ownerLabel || "Workspace"} · {debt.includedInCorePayoffPlan ? "Included in core plan" : "Excluded from core date"}</p>
              {snapshot.targetDebt?.id === debt.id && <span style={styles.pill}>Current target</span>}
            </article>
          ))}
        </div>
      </Section>
      <Section title="Record observed reality" eyebrow="Payments + balances">
        <div style={styles.grid}>
          <form onSubmit={(event) => {
            event.preventDefault();
            runAction("record payment", async () => {
              await service.recordPayment(snapshot.workspace.id, payment.debtId, { amount: Number(payment.amount) });
              setPayment({ ...payment, amount: "" });
              await refresh();
            });
          }}>
            <Field label="Record payment">
              <select style={styles.input} value={payment.debtId} onChange={(event) => setPayment({ ...payment, debtId: event.target.value })}>{snapshot.debts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
            </Field>
            <Field label="Amount"><input style={styles.input} value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} /></Field>
            <button disabled={!canObserve || writeState.inProgress} style={canObserve && !writeState.inProgress ? styles.primaryButton : styles.disabledButton}>
              {writeState.action === "record payment" ? "Recording..." : "Record payment"}
            </button>
            {!canObserve && <p>Your role is read-only for payment recording.</p>}
          </form>
          <form onSubmit={(event) => {
            event.preventDefault();
            runAction("confirm balance", async () => {
              await service.recordBalanceSnapshot(snapshot.workspace.id, balance.debtId, { balance: Number(balance.amount) });
              setBalance({ ...balance, amount: "" });
              await refresh();
            });
          }}>
            <Field label="Update confirmed balance">
              <select style={styles.input} value={balance.debtId} onChange={(event) => setBalance({ ...balance, debtId: event.target.value })}>{snapshot.debts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
            </Field>
            <Field label="Current balance"><input style={styles.input} value={balance.amount} onChange={(event) => setBalance({ ...balance, amount: event.target.value })} /></Field>
            <button disabled={!canObserve || writeState.inProgress} style={canObserve && !writeState.inProgress ? styles.primaryButton : styles.disabledButton}>
              {writeState.action === "confirm balance" ? "Saving..." : "Confirm balance"}
            </button>
          </form>
          <form onSubmit={(event) => {
            event.preventDefault();
            runAction("add debt", async () => {
              const dueDay = newDebt.dueDate ? new Date(`${newDebt.dueDate}T00:00:00.000Z`).getUTCDate() : null;
              await service.createNewDebt(snapshot.workspace.id, {
                clientRequestId: newDebt.clientRequestId,
                name: newDebt.name,
                debtType: newDebt.debtType,
                currentBalance: Number(newDebt.currentBalance),
                balanceAsOf: dateInputToIso(newDebt.balanceAsOf),
                minimumRequiredPayment: Number(newDebt.minimumRequiredPayment),
                aprStatus: newDebt.aprStatus,
                apr: newDebt.aprStatus === "unknown" ? null : newDebt.aprStatus === "no_interest" ? 0 : Number(newDebt.apr),
                dueDay,
                ownerLabel: newDebt.ownerLabel || snapshot.membership?.displayName || "Workspace",
                includedInCorePayoffPlan: !!newDebt.includedInCorePayoffPlan,
              });
              setNewDebt(newDebtDraft());
              await refresh();
            });
          }}>
            <Field label="Creditor / debt name"><input style={styles.input} placeholder="Debt name" value={newDebt.name} onChange={(event) => setNewDebt({ ...newDebt, name: event.target.value })} /></Field>
            <Field label="Debt type">
              <select
                style={styles.input}
                value={newDebt.debtType}
                onChange={(event) => {
                  const debtType = event.target.value;
                  setNewDebt({ ...newDebt, debtType, includedInCorePayoffPlan: debtType === "mortgage" ? false : newDebt.includedInCorePayoffPlan });
                }}
              >
                <option value="credit_card">Credit card</option>
                <option value="personal_loan">Personal loan</option>
                <option value="auto_loan">Auto loan</option>
                <option value="student_loan">Student loan</option>
                <option value="medical">Medical debt</option>
                <option value="collections">Collections</option>
                <option value="tax_debt">Tax debt</option>
                <option value="line_of_credit">Line of credit</option>
                <option value="bnpl">Financing / BNPL</option>
                <option value="personal_debt">Personal debt</option>
                <option value="mortgage">Mortgage</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Current balance"><input style={styles.input} type="number" min="0" step="0.01" value={newDebt.currentBalance} onChange={(event) => setNewDebt({ ...newDebt, currentBalance: event.target.value })} /></Field>
            <Field label="Balance as-of date"><input style={styles.input} type="date" value={newDebt.balanceAsOf} onChange={(event) => setNewDebt({ ...newDebt, balanceAsOf: event.target.value })} /></Field>
            <Field label="Required payment"><input style={styles.input} value={newDebt.minimumRequiredPayment} onChange={(event) => setNewDebt({ ...newDebt, minimumRequiredPayment: event.target.value })} /></Field>
            <Field label="APR status">
              <select style={styles.input} value={newDebt.aprStatus} onChange={(event) => setNewDebt({ ...newDebt, aprStatus: event.target.value })}>
                <option value="unknown">Unknown</option>
                <option value="known">Known</option>
                <option value="no_interest">No interest</option>
                <option value="promotional">Promotional</option>
              </select>
            </Field>
            {newDebt.aprStatus !== "unknown" && newDebt.aprStatus !== "no_interest" && <Field label="APR"><input style={styles.input} type="number" min="0" step="0.01" value={newDebt.apr} onChange={(event) => setNewDebt({ ...newDebt, apr: event.target.value })} /></Field>}
            <Field label="Due date"><input style={styles.input} type="date" value={newDebt.dueDate} onChange={(event) => setNewDebt({ ...newDebt, dueDate: event.target.value })} /></Field>
            <Field label="Owner"><input style={styles.input} placeholder="Me, spouse, household..." value={newDebt.ownerLabel} onChange={(event) => setNewDebt({ ...newDebt, ownerLabel: event.target.value })} /></Field>
            <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0 14px", fontWeight: 800 }}>
              <input type="checkbox" checked={!!newDebt.includedInCorePayoffPlan} onChange={(event) => setNewDebt({ ...newDebt, includedInCorePayoffPlan: event.target.checked })} />
              Include in my core payoff plan
            </label>
            {newDebt.debtType === "mortgage" && !newDebt.includedInCorePayoffPlan && <p style={{ color: "#47657d" }}>Mortgage is tracked, but excluded from the core debt-free date unless you include it.</p>}
            <button disabled={!canManage || writeState.inProgress} style={canManage && !writeState.inProgress ? styles.primaryButton : styles.disabledButton}>
              {writeState.action === "add debt" ? "Adding..." : "Add debt"}
            </button>
            {!canManage && <p>Your role is read-only for debt setup.</p>}
          </form>
        </div>
      </Section>
    </>
  );
}

function Plan({ snapshot, service, refresh, runAction, writeState }) {
  const [draft, setDraft] = useState({ strategy: "avalanche", extraMonthlyPayment: "100" });
  const [reforecast, setReforecast] = useState(null);
  const canPlan = snapshot.permissions.managePlans && snapshot.mode !== "legacy_preview";
  const active = snapshot.activeContext;
  return (
    <>
      <Section title={active?.plan ? "Active payoff plan" : "No active payoff plan"} eyebrow="Plan">
        {active?.version ? (
          <div style={styles.grid}>
            <p><strong>Strategy:</strong> {active.version.strategy}</p>
            <p><strong>Extra monthly:</strong> {money(active.version.extraMonthlyPayment)}</p>
            <p><strong>Current version:</strong> {active.version.versionNumber}</p>
            <p><strong>Estimated $0 date:</strong> {snapshot.projectedZeroDate}</p>
          </div>
        ) : <p>Create a payoff plan to see target order, milestones, and status.</p>}
        {!!snapshot.warnings.length && <ul>{snapshot.warnings.map((warning) => <li key={`${warning.code}-${warning.debtId}`}>{warning.severity}: {warning.message}</li>)}</ul>}
      </Section>
      <Section title="Payoff order" eyebrow="Milestones">
        <ol>
          {snapshot.includedDebts.map((debt) => <li key={debt.id}>{debt.name} · {money(debt.currentBalance)} · {debt.aprStatus === "unknown" ? "Unknown APR" : percent(debt.apr)}</li>)}
        </ol>
      </Section>
      <Section title="Create or reforecast a plan" eyebrow="Preview before apply">
        <div style={styles.grid}>
          <form onSubmit={(event) => {
            event.preventDefault();
            runAction("activate plan", async () => {
              const { plan, version } = await service.createDraftPlan(snapshot.workspace.id, { strategy: draft.strategy, extraMonthlyPayment: Number(draft.extraMonthlyPayment) });
              await service.activatePlan(snapshot.workspace.id, plan.id, version.id);
              await refresh();
            });
          }}>
            <Field label="Strategy">
              <select style={styles.input} value={draft.strategy} onChange={(event) => setDraft({ ...draft, strategy: event.target.value })}>
                <option value="avalanche">Avalanche</option>
                <option value="snowball">Snowball</option>
              </select>
            </Field>
            <Field label="Extra monthly payment"><input style={styles.input} value={draft.extraMonthlyPayment} onChange={(event) => setDraft({ ...draft, extraMonthlyPayment: event.target.value })} /></Field>
            <button disabled={!canPlan || writeState.inProgress} style={canPlan && !writeState.inProgress ? styles.primaryButton : styles.disabledButton}>
              {writeState.action === "activate plan" ? "Activating..." : "Create + activate plan"}
            </button>
            {!canPlan && <p>Your role can view plans, but cannot change payoff plan setup.</p>}
          </form>
          <div>
            <button disabled={!canPlan || !active?.version || writeState.inProgress} style={canPlan && !writeState.inProgress ? styles.button : styles.disabledButton} onClick={() => {
              runAction("preview reforecast", async () => {
                setReforecast(await service.previewReforecast(snapshot.workspace.id, { extraMonthlyPayment: Number(active.version.extraMonthlyPayment || 0) + 50 }));
              }, { write: false });
            }}>Preview reforecast +$50/mo</button>
            {reforecast && (
              <div>
                <p>Old estimate: {reforecast.oldProjectedZeroDate || "n/a"}</p>
                <p>Proposed estimate: {reforecast.proposedZeroDate || "n/a"}</p>
                <button style={writeState.inProgress ? styles.disabledButton : styles.primaryButton} disabled={writeState.inProgress} onClick={() => {
                  runAction("apply reforecast", async () => {
                    await service.applyReforecast(snapshot.workspace.id, { extraMonthlyPayment: Number(active.version.extraMonthlyPayment || 0) + 50 });
                    setReforecast(null);
                    await refresh();
                  });
                }}>{writeState.action === "apply reforecast" ? "Applying..." : "Apply reforecast"}</button>
              </div>
            )}
          </div>
        </div>
      </Section>
    </>
  );
}

function MigrationPanel() {
  const states = [
    "Loading source",
    "Preview ready",
    "Needs confirmation",
    "Ready to migrate",
    "Migrating",
    "Validation result",
    "Rollback available",
    "Rollback blocked after native writes",
  ];
  return (
    <div style={{ ...styles.card, borderColor: "#f4b860", background: "#fffaf0" }}>
      <h3>Migration rehearsal tooling</h3>
      <p>Previewing migration data does not change legacy records or create production v2 data.</p>
      <ol>
        {states.map((state) => <li key={state}>{state}</li>)}
      </ol>
      <p><strong>Phase 4A safety:</strong> emulator rehearsal only. Saved legacy payoff plans import as drafts and do not become active automatically.</p>
    </div>
  );
}

function Settings({ snapshot, repositoryMode }) {
  const flags = getLaunchFlags();
  const dataMode = repositoryMode === TRACKTOZERO_V2_REPOSITORY_MODES.firebaseProduction
    ? "Clean V2 beta"
    : snapshot.mode === "legacy_preview" ? "Read-only legacy preview" : "Interactive v2 seed/test workspace";
  return (
    <Section title="Workspace settings" eyebrow="Settings">
      <div style={styles.grid}>
        <div>
          <p><strong>Workspace type:</strong> {snapshot.workspace.type}</p>
          <p><strong>Your role:</strong> {snapshot.membership?.role}</p>
          <p><strong>Data mode:</strong> {dataMode}</p>
        </div>
        <div>
          <h3>Members</h3>
          <ul>{snapshot.members.map((member) => <li key={member.uid}>{member.displayName || member.uid} · {member.role}</li>)}</ul>
        </div>
        <div>
          <h3>Privacy note</h3>
          <p>TrackToZero provides planning projections based on the information you enter. Actual balances, interest, fees, and payoff amounts may differ from your creditor's records.</p>
        </div>
      </div>
      {flags.trackToZeroMigrationEnabled && <MigrationPanel />}
    </Section>
  );
}

const getRuntimeMode = () => {
  const env = typeof import.meta !== "undefined" ? import.meta.env || {} : {};
  const requested = env.VITE_TRACKTOZERO_V2_REPOSITORY_MODE;
  if (requested === TRACKTOZERO_V2_REPOSITORY_MODES.firebaseEmulator) return TRACKTOZERO_V2_REPOSITORY_MODES.firebaseEmulator;
  if (requested === TRACKTOZERO_V2_REPOSITORY_MODES.inMemory) return TRACKTOZERO_V2_REPOSITORY_MODES.inMemory;
  return TRACKTOZERO_V2_REPOSITORY_MODES.firebaseProduction;
};

const getRuntimeConfig = () => {
  const env = typeof import.meta !== "undefined" ? import.meta.env || {} : {};
  const mode = getRuntimeMode();
  return {
    mode,
    firebaseConfig: mode === TRACKTOZERO_V2_REPOSITORY_MODES.firebaseProduction ? getFirebaseConfig() : {
      projectId: env.VITE_TRACKTOZERO_V2_FIREBASE_PROJECT_ID || "demo-budget-react-v2",
      apiKey: env.VITE_TRACKTOZERO_V2_FIREBASE_API_KEY || "demo",
    },
    emulatorHost: env.VITE_TRACKTOZERO_V2_FIRESTORE_EMULATOR_HOST || "",
    authEmulatorHost: env.VITE_TRACKTOZERO_V2_AUTH_EMULATOR_HOST || "",
    seedWorkspaceIds: String(env.VITE_TRACKTOZERO_V2_SEED_WORKSPACE_IDS || "personal-seed,household-seed")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  };
};

const getRuntimeRepository = () => {
  const runtime = getRuntimeConfig();
  return createTrackToZeroRepository({
    mode: runtime.mode,
    firebaseConfig: runtime.firebaseConfig,
    emulatorHost: runtime.emulatorHost,
  });
};

const safeUid = (uid) => String(uid || "").replace(/[\\/]/g, "_");
const workspaceIdForUser = (uid, type = "personal") => `${type}-workspace-${safeUid(uid)}`;
const productionWorkspaceCandidates = (uid) => [
  { id: workspaceIdForUser(uid, "personal"), type: "personal" },
  { id: workspaceIdForUser(uid, "household"), type: "household" },
];

export default function TrackToZeroV2App() {
  const runtime = useMemo(() => getRuntimeConfig(), []);
  const isProductionRuntime = runtime.mode === TRACKTOZERO_V2_REPOSITORY_MODES.firebaseProduction;
  const repository = useMemo(() => getRuntimeRepository(), []);
  const [authState, setAuthState] = useState({ status: isProductionRuntime ? "loading" : "ready", user: null, error: "" });
  const [authForm, setAuthForm] = useState({ mode: "signup", email: "", password: "" });
  const [authBusy, setAuthBusy] = useState(false);
  const [workspaceId, setWorkspaceId] = useState(isProductionRuntime ? "" : "personal-seed");
  const [actorId, setActorId] = useState(isProductionRuntime ? "" : V2_TEST_ACTOR_ID);
  const [tab, setTab] = useState("home");
  const [scenario, setScenario] = useState(null);
  const [runtimeState, setRuntimeState] = useState({ status: "idle", snapshot: null, workspaces: [], error: "" });
  const [writeState, setWriteState] = useState({ inProgress: false, action: "", error: "", success: "" });
  const requestSeq = useRef(0);
  const asOf = useMemo(() => isProductionRuntime ? new Date().toISOString() : V2_TEST_NOW, [isProductionRuntime]);
  const service = useMemo(() => createTrackToZeroV2AsyncAppService({ repository, actorId, asOf }), [repository, actorId, asOf]);

  useEffect(() => {
    if (!isProductionRuntime) return undefined;
    if (!auth) {
      setAuthState({ status: "unavailable", user: null, error: "Production Firebase is not configured for this release." });
      return undefined;
    }
    return onAuthStateChanged(auth, (user) => {
      setAuthState({ status: "ready", user, error: "" });
      setActorId(user?.uid || "");
      setWorkspaceId("");
      setRuntimeState({ status: user ? "idle" : "signed_out", snapshot: null, workspaces: [], error: "" });
      setScenario(null);
      setWriteState({ inProgress: false, action: "", error: "", success: "" });
    }, () => {
      setAuthState({ status: "unavailable", user: null, error: "TrackToZero could not connect to Firebase Auth." });
    });
  }, [isProductionRuntime]);

  const submitAuth = async (event) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthState((state) => ({ ...state, error: "" }));
    try {
      if (authForm.mode === "signup") await signup(authForm.email, authForm.password);
      else await login(authForm.email, authForm.password);
    } catch (error) {
      setAuthState((state) => ({ ...state, error: error?.message || "Authentication failed." }));
    } finally {
      setAuthBusy(false);
    }
  };

  const refresh = useCallback(async (nextWorkspaceId = workspaceId) => {
    const requestId = requestSeq.current + 1;
    requestSeq.current = requestId;
    setRuntimeState((state) => ({ ...state, status: "loading", error: "", snapshot: null }));
    try {
      if (isProductionRuntime) {
        if (!authState.user || !actorId) return;
        if (!nextWorkspaceId) {
          const candidates = productionWorkspaceCandidates(actorId);
          for (const candidate of candidates) {
            const membership = await repository.getMembership(candidate.id, actorId).catch(() => null);
            if (membership?.status === "active") {
              setWorkspaceId(candidate.id);
              nextWorkspaceId = candidate.id;
              break;
            }
          }
          if (!nextWorkspaceId) {
            if (requestSeq.current !== requestId) return;
            setRuntimeState({ status: "needs_onboarding", workspaces: [], snapshot: null, error: "" });
            return;
          }
        }
      } else {
        await ensureTrackToZeroV2EmulatorActor({
          actorId,
          mode: runtime.mode,
          firebaseConfig: runtime.firebaseConfig,
          emulatorHost: runtime.emulatorHost,
          authEmulatorHost: runtime.authEmulatorHost,
        });
      }
      const snapshot = await service.getWorkspaceSnapshot(nextWorkspaceId);
      const workspaces = isProductionRuntime
        ? productionWorkspaceCandidates(actorId).filter((workspace) => workspace.id === nextWorkspaceId)
        : runtime.mode === TRACKTOZERO_V2_REPOSITORY_MODES.firebaseEmulator
        ? runtime.seedWorkspaceIds.map((id) => ({ id, type: id.includes("household") ? "household" : "personal" }))
        : await service.getWorkspaces();
      if (requestSeq.current !== requestId) return;
      setRuntimeState({ status: "loaded", workspaces, snapshot, error: "" });
    } catch (error) {
      if (requestSeq.current !== requestId) return;
      const safe = getUserSafeTrackToZeroError(error);
      setRuntimeState({ status: safe.kind, workspaces: [], snapshot: null, error: safe.message });
    }
  }, [actorId, authState.user, isProductionRuntime, repository, runtime, service, workspaceId]);

  const runAction = async (action, callback, { write = true } = {}) => {
    setWriteState({ inProgress: write, action, error: "", success: "" });
    try {
      await callback();
      setWriteState({ inProgress: false, action: "", error: "", success: write ? `${action} saved.` : "" });
    } catch (error) {
      const safe = getUserSafeTrackToZeroError(error);
      setWriteState({ inProgress: false, action: "", error: `${action}: ${safe.message}`, success: "" });
    }
  };

  const chooseProductionWorkspace = async (type) => {
    const nextType = type === "household" ? "household" : "personal";
    const nextWorkspaceId = workspaceIdForUser(actorId, nextType);
    await runAction("create workspace", async () => {
      await service.bootstrapOwnerWorkspace(nextWorkspaceId, {
        type: nextType,
        displayName: authState.user?.displayName || authState.user?.email || "Owner",
        email: authState.user?.email || "",
      });
      setWorkspaceId(nextWorkspaceId);
      await refresh(nextWorkspaceId);
    });
  };

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      refresh(workspaceId);
      setScenario(null);
      setWriteState({ inProgress: false, action: "", error: "", success: "" });
    });
    return () => {
      cancelled = true;
    };
  }, [refresh, workspaceId]);

  const snapshot = runtimeState.snapshot;
  const workspaces = runtimeState.workspaces;
  const firebaseReady = !isProductionRuntime || (getFirebaseStatus().configured && getFirebaseConfig().projectId === "budgetapp-c9306");

  if (isProductionRuntime && (authState.status === "loading" || !authState.user)) {
    return (
      <AuthScreen
        onSubmit={submitAuth}
        state={authForm}
        setState={setAuthForm}
        error={authState.error}
        busy={authBusy}
        firebaseReady={firebaseReady && authState.status !== "unavailable"}
      />
    );
  }

  if (isProductionRuntime && runtimeState.status === "needs_onboarding") {
    return (
      <OnboardingScreen
        busy={writeState.inProgress}
        error={writeState.error}
        onChooseWorkspace={chooseProductionWorkspace}
        onSignOut={logout}
      />
    );
  }

  if (runtimeState.status === "loading" || runtimeState.status === "idle") {
    return (
      <main style={styles.shell}>
        <div style={styles.wrap}>
          <Section title="Loading TrackToZero 2.0" eyebrow="Firebase runtime">
            <p aria-live="polite">Loading workspace, debts, active plan, and balance history...</p>
          </Section>
        </div>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main style={styles.shell}>
        <div style={styles.wrap}>
          <Section title="TrackToZero test persistence is unavailable" eyebrow={runtimeState.status}>
            <p>{runtimeState.error || "We could not load the TrackToZero 2.0 workspace."}</p>
            <button style={styles.button} onClick={() => refresh(workspaceId)}>Retry</button>
          </Section>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.shell}>
      <div style={styles.wrap}>
        <WorkspaceBar
          workspaces={workspaces}
          workspaceId={workspaceId}
          setWorkspaceId={(idValue) => { setWorkspaceId(idValue); setScenario(null); }}
          members={snapshot.members}
          actorId={actorId}
          setActorId={setActorId}
          membership={snapshot.membership}
          mode={snapshot.mode}
          repositoryMode={runtime.mode}
          allowNonMemberPreview={runtime.mode === TRACKTOZERO_V2_REPOSITORY_MODES.firebaseEmulator}
          canSwitchWorkspace={!isProductionRuntime}
          canSwitchRole={!isProductionRuntime}
          onSignOut={isProductionRuntime ? logout : null}
        />
        <nav aria-label="TrackToZero 2.0 primary navigation" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
          {["home", "debts", "plan", "settings"].map((item) => (
            <button key={item} style={tab === item ? styles.primaryButton : styles.button} onClick={() => setTab(item)}>{item[0].toUpperCase() + item.slice(1)}</button>
          ))}
        </nav>
        {(writeState.error || writeState.success) && (
          <div role="status" aria-live="polite" style={{ ...styles.card, marginTop: 16, borderColor: writeState.error ? "#fecaca" : "#86efac" }}>
            {writeState.error || writeState.success}
          </div>
        )}
        {tab === "home" && <Home snapshot={snapshot} scenario={scenario} onScenario={(extra) => runAction("preview scenario", async () => {
          setScenario(await service.previewScenario(workspaceId, { extraMonthlyPayment: extra }));
        }, { write: false })} />}
        {tab === "debts" && <Debts snapshot={snapshot} service={service} refresh={() => refresh(workspaceId)} runAction={runAction} writeState={writeState} />}
        {tab === "plan" && <Plan snapshot={snapshot} service={service} refresh={() => refresh(workspaceId)} runAction={runAction} writeState={writeState} />}
        {tab === "settings" && <Settings snapshot={snapshot} repositoryMode={runtime.mode} />}
      </div>
    </main>
  );
}
