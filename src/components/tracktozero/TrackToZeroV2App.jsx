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
import { ROLE_PERMISSIONS } from "../../domain/tracktozero/constants.js";
import { effectiveOwnerType, isConfirmedZero, isDebtNeedsReview, looksLikeJunkOwnerLabel, presentedOwnerLabel } from "../../domain/tracktozero/ownership.js";
import AppShell from "./layout/AppShell.jsx";
import PageContainer from "./layout/PageContainer.jsx";
import QaHarnessControls from "./layout/QaHarnessControls.jsx";
import StatusBadge from "./ui/StatusBadge.jsx";
import ReviewCenter from "./review/ReviewCenter.jsx";
import HomeCommandCenter from "./home/HomeCommandCenter.jsx";
import PlanSection from "./plan/PlanSection.jsx";
import { navigateToPlanDestination } from "./plan/planRouting.js";
import { deriveDebtPortfolioView } from "./debtPortfolioView.js";
import { formatMoney as money, formatPercent as percent } from "./formatting.js";
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
  ownerType: "unassigned",
  ownerId: "",
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

// Workspace-aware owner selector shared by manual debt entry and import
// review. Personal workspaces have nothing to choose - every debt always
// belongs to the signed-in member, so it's shown as a fixed, non-editable
// fact. Household workspaces require an explicit choice from the REAL
// verified member list, an existing DATA-HH1 household person, Joint/
// Household, or Unassigned - never free text, so a parser suggestion or
// typo can never become an owner. onCreatePerson (optional) lets the caller
// add a genuinely new household financial identity inline - it never
// creates an Auth account or a WorkspaceMembership, only a Workspace-scoped
// person another debt's owner can also reference.
function OwnerField({ workspace, members = [], people = [], ownerType, ownerId, onChange, onCreatePerson, disabled }) {
  const [addingPerson, setAddingPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  if (workspace?.type !== "household") {
    return <Field label="Owner"><span style={styles.pill}>You</span></Field>;
  }
  const activePeople = people.filter((person) => person.status !== "merged");
  const value = ownerType === "member" && ownerId ? `member:${ownerId}`
    : ownerType === "person" && ownerId ? `person:${ownerId}`
    : (ownerType || "unassigned");

  const handleCreate = async () => {
    const name = newPersonName.trim();
    if (!name || !onCreatePerson) return;
    setCreating(true);
    setCreateError("");
    try {
      const person = await onCreatePerson(name);
      onChange({ ownerType: "person", ownerId: person.id });
      setAddingPerson(false);
      setNewPersonName("");
    } catch {
      setCreateError("Couldn't add that person. Try again.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Field label="Owner">
      <select
        style={styles.input}
        disabled={disabled}
        value={value}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw.startsWith("member:")) onChange({ ownerType: "member", ownerId: raw.slice(7) });
          else if (raw.startsWith("person:")) onChange({ ownerType: "person", ownerId: raw.slice(7) });
          else onChange({ ownerType: raw, ownerId: "" });
        }}
      >
        <option value="unassigned">Unassigned</option>
        <option value="joint">Joint / Household</option>
        {members.filter((member) => member.status !== "removed").map((member) => (
          <option key={member.uid} value={`member:${member.uid}`}>{member.displayName || member.uid}</option>
        ))}
        {activePeople.map((person) => (
          <option key={person.id} value={`person:${person.id}`}>{person.displayName}</option>
        ))}
      </select>
      {onCreatePerson && !disabled ? (
        addingPerson ? (
          <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
            <input
              style={{ ...styles.input, flex: 1 }}
              placeholder="Person's name"
              value={newPersonName}
              disabled={creating}
              onChange={(event) => setNewPersonName(event.target.value)}
            />
            <button type="button" style={styles.button} disabled={creating || !newPersonName.trim()} onClick={handleCreate}>
              {creating ? "Adding..." : "Add"}
            </button>
            <button type="button" style={styles.button} disabled={creating} onClick={() => { setAddingPerson(false); setNewPersonName(""); setCreateError(""); }}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" style={{ ...styles.button, marginTop: 6, fontSize: 12 }} onClick={() => setAddingPerson(true)}>
            + Add a household person
          </button>
        )
      ) : null}
      {createError ? <p role="alert" style={{ color: "#991b1b", fontSize: 12, marginTop: 4 }}>{createError}</p> : null}
    </Field>
  );
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
              {authState.error && <p role="alert" style={{ color: "#991b1b", fontWeight: 800 }}>{authState.error}</p>}
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
          {error && <p role="alert" style={{ color: "#991b1b", fontWeight: 800 }}>{error}</p>}
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
          {error && <p role="alert" style={{ color: "#991b1b", fontWeight: 800 }}>{error}</p>}
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

// Small, honest badges summarizing a debt's state at a glance - every badge
// reflects a real field, never an inferred/guessed one. Uses the same
// isDebtNeedsReview/isConfirmedZero/looksLikeJunkOwnerLabel truth functions
// the plan-eligibility and portfolio-total logic use (UX-0), so a debt can
// never look fine here while being silently excluded from the plan/totals
// for a reason this card doesn't mention.
function DebtBadges({ debt, isTarget, isHousehold }) {
  const paidOff = isConfirmedZero(debt);
  const junkOwner = isHousehold && looksLikeJunkOwnerLabel(debt.ownerLabel);
  const needsReview = !paidOff && (
    isDebtNeedsReview(debt)
    || debt.aprStatus === "unknown"
    || Number(debt.minimumRequiredPayment || 0) <= 0
    || (isHousehold && effectiveOwnerType(debt) === "unassigned")
    || junkOwner
  );
  const ownerLabel = presentedOwnerLabel(debt);
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0" }}>
      {isTarget && <span style={styles.badgeTarget}>Current target</span>}
      {paidOff && <span style={styles.badgeOwner}>Paid off</span>}
      {isHousehold && <span style={styles.badgeOwner}>{ownerLabel}</span>}
      {debt.aprStatus === "unknown" && <span style={styles.badgeWarning}>APR unknown</span>}
      {needsReview && <span style={styles.badgeWarning}>Needs review</span>}
      {!debt.includedInCorePayoffPlan && <span style={styles.badgeMuted}>Excluded from core date</span>}
    </div>
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
    />
  );
}

const DEBT_TYPE_OPTIONS = [
  ["credit_card", "Credit card"],
  ["personal_loan", "Personal loan"],
  ["auto_loan", "Auto loan"],
  ["student_loan", "Student loan"],
  ["medical", "Medical debt"],
  ["collections", "Collections"],
  ["tax_debt", "Tax debt"],
  ["line_of_credit", "Line of credit"],
  ["bnpl", "Financing / BNPL"],
  ["personal_debt", "Personal debt"],
  ["mortgage", "Mortgage"],
  ["other", "Other"],
];

function ReconciliationSection({ candidate, canManage, busy, onResolveMatch, onResolveNew }) {
  const reconciliation = candidate.evidence?.reconciliation;
  const matches = reconciliation?.matches || [];
  const resolved = !!reconciliation?.resolution;
  const [selectedDebtId, setSelectedDebtId] = useState(matches.length === 1 ? matches[0].debtId : "");
  const [acceptedFields, setAcceptedFields] = useState({ apr: true, minimumPayment: true, dueDay: true });
  if (!matches.length || resolved) return null;
  const selectedMatch = matches.find((match) => match.debtId === selectedDebtId) || null;

  const formatDiffValue = (field, value) => {
    if (value == null || value === "") return "unknown";
    if (field === "apr") return percent(value);
    if (field === "balance" || field === "minimumPayment") return money(value);
    return String(value);
  };

  const buildMetadataUpdates = (match, fields) => {
    const updates = {};
    if (fields.apr && match.diff?.apr?.state === "changed" && match.diff.apr.newValue != null) updates.apr = match.diff.apr.newValue;
    if (fields.minimumPayment && match.diff?.minimumPayment?.state === "changed" && match.diff.minimumPayment.newValue != null) updates.minimumRequiredPayment = match.diff.minimumPayment.newValue;
    if (fields.dueDay && match.diff?.dueDay?.state === "changed" && match.diff.dueDay.newValue != null) updates.dueDay = match.diff.dueDay.newValue;
    return updates;
  };

  return (
    <div style={{ ...styles.card, boxShadow: "none", padding: 14, background: "#fff7ed", border: "1px solid #fbbf24", marginBottom: 12 }}>
      <p style={{ margin: "0 0 4px", fontWeight: 900, color: "#92400e" }}>This may already be in TrackToZero</p>
      <p style={{ margin: "0 0 10px", color: "#92400e", fontSize: 13 }}>
        {matches.length > 1 ? "More than one existing debt could match this import. Choose the right one, or keep it separate." : "We found an existing debt that looks like this one. Choose what to do before adding it."}
      </p>
      <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
        {matches.map((match) => (
          <label
            key={match.debtId}
            style={{ display: "grid", gap: 6, padding: 10, borderRadius: 12, border: selectedDebtId === match.debtId ? "2px solid #f59e0b" : "1px solid #fde68a", background: "#fff", cursor: "pointer" }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="radio" name={`match-${candidate.candidateId}`} checked={selectedDebtId === match.debtId} onChange={() => setSelectedDebtId(match.debtId)} disabled={!canManage} />
              <strong>{match.debtName}</strong>
            </span>
            <span style={{ fontSize: 13, color: "#78350f" }}>
              Existing balance {formatDiffValue("balance", match.diff?.balance?.existingValue)} · Imported balance {formatDiffValue("balance", match.diff?.balance?.newValue)}
            </span>
          </label>
        ))}
      </div>
      {selectedMatch ? (
        <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
          {["apr", "minimumPayment", "dueDay"].filter((field) => selectedMatch.diff?.[field]?.state === "changed").map((field) => (
            <label key={field} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#78350f" }}>
              <input type="checkbox" checked={!!acceptedFields[field]} disabled={!canManage} onChange={() => setAcceptedFields((state) => ({ ...state, [field]: !state[field] }))} />
              Update {field === "apr" ? "APR" : field === "minimumPayment" ? "minimum payment" : "due day"}: {formatDiffValue(field, selectedMatch.diff[field].existingValue)} → {formatDiffValue(field, selectedMatch.diff[field].newValue)}
            </label>
          ))}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={!canManage || busy || !selectedMatch}
          style={canManage && !busy && selectedMatch ? styles.primaryButton : styles.disabledButton}
          onClick={() => onResolveMatch(candidate.candidateId, selectedMatch.debtId, buildMetadataUpdates(selectedMatch, acceptedFields))}
        >
          Update this debt
        </button>
        <button type="button" disabled={!canManage || busy} style={styles.button} onClick={() => onResolveNew(candidate.candidateId)}>
          It&apos;s a different debt
        </button>
      </div>
    </div>
  );
}

function AprCandidatesField({ candidate, canManage, onUpdate }) {
  const aprEvidence = candidate.evidence?.fieldEvidence?.apr || candidate.evidence?.aprCandidates || [];
  const knownCandidates = [...new Map(
    aprEvidence
      .map((entry) => (typeof entry === "number" ? { apr: entry, aprStatus: "known" } : entry))
      .filter((entry) => entry?.aprStatus === "known" && entry.apr != null)
      .map((entry) => [`${entry.apr}`, entry])
  ).values()];
  if (knownCandidates.length < 2) return null;
  return (
    <div style={{ gridColumn: "1 / -1", padding: 12, borderRadius: 12, border: "1px solid #fde68a", background: "#fffbeb" }}>
      <p style={{ margin: "0 0 8px", fontWeight: 900, color: "#92400e" }}>We found more than one APR. Which one applies?</p>
      <div role="radiogroup" aria-label="Possible APR values" style={{ display: "grid", gap: 6 }}>
        {knownCandidates.map((entry, index) => (
          <label key={entry.apr} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="radio"
              name={`apr-candidates-${candidate.candidateId}`}
              disabled={!canManage}
              checked={candidate.aprStatus === "known" && Number(candidate.apr) === Number(entry.apr)}
              onChange={() => onUpdate({ apr: entry.apr, aprStatus: "known" })}
            />
            {percent(entry.apr)}
            {index === 0 ? <span style={styles.badgeTarget}>Most likely</span> : null}
          </label>
        ))}
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="radio"
            name={`apr-candidates-${candidate.candidateId}`}
            disabled={!canManage}
            checked={candidate.aprStatus === "unknown"}
            onChange={() => onUpdate({ apr: null, aprStatus: "unknown" })}
          />
          I don&apos;t know yet
        </label>
      </div>
    </div>
  );
}

function ImportReviewCandidate({ candidate, canManage, busy, onUpdate, onDecide, onResolveMatch, onResolveNew, workspace, members, people, onCreatePerson }) {
  const reconciliation = candidate.evidence?.reconciliation;
  const hasUnresolvedMatch = !!(reconciliation?.matches?.length) && !reconciliation?.resolution;
  const resolvedAsUpdate = reconciliation?.resolution?.decision === "updateExisting";
  const decisionLabel = resolvedAsUpdate
    ? "Will update existing debt"
    : ({ pending_review: "Needs your review", confirmed: "Will be added", excluded: "Excluded", needs_information: "Needs information" }[candidate.decision] || candidate.decision);
  return (
    <article style={{ border: "1px solid #c7e3f8", borderRadius: 18, padding: 14, background: candidate.decision === "confirmed" ? "#f0fdf4" : candidate.decision === "excluded" ? "#fef2f2" : "#fff" }}>
      <ReconciliationSection candidate={candidate} canManage={canManage} busy={busy} onResolveMatch={onResolveMatch} onResolveNew={onResolveNew} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Creditor / debt name"><input style={styles.input} disabled={!canManage} value={candidate.accountName} onChange={(event) => onUpdate({ accountName: event.target.value })} /></Field>
        <Field label="Debt type">
          <select style={styles.input} disabled={!canManage} value={candidate.debtType} onChange={(event) => onUpdate({ debtType: event.target.value, includedInCorePayoffPlan: event.target.value !== "mortgage" })}>
            {DEBT_TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="Current balance"><input style={styles.input} type="number" min="0" step="0.01" disabled={!canManage} value={candidate.currentBalance} onChange={(event) => onUpdate({ currentBalance: Number(event.target.value) })} /></Field>
        <Field label="Balance as-of date"><input style={styles.input} type="date" disabled={!canManage} value={candidate.statementDate || ""} onChange={(event) => onUpdate({ statementDate: event.target.value })} /></Field>
        <Field label="APR status">
          <select style={styles.input} disabled={!canManage} value={candidate.aprStatus} onChange={(event) => onUpdate({ aprStatus: event.target.value, apr: event.target.value === "unknown" ? null : event.target.value === "no_interest" ? 0 : candidate.apr })}>
            <option value="unknown">Unknown</option>
            <option value="known">Known</option>
            <option value="no_interest">No interest</option>
            <option value="promotional">Promotional</option>
          </select>
        </Field>
        {candidate.aprStatus !== "unknown" && candidate.aprStatus !== "no_interest" && (
          <Field label="APR (%)"><input style={styles.input} type="number" min="0" step="0.01" disabled={!canManage} value={candidate.apr == null ? "" : Number(candidate.apr * 100).toFixed(2)} onChange={(event) => onUpdate({ apr: Number(event.target.value) / 100 })} /></Field>
        )}
        <AprCandidatesField candidate={candidate} canManage={canManage} onUpdate={onUpdate} />
        <Field label="Minimum due"><input style={styles.input} type="number" min="0" step="0.01" disabled={!canManage} value={candidate.minimumPayment ?? ""} onChange={(event) => onUpdate({ minimumPayment: event.target.value === "" ? null : Number(event.target.value) })} /></Field>
        <Field label="Due date"><input style={styles.input} type="date" disabled={!canManage} value={candidate.dueDate || ""} onChange={(event) => onUpdate({ dueDate: event.target.value })} /></Field>
        <div style={{ gridColumn: "1 / -1" }}>
          <OwnerField
            workspace={workspace}
            members={members}
            people={people}
            ownerType={candidate.ownerType}
            ownerId={candidate.ownerId}
            disabled={!canManage}
            onChange={(next) => onUpdate(next)}
            onCreatePerson={onCreatePerson}
          />
        </div>
      </div>
      {workspace?.type === "household" && !!candidate.ownerSuggestion && (
        <p style={{ color: "#5b7c98", fontSize: 13 }}>
          The statement suggested &quot;{candidate.ownerSuggestion}&quot; as the account holder. This is a hint only - choose the real owner above before confirming.
        </p>
      )}
      <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0" }}>
        <input type="checkbox" disabled={!canManage} checked={!!candidate.includedInCorePayoffPlan} onChange={(event) => onUpdate({ includedInCorePayoffPlan: event.target.checked })} />
        Include in core payoff plan
      </label>
      {!!candidate.warnings?.length && <ul style={{ color: "#92400e" }}>{candidate.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={styles.pill}>{decisionLabel}</span>
        <button
          type="button"
          disabled={!canManage || busy || hasUnresolvedMatch}
          title={hasUnresolvedMatch ? "Resolve the possible match above first" : undefined}
          style={candidate.decision === "confirmed" ? styles.primaryButton : hasUnresolvedMatch ? styles.disabledButton : styles.button}
          onClick={() => onDecide("confirmed")}
        >
          Confirm
        </button>
        <button type="button" disabled={!canManage || busy} style={styles.button} onClick={() => onDecide("excluded")}>Exclude</button>
        <button type="button" disabled={!canManage || busy} style={styles.button} onClick={() => onDecide("needs_information")}>Needs information</button>
      </div>
    </article>
  );
}

const formatFileSize = (file) => {
  if (!file || !file.size) return "0 KB";
  const kb = file.size / 1024;
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

function ImportPanel({ snapshot, service, refresh, refreshReview, canManage, reviewSnapshot, onGoToReview }) {
  const [importState, setImportState] = useState({ status: "idle", batch: null, error: "" });
  const [selectedFile, setSelectedFile] = useState(null);
  const [dismissedResumeBatchId, setDismissedResumeBatchId] = useState(null);
  const [resuming, setResuming] = useState(false);
  // DATA-HH1: merged with snapshot.people locally, mirroring Debts' and
  // ReviewCenter's identical pattern - calling the full refresh() here
  // would null out `snapshot` while in flight (see the top-level refresh
  // callback), unmounting this whole panel and silently discarding
  // whatever candidate edits/decisions the reviewer already made.
  const [newlyCreatedPeople, setNewlyCreatedPeople] = useState([]);
  const people = [...(snapshot.people || []), ...newlyCreatedPeople.filter((person) => !(snapshot.people || []).some((existing) => existing.id === person.id))];

  // UX-5 Part 51/79: a batch created earlier (e.g. before the user
  // navigated away) still lives in Firestore as review_required - without
  // this, that batch becomes permanently unreachable from this screen once
  // local state resets. We only ever surface it; we never auto-load it
  // into memory or mutate it.
  const resumableBatchId = importState.status === "idle" && !!reviewSnapshot?.openItems?.length
    ? reviewSnapshot.openItems.find((item) => item.importBatchId !== dismissedResumeBatchId)?.importBatchId
    : null;
  const resumableCandidateCount = resumableBatchId
    ? reviewSnapshot.openItems.filter((item) => item.importBatchId === resumableBatchId).length
    : 0;
  const resumableSourceName = resumableBatchId
    ? reviewSnapshot.openItems.find((item) => item.importBatchId === resumableBatchId)?.sourceReference
    : "";

  const resumeImport = async () => {
    if (!resumableBatchId || typeof service.getImportBatch !== "function") return;
    setResuming(true);
    try {
      const batch = await service.getImportBatch(snapshot.workspace.id, resumableBatchId);
      if (batch && batch.status === "review_required") {
        setImportState({ status: "review", batch, error: "" });
      }
    } catch {
      // Resuming is a convenience, not a requirement - if it fails, the
      // user can still reach these candidates from Review.
    } finally {
      setResuming(false);
    }
  };

  // DATA-HH1: never touches Debt/BalanceSnapshot/PaymentEvent/PlanVersion -
  // safe to run immediately.
  const handleCreatePerson = async (displayName) => {
    const person = await service.createImportedPerson(snapshot.workspace.id, { displayName });
    setNewlyCreatedPeople((state) => (state.some((existing) => existing.id === person.id) ? state : [...state, person]));
    return person;
  };

  const handleFileSelection = (file) => {
    if (!file) return;
    setSelectedFile(file);
    setImportState({ status: "ready", batch: null, error: "" });
  };

  const analyzeSelectedFile = async () => {
    if (!selectedFile) return;
    await handleFile(selectedFile);
  };

  const handleFile = async (file) => {
    if (!file) return;
    setSelectedFile(file);
    setImportState({ status: "parsing", batch: null, error: "" });
    try {
      const name = String(file.name || "").toLowerCase();
      const isCsv = name.endsWith(".csv");
      const isPdf = name.endsWith(".pdf");
      const isImage = /\.(png|jpe?g|webp)$/.test(name);

      if (isPdf || isImage) {
        // PDF/image statements produce exactly one candidate per file, via the
        // existing pdfjs/OCR extraction engine (see pdfImportReader.js /
        // imageImportReader.js) - same downstream ImportBatch/review/commit
        // contract as Excel/CSV, just a different source-to-candidate step.
        const result = isPdf
          ? await (await import("../../services/adapters/pdfImportReader.js")).readPdfFileToCandidate(file, { importBatchId: "upload", source: "pdf" })
          : await (await import("../../services/adapters/imageImportReader.js")).readImageFileToCandidate(file, { importBatchId: "upload", source: "image" });
        if (result.status !== "parsed" || !result.candidate) {
          setImportState({ status: "ready", batch: null, error: result.message || "This file could not be read." });
          return;
        }
        const batch = await service.createImportBatch(snapshot.workspace.id, {
          sourceType: isPdf ? "pdf" : "image",
          sourceFilename: file.name,
          candidates: [result.candidate],
          warnings: [],
        });
        setImportState({ status: "review", batch, error: "" });
        await refreshReview?.();
        return;
      }

      // Excel and CSV converge on the exact same normalizeSpreadsheetRowsToCandidates
      // pipeline (see importCandidateAdapter.js) - only the file-to-{headers,rows}
      // reading step differs between the two readers.
      const parsed = isCsv
        ? await (await import("../../services/adapters/csvImportReader.js")).readCsvFileToCandidates(file, { importBatchId: "upload", source: "csv" })
        : await (await import("../../services/adapters/excelImportReader.js")).readExcelFileToCandidates(file, { importBatchId: "upload", source: "excel" });
      if (!parsed.confident || !parsed.candidates.length) {
        setImportState({ status: "ready", batch: null, error: parsed.batchWarnings.join(" ") || "This file could not be read as a debt list." });
        return;
      }
      const batch = await service.createImportBatch(snapshot.workspace.id, {
        sourceType: isCsv ? "csv" : "excel",
        sourceFilename: file.name,
        candidates: parsed.candidates,
        warnings: parsed.batchWarnings,
      });
      setImportState({ status: "review", batch, error: "" });
      await refreshReview?.();
    } catch (error) {
      // Never show a raw Firestore/Firebase error as the primary message -
      // getUserSafeTrackToZeroError translates it into friendly TrackToZero
      // copy (DATA-1 HOTFIX Part 24).
      setImportState({ status: "ready", batch: null, error: getUserSafeTrackToZeroError(error).message });
    }
  };

  const updateCandidate = async (candidateId, patch) => {
    const batch = importState.batch;
    const current = batch.candidates.find((c) => c.candidateId === candidateId);
    const decision = current.decision === "pending_review" ? current.decision : current.decision;
    setImportState((state) => ({
      ...state,
      batch: { ...state.batch, candidates: state.batch.candidates.map((c) => (c.candidateId === candidateId ? { ...c, ...patch } : c)) },
    }));
    await service.decideImportCandidate(snapshot.workspace.id, batch.id, candidateId, { decision, patch });
  };

  const decideCandidate = async (candidateId, decision) => {
    setImportState((state) => ({ ...state, status: "saving-decision" }));
    const updated = await service.decideImportCandidate(snapshot.workspace.id, importState.batch.id, candidateId, { decision, patch: {} });
    setImportState({ status: "review", batch: updated, error: "" });
  };

  const resolveMatch = async (candidateId, targetDebtId, metadataUpdates) => {
    setImportState((state) => ({ ...state, status: "saving-decision" }));
    try {
      const updated = await service.resolveAsExistingDebt(snapshot.workspace.id, importState.batch.id, candidateId, { targetDebtId, metadataUpdates });
      setImportState({ status: "review", batch: updated, error: "" });
    } catch (error) {
      setImportState((state) => ({ ...state, status: "review", error: getUserSafeTrackToZeroError(error).message }));
    }
  };

  const resolveNew = async (candidateId) => {
    setImportState((state) => ({ ...state, status: "saving-decision" }));
    try {
      const updated = await service.resolveAsNewDebt(snapshot.workspace.id, importState.batch.id, candidateId);
      setImportState({ status: "review", batch: updated, error: "" });
    } catch (error) {
      setImportState((state) => ({ ...state, status: "review", error: getUserSafeTrackToZeroError(error).message }));
    }
  };

  const commit = async () => {
    setImportState((state) => ({ ...state, status: "committing" }));
    try {
      await service.commitImportBatch(snapshot.workspace.id, importState.batch.id);
      setImportState({ status: "idle", batch: null, error: "" });
      await refresh();
      await refreshReview?.();
    } catch (error) {
      setImportState((state) => ({ ...state, status: "review", error: error?.message || "Some debts could not be added. The rest were saved; try again for the remaining ones." }));
    }
  };

  if (importState.status === "idle" || importState.status === "ready" || importState.status === "parsing") {
    return (
      <Section title="Import debts" eyebrow="Excel, CSV, PDF, or a photo">
        {resumableBatchId ? (
          <div style={{ ...styles.card, boxShadow: "none", padding: 16, background: "#eff8ff", border: "1px solid #9bd0f7", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div>
              <p style={{ margin: "0 0 2px", fontWeight: 900, color: "#2f6289" }}>You have an import waiting for review</p>
              <p style={{ margin: 0, color: "#5b7c98", fontSize: 13 }}>
                {resumableSourceName ? `${resumableSourceName} · ` : ""}{resumableCandidateCount} debt{resumableCandidateCount === 1 ? "" : "s"} still need{resumableCandidateCount === 1 ? "s" : ""} a decision.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" disabled={resuming} style={resuming ? styles.disabledButton : styles.primaryButton} onClick={resumeImport}>{resuming ? "Loading..." : "Continue review"}</button>
              {onGoToReview ? <button type="button" style={styles.button} onClick={onGoToReview}>Open in Review</button> : null}
              <button type="button" style={styles.button} onClick={() => setDismissedResumeBatchId(resumableBatchId)}>Dismiss</button>
            </div>
          </div>
        ) : null}
        <p>Upload a spreadsheet (.xlsx, .xls, .csv), a statement PDF, or a photo/screenshot of a statement (PNG, JPG, WEBP).</p>
        <p style={{ color: "#5b7c98", fontSize: 14, marginTop: 0 }}><strong>We analyze the file and show you what we found.</strong> Nothing becomes part of your debt data until you approve it.</p>

        <div style={{ ...styles.card, boxShadow: "none", padding: 20, borderStyle: "dashed", background: "#f8fbff", marginTop: 12 }}>
          <div style={{ display: "grid", gap: 12 }}>
            {selectedFile ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ ...styles.label, color: "#2f6289" }}>Selected file</div>
                    <div style={{ fontWeight: 800 }}>{selectedFile.name}</div>
                    <div style={{ color: "#5b7c98", fontSize: 13 }}>{formatFileSize(selectedFile)}</div>
                  </div>
                  <span style={{ ...styles.pill, background: "#ecfdf5", color: "#166534" }}>Ready to analyze</span>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="button" disabled={!canManage || importState.status === "parsing"} style={canManage && importState.status !== "parsing" ? styles.primaryButton : styles.disabledButton} onClick={analyzeSelectedFile}>
                    {importState.status === "parsing" ? "Analyzing..." : "Analyze file"}
                  </button>
                  <button type="button" style={styles.button} onClick={() => { setSelectedFile(null); setImportState({ status: "idle", batch: null, error: "" }); }}>
                    Choose another file
                  </button>
                </div>
              </>
            ) : (
              <label style={{ display: "grid", gap: 10, cursor: "pointer" }}>
                <div style={{ ...styles.label, color: "#2f6289" }}>Choose a file</div>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp"
                  aria-label="Upload a spreadsheet, PDF, or photo of your debts"
                  disabled={!canManage || importState.status === "parsing"}
                  onChange={(event) => handleFileSelection(event.target.files?.[0])}
                  style={{ width: "100%" }}
                />
              </label>
            )}

            {importState.status === "parsing" && (
              <div aria-live="polite" style={{ color: "#2f6289", fontWeight: 800 }}>
                Reading your file… Finding debt details… Checking for duplicates… Preparing your review…
              </div>
            )}

            {importState.error && <p role="alert" style={{ color: "#991b1b", fontWeight: 800 }}>{importState.error}</p>}
            {!canManage && <p>Your role is read-only for imports.</p>}
          </div>
        </div>
      </Section>
    );
  }

  const batch = importState.batch;
  const candidates = batch.candidates;
  const confirmed = candidates.filter((c) => c.decision === "confirmed");
  const excluded = candidates.filter((c) => c.decision === "excluded");
  const needsReview = candidates.filter((c) => c.decision === "pending_review" || c.decision === "needs_information");
  const totalConfirmedBalance = confirmed.reduce((sum, c) => sum + Number(c.currentBalance || 0), 0);
  const totalFoundBalance = candidates.filter((c) => c.decision !== "excluded").reduce((sum, c) => sum + Number(c.currentBalance || 0), 0);
  const unknownAprCount = confirmed.filter((c) => c.aprStatus === "unknown").length;
  const missingMinimumCount = confirmed.filter((c) => c.minimumPayment == null).length;
  const mortgageExcludedCount = confirmed.filter((c) => c.debtType === "mortgage" && !c.includedInCorePayoffPlan).length;
  const busy = importState.status === "committing" || importState.status === "saving-decision";
  const readyCount = candidates.filter((c) => c.decision === "pending_review" && !c.warnings?.length).length;
  const uncertainCount = candidates.filter((c) => c.decision === "pending_review" && (c.warnings?.length || c.duplicateStatus !== "new")).length;

  // Visual triage so the human reviewer sees the riskiest candidates first:
  // decided items are already sorted out (shown last, dimmed by decision
  // color); everything still pending_review is grouped by how much it
  // actually needs attention rather than shown as one undifferentiated list.
  const pending = candidates.filter((c) => c.decision === "pending_review");
  const missingCandidates = candidates.filter((c) => c.decision === "needs_information");
  const ambiguousCandidates = pending.filter((c) => c.duplicateStatus !== "new");
  const needsReviewCandidates = pending.filter((c) => c.duplicateStatus === "new" && c.warnings?.length);
  const confidentCandidates = pending.filter((c) => c.duplicateStatus === "new" && !c.warnings?.length);
  const groups = [
    { key: "missing", title: "Missing information", hint: "Nothing readable found - fill these in manually before confirming.", items: missingCandidates },
    { key: "ambiguous", title: "Ambiguous / possible duplicate", hint: "May already exist in your workspace - check before confirming.", items: ambiguousCandidates },
    { key: "needs_review", title: "Needs review", hint: "Parsed, but has warnings worth a second look.", items: needsReviewCandidates },
    { key: "confident", title: "Looks good", hint: "Parsed cleanly with no warnings.", items: confidentCandidates },
    { key: "decided", title: "Already decided", hint: "Confirmed or excluded - change your mind any time before adding.", items: candidates.filter((c) => c.decision === "confirmed" || c.decision === "excluded") },
  ].filter((group) => group.items.length);

  return (
    <Section title={`Review import: ${batch.sourceFilename}`} eyebrow="Excel · review before anything is saved">
      <div style={{ ...styles.grid, marginBottom: 18 }}>
        <div style={{ ...styles.card, boxShadow: "none", padding: 16 }}>
          <div style={{ ...styles.label, color: "#2f6289" }}>We found</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{candidates.length} possible debt{candidates.length === 1 ? "" : "s"}</div>
          <div style={{ color: "#5b7c98", fontSize: 13 }}>{readyCount} look ready and {uncertainCount} need a quick review.</div>
        </div>
        <div style={{ ...styles.card, boxShadow: "none", padding: 16 }}>
          <div style={{ ...styles.label, color: "#2f6289" }}>Found in your file</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{money(totalFoundBalance)}</div>
          <div style={{ color: "#5b7c98", fontSize: 13 }}>This is not saved yet. It becomes official only after you approve it.</div>
        </div>
        <div style={{ ...styles.card, boxShadow: "none", padding: 16 }}>
          <div style={{ ...styles.label, color: "#2f6289" }}>What needs attention</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{needsReview.length}</div>
          <div style={{ color: "#5b7c98", fontSize: 13 }}>{unknownAprCount} unknown APR · {missingMinimumCount} missing minimum · {excluded.length} excluded</div>
        </div>
      </div>
      {!!batch.warnings?.length && <ul style={{ color: "#92400e" }}>{batch.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
      {groups.map((group) => (
        <div key={group.key} style={{ marginBottom: 16 }}>
          <p style={{ margin: "0 0 4px", fontWeight: 900, color: "#2f6289" }}>{group.title} ({group.items.length})</p>
          <p style={{ margin: "0 0 10px", color: "#5b7c98", fontSize: 13 }}>{group.hint}</p>
          <div style={styles.grid}>
            {group.items.map((candidate) => (
              <ImportReviewCandidate
                key={candidate.candidateId}
                candidate={candidate}
                canManage={canManage}
                busy={busy}
                workspace={snapshot.workspace}
                members={snapshot.members}
                people={people}
                onUpdate={(patch) => updateCandidate(candidate.candidateId, patch)}
                onDecide={(decision) => decideCandidate(candidate.candidateId, decision)}
                onResolveMatch={(candidateId, targetDebtId, metadataUpdates) => resolveMatch(candidateId, targetDebtId, metadataUpdates)}
                onResolveNew={(candidateId) => resolveNew(candidateId)}
                onCreatePerson={canManage ? handleCreatePerson : undefined}
              />
            ))}
          </div>
        </div>
      ))}
      <Section title="Review summary" eyebrow="Before you add anything">
        <div style={styles.grid}>
          <p><strong>Debts to create:</strong> {confirmed.length}</p>
          <p><strong>Excluded:</strong> {excluded.length}</p>
          <p><strong>Needs attention:</strong> {needsReview.length}</p>
          <p><strong>Total confirmed balance:</strong> {money(totalConfirmedBalance)}</p>
          <p><strong>Unknown APR:</strong> {unknownAprCount}</p>
          <p><strong>Missing minimum payment:</strong> {missingMinimumCount}</p>
          <p><strong>Mortgage excluded from core:</strong> {mortgageExcludedCount}</p>
        </div>
        {importState.error && <p role="alert" style={{ color: "#991b1b", fontWeight: 800 }}>{importState.error}</p>}
        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <button
            type="button"
            disabled={!canManage || busy || !confirmed.length}
            style={canManage && !busy && confirmed.length ? styles.primaryButton : styles.disabledButton}
            onClick={commit}
          >
            {importState.status === "committing" ? "Adding..." : `Add these ${confirmed.length} debt(s) to TrackToZero`}
          </button>
          <button type="button" style={styles.button} onClick={() => setImportState({ status: "idle", batch: null, error: "" })}>Cancel import</button>
        </div>
      </Section>
    </Section>
  );
}

function Debts({ snapshot, service, refresh, refreshReview, runAction, writeState, reviewSnapshot, onGoToReview }) {
  const [payment, setPayment] = useState({ debtId: snapshot.debts[0]?.id || "", amount: "" });
  const [balance, setBalance] = useState({ debtId: snapshot.debts[0]?.id || "", amount: "" });
  const [newDebt, setNewDebt] = useState(newDebtDraft);
  const [ownerFilter, setOwnerFilter] = useState("all");
  // DATA-HH1: people created mid-form via "+ Add a household person" -
  // merged with snapshot.people locally. A full refresh() is deliberately
  // NOT used here: refresh() nulls out `snapshot` while it's in flight
  // (see the top-level refresh callback), which unmounts this whole tab and
  // would silently wipe out whatever the user had already typed into the
  // in-progress "Add debt" form. This mirrors ReviewCenter.jsx's identical
  // newlyCreatedPeople pattern.
  const [newlyCreatedPeople, setNewlyCreatedPeople] = useState([]);
  const people = [...(snapshot.people || []), ...newlyCreatedPeople.filter((person) => !(snapshot.people || []).some((existing) => existing.id === person.id))];
  const canManage = snapshot.permissions.manageDebts && snapshot.mode !== "legacy_preview";
  const canObserve = snapshot.permissions.recordObservations && snapshot.mode !== "legacy_preview";
  const isHousehold = snapshot.workspace.type === "household";
  const portfolio = useMemo(() => deriveDebtPortfolioView(snapshot), [snapshot]);

  const visibleDebts = !isHousehold || ownerFilter === "all"
    ? portfolio.activeDebts
    : portfolio.activeDebts.filter((debt) => (
        ownerFilter === "joint" || ownerFilter === "unassigned"
          ? effectiveOwnerType(debt) === ownerFilter
          : debt.ownerId === ownerFilter
      ));

  // DATA-HH1: never touches Debt/BalanceSnapshot/PaymentEvent/PlanVersion -
  // safe to run immediately, matching ImportPanel's own handleCreatePerson.
  const handleCreatePerson = async (displayName) => {
    const person = await service.createImportedPerson(snapshot.workspace.id, { displayName });
    setNewlyCreatedPeople((state) => (state.some((existing) => existing.id === person.id) ? state : [...state, person]));
    return person;
  };

  return (
    <>
      <Section title="What you owe" eyebrow="Debts">
        <div style={{ ...styles.grid, marginBottom: 16 }}>
          {portfolio.summaryCards.map((card) => (
            <div key={card.key} style={{ ...styles.card, boxShadow: "none", padding: 16, borderColor: card.tone === "warning" ? "#f7c46b" : card.tone === "success" ? "#9ae6b4" : card.tone === "primary" ? "#8dd1ff" : "#cfe6f9", background: card.tone === "warning" ? "#fffaf0" : card.tone === "success" ? "#f0fdf4" : card.tone === "primary" ? "#f0f9ff" : "#f8fbff" }}>
              <div style={{ color: "#5b7c98", fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 900 }}>{card.label}</div>
              <div style={{ fontSize: 28, fontWeight: 900, marginTop: 8 }}>{card.key === "leftToGo" ? money(card.value) : card.value}</div>
            </div>
          ))}
        </div>

        {isHousehold && (
          <div style={{ marginBottom: 12 }}>
            <Field label="Filter by owner">
              <select style={styles.input} value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
                <option value="all">Everyone</option>
                {snapshot.members.filter((member) => member.status !== "removed").map((member) => (
                  <option key={member.uid} value={member.uid}>{member.displayName || member.uid}</option>
                ))}
                {people.filter((person) => person.status !== "merged").map((person) => (
                  <option key={person.id} value={person.id}>{person.displayName}</option>
                ))}
                <option value="joint">Joint / Household</option>
                <option value="unassigned">Unassigned</option>
              </select>
            </Field>
          </div>
        )}

        {isHousehold && (
          <div style={{ ...styles.grid, marginBottom: 14 }}>
            <p><strong>Total household debt:</strong> {money(snapshot.portfolioSummary.includedDebt)} <span style={{ color: "#5b7c98" }}>(counted once)</span></p>
            {snapshot.portfolioSummary.memberDebt.map((member) => (
              <p key={member.uid}><strong>{member.displayName}:</strong> {money(member.total)}</p>
            ))}
            <p><strong>Joint / Household:</strong> {money(snapshot.portfolioSummary.jointDebt)}</p>
            <p><strong>Unassigned:</strong> {money(snapshot.portfolioSummary.unassignedDebt)}</p>
            {snapshot.portfolioSummary.needsReviewCount > 0 && (
              <p><strong>Needs review:</strong> {snapshot.portfolioSummary.needsReviewCount} debt(s) have unresolved or unverified data - a confirmed balance still counts above, but these debts are excluded from plan calculations until reviewed.</p>
            )}
          </div>
        )}

        <div style={{ ...styles.grid, marginBottom: 16 }}>
          {visibleDebts.length === 0 && (
            <div style={{ ...styles.card, boxShadow: "none", padding: 18, gridColumn: "1 / -1" }}>
              <h3 style={{ margin: 0 }}>No active debts to show</h3>
              <p style={{ marginBottom: 0, color: "#4d6a82" }}>This workspace is either fully paid off or everything is waiting for review.</p>
            </div>
          )}
          {visibleDebts.map((debt) => (
            <article key={debt.id} style={{ border: "1px solid #c7e3f8", borderRadius: 18, padding: 14, background: debt.status === "paid_off" ? "#f0fdf4" : "#fff" }}>
              <h3 style={{ margin: 0 }}>{debt.name}</h3>
              <p style={{ margin: "8px 0 6px" }}><strong>{money(snapshot.latestSnapshotsByDebt[debt.id]?.balance ?? debt.currentBalance)}</strong> · {debt.aprStatus === "unknown" ? "APR unknown" : percent(debt.apr)}</p>
              <p style={{ margin: "0 0 8px", color: "#3f5a71" }}>Required payment: {money(debt.minimumRequiredPayment)} · Due day: {debt.dueDay || "not set"}</p>
              <DebtBadges debt={debt} isTarget={snapshot.targetDebt?.id === debt.id} isHousehold={isHousehold} />
            </article>
          ))}
        </div>

        {portfolio.reviewDebts.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <h3 style={{ marginBottom: 10 }}>Needs review</h3>
            <div style={styles.grid}>
              {portfolio.reviewDebts.map((debt) => (
                <article key={debt.id} style={{ ...styles.card, boxShadow: "none", borderColor: "#f7c46b", background: "#fffaf0" }}>
                  <h4 style={{ marginTop: 0 }}>{debt.name}</h4>
                  <p style={{ margin: 0 }}>{money(snapshot.latestSnapshotsByDebt[debt.id]?.balance ?? debt.currentBalance)}</p>
                  <p style={{ margin: "8px 0 0", color: "#4d6a82" }}>This debt is excluded from the plan until the missing or conflicting details are resolved in Review.</p>
                </article>
              ))}
            </div>
          </div>
        )}

        {portfolio.paidOffDebts.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <h3 style={{ marginBottom: 10 }}>Paid off</h3>
            <div style={styles.grid}>
              {portfolio.paidOffDebts.map((debt) => (
                <article key={debt.id} style={{ ...styles.card, boxShadow: "none", borderColor: "#9ae6b4", background: "#f0fdf4" }}>
                  <h4 style={{ marginTop: 0 }}>{debt.name}</h4>
                  <p style={{ margin: 0 }}>{money(snapshot.latestSnapshotsByDebt[debt.id]?.balance ?? debt.currentBalance)} · Paid off</p>
                </article>
              ))}
            </div>
          </div>
        )}
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
                ownerType: newDebt.ownerType,
                ownerId: newDebt.ownerId,
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
            <OwnerField
              workspace={snapshot.workspace}
              members={snapshot.members}
              people={people}
              ownerType={newDebt.ownerType}
              ownerId={newDebt.ownerId}
              onChange={(next) => setNewDebt({ ...newDebt, ...next })}
              onCreatePerson={canManage ? handleCreatePerson : undefined}
            />
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
      <ImportPanel snapshot={snapshot} service={service} refresh={refresh} refreshReview={refreshReview} canManage={canManage} reviewSnapshot={reviewSnapshot} onGoToReview={onGoToReview} />
    </>
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

function Plan({ snapshot, service, refresh, runAction, writeState }) {
  return <PlanSection snapshot={snapshot} service={service} refresh={refresh} runAction={runAction} writeState={writeState} />;
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

function Settings({ snapshot, repositoryMode, service, refresh, runAction, writeState }) {
  const flags = getLaunchFlags();
  const canManageMembers = ROLE_PERMISSIONS[snapshot.membership?.role]?.manageMembers;
  const [householdName, setHouseholdName] = useState(snapshot.workspace.name || "");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [latestInvite, setLatestInvite] = useState(null);
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
            <div style={{ ...styles.card, marginTop: 16, borderColor: "#86efac" }}>
              <h3 style={{ marginTop: 0 }}>Invite ready</h3>
              <p style={{ marginBottom: 8 }}>{latestInvite.emailNormalized} · expires {new Date(latestInvite.expiresAt).toLocaleDateString()}</p>
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
              <h3 style={{ marginTop: 0 }}>Pending invites</h3>
              {snapshot.memberInvites?.length ? (
                <div style={{ display: "grid", gap: 12 }}>
                  {snapshot.memberInvites.map((invite) => (
                    <article key={invite.id} style={{ border: "1px solid #d7e7f5", borderRadius: 16, padding: 12, background: "#fff" }}>
                      <p style={{ margin: 0, fontWeight: 800 }}>{invite.emailNormalized}</p>
                      <p style={{ margin: "6px 0", color: "#4d6a82" }}>{invite.role} · {invite.derivedStatus} · expires {new Date(invite.expiresAt).toLocaleDateString()}</p>
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
              <h3 style={{ marginTop: 0 }}>Financial people not connected to an account</h3>
              {unlinkedPeople.length ? (
                <div style={{ display: "grid", gap: 12 }}>
                  {unlinkedPeople.map((person) => (
                    <article key={person.id} style={{ border: "1px solid #d7e7f5", borderRadius: 16, padding: 12, background: "#fff" }}>
                      <p style={{ margin: 0, fontWeight: 800 }}>{person.displayName}</p>
                      <p style={{ margin: "6px 0", color: "#4d6a82" }}>This financial profile is still separate from a member account.</p>
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
  const [actorId, setActorId] = useState(usesRealAuthUi ? "" : V2_TEST_ACTOR_ID);
  const [tab, setTab] = useState("home");
  const [scenario, setScenario] = useState(null);
  const [joinIntent, setJoinIntent] = useState(() => getJoinIntent());
  const [joinPreviewState, setJoinPreviewState] = useState({ status: joinIntent ? "loading" : "idle", preview: null, error: "" });
  const [joinAcceptedState, setJoinAcceptedState] = useState({ status: "idle", workspaceId: "", matches: [], invite: null, error: "" });
  const [runtimeState, setRuntimeState] = useState({ status: "idle", snapshot: null, workspaces: [], error: "" });
  const [writeState, setWriteState] = useState({ inProgress: false, action: "", error: "", success: "" });
  const [reviewState, setReviewState] = useState({ status: "idle", snapshot: null });
  const requestSeq = useRef(0);
  const reviewRequestSeq = useRef(0);
  const asOf = useMemo(() => usesRealAuthUi ? new Date().toISOString() : V2_TEST_NOW, [usesRealAuthUi]);
  const isFreshLocalBetaSignup = Boolean(
    isLocalBetaRuntime
      && authState.user?.metadata?.creationTime
      && authState.user?.metadata?.creationTime === authState.user?.metadata?.lastSignInTime
  );
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
      if (authForm.mode === "signup") await activeSignup(authForm.email, authForm.password);
      else await activeLogin(authForm.email, authForm.password);
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

  // UX-4.1: the top-level tab was never synced with the URL, so a fresh
  // load or refresh at /plan/<destination> silently rendered Home instead
  // (tab defaults to "home" and never reads the URL) - PlanSection's own
  // pushState-based sub-routing only ever worked once you were ALREADY on
  // the Plan tab by clicking through the nav. This keeps `tab` and the URL
  // in agreement both ways: on first load/refresh, and on Back/Forward.
  // Only Plan has real distinct URLs today, so leaving Plan for any other
  // tab resets the URL to "/" rather than inventing routes the rest of the
  // app doesn't have yet.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const syncTabFromLocation = () => setTab(window.location.pathname.startsWith("/plan") ? "plan" : "home");
    syncTabFromLocation();
    window.addEventListener("popstate", syncTabFromLocation);
    return () => window.removeEventListener("popstate", syncTabFromLocation);
  }, []);

  const navigateTab = (nextTab) => {
    setTab(nextTab);
    if (typeof window === "undefined") return;
    const onPlanPath = window.location.pathname.startsWith("/plan");
    if (nextTab === "plan" && !onPlanPath) window.history.pushState({}, "", "/plan/my-plan");
    else if (nextTab !== "plan" && onPlanPath) window.history.pushState({}, "", "/");
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

  if (usesRealAuthUi && joinIntent && joinPreviewState.status === "ready") {
    const preview = joinPreviewState.preview;
    if (preview?.state === "ready") {
      return (
        <JoinAcceptScreen
          preview={preview}
          signedInEmail={authState.user?.email || ""}
          onAccept={acceptJoinInvite}
          busy={writeState.inProgress && writeState.action === "join household"}
          error={writeState.action === "join household" ? writeState.error : ""}
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

  if (joinAcceptedState.status === "needs_person_link") {
    return (
      <JoinConnectScreen
        workspaceName={joinAcceptedState.invite?.workspaceName}
        matches={joinAcceptedState.matches}
        onConnect={connectJoinedPerson}
        onSkip={skipJoinedPersonConnection}
        busy={writeState.inProgress && writeState.action === "connect profile"}
        error={writeState.action === "connect profile" ? writeState.error : ""}
      />
    );
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
    navBadges: { review: reviewState.snapshot?.actionableCount ?? reviewState.snapshot?.openCount ?? 0 },
  };

  return (
    <AppShell topBarProps={topBarProps}>
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
          <div role="status" aria-live="polite" style={{ ...styles.card, marginTop: 16, borderColor: writeState.error ? "#fecaca" : "#86efac" }}>
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
        />}
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
        {tab === "debts" && <Debts snapshot={snapshot} service={service} refresh={() => refresh(workspaceId)} refreshReview={() => refreshReview(workspaceId)} runAction={runAction} writeState={writeState} reviewSnapshot={reviewState.snapshot} onGoToReview={() => navigateTab("review")} />}
        {tab === "plan" && <Plan snapshot={snapshot} service={service} refresh={() => refresh(workspaceId)} runAction={runAction} writeState={writeState} />}
        {tab === "settings" && <Settings snapshot={snapshot} repositoryMode={runtime.mode} service={service} refresh={() => refresh(workspaceId)} runAction={runAction} writeState={writeState} />}
      </PageContainer>
    </AppShell>
  );
}
