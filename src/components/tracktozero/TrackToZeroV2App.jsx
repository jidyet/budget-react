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
import { effectiveOwnerType, isConfirmedZero, isDebtNeedsReview, looksLikeJunkOwnerLabel } from "../../domain/tracktozero/ownership.js";
import AppShell from "./layout/AppShell.jsx";
import PageContainer from "./layout/PageContainer.jsx";
import QaHarnessControls from "./layout/QaHarnessControls.jsx";
import StatusBadge from "./ui/StatusBadge.jsx";
import { formatMoney as money, formatPercent as percent } from "./formatting.js";
// A display-time safety net (UX-0 Part 7): a stored ownerLabel that looks
// like statement noise (mail-handling boilerplate, a card product name) is
// shown as "Unassigned" instead of as if it were a real person - for
// records written before the parser-level fix existed, without ever
// mutating the stored value or running a backfill.
const presentedOwnerLabel = (debt) => (looksLikeJunkOwnerLabel(debt?.ownerLabel) ? "Unassigned" : (debt?.ownerLabel || "Unassigned"));
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

// Workspace-aware owner selector shared by manual debt entry and import
// review. Personal workspaces have nothing to choose - every debt always
// belongs to the signed-in member, so it's shown as a fixed, non-editable
// fact. Household workspaces require an explicit choice from the REAL
// verified member list, Joint/Household, or Unassigned - never free text,
// so a parser suggestion or typo can never become an owner.
function OwnerField({ workspace, members = [], ownerType, ownerId, onChange, disabled }) {
  if (workspace?.type !== "household") {
    return <Field label="Owner"><span style={styles.pill}>You</span></Field>;
  }
  const value = ownerType === "member" && ownerId ? `member:${ownerId}` : (ownerType || "unassigned");
  return (
    <Field label="Owner">
      <select
        style={styles.input}
        disabled={disabled}
        value={value}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw.startsWith("member:")) onChange({ ownerType: "member", ownerId: raw.slice(7) });
          else onChange({ ownerType: raw, ownerId: "" });
        }}
      >
        <option value="unassigned">Unassigned</option>
        <option value="joint">Joint / Household</option>
        {members.filter((member) => member.status !== "removed").map((member) => (
          <option key={member.uid} value={`member:${member.uid}`}>{member.displayName || member.uid}</option>
        ))}
      </select>
    </Field>
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

function Home({ snapshot, scenario, onGoToPlan, onScenario }) {
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
          <p><strong>Total debt entered:</strong> {money(snapshot.portfolioSummary.totalWorkspaceDebt)}</p>
          <p><strong>Included in core payoff:</strong> {snapshot.includedDebts.length}</p>
          <p><strong>Plan status:</strong> Not started yet</p>
          {snapshot.portfolioSummary.needsReviewCount > 0 && (
            <p><strong>Needs review:</strong> {snapshot.portfolioSummary.needsReviewCount} debt(s) have unresolved or unverified data - a confirmed balance still counts above, but these debts are excluded from plan calculations until reviewed.</p>
          )}
        </div>
        <button type="button" style={styles.primaryButton} onClick={onGoToPlan}>Build my payoff plan</button>
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
            {target && snapshot.workspace.type === "household" && <p><strong>Owner:</strong> {presentedOwnerLabel(target)}</p>}
          </div>
          <div>
            <p><strong>Total included debt:</strong> {money(snapshot.portfolioSummary.includedDebt)}</p>
            <p><strong>Estimated debt-free date:</strong> {snapshot.projectedZeroDate || "Needs plan"}</p>
            <p><strong>Workspace:</strong> {snapshot.workspace.type === "household" ? "Household shared payoff" : "Personal payoff"}</p>
            {snapshot.portfolioSummary.needsReviewCount > 0 && (
              <p><strong>Needs review:</strong> {snapshot.portfolioSummary.needsReviewCount} debt(s) have unresolved or unverified data - a confirmed balance still counts above, but these debts are excluded from plan calculations until reviewed.</p>
            )}
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

function ImportReviewCandidate({ candidate, canManage, busy, onUpdate, onDecide, workspace, members }) {
  const decisionLabel = { pending_review: "Needs your review", confirmed: "Will be added", excluded: "Excluded", needs_information: "Needs information" }[candidate.decision] || candidate.decision;
  return (
    <article style={{ border: "1px solid #c7e3f8", borderRadius: 18, padding: 14, background: candidate.decision === "confirmed" ? "#f0fdf4" : candidate.decision === "excluded" ? "#fef2f2" : "#fff" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Creditor / debt name"><input style={styles.input} disabled={!canManage} value={candidate.accountName} onChange={(event) => onUpdate({ accountName: event.target.value })} /></Field>
        <Field label="Debt type">
          <select style={styles.input} disabled={!canManage} value={candidate.debtType} onChange={(event) => onUpdate({ debtType: event.target.value, includedInCorePayoffPlan: event.target.value !== "mortgage" })}>
            {DEBT_TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="Balance"><input style={styles.input} type="number" min="0" step="0.01" disabled={!canManage} value={candidate.currentBalance} onChange={(event) => onUpdate({ currentBalance: Number(event.target.value) })} /></Field>
        <Field label="Statement date"><input style={styles.input} type="date" disabled={!canManage} value={candidate.statementDate || ""} onChange={(event) => onUpdate({ statementDate: event.target.value })} /></Field>
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
        <Field label="Minimum payment"><input style={styles.input} type="number" min="0" step="0.01" disabled={!canManage} value={candidate.minimumPayment ?? ""} onChange={(event) => onUpdate({ minimumPayment: event.target.value === "" ? null : Number(event.target.value) })} /></Field>
        <Field label="Due date"><input style={styles.input} type="date" disabled={!canManage} value={candidate.dueDate || ""} onChange={(event) => onUpdate({ dueDate: event.target.value })} /></Field>
        <OwnerField
          workspace={workspace}
          members={members}
          ownerType={candidate.ownerType}
          ownerId={candidate.ownerId}
          disabled={!canManage}
          onChange={(next) => onUpdate(next)}
        />
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
        <button type="button" disabled={!canManage || busy} style={candidate.decision === "confirmed" ? styles.primaryButton : styles.button} onClick={() => onDecide("confirmed")}>Confirm</button>
        <button type="button" disabled={!canManage || busy} style={styles.button} onClick={() => onDecide("excluded")}>Exclude</button>
        <button type="button" disabled={!canManage || busy} style={styles.button} onClick={() => onDecide("needs_information")}>Needs information</button>
      </div>
    </article>
  );
}

function ImportPanel({ snapshot, service, refresh, canManage }) {
  const [importState, setImportState] = useState({ status: "idle", batch: null, error: "" });

  const handleFile = async (file) => {
    if (!file) return;
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
          setImportState({ status: "idle", batch: null, error: result.message || "This file could not be read." });
          return;
        }
        const batch = await service.createImportBatch(snapshot.workspace.id, {
          sourceType: isPdf ? "pdf" : "image",
          sourceFilename: file.name,
          candidates: [result.candidate],
          warnings: [],
        });
        setImportState({ status: "review", batch, error: "" });
        return;
      }

      // Excel and CSV converge on the exact same normalizeSpreadsheetRowsToCandidates
      // pipeline (see importCandidateAdapter.js) - only the file-to-{headers,rows}
      // reading step differs between the two readers.
      const parsed = isCsv
        ? await (await import("../../services/adapters/csvImportReader.js")).readCsvFileToCandidates(file, { importBatchId: "upload", source: "csv" })
        : await (await import("../../services/adapters/excelImportReader.js")).readExcelFileToCandidates(file, { importBatchId: "upload", source: "excel" });
      if (!parsed.confident || !parsed.candidates.length) {
        setImportState({ status: "idle", batch: null, error: parsed.batchWarnings.join(" ") || "This file could not be read as a debt list." });
        return;
      }
      const batch = await service.createImportBatch(snapshot.workspace.id, {
        sourceType: isCsv ? "csv" : "excel",
        sourceFilename: file.name,
        candidates: parsed.candidates,
        warnings: parsed.batchWarnings,
      });
      setImportState({ status: "review", batch, error: "" });
    } catch (error) {
      setImportState({ status: "idle", batch: null, error: error?.message || "This file could not be imported." });
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

  const commit = async () => {
    setImportState((state) => ({ ...state, status: "committing" }));
    try {
      await service.commitImportBatch(snapshot.workspace.id, importState.batch.id);
      setImportState({ status: "idle", batch: null, error: "" });
      await refresh();
    } catch (error) {
      setImportState((state) => ({ ...state, status: "review", error: error?.message || "Some debts could not be added. The rest were saved; try again for the remaining ones." }));
    }
  };

  if (importState.status === "idle" || importState.status === "parsing") {
    return (
      <Section title="Import statements" eyebrow="Excel, CSV, PDF, or a photo">
        <p>Upload a spreadsheet (.xlsx, .xls, .csv), a statement PDF, or a photo/screenshot of a statement (PNG, JPG, WEBP). Nothing is added until you review and confirm it.</p>
        <input
          type="file"
          accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp"
          aria-label="Upload a spreadsheet, PDF, or photo of your debts"
          disabled={!canManage || importState.status === "parsing"}
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
        {importState.status === "parsing" && <p aria-live="polite">Reading your file...</p>}
        {importState.error && <p role="alert" style={{ color: "#991b1b", fontWeight: 800 }}>{importState.error}</p>}
        {!canManage && <p>Your role is read-only for imports.</p>}
      </Section>
    );
  }

  const batch = importState.batch;
  const candidates = batch.candidates;
  const confirmed = candidates.filter((c) => c.decision === "confirmed");
  const excluded = candidates.filter((c) => c.decision === "excluded");
  const needsReview = candidates.filter((c) => c.decision === "pending_review" || c.decision === "needs_information");
  const totalConfirmedBalance = confirmed.reduce((sum, c) => sum + Number(c.currentBalance || 0), 0);
  const unknownAprCount = confirmed.filter((c) => c.aprStatus === "unknown").length;
  const missingMinimumCount = confirmed.filter((c) => c.minimumPayment == null).length;
  const mortgageExcludedCount = confirmed.filter((c) => c.debtType === "mortgage" && !c.includedInCorePayoffPlan).length;
  const busy = importState.status === "committing" || importState.status === "saving-decision";

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
                onUpdate={(patch) => updateCandidate(candidate.candidateId, patch)}
                onDecide={(decision) => decideCandidate(candidate.candidateId, decision)}
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

function Debts({ snapshot, service, refresh, runAction, writeState }) {
  const [payment, setPayment] = useState({ debtId: snapshot.debts[0]?.id || "", amount: "" });
  const [balance, setBalance] = useState({ debtId: snapshot.debts[0]?.id || "", amount: "" });
  const [newDebt, setNewDebt] = useState(newDebtDraft);
  const [ownerFilter, setOwnerFilter] = useState("all");
  const canManage = snapshot.permissions.manageDebts && snapshot.mode !== "legacy_preview";
  const canObserve = snapshot.permissions.recordObservations && snapshot.mode !== "legacy_preview";
  const isHousehold = snapshot.workspace.type === "household";

  const visibleDebts = !isHousehold || ownerFilter === "all"
    ? snapshot.debts
    : snapshot.debts.filter((debt) => (
        ownerFilter === "joint" || ownerFilter === "unassigned"
          ? effectiveOwnerType(debt) === ownerFilter
          : debt.ownerId === ownerFilter
      ));

  return (
    <>
      <Section title="What you owe" eyebrow="Debts">
        {isHousehold && (
          <div style={{ marginBottom: 12 }}>
            <Field label="Filter by owner">
              <select style={styles.input} value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
                <option value="all">Everyone</option>
                {snapshot.members.filter((member) => member.status !== "removed").map((member) => (
                  <option key={member.uid} value={member.uid}>{member.displayName || member.uid}</option>
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
        <div style={styles.grid}>
          {visibleDebts.map((debt) => (
            <article key={debt.id} style={{ border: "1px solid #c7e3f8", borderRadius: 18, padding: 14, background: debt.status === "paid_off" ? "#f0fdf4" : "#fff" }}>
              <h3 style={{ margin: 0 }}>{debt.name}</h3>
              <p>{money(snapshot.latestSnapshotsByDebt[debt.id]?.balance ?? debt.currentBalance)} · {debt.aprStatus === "unknown" ? "Unknown APR" : percent(debt.apr)}</p>
              <p>Required payment: {money(debt.minimumRequiredPayment)} · Due day: {debt.dueDay || "not set"}</p>
              <DebtBadges debt={debt} isTarget={snapshot.targetDebt?.id === debt.id} isHousehold={isHousehold} />
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
              ownerType={newDebt.ownerType}
              ownerId={newDebt.ownerId}
              onChange={(next) => setNewDebt({ ...newDebt, ...next })}
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
      <ImportPanel snapshot={snapshot} service={service} refresh={refresh} canManage={canManage} />
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
      <Section title="Payoff queue" eyebrow="Who's being paid off, and in what order">
        <ol style={{ display: "grid", gap: 10, paddingLeft: 22 }}>
          {snapshot.payoffQueue.map((debt) => (
            <li key={debt.id} style={{ paddingLeft: 6 }}>
              <strong>{debt.name}</strong> · {money(snapshot.latestSnapshotsByDebt[debt.id]?.balance ?? debt.currentBalance)} · {debt.aprStatus === "unknown" ? "Unknown APR" : percent(debt.apr)}
              <DebtBadges debt={debt} isTarget={snapshot.targetDebt?.id === debt.id} isHousehold={snapshot.workspace.type === "household"} />
            </li>
          ))}
        </ol>
      </Section>
      {!active?.version ? (
        <FirstPlanBuilder snapshot={snapshot} service={service} refresh={refresh} runAction={runAction} writeState={writeState} canPlan={canPlan} />
      ) : (
        <Section title="Reforecast" eyebrow="Preview before apply">
          <div style={styles.grid}>
            <div>
              <button disabled={!canPlan || writeState.inProgress} style={canPlan && !writeState.inProgress ? styles.button : styles.disabledButton} onClick={() => {
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
      )}
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
    : repositoryMode === TRACKTOZERO_V2_REPOSITORY_MODES.localBeta
    ? "Local beta (Firebase emulator)"
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
const productionWorkspaceCandidates = (uid) => [
  { id: workspaceIdForUser(uid, "personal"), type: "personal" },
  { id: workspaceIdForUser(uid, "household"), type: "household" },
];

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
  const [runtimeState, setRuntimeState] = useState({ status: "idle", snapshot: null, workspaces: [], error: "" });
  const [writeState, setWriteState] = useState({ inProgress: false, action: "", error: "", success: "" });
  const requestSeq = useRef(0);
  const asOf = useMemo(() => usesRealAuthUi ? new Date().toISOString() : V2_TEST_NOW, [usesRealAuthUi]);
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
      if (usesRealAuthUi) {
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
      const workspaces = usesRealAuthUi
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
  }, [actorId, authState.user, usesRealAuthUi, repository, runtime, service, workspaceId]);

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
  const productionReady = getFirebaseStatus().configured && getFirebaseConfig().projectId === "budgetapp-c9306";
  const firebaseReady = isLocalBetaRuntime ? !localBetaAuthError : (!isProductionRuntime || productionReady);
  const authUnavailableMessage = isLocalBetaRuntime
    ? (localBetaAuthError || "Local beta configuration error: the local Firebase emulators are not reachable. Run `npm run emulators:v2` first.")
    : "Production Firebase is not configured for this release. The app is in a safe disabled state.";

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
          <Section title="TrackToZero test persistence is unavailable" eyebrow={runtimeState.status}>
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
    onSelectTab: setTab,
    userName: snapshot.membership?.displayName || authState.user?.displayName || "",
    userEmail: authState.user?.email || "",
    userRole: snapshot.membership?.role || "viewer",
    onGoToSettings: () => setTab("settings"),
    onSignOut: usesRealAuthUi ? activeLogout : null,
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
        {tab === "home" && <Home snapshot={snapshot} scenario={scenario} onGoToPlan={() => setTab("plan")} onScenario={(extra) => runAction("preview scenario", async () => {
          setScenario(await service.previewScenario(workspaceId, { extraMonthlyPayment: extra }));
        }, { write: false })} />}
        {tab === "debts" && <Debts snapshot={snapshot} service={service} refresh={() => refresh(workspaceId)} runAction={runAction} writeState={writeState} />}
        {tab === "plan" && <Plan snapshot={snapshot} service={service} refresh={() => refresh(workspaceId)} runAction={runAction} writeState={writeState} />}
        {tab === "settings" && <Settings snapshot={snapshot} repositoryMode={runtime.mode} />}
      </PageContainer>
    </AppShell>
  );
}
