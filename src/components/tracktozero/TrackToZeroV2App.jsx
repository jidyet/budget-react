import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth as productionAuth, getFirebaseConfig, getFirebaseStatus, login as productionLogin, logout as productionLogout, signup as productionSignup } from "../../firebase";
import {
  createTrackToZeroRepository,
  ensureTrackToZeroV2EmulatorActor,
  getTrackToZeroV2LocalBetaAuth,
  TRACKTOZERO_V2_REPOSITORY_MODES,
} from "../../services/tracktozero/repositoryRuntime";
import { createTrackToZeroV2AsyncAppService, getUserSafeTrackToZeroError } from "../../services/tracktozero/v2AsyncApplicationService";
import { V2_TEST_ACTOR_ID, V2_TEST_NOW } from "../../services/tracktozero/v2SeedData";
import { getLaunchFlags } from "../../config/launchFlags";
import { APP_COMMIT, APP_VERSION } from "../../config/appMeta.js";
import { ROLE_PERMISSIONS } from "../../domain/tracktozero/constants.js";
import { presentedOwnerLabel } from "../../domain/tracktozero/ownership.js";
import { ttzPalette } from "./theme.js";
import AppShell from "./layout/AppShell.jsx";
import PageContainer from "./layout/PageContainer.jsx";
import QaHarnessControls from "./layout/QaHarnessControls.jsx";
import StatusBadge from "./ui/StatusBadge.jsx";
import Badge from "./ui/Badge.jsx";
import ReviewCenter from "./review/ReviewCenter.jsx";
import HomeCommandCenter from "./home/HomeCommandCenter.jsx";
import ActivityCenter from "./activity/ActivityCenter.jsx";
import PlanSection from "./plan/PlanSection.jsx";
import { navigateToPlanDestination } from "./plan/planRouting.js";
import { formatMoney as money, formatPercent as percent } from "./formatting.js";
import DebtsCenter from "./debts/DebtsCenter.jsx";

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
  badgeTarget: { border: "1px solid #9bd0f7", borderRadius: 999, padding: "4px 10px", background: "#e7f6ff", fontWeight: 800, fontSize: 12 },
  badgeWarning: { border: "1px solid #fbbf24", borderRadius: 999, padding: "4px 10px", background: "#fffbeb", color: "#92400e", fontWeight: 800, fontSize: 12 },
  badgeMuted: { border: "1px solid #cbd5e1", borderRadius: 999, padding: "4px 10px", background: "#f1f5f9", color: "#475569", fontWeight: 800, fontSize: 12 },
  badgeOwner: { border: "1px solid #86efac", borderRadius: 999, padding: "4px 10px", background: "#f0fdf4", color: "#166534", fontWeight: 800, fontSize: 12 },
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

function getRuntimeErrorTitle(status) {
  if (status === "permission_denied") return "You do not have access to this TrackToZero workspace";
  if (status === "repository_error") return "TrackToZero test persistence is unavailable";
  return "TrackToZero could not load this workspace";
}

function JoinInviteScreen({ previewState, authState, authForm, setAuthForm, onSubmit, authBusy }) {
  const preview = previewState.preview;
  const invite = preview?.invite;
  const title = preview?.state === "ready"
    ? `You've been invited to join ${invite?.workspaceName || "a household"}`
    : "This invite needs attention";
  const message = preview?.state === "expired"
    ? "This invite expired. Ask the household owner to create a new link."
    : preview?.state === "canceled"
    ? "This invite was canceled. Ask the household owner for a fresh link."
    : preview?.state === "accepted"
    ? "This invite was already used. Sign in if you already joined this household."
    : preview?.state === "invalid"
    ? "This invite link isn't valid."
    : "Sign in or create an account to continue.";
  return (
    <main style={styles.shell}>
      <div style={styles.wrap}>
        <Section title={title} eyebrow="Join household">
          {previewState.status === "loading" ? <p>Checking that invite...</p> : <p>{message}</p>}
          {invite && (
            <div style={{ ...styles.card, boxShadow: "none", marginTop: 14 }}>
              <p><strong>Household:</strong> {invite.workspaceName || "Household workspace"}</p>
              <p><strong>Role:</strong> {invite.role}</p>
              <p><strong>Invited by:</strong> {invite.invitedByName || "TrackToZero member"}</p>
            </div>
          )}
          {preview?.state === "ready" && !authState.user && (
            <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, maxWidth: 460, marginTop: 18 }}>
              <Field label="Email">
                <input style={styles.input} type="email" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} required />
              </Field>
              <Field label="Password">
                <input style={styles.input} type="password" value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} minLength={6} required />
              </Field>
              {authState.error && <p role="alert" style={{ color: ttzPalette.da, fontWeight: 800 }}>{authState.error}</p>}
              <button type="submit" disabled={authBusy} style={authBusy ? styles.disabledButton : styles.primaryButton}>
                {authBusy ? "Please wait..." : authForm.mode === "signup" ? "Create account and continue" : "Sign in to continue"}
              </button>
              <button type="button" style={styles.button} onClick={() => setAuthForm({ ...authForm, mode: authForm.mode === "signup" ? "login" : "signup" })}>
                {authForm.mode === "signup" ? "I already have an account" : "I need to create an account"}
              </button>
            </form>
          )}
        </Section>
      </div>
    </main>
  );
}

function JoinAcceptScreen({ preview, signedInEmail, onAccept, busy, error }) {
  const invite = preview?.invite;
  return (
    <main style={styles.shell}>
      <div style={styles.wrap}>
        <Section title={`Join ${invite?.workspaceName || "this household"}`} eyebrow="Invitation ready">
          <p>You're signed in as <strong>{signedInEmail}</strong>.</p>
          <div style={{ ...styles.card, boxShadow: "none", marginTop: 14 }}>
            <p><strong>Role:</strong> {invite?.role}</p>
            <p><strong>Invited by:</strong> {invite?.invitedByName || "TrackToZero member"}</p>
            <p><strong>Invite email:</strong> {invite?.emailNormalized}</p>
          </div>
          {error && <p role="alert" style={{ color: ttzPalette.da, fontWeight: 800 }}>{error}</p>}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
            <button type="button" disabled={busy} style={busy ? styles.disabledButton : styles.primaryButton} onClick={onAccept}>
              {busy ? "Joining..." : "Join household"}
            </button>
          </div>
        </Section>
      </div>
    </main>
  );
}

function JoinConnectScreen({ workspaceName, matches = [], onConnect, onSkip, busy, error }) {
  const [selectedPersonId, setSelectedPersonId] = useState(matches[0]?.id || "");
  if (!matches.length) return null;
  return (
    <main style={styles.shell}>
      <div style={styles.wrap}>
        <Section title="One quick thing" eyebrow="Connect your financial profile">
          <p>You're in. We already found a financial profile in {workspaceName || "this household"} that might be yours.</p>
          {matches.length === 1 ? (
            <div style={{ ...styles.card, boxShadow: "none", marginTop: 14 }}>
              <p><strong>{matches[0].displayName}</strong></p>
              <p style={{ color: "#4d6a82", marginBottom: 0 }}>If this is you, connect it now. Your debts stay on the same financial profile either way.</p>
            </div>
          ) : (
            <Field label="Which financial profile is yours?">
              <select style={styles.input} value={selectedPersonId} onChange={(event) => setSelectedPersonId(event.target.value)}>
                {matches.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
              </select>
            </Field>
          )}
          {error && <p role="alert" style={{ color: ttzPalette.da, fontWeight: 800 }}>{error}</p>}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
            <button
              type="button"
              disabled={busy || !(matches.length === 1 ? matches[0]?.id : selectedPersonId)}
              style={busy ? styles.disabledButton : styles.primaryButton}
              onClick={() => onConnect(matches.length === 1 ? matches[0].id : selectedPersonId)}
            >
              {busy ? "Connecting..." : "Yes, connect me"}
            </button>
            <button type="button" disabled={busy} style={styles.button} onClick={onSkip}>Not now</button>
          </div>
        </Section>
      </div>
    </main>
  );
}

function AuthScreen({ onSubmit, state, setState, error, busy, firebaseReady, unavailableMessage, eyebrow = "Clean beta" }) {
  const title = state.mode === "signup" ? "Create your TrackToZero beta account" : "Sign in to TrackToZero beta";
  return (
    <main style={styles.shell}>
      <div style={styles.wrap}>
        <Section title={firebaseReady ? title : "TrackToZero beta is temporarily unavailable"} eyebrow={eyebrow}>
          {!firebaseReady ? (
            <p>{unavailableMessage || "Production Firebase is not configured for this release. The app is in a safe disabled state."}</p>
          ) : (
            <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, maxWidth: 460 }}>
              <p>Start fresh in the V2 command center. No demo debts are loaded.</p>
              <Field label="Email">
                <input style={styles.input} type="email" value={state.email} onChange={(event) => setState({ ...state, email: event.target.value })} required />
              </Field>
              <Field label="Password">
                <input style={styles.input} type="password" value={state.password} onChange={(event) => setState({ ...state, password: event.target.value })} minLength={6} required />
              </Field>
              {error && <p role="alert" style={{ color: ttzPalette.da, fontWeight: 800 }}>{error}</p>}
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
          {error && <p role="alert" style={{ color: ttzPalette.da, fontWeight: 800 }}>{error}</p>}
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

function WorkspaceBar({
  workspace,
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
  if (canSwitchWorkspace || canSwitchRole) {
    return (
      <QaHarnessControls
        workspaces={workspaces}
        workspaceId={workspaceId}
        setWorkspaceId={setWorkspaceId}
        members={members}
        actorId={actorId}
        setActorId={setActorId}
        allowNonMemberPreview={allowNonMemberPreview}
      />
    );
  }
  if (!onSignOut) return null;
  const modeLabel = repositoryMode === TRACKTOZERO_V2_REPOSITORY_MODES.firebaseProduction
    ? "Clean beta workspace"
    : repositoryMode === TRACKTOZERO_V2_REPOSITORY_MODES.localBeta
    ? "Local beta workspace (emulator)"
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
        ) : (
          // Same authoritative snapshot.workspace every other screen (Home,
          // Debts, Plan, Settings) reads its type from - never a hardcoded
          // label, which previously could say "Personal" here while Settings
          // correctly said "household" for the exact same workspace (UX-0
          // Part 2: Header/Home/Debts/Plan/Settings must never disagree).
          <span style={styles.pill}>Workspace: {workspace?.type === "household" ? "Household" : "Personal"} beta</span>
        )}
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

// UX-2: HOME COMMAND CENTER + MOMENTUM EXPERIENCE
// The heart of TrackToZero - users understand their debt situation and next move
// within 5 seconds. Handled by dedicated HomeCommandCenter component.
function Home({
  snapshot,
  scenario,
  onGoToPlan,
  onGoToReview,
  reviewSnapshot,
  onScenario,
  onViewMyPlan,
  onCompareStrategies,
  onTryWhatIf,
  onGoToDebts,
  activityPage,
  onViewAllActivity,
}) {
  return (
    <HomeCommandCenter
      snapshot={snapshot}
      reviewSnapshot={reviewSnapshot}
      scenario={scenario}
      onGoToPlan={onGoToPlan}
      onGoToReview={onGoToReview}
      onUploadBudget={onGoToDebts}
      onAddDebt={onGoToDebts}
      onRecordPayment={onGoToDebts}
      onViewDetails={onGoToDebts}
      onSeeOptions={onGoToPlan}
      onPreviewScenario={onScenario}
      onViewMyPlan={onViewMyPlan}
      onCompareStrategies={onCompareStrategies}
      onTryWhatIf={onTryWhatIf}
      onGoToDebts={onGoToDebts}
      activityPage={activityPage}
      onViewAllActivity={onViewAllActivity}
    />
  );
}

function FirstPlanBuilder({ snapshot, service, refresh, runAction, writeState, canPlan }) {
  const [draft, setDraft] = useState({ strategy: "avalanche", extraMonthlyPayment: "100" });
  const [preview, setPreview] = useState(null);

  const previewPlan = () => runAction("preview first plan", async () => {
    setPreview(await service.previewDraftPlan(snapshot.workspace.id, { strategy: draft.strategy, extraMonthlyPayment: Number(draft.extraMonthlyPayment) || 0 }));
  }, { write: false });

  const activatePlan = () => runAction("activate plan", async () => {
    const { plan, version } = await service.createDraftPlan(snapshot.workspace.id, { strategy: draft.strategy, extraMonthlyPayment: Number(draft.extraMonthlyPayment) || 0 });
    await service.activatePlan(snapshot.workspace.id, plan.id, version.id);
    setPreview(null);
    await refresh();
  });

  return (
    <Section title="Build my payoff plan" eyebrow="Preview before you activate anything">
      <div style={styles.grid}>
        <Field label="Strategy">
          <select style={styles.input} value={draft.strategy} onChange={(event) => { setDraft({ ...draft, strategy: event.target.value }); setPreview(null); }}>
            <option value="avalanche">Avalanche - highest APR first</option>
            <option value="snowball">Snowball - smallest balance first</option>
          </select>
        </Field>
        <Field label="Extra monthly payment (beyond minimums)">
          <input style={styles.input} type="number" min="0" step="0.01" value={draft.extraMonthlyPayment} onChange={(event) => { setDraft({ ...draft, extraMonthlyPayment: event.target.value }); setPreview(null); }} />
        </Field>
        <button type="button" disabled={!canPlan || writeState.inProgress} style={canPlan && !writeState.inProgress ? styles.button : styles.disabledButton} onClick={previewPlan}>
          {writeState.action === "preview first plan" ? "Calculating..." : "Preview my plan"}
        </button>
      </div>
      {!canPlan && <p>Your role can view plans, but cannot build or activate one.</p>}
      {preview && (
        <div style={{ ...styles.card, marginTop: 14, borderColor: "#9bd0f7" }}>
          <p><strong>Starting total balance:</strong> {money(preview.startingTotalBalance)}</p>
          <p><strong>Estimated months to $0:</strong> {preview.monthsToZero || "Not reachable at this payment"}</p>
          <p><strong>Projected payoff date:</strong> {preview.projectedZeroDate || "n/a"}</p>
          <p><strong>Estimated interest paid:</strong> {money(preview.estimatedInterest)}</p>
          <p><strong>Payment amount:</strong> minimums on every included debt, plus {money(preview.extraMonthlyPayment)}/mo extra toward the {preview.strategy === "snowball" ? "smallest-balance" : "highest-APR"} target</p>
          <p><strong>Payoff order:</strong></p>
          <ol>
            {preview.payoffOrder.map((debt) => (
              <li key={debt.id}>
                {debt.name} · {money(debt.currentBalance)} · {debt.aprStatus === "unknown" ? "Unknown APR" : percent(debt.apr)}
                {snapshot.workspace.type === "household" && <> · {presentedOwnerLabel(debt)}</>}
              </li>
            ))}
          </ol>
          {!!preview.warnings.length && <ul>{preview.warnings.map((warning) => <li key={`${warning.code}-${warning.debtId}`}>{warning.severity}: {warning.message}</li>)}</ul>}
          <button type="button" disabled={!canPlan || writeState.inProgress} style={canPlan && !writeState.inProgress ? styles.primaryButton : styles.disabledButton} onClick={activatePlan}>
            {writeState.action === "activate plan" ? "Activating..." : "Activate this plan"}
          </button>
        </div>
      )}
    </Section>
  );
}

function Plan({ snapshot, service, refresh, runAction, writeState, navigateTab }) {
  return <PlanSection snapshot={snapshot} service={service} refresh={refresh} runAction={runAction} writeState={writeState} onGoToDebts={() => navigateTab?.("debts")} />;
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

function Settings({ snapshot, repositoryMode, service, refresh, runAction, writeState, latestInvite, setLatestInvite }) {
  const flags = getLaunchFlags();
  const canManageMembers = ROLE_PERMISSIONS[snapshot.membership?.role]?.manageMembers;
  const [householdName, setHouseholdName] = useState(snapshot.workspace.name || "");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [pendingConnections, setPendingConnections] = useState({});
  const dataMode = repositoryMode === TRACKTOZERO_V2_REPOSITORY_MODES.firebaseProduction
    ? "Clean V2 beta"
    : repositoryMode === TRACKTOZERO_V2_REPOSITORY_MODES.localBeta
    ? "Local beta (Firebase emulator)"
    : snapshot.mode === "legacy_preview" ? "Read-only legacy preview" : "Interactive v2 seed/test workspace";
  const unlinkedPeople = (snapshot.people || []).filter((person) => person.status !== "merged" && !person.workspaceMembershipId);
  return (
    <Section title="Workspace settings" eyebrow="Settings">
      <div style={styles.grid}>
        <div>
          <p><strong>Workspace name:</strong> {snapshot.workspace.name || (snapshot.workspace.type === "household" ? "Your household" : "Personal workspace")}</p>
          <p><strong>Workspace type:</strong> {snapshot.workspace.type}</p>
          <p><strong>Your role:</strong> {snapshot.membership?.role}</p>
          <p><strong>Data mode:</strong> {dataMode}</p>
          {/* BETA-1: a tester/support engineer needs a way to say exactly
              which build they're on ("Beta - 4715497") without exposing
              anything sensitive - never a secret, just the version + short
              commit hash this build was produced from (see appMeta.js).
              APP_COMMIT is "" for a shallow checkout with no .git history;
              in that case only the version shows, never a fabricated hash. */}
          <p><strong>Build:</strong> {APP_VERSION}{APP_COMMIT ? ` • ${APP_COMMIT}` : ""}</p>
        </div>
        <div>
          <h3>Verified members</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
            {snapshot.members.map((member) => (
              <li key={member.uid} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span>{member.displayName || member.uid} · {member.role}</span>
                <Badge tone="success">Verified member</Badge>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Privacy note</h3>
          <p>TrackToZero provides planning projections based on the information you enter. Actual balances, interest, fees, and payoff amounts may differ from your creditor's records.</p>
        </div>
      </div>
      {snapshot.workspace.type === "household" && (
        <>
          <div style={{ ...styles.grid, marginTop: 18 }}>
            <div style={{ ...styles.card, boxShadow: "none" }}>
              <h3 style={{ marginTop: 0 }}>Household details</h3>
              <Field label="Household name">
                <input style={styles.input} value={householdName} onChange={(event) => setHouseholdName(event.target.value)} disabled={!canManageMembers || writeState.inProgress} />
              </Field>
              <button
                type="button"
                disabled={!canManageMembers || writeState.inProgress || !householdName.trim()}
                style={canManageMembers && !writeState.inProgress ? styles.primaryButton : styles.disabledButton}
                onClick={() => runAction("save household name", async () => {
                  await service.renameWorkspace(snapshot.workspace.id, householdName);
                  await refresh();
                })}
              >
                {writeState.action === "save household name" ? "Saving..." : "Save household name"}
              </button>
            </div>
            <div style={{ ...styles.card, boxShadow: "none" }}>
              <h3 style={{ marginTop: 0 }}>Invite someone</h3>
              <Field label="Email address">
                <input style={styles.input} type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} disabled={!canManageMembers || writeState.inProgress} placeholder="jamie@example.com" />
              </Field>
              <Field label="Role">
                <select style={styles.input} value={inviteRole} onChange={(event) => setInviteRole(event.target.value)} disabled={!canManageMembers || writeState.inProgress}>
                  <option value="viewer">Viewer</option>
                  <option value="contributor">Contributor</option>
                  <option value="admin">Admin</option>
                </select>
              </Field>
              <button
                type="button"
                disabled={!canManageMembers || writeState.inProgress || !inviteEmail.trim()}
                style={canManageMembers && !writeState.inProgress ? styles.primaryButton : styles.disabledButton}
                onClick={() => runAction("create invite", async () => {
                  const invite = await service.createMemberInvite(snapshot.workspace.id, { email: inviteEmail, role: inviteRole });
                  setLatestInvite(invite);
                  setInviteEmail("");
                  await refresh();
                })}
              >
                {writeState.action === "create invite" ? "Creating..." : "Create invite"}
              </button>
              {!canManageMembers && <p style={{ color: "#4d6a82", marginBottom: 0 }}>Only owners and admins can invite people.</p>}
            </div>
          </div>
          {latestInvite && (
            <div style={{ ...styles.card, marginTop: 16, borderColor: ttzPalette.go }}>
              <h3 style={{ marginTop: 0 }}>Invite ready</h3>
              <p style={{ marginBottom: 8, overflowWrap: "anywhere" }}>{latestInvite.emailNormalized} · expires {new Date(latestInvite.expiresAt).toLocaleDateString()}</p>
              <button
                type="button"
                style={styles.primaryButton}
                onClick={async () => {
                  if (navigator?.clipboard?.writeText) {
                    await navigator.clipboard.writeText(latestInvite.joinUrl);
                  }
                }}
              >
                Copy invite link
              </button>
            </div>
          )}
          <div style={{ ...styles.grid, marginTop: 18 }}>
            <div style={{ ...styles.card, boxShadow: "none" }}>
              <h3 style={{ marginTop: 0 }}>Pending invitations</h3>
              {snapshot.memberInvites?.length ? (
                <div style={{ display: "grid", gap: 12 }}>
                  {snapshot.memberInvites.map((invite) => (
                    <article key={invite.id} style={{ border: "1px solid #d7e7f5", borderRadius: 16, padding: 12, background: "#fff" }}>
                      <p style={{ margin: 0, fontWeight: 800, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ overflowWrap: "anywhere", minWidth: 0 }}>{invite.emailNormalized}</span>
                        <Badge tone={invite.derivedStatus === "pending" ? "warning" : invite.derivedStatus === "accepted" ? "success" : "neutral"}>
                          {invite.derivedStatus === "pending" ? "Pending invitation" : invite.derivedStatus === "accepted" ? "Accepted" : invite.derivedStatus === "canceled" ? "Canceled" : "Expired"}
                        </Badge>
                      </p>
                      <p style={{ margin: "6px 0", color: "#4d6a82" }}>{invite.role} · expires {new Date(invite.expiresAt).toLocaleDateString()}</p>
                      {invite.derivedStatus === "pending" ? (
                        <button
                          type="button"
                          disabled={!canManageMembers || writeState.inProgress}
                          style={canManageMembers && !writeState.inProgress ? styles.button : styles.disabledButton}
                          onClick={() => runAction("cancel invite", async () => {
                            await service.cancelMemberInvite(snapshot.workspace.id, invite.id);
                            await refresh();
                          })}
                        >
                          Cancel invite
                        </button>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : <p style={{ marginBottom: 0, color: "#4d6a82" }}>No household invites yet.</p>}
            </div>
            <div style={{ ...styles.card, boxShadow: "none" }}>
              <h3 style={{ marginTop: 0 }}>Financial profiles not connected to a verified member</h3>
              {unlinkedPeople.length ? (
                <div style={{ display: "grid", gap: 12 }}>
                  {unlinkedPeople.map((person) => (
                    <article key={person.id} style={{ border: "1px solid #d7e7f5", borderRadius: 16, padding: 12, background: "#fff" }}>
                      <p style={{ margin: 0, fontWeight: 800, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {person.displayName}
                        <Badge tone="neutral">Financial profile</Badge>
                      </p>
                      <p style={{ margin: "6px 0", color: "#4d6a82" }}>This debt-owner profile is not linked to a verified household member yet.</p>
                      {canManageMembers ? (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <select
                            style={{ ...styles.input, minWidth: 220 }}
                            value={pendingConnections[person.id] || ""}
                            onChange={(event) => setPendingConnections((state) => ({ ...state, [person.id]: event.target.value }))}
                          >
                            <option value="">Choose a member</option>
                            {snapshot.members.filter((member) => member.status === "active").map((member) => (
                              <option key={member.uid} value={member.uid}>{member.displayName || member.uid} · {member.role}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={!pendingConnections[person.id] || writeState.inProgress}
                            style={!pendingConnections[person.id] || writeState.inProgress ? styles.disabledButton : styles.button}
                            onClick={() => runAction("connect profile", async () => {
                              await service.connectWorkspacePersonToMember(snapshot.workspace.id, { personId: person.id, memberUid: pendingConnections[person.id] });
                              await refresh();
                            })}
                          >
                            Connect account
                          </button>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : <p style={{ marginBottom: 0, color: "#4d6a82" }}>No unconnected financial profiles right now.</p>}
            </div>
          </div>
        </>
      )}
      {flags.trackToZeroMigrationEnabled && <MigrationPanel />}
    </Section>
  );
}

const getRuntimeMode = () => {
  const env = typeof import.meta !== "undefined" ? import.meta.env || {} : {};
  const requested = env.VITE_TRACKTOZERO_V2_REPOSITORY_MODE;
  if (requested === TRACKTOZERO_V2_REPOSITORY_MODES.firebaseEmulator) return TRACKTOZERO_V2_REPOSITORY_MODES.firebaseEmulator;
  // localBeta: real fresh-signup flow against local emulators (see repositoryRuntime.js).
  // Distinct from firebaseEmulator, which is a seeded actor-switcher QA harness -
  // that mode is preserved exactly as-is.
  if (requested === TRACKTOZERO_V2_REPOSITORY_MODES.localBeta) return TRACKTOZERO_V2_REPOSITORY_MODES.localBeta;
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
const getJoinIntent = () => {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  if (!url.pathname.startsWith("/join")) return null;
  const workspaceId = url.searchParams.get("workspace") || "";
  const token = url.searchParams.get("token") || "";
  if (!workspaceId || !token) return null;
  return { workspaceId, token };
};
const clearJoinIntent = () => {
  if (typeof window === "undefined") return;
  window.history.replaceState({}, "", "/");
};

export default function TrackToZeroV2App() {
  const runtime = useMemo(() => getRuntimeConfig(), []);
  const isProductionRuntime = runtime.mode === TRACKTOZERO_V2_REPOSITORY_MODES.firebaseProduction;
  const isLocalBetaRuntime = runtime.mode === TRACKTOZERO_V2_REPOSITORY_MODES.localBeta;
  // Both production and local-beta use the real fresh-signup UI flow
  // (AuthScreen, onAuthStateChanged, Personal/Household onboarding, Owner
  // bootstrap) - they differ only in which Firebase project/emulator backs
  // them. firebaseEmulator (seeded QA harness) and inMemory are unaffected.
  const usesRealAuthUi = isProductionRuntime || isLocalBetaRuntime;
  const repository = useMemo(() => getRuntimeRepository(), []);

  // Fail closed: if local-beta mode can't establish its own emulator-backed
  // auth (bad/missing host config), this throws inside the memo rather than
  // ever falling back to the production `auth` instance.
  const [localBetaAuthError, setLocalBetaAuthError] = useState("");
  const localBetaAuthApi = useMemo(() => {
    if (!isLocalBetaRuntime) return null;
    try {
      return getTrackToZeroV2LocalBetaAuth({
        firebaseConfig: runtime.firebaseConfig,
        emulatorHost: runtime.emulatorHost,
        authEmulatorHost: runtime.authEmulatorHost,
      });
    } catch (error) {
      setLocalBetaAuthError(error?.message || "Local beta configuration error.");
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocalBetaRuntime]);
  const activeAuth = isLocalBetaRuntime ? localBetaAuthApi?.auth : productionAuth;
  const activeLogin = isLocalBetaRuntime ? localBetaAuthApi?.login : productionLogin;
  const activeSignup = isLocalBetaRuntime ? localBetaAuthApi?.signup : productionSignup;
  const activeLogout = isLocalBetaRuntime ? (localBetaAuthApi?.logout || (() => {})) : productionLogout;

  const [authState, setAuthState] = useState({ status: usesRealAuthUi ? "loading" : "ready", user: null, error: "" });
  const [authForm, setAuthForm] = useState({ mode: "signup", email: "", password: "" });
  const [authBusy, setAuthBusy] = useState(false);
  const [workspaceId, setWorkspaceId] = useState(usesRealAuthUi ? "" : "personal-seed");
  const lastWorkspaceIdRef = useRef(workspaceId);
  const [actorId, setActorId] = useState(usesRealAuthUi ? "" : V2_TEST_ACTOR_ID);
  const [tab, setTab] = useState("home");
  const [scenario, setScenario] = useState(null);
  // Lifted out of Settings (not local state there) because every write
  // action calls refresh(), which briefly sets runtimeState.status to
  // "loading" and replaces this component's whole child tree with a
  // loading screen (see the runtimeState.status === "loading" render gate
  // below) - that unmounts Settings and would silently lose the freshly
  // created invite's one-time joinUrl. Only the invite's hashed token is
  // ever persisted, so once this is lost there is no way to recover the
  // link short of canceling and recreating the invite.
  const [latestInvite, setLatestInvite] = useState(null);
  const [joinIntent, setJoinIntent] = useState(() => getJoinIntent());
  const [joinPreviewState, setJoinPreviewState] = useState({ status: joinIntent ? "loading" : "idle", preview: null, error: "" });
  const [joinAcceptedState, setJoinAcceptedState] = useState({ status: "idle", workspaceId: "", matches: [], invite: null, error: "" });
  const [runtimeState, setRuntimeState] = useState({ status: "idle", snapshot: null, workspaces: [], error: "" });
  const [writeState, setWriteState] = useState({ inProgress: false, action: "", error: "", success: "", errorAction: "" });
  const [reviewState, setReviewState] = useState({ status: "idle", snapshot: null });
  const [activityState, setActivityState] = useState({ status: "idle", page: null });
  // UX-8: mobile quick-action sheet - the sheet itself is stateless UI (see
  // QuickActionSheet.jsx); this is only "is it open" plus "what should
  // Debts auto-open once we navigate there," never new business logic.
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [debtsInitialAction, setDebtsInitialAction] = useState(null);
  const requestSeq = useRef(0);
  const reviewRequestSeq = useRef(0);
  const activityRequestSeq = useRef(0);
  const asOf = useMemo(() => usesRealAuthUi ? new Date().toISOString() : V2_TEST_NOW, [usesRealAuthUi]);
  // UX-9: this used to be derived from Firebase Auth's own
  // creationTime === lastSignInTime metadata - a real bug, found while
  // driving a genuine fresh local-beta signup through a hard refresh: that
  // equality is set once at account creation and never changes just from
  // restoring a persisted session, so it stayed "true" forever after the
  // original signup instant - including after the user went on to create a
  // real workspace. Every later refresh() (e.g. after a page reload, where
  // workspaceId resets to "" below) then hit the "skip the workspace
  // lookup, this must be a brand-new signup with nothing to find yet"
  // shortcut again, silently sending an existing user with real data back
  // to the onboarding screen. Firestore data was never actually lost - only
  // discoverable, which made it worse to diagnose. Now tracked as plain
  // React state, set only inside the interactive signup handler below, so
  // it is true for exactly the one moment the shortcut is meant to cover
  // and always resets to false on reload like the rest of this component's
  // session state.
  const [justSignedUpLocalBeta, setJustSignedUpLocalBeta] = useState(false);
  const isFreshLocalBetaSignup = isLocalBetaRuntime && justSignedUpLocalBeta;
  const service = useMemo(() => createTrackToZeroV2AsyncAppService({ repository, actorId, asOf }), [repository, actorId, asOf]);

  useEffect(() => {
    if (!usesRealAuthUi) return undefined;
    if (isLocalBetaRuntime && localBetaAuthError) {
      setAuthState({ status: "unavailable", user: null, error: localBetaAuthError });
      return undefined;
    }
    if (!activeAuth) {
      // Still resolving localBetaAuthApi (or, for production, genuinely unconfigured).
      if (isLocalBetaRuntime) return undefined;
      setAuthState({ status: "unavailable", user: null, error: "Production Firebase is not configured for this release." });
      return undefined;
    }
    return onAuthStateChanged(activeAuth, (user) => {
      setAuthState({ status: "ready", user, error: "" });
      setActorId(user?.uid || "");
      setWorkspaceId("");
      setRuntimeState({ status: user ? "idle" : "signed_out", snapshot: null, workspaces: [], error: "" });
      setScenario(null);
      setWriteState({ inProgress: false, action: "", error: "", success: "" });
    }, () => {
      setAuthState({ status: "unavailable", user: null, error: isLocalBetaRuntime ? "TrackToZero could not connect to the local Auth emulator." : "TrackToZero could not connect to Firebase Auth." });
    });
  }, [usesRealAuthUi, isLocalBetaRuntime, localBetaAuthError, activeAuth]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const syncJoinIntent = () => setJoinIntent(getJoinIntent());
    window.addEventListener("popstate", syncJoinIntent);
    return () => window.removeEventListener("popstate", syncJoinIntent);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!joinIntent) {
      setJoinPreviewState({ status: "idle", preview: null, error: "" });
      return undefined;
    }
    setJoinPreviewState({ status: "loading", preview: null, error: "" });
    Promise.resolve()
      .then(async () => service.getJoinInvitePreview(joinIntent.workspaceId, joinIntent.token))
      .then((preview) => {
        if (cancelled) return;
        setJoinPreviewState({ status: "ready", preview, error: "" });
      })
      .catch((error) => {
        if (cancelled) return;
        setJoinPreviewState({ status: "error", preview: null, error: error?.message || "We couldn't load that invite right now." });
      });
    return () => {
      cancelled = true;
    };
  }, [joinIntent, service]);

  const submitAuth = async (event) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthState((state) => ({ ...state, error: "" }));
    try {
      if (authForm.mode === "signup") {
        await activeSignup(authForm.email, authForm.password);
        if (isLocalBetaRuntime) setJustSignedUpLocalBeta(true);
      } else {
        await activeLogin(authForm.email, authForm.password);
      }
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
      let availableWorkspaces = null;
      if (usesRealAuthUi) {
        if (!authState.user || !actorId) return;
        if (
          isFreshLocalBetaSignup
          && !nextWorkspaceId
          && !joinAcceptedState.workspaceId
          && !joinIntent?.workspaceId
        ) {
          if (requestSeq.current !== requestId) return;
          setRuntimeState({ status: "needs_onboarding", workspaces: [], snapshot: null, error: "" });
          return;
        }
        try {
          availableWorkspaces = await service.getUserWorkspaces();
        } catch (error) {
          const safe = getUserSafeTrackToZeroError(error);
          if (
            isLocalBetaRuntime
            && safe.kind === "permission_denied"
            && !nextWorkspaceId
            && !joinAcceptedState.workspaceId
            && !joinIntent?.workspaceId
          ) {
            if (requestSeq.current !== requestId) return;
            setRuntimeState({ status: "needs_onboarding", workspaces: [], snapshot: null, error: "" });
            return;
          }
          throw error;
        }
        const preferredWorkspaceId = joinAcceptedState.workspaceId || joinIntent?.workspaceId || "";
        const requestedWorkspaceId = availableWorkspaces.find((workspace) => workspace.id === nextWorkspaceId)?.id || "";
        nextWorkspaceId = requestedWorkspaceId
          || availableWorkspaces.find((workspace) => workspace.id === preferredWorkspaceId)?.id
          || availableWorkspaces[0]?.id
          || "";
        if (nextWorkspaceId && nextWorkspaceId !== workspaceId) setWorkspaceId(nextWorkspaceId);
        if (!nextWorkspaceId) {
          if (requestSeq.current !== requestId) return;
          setRuntimeState({ status: "needs_onboarding", workspaces: [], snapshot: null, error: "" });
          return;
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
      const workspaces = usesRealAuthUi
        ? (availableWorkspaces || await service.getUserWorkspaces())
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
  }, [actorId, authState.user, isFreshLocalBetaSignup, isLocalBetaRuntime, joinAcceptedState.workspaceId, joinIntent, usesRealAuthUi, repository, runtime, service, workspaceId]);

  // Review counts/lists come from exactly one place - service.getReviewSnapshot,
  // which itself only calls REVIEW-1A's shared selectors over
  // repository.listImportBatches. Nothing here recomputes an open/blocking
  // count independently (REVIEW-1B Part 4/60), and it's fetched once per
  // workspace load / resolution rather than on every render.
  const refreshReview = useCallback(async (nextWorkspaceId = workspaceId) => {
    if (!nextWorkspaceId) return;
    const requestId = reviewRequestSeq.current + 1;
    reviewRequestSeq.current = requestId;
    setReviewState((state) => ({ ...state, status: "loading" }));
    try {
      const reviewSnapshot = await service.getReviewSnapshot(nextWorkspaceId);
      if (reviewRequestSeq.current !== requestId) return;
      setReviewState({ status: "loaded", snapshot: reviewSnapshot });
    } catch {
      if (reviewRequestSeq.current !== requestId) return;
      setReviewState({ status: "error", snapshot: null });
    }
  }, [service, workspaceId]);

  // UX-7: Activity is intentionally NOT fetched alongside the main
  // snapshot/review load (see the effect below, gated on tab) - its bounded
  // per-debt reads (see v2AsyncApplicationService.js's getActivityFeed) are
  // cheap in isolation, but there is no reason to pay them on every
  // workspace load when the user may never open Home's activity preview or
  // the Activity tab this session.
  const refreshActivity = useCallback(async (nextWorkspaceId = workspaceId, options = {}) => {
    if (!nextWorkspaceId) return;
    const requestId = activityRequestSeq.current + 1;
    activityRequestSeq.current = requestId;
    setActivityState((state) => ({ ...state, status: "loading" }));
    try {
      const page = await service.getActivityFeed(nextWorkspaceId, options);
      if (activityRequestSeq.current !== requestId) return;
      setActivityState({ status: "loaded", page });
    } catch {
      if (activityRequestSeq.current !== requestId) return;
      setActivityState({ status: "error", page: null });
    }
  }, [service, workspaceId]);

  useEffect(() => {
    if (tab !== "home" && tab !== "activity") return;
    refreshActivity(workspaceId, { limit: tab === "activity" ? 20 : 5 });
  }, [tab, workspaceId, refreshActivity]);

  // UX-9: a raw "create workspace saved."/"add debt saved." confirmation
  // previously had no auto-dismiss at all - it sat on screen indefinitely
  // (worst case: it's the very first thing a brand-new user sees, right on
  // their freshly created, otherwise-empty Home) until they happened to
  // switch tabs, which is the only other place writeState gets reset (see
  // navigateTab). Errors deliberately stay sticky - a user should
  // consciously see and act on those - only a genuine success confirmation
  // self-clears.
  useEffect(() => {
    if (!writeState.success) return undefined;
    const timer = setTimeout(() => {
      setWriteState((state) => (state.success ? { ...state, success: "" } : state));
    }, 4000);
    return () => clearTimeout(timer);
  }, [writeState.success]);

  const runAction = async (action, callback, { write = true } = {}) => {
    setWriteState({ inProgress: write, action, error: "", success: "", errorAction: "" });
    try {
      await callback();
      setWriteState({ inProgress: false, action: "", error: "", success: write ? `${action} saved.` : "", errorAction: "" });
    } catch (error) {
      const safe = getUserSafeTrackToZeroError(error);
      // action is reset here just like on success (it also drives "busy"
      // button labels elsewhere, which must not get stuck showing their
      // in-progress text forever after a failure) - errorAction is the
      // separate, dedicated field callers use to know THEIR action is the
      // one that failed, since by render time action alone can no longer
      // tell them apart from "nothing in progress".
      setWriteState({ inProgress: false, action: "", error: `${action}: ${safe.message}`, success: "", errorAction: action });
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
      setJustSignedUpLocalBeta(false);
      await refresh(nextWorkspaceId);
    });
  };

  const acceptJoinInvite = async () => {
    if (!joinIntent || !authState.user) return;
    await runAction("join household", async () => {
      const result = await service.acceptMemberInvite(joinIntent.workspaceId, {
        token: joinIntent.token,
        displayName: authState.user?.displayName || authState.user?.email || "",
        email: authState.user?.email || "",
      });
      if (result.personMatches?.length) {
        setJoinAcceptedState({
          status: "needs_person_link",
          workspaceId: joinIntent.workspaceId,
          matches: result.personMatches,
          invite: result.invite,
          error: "",
        });
        return;
      }
      setJoinAcceptedState({
        status: "joined",
        workspaceId: joinIntent.workspaceId,
        matches: [],
        invite: result.invite,
        error: "",
      });
      setWorkspaceId(joinIntent.workspaceId);
      clearJoinIntent();
      setJoinIntent(null);
      await refresh(joinIntent.workspaceId);
    }, { write: true });
  };

  const connectJoinedPerson = async (personId) => {
    if (!joinAcceptedState.workspaceId) return;
    await runAction("connect profile", async () => {
      await service.connectWorkspacePersonToMember(joinAcceptedState.workspaceId, {
        personId,
        memberUid: actorId,
        allowSelfService: true,
      });
      setWorkspaceId(joinAcceptedState.workspaceId);
      setJoinAcceptedState({ status: "joined", workspaceId: joinAcceptedState.workspaceId, matches: [], invite: joinAcceptedState.invite, error: "" });
      clearJoinIntent();
      setJoinIntent(null);
      await refresh(joinAcceptedState.workspaceId);
    }, { write: true });
  };

  const skipJoinedPersonConnection = async () => {
    if (!joinAcceptedState.workspaceId) return;
    setWorkspaceId(joinAcceptedState.workspaceId);
    setJoinAcceptedState((state) => ({ ...state, status: "joined", matches: [] }));
    clearJoinIntent();
    setJoinIntent(null);
    await refresh(joinAcceptedState.workspaceId);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      refresh(workspaceId);
      refreshReview(workspaceId);
      setScenario(null);
      setWriteState({ inProgress: false, action: "", error: "", success: "" });
    });
    return () => {
      cancelled = true;
    };
  }, [refresh, refreshReview, workspaceId]);

  // UX-6.2: a genuine workspace SWITCH (not the initial mount) resets a
  // stale /debts/<category> URL back to the portfolio root - DebtsCenter
  // remounts via `key={snapshot.workspace?.id}` on switch (resetting its own
  // local ownerFilter/destination state), but a full remount alone still
  // reads whatever the CURRENT URL says, so a category slug left over from
  // the previous workspace would otherwise reopen (showing an empty/wrong
  // category) instead of the portfolio grid. Guarded on lastWorkspaceIdRef
  // so this never fights the intentional refresh-safe direct-navigation
  // behavior on first page load (e.g. opening a bookmarked /debts/mortgage
  // link should still resolve to that category, not bounce to "/debts").
  useEffect(() => {
    if (lastWorkspaceIdRef.current === workspaceId) return;
    lastWorkspaceIdRef.current = workspaceId;
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/debts") && window.location.pathname !== "/debts") {
      window.history.pushState({}, "", "/debts");
    }
  }, [workspaceId]);

  // UX-4.1/UX-6.1: the top-level tab was never synced with the URL, so a
  // fresh load or refresh at /plan/<destination> (or /debts/<category>)
  // silently rendered Home instead (tab defaults to "home" and never reads
  // the URL) - PlanSection's/DebtsCenter's own pushState-based sub-routing
  // only ever worked once you were ALREADY on that tab by clicking through
  // the nav. This keeps `tab` and the URL in agreement both ways: on first
  // load/refresh, and on Back/Forward. Only Plan and Debts have real
  // distinct URLs today, so leaving either for any other tab resets the URL
  // to "/" rather than inventing routes the rest of the app doesn't have yet.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const syncTabFromLocation = () => {
      const path = window.location.pathname;
      setTab(path.startsWith("/plan") ? "plan" : path.startsWith("/debts") ? "debts" : "home");
    };
    syncTabFromLocation();
    window.addEventListener("popstate", syncTabFromLocation);
    return () => window.removeEventListener("popstate", syncTabFromLocation);
  }, []);

  const navigateTab = (nextTab) => {
    setTab(nextTab);
    // A write-state banner (success/error) belongs to the tab that produced
    // it - without this reset, an error like "apply finish by: No active
    // plan to reforecast" raised on Plan stays visible after navigating to
    // Debts, since writeState lives in this never-unmounted root component.
    setWriteState({ inProgress: false, action: "", error: "", success: "", errorAction: "" });
    if (typeof window === "undefined") return;
    const path = window.location.pathname;
    const onPlanPath = path.startsWith("/plan");
    const onDebtsPath = path.startsWith("/debts");
    if (nextTab === "plan" && !onPlanPath) window.history.pushState({}, "", "/plan/my-plan");
    else if (nextTab === "debts") {
      // Re-clicking "Debts" while already deep in a category drill-down
      // (e.g. /debts/credit-cards) used to no-op here, since the guard only
      // fired when NOT already on a /debts path - the URL never changed, so
      // DebtsCenter's own popstate listener never saw a reason to reset its
      // destination back to the category grid. Users reflexively reach for
      // the top nav as "go back," so this now always returns to the grid
      // root, dispatching a synthetic popstate (mirroring
      // navigateToPlanDestination's own pattern) since pushState alone
      // never fires that event.
      if (path !== "/debts") {
        window.history.pushState({}, "", "/debts");
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
    }
    else if (nextTab !== "plan" && nextTab !== "debts" && (onPlanPath || onDebtsPath)) window.history.pushState({}, "", "/");
  };

  const goToPlanDestination = useCallback((destination) => {
    navigateTab("plan");
    navigateToPlanDestination(destination);
  }, []);

  const snapshot = runtimeState.snapshot;
  const workspaces = runtimeState.workspaces;
  const productionReady = getFirebaseStatus().configured && getFirebaseConfig().projectId === "budgetapp-c9306";
  const firebaseReady = isLocalBetaRuntime ? !localBetaAuthError : (!isProductionRuntime || productionReady);
  const authUnavailableMessage = isLocalBetaRuntime
    ? (localBetaAuthError || "Local beta configuration error: the local Firebase emulators are not reachable. Run `npm run emulators:v2` first.")
    : "Production Firebase is not configured for this release. The app is in a safe disabled state.";

  if (usesRealAuthUi && joinIntent && !authState.user && authState.status !== "loading") {
    return (
      <JoinInviteScreen
        previewState={joinPreviewState}
        authState={authState}
        authForm={authForm}
        setAuthForm={setAuthForm}
        onSubmit={submitAuth}
        authBusy={authBusy}
      />
    );
  }

  if (usesRealAuthUi && (authState.status === "loading" || !authState.user)) {
    return (
      <AuthScreen
        onSubmit={submitAuth}
        state={authForm}
        setState={setAuthForm}
        error={authState.error}
        busy={authBusy}
        firebaseReady={firebaseReady && authState.status !== "unavailable"}
        unavailableMessage={authUnavailableMessage}
        eyebrow={isLocalBetaRuntime ? "Local beta (emulator)" : "Clean beta"}
      />
    );
  }

  // Must be checked before the joinIntent/joinPreviewState gate below:
  // acceptJoinInvite() deliberately leaves joinIntent set (and never
  // re-fetches joinPreviewState) while a person-link decision is pending,
  // so that gate's preview?.state === "ready" is still true and would
  // otherwise keep re-matching forever, making this screen unreachable.
  if (joinAcceptedState.status === "needs_person_link") {
    return (
      <JoinConnectScreen
        workspaceName={joinAcceptedState.invite?.workspaceName}
        matches={joinAcceptedState.matches}
        onConnect={connectJoinedPerson}
        onSkip={skipJoinedPersonConnection}
        busy={writeState.inProgress && writeState.action === "connect profile"}
        error={writeState.errorAction === "connect profile" ? writeState.error : ""}
      />
    );
  }

  if (usesRealAuthUi && joinIntent && joinPreviewState.status === "ready") {
    const preview = joinPreviewState.preview;
    if (preview?.state === "ready") {
      return (
        <JoinAcceptScreen
          preview={preview}
          signedInEmail={authState.user?.email || ""}
          onAccept={acceptJoinInvite}
          busy={writeState.inProgress && writeState.action === "join household"}
          error={writeState.errorAction === "join household" ? writeState.error : ""}
        />
      );
    }
    if (preview?.state !== "accepted") {
      return (
        <JoinInviteScreen
          previewState={joinPreviewState}
          authState={authState}
          authForm={authForm}
          setAuthForm={setAuthForm}
          onSubmit={submitAuth}
          authBusy={authBusy}
        />
      );
    }
  }

  if (usesRealAuthUi && runtimeState.status === "needs_onboarding") {
    return (
      <OnboardingScreen
        busy={writeState.inProgress}
        error={writeState.error}
        onChooseWorkspace={chooseProductionWorkspace}
        onSignOut={activeLogout}
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
          <Section title={getRuntimeErrorTitle(runtimeState.status)} eyebrow={runtimeState.status}>
            <p>{runtimeState.error || "We could not load the TrackToZero 2.0 workspace."}</p>
            <button style={styles.button} onClick={() => refresh(workspaceId)}>Retry</button>
          </Section>
        </div>
      </main>
    );
  }

  const qaControlsVisible = !usesRealAuthUi;
  const topBarProps = {
    workspace: snapshot.workspace,
    repositoryMode: runtime.mode,
    snapshotMode: snapshot.mode,
    activeTab: tab,
    onSelectTab: navigateTab,
    userName: snapshot.membership?.displayName || authState.user?.displayName || "",
    userEmail: authState.user?.email || "",
    userRole: snapshot.membership?.role || "viewer",
    onGoToSettings: () => navigateTab("settings"),
    onSignOut: usesRealAuthUi ? activeLogout : null,
    // REVIEW-1C Part 32: the nav badge represents work that genuinely still
    // needs the user's attention, not every open review - an item the user
    // already chose "Skip all for now"/"Leave for later" on stays open
    // (still unresolved evidence) but no longer inflates this count.
    navBadges: {
      review: (reviewState.snapshot?.actionableCount ?? reviewState.snapshot?.openCount ?? 0)
        || (reviewState.snapshot?.staleBatchCount ?? 0),
    },
  };

  // UX-8: the mobile quick-action sheet never mutates anything itself - it
  // only navigates to Debts and tells DebtsCenter.jsx which of its own,
  // already-existing surfaces (AddDebtModal/ImportCenter/the always-visible
  // QuickUpdateRail) to bring to the front. Same permission gate DebtsCenter
  // already uses for the same actions, not a second permission model.
  const canManageDebtsMobile = snapshot.permissions.manageDebts && snapshot.mode !== "legacy_preview";
  const canObserveMobile = snapshot.permissions.recordObservations && snapshot.mode !== "legacy_preview";
  const onSelectQuickAction = (actionKey) => {
    setQuickActionsOpen(false);
    setDebtsInitialAction(actionKey === "record-payment" || actionKey === "update-balance" ? null : actionKey);
    navigateTab("debts");
  };
  const mobileBottomNavProps = {
    activeTab: tab,
    onSelectTab: navigateTab,
    // None of MobileBottomNav's 4 items (home/debts/plan/activity) currently
    // has a badge count of its own - Review is the only nav-badge count
    // today (topBarProps.navBadges), and Review is deliberately not one of
    // the 4 mobile items (see MobileBottomNav.jsx's own comment).
    badges: {},
    onOpenQuickActions: () => setQuickActionsOpen(true),
  };
  const quickActionSheetProps = {
    open: quickActionsOpen,
    onClose: () => setQuickActionsOpen(false),
    onSelectAction: onSelectQuickAction,
    canManage: canManageDebtsMobile,
    canObserve: canObserveMobile,
  };

  return (
    <AppShell topBarProps={topBarProps} mobileBottomNavProps={mobileBottomNavProps} quickActionSheetProps={quickActionSheetProps}>
      <PageContainer>
        {qaControlsVisible ? (
          <WorkspaceBar
            workspace={snapshot.workspace}
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
            canSwitchWorkspace={qaControlsVisible}
            canSwitchRole={qaControlsVisible}
            onSignOut={null}
          />
        ) : null}
        {(writeState.error || writeState.success) && (
          <div role="status" aria-live="polite" style={{ ...styles.card, marginTop: 16, borderColor: writeState.error ? ttzPalette.da : ttzPalette.go }}>
            {writeState.error || writeState.success}
          </div>
        )}
        {tab === "home" && <Home
          snapshot={snapshot}
          scenario={scenario}
          reviewSnapshot={reviewState.snapshot}
          onGoToPlan={() => navigateTab("plan")}
          onGoToReview={() => navigateTab("review")}
          onGoToDebts={() => navigateTab("debts")}
          onViewMyPlan={() => goToPlanDestination("my-plan")}
          onCompareStrategies={() => goToPlanDestination("compare")}
          onTryWhatIf={() => goToPlanDestination("what-if")}
          onScenario={(extra) => runAction("preview scenario", async () => {
            setScenario(await service.previewScenario(workspaceId, { extraMonthlyPayment: extra }));
          }, { write: false })}
          activityPage={activityState.page}
          onViewAllActivity={() => navigateTab("activity")}
        />}
        {tab === "activity" && (
          <ActivityCenter
            workspace={snapshot.workspace}
            page={activityState.page}
            loading={activityState.status === "loading" && !activityState.page}
            onLoadMore={(cursor, limit) => refreshActivity(workspaceId, { cursor, limit })}
          />
        )}
        {tab === "review" && (
          <ReviewCenter
            snapshot={snapshot}
            service={service}
            workspaceId={workspaceId}
            reviewSnapshot={reviewState.snapshot}
            loadingReview={reviewState.status === "loading" && !reviewState.snapshot}
            onRefreshReview={() => Promise.all([refreshReview(workspaceId), refresh(workspaceId)])}
          />
        )}
        {tab === "debts" && <DebtsCenter key={snapshot.workspace?.id} snapshot={snapshot} service={service} refresh={() => refresh(workspaceId)} refreshReview={() => refreshReview(workspaceId)} runAction={runAction} writeState={writeState} reviewSnapshot={reviewState.snapshot} onGoToReview={() => navigateTab("review")} initialAction={debtsInitialAction} onInitialActionHandled={() => setDebtsInitialAction(null)} />}
        {tab === "plan" && <Plan snapshot={snapshot} service={service} refresh={() => refresh(workspaceId)} runAction={runAction} writeState={writeState} navigateTab={navigateTab} />}
        {tab === "settings" && <Settings snapshot={snapshot} repositoryMode={runtime.mode} service={service} refresh={() => refresh(workspaceId)} runAction={runAction} writeState={writeState} latestInvite={latestInvite} setLatestInvite={setLatestInvite} />}
      </PageContainer>
    </AppShell>
  );
}
