#!/usr/bin/env node
/**
 * tools/betaAccess.cjs
 *
 * Operator CLI for the tracktozero-beta controlled-access allowlist (see
 * the `beta_allowlist` match block firestore.beta.rules adds on top of
 * production's unmodified firestore.rules). This is the ONLY way a
 * tester's email is ever added to or removed from the allowlist - the
 * rules deny every client write path outright (`allow create, update,
 * delete: if false;`), so allowlisting only ever happens through this
 * Admin-SDK-driven script, matching tools/cleanSlate.cjs's existing
 * operator-script precedent in this repo.
 *
 * FAIL-CLOSED TO tracktozero-beta ONLY. BETA_PROJECT_ID below is a literal
 * constant, never read from an argument, flag, or environment variable -
 * there is no --force-production flag and no way to point this script at
 * budgetapp-c9306 (or anywhere else) without editing this file's source.
 *
 * CREDENTIALS: this deliberately does NOT create or require a new
 * downloaded service-account key. It reuses the SAME OAuth session
 * `firebase login` already established (the same session already used
 * for `firebase deploy --project beta` in BETA-2) via firebase-tools' own
 * internal defaultCredentials module - the exact mechanism firebase-tools
 * itself uses to hand local tooling real, Google-authenticated Application
 * Default Credentials without a key file. The resulting credential is a
 * standard "authorized_user" ADC (the same format `gcloud auth
 * application-default login` produces), written only to the OS user
 * profile (%APPDATA%\firebase on Windows) - the same trust boundary
 * `firebase login` already relies on. It is never written into this
 * repository and is not a service-account key.
 *
 * firebase-tools does not publish these two modules as public API, so a
 * future firebase-tools upgrade could relocate/remove them. If that
 * happens this script fails loudly with the exact remediation
 * (`firebase login`, or set GOOGLE_APPLICATION_CREDENTIALS yourself)
 * rather than silently falling back to anything weaker.
 *
 * Usage:
 *   node tools/betaAccess.cjs add <email> [--cohort N]
 *   node tools/betaAccess.cjs remove <email>
 *   node tools/betaAccess.cjs list
 *
 * Never logs a full tester roster anywhere but this terminal - `list`
 * output must never be pasted into a committed file (see the Gate-10
 * manifest's explicit "do not commit real tester emails" instruction).
 */

const BETA_PROJECT_ID = "tracktozero-beta";

async function resolveApplicationDefaultCredentialPath() {
  let authModule;
  let defaultCredentialsModule;
  try {
    // Reaches into firebase-tools' (an existing devDependency) internal
    // modules deliberately - see the file header for why.
    authModule = require("firebase-tools/lib/auth");
    defaultCredentialsModule = require("firebase-tools/lib/defaultCredentials");
  } catch (err) {
    throw new Error(
      "Could not load firebase-tools' internal auth modules to reuse the existing `firebase login` session "
      + `(${err.message}). Run \`firebase login\` first, or set GOOGLE_APPLICATION_CREDENTIALS yourself.`
    );
  }
  const account = authModule.getGlobalDefaultAccount();
  if (!account) {
    throw new Error("No active `firebase login` session found. Run `firebase login` first - this script deliberately never creates a new service-account key.");
  }
  const credentialPath = await defaultCredentialsModule.getCredentialPathAsync(account);
  if (!credentialPath) {
    throw new Error("firebase-tools could not materialize a credential file from the current login session.");
  }
  return credentialPath;
}

async function main() {
  const [, , command, ...rest] = process.argv;
  if (!["add", "remove", "list"].includes(command)) {
    console.error("Usage: node tools/betaAccess.cjs <add|remove|list> [email] [--cohort N]");
    process.exit(1);
    return;
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const credentialPath = await resolveApplicationDefaultCredentialPath();
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialPath;
    console.log(`Using the existing \`firebase login\` session as Application Default Credentials: ${credentialPath}`);
  }

  const { initializeApp, applicationDefault } = require("firebase-admin/app");
  const { getFirestore, FieldValue } = require("firebase-admin/firestore");

  // BETA_PROJECT_ID is the only project this script will ever touch - see
  // the file header. There is no argument/flag path that changes it.
  initializeApp({ credential: applicationDefault(), projectId: BETA_PROJECT_ID });
  const db = getFirestore();

  // Defense in depth: prove the credential can actually reach this exact
  // project before doing anything else, so a stale/misconfigured
  // credential fails loudly instead of silently no-op'ing.
  try {
    await db.collection("beta_allowlist").limit(1).get();
  } catch (err) {
    throw new Error(`Could not reach Firestore for project "${BETA_PROJECT_ID}" with the current credentials: ${err.message}`);
  }

  if (command === "list") {
    const snap = await db.collection("beta_allowlist").get();
    if (snap.empty) {
      console.log(`beta_allowlist is empty on ${BETA_PROJECT_ID}.`);
      return;
    }
    console.log(`${snap.size} entr${snap.size === 1 ? "y" : "ies"} in ${BETA_PROJECT_ID}'s beta_allowlist:`);
    snap.docs.forEach((doc) => {
      const data = doc.data();
      const addedAt = data.addedAt?.toDate ? data.addedAt.toDate().toISOString() : String(data.addedAt || "");
      console.log(`  ${doc.id}  status=${data.status}  cohort=${data.cohort ?? "-"}  addedAt=${addedAt}`);
    });
    return;
  }

  const rawEmail = rest[0];
  if (!rawEmail || rawEmail.startsWith("--")) {
    console.error(`Usage: node tools/betaAccess.cjs ${command} <email>${command === "add" ? " [--cohort N]" : ""}`);
    process.exit(1);
    return;
  }
  // Normalized the same way as the existing invite emailNormalized
  // convention elsewhere in this codebase - the doc id must match
  // Firebase Auth's own (lowercased) request.auth.token.email exactly, or
  // the rules' v2BetaApproved() lookup will never find it.
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error(`"${rawEmail}" does not look like a valid email address.`);
    process.exit(1);
    return;
  }

  if (command === "add") {
    const cohortFlagIndex = rest.indexOf("--cohort");
    const parsedCohort = cohortFlagIndex >= 0 ? Number(rest[cohortFlagIndex + 1]) : 1;
    const cohort = Number.isFinite(parsedCohort) ? parsedCohort : 1;
    await db.doc(`beta_allowlist/${email}`).set({
      email,
      status: "active",
      cohort,
      addedAt: FieldValue.serverTimestamp(),
      addedBy: "tools/betaAccess.cjs",
    });
    console.log(`Added ${email} to ${BETA_PROJECT_ID}'s beta_allowlist (status=active, cohort=${cohort}).`);
    return;
  }

  // remove: revoke rather than delete, preserving an audit trail of who
  // was ever approved and when access was pulled - matching
  // firestore.beta.rules.test.js's own "revoked" status literal.
  const ref = db.doc(`beta_allowlist/${email}`);
  const existing = await ref.get();
  if (!existing.exists) {
    console.log(`${email} is not on ${BETA_PROJECT_ID}'s beta_allowlist - nothing to do.`);
    return;
  }
  await ref.set({ status: "revoked", revokedAt: FieldValue.serverTimestamp(), revokedBy: "tools/betaAccess.cjs" }, { merge: true });
  console.log(`Revoked ${email}'s beta access on ${BETA_PROJECT_ID} (status set to "revoked", document not deleted).`);
}

main().catch((err) => {
  console.error("betaAccess failed:", err.message || err);
  process.exit(1);
});
