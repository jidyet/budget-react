import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createTrackToZeroV2Seed, V2_TEST_NOW } from "../src/services/tracktozero/v2SeedData.js";
import { TRACKTOZERO_V2_EMULATOR_PROJECT_ID, TRACKTOZERO_V2_TEST_PASSWORD, testEmailForActor } from "../src/services/tracktozero/repositoryRuntime.js";

const workspaceRoot = resolve(process.cwd());
const artifactDir = resolve(workspaceRoot, "qa-artifacts", "phase3c");
mkdirSync(artifactDir, { recursive: true });

const chromeCandidates = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];

const findOpenPort = (preferred) => new Promise((resolvePort) => {
  import("node:net").then(({ default: net }) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => {
      const retry = net.createServer();
      retry.unref();
      retry.listen(0, "127.0.0.1", () => {
        const address = retry.address();
        retry.close(() => resolvePort(typeof address === "object" && address ? address.port : preferred));
      });
    });
    server.listen(preferred, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolvePort(typeof address === "object" && address ? address.port : preferred));
    });
  });
});

const waitForHttp = async (url, timeoutMs = 30000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // retry
    }
    await delay(300);
  }
  throw new Error(`Timed out waiting for ${url}`);
};

const killProcessTree = (childProcess) => {
  if (!childProcess?.pid) return;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(childProcess.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    } catch {
      // Fall through to regular child kill.
    }
  }
  try {
    childProcess.kill("SIGTERM");
  } catch {
    // Best-effort cleanup only.
  }
};

const seedFirestore = async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Phase 3c browser QA requires Firestore and Auth emulators.");
  }
  const app = getApps()[0] || initializeApp({ projectId: TRACKTOZERO_V2_EMULATOR_PROJECT_ID });
  const auth = getAuth(app);
  const db = getFirestore(app);
  const seed = createTrackToZeroV2Seed();
  const actorIds = ["seed-owner", "seed-admin", "seed-contributor", "seed-viewer", "seed-outsider"];

  for (const uid of actorIds) {
    try {
      await auth.createUser({ uid, email: testEmailForActor(uid), password: TRACKTOZERO_V2_TEST_PASSWORD, displayName: uid });
    } catch (error) {
      if (error.code !== "auth/uid-already-exists" && error.code !== "auth/email-already-exists") throw error;
    }
  }

  for (const workspace of Object.values(seed.workspaces)) {
    await db.doc(`workspaces/${workspace.id}`).set(workspace);
  }
  for (const member of Object.values(seed.members)) {
    await db.doc(`workspaces/${member.workspaceId}/members/${member.uid}`).set({ status: "active", ...member });
  }
  for (const debt of Object.values(seed.debts)) {
    await db.doc(`workspaces/${debt.workspaceId}/debts/${debt.id}`).set(debt);
  }
  for (const plan of Object.values(seed.plans)) {
    await db.doc(`workspaces/${plan.workspaceId}/plans/${plan.id}`).set(plan);
  }
  for (const version of Object.values(seed.versions)) {
    await db.doc(`workspaces/${version.workspaceId}/plans/${version.planId}/versions/${version.id}`).set(version);
  }
  for (const snapshot of Object.values(seed.balanceSnapshots)) {
    await db.doc(`workspaces/${snapshot.workspaceId}/debts/${snapshot.debtId}/balance_snapshots/${snapshot.id}`).set(snapshot);
  }
  for (const checkpoint of Object.values(seed.expectedCheckpoints)) {
    await db.doc(`workspaces/${checkpoint.workspaceId}/plans/${checkpoint.planId}/versions/${checkpoint.planVersionId}/expected_schedule/${checkpoint.id}`).set(checkpoint);
  }
};

class CdpClient {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolveCall, rejectCall } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) rejectCall(new Error(message.error.message));
        else resolveCall(message.result || {});
      } else if (message.method) {
        this.events.push(message);
      }
    });
  }
  call(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolveCall, rejectCall) => this.pending.set(id, { resolveCall, rejectCall }));
  }
}

const openBrowser = async ({ chromePath, debugPort, url, width, height }) => {
  const profileDir = join(tmpdir(), `tracktozero-phase3c-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const chrome = spawn(chromePath, [
    "--headless=new",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`,
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--window-size=${width},${height}`,
    url,
  ], { stdio: "ignore" });

  await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`);
  const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  const tab = tabs.find((item) => item.type === "page") || tabs[0];
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    ws.addEventListener("open", resolveOpen, { once: true });
    ws.addEventListener("error", rejectOpen, { once: true });
  });
  const cdp = new CdpClient(ws);
  await cdp.call("Runtime.enable");
  await cdp.call("Page.enable");
  await cdp.call("Log.enable");
  await cdp.call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 700 });
  return { cdp, chrome, profileDir };
};

const evaluate = async (cdp, expression) => {
  const result = await cdp.call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
  return result.result?.value;
};

const clickText = (text) => `
  (() => {
    const el = [...document.querySelectorAll('button, option, select')].find((node) => node.textContent.trim().includes(${JSON.stringify(text)}));
    if (!el) throw new Error('Missing clickable text: ${text}');
    el.click();
    return true;
  })()
`;

const setSelectByText = (labelText, optionText) => `
  (() => {
    const labels = [...document.querySelectorAll('label')];
    const label = labels.find((node) => node.textContent.includes(${JSON.stringify(labelText)}));
    if (!label) throw new Error('Missing select label: ${labelText}');
    const select = label.querySelector('select');
    if (!select) throw new Error('Missing select for: ${labelText}');
    const option = [...select.options].find((item) => item.textContent.includes(${JSON.stringify(optionText)}));
    if (!option) throw new Error('Missing option: ${optionText}');
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return select.value;
  })()
`;

const fillByLabel = (labelText, value) => `
  (() => {
    const label = [...document.querySelectorAll('label')].find((node) => node.textContent.includes(${JSON.stringify(labelText)}));
    if (!label) throw new Error('Missing label: ${labelText}');
    const input = label.querySelector('input, select, textarea');
    if (!input) throw new Error('Missing control for: ${labelText}');
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set;
    setter.call(input, ${JSON.stringify(String(value))});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.value;
  })()
`;

const waitForText = async (cdp, text, timeoutMs = 60000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = await evaluate(cdp, `document.body?.innerText.includes(${JSON.stringify(text)})`);
    if (found) return true;
    await delay(300);
  }
  throw new Error(`Timed out waiting for text: ${text}`);
};

const screenshot = async (cdp, name) => {
  const result = await cdp.call("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  const file = resolve(artifactDir, `${name}.png`);
  writeFileSync(file, Buffer.from(result.data, "base64"));
  return file;
};

const auditPage = async (cdp) => evaluate(cdp, `(() => {
  const body = document.body;
  const focusables = [...document.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((el) => !el.disabled && el.offsetParent !== null);
  const unlabeledInputs = [...document.querySelectorAll('input, select, textarea')]
    .filter((el) => !el.closest('label') && !el.getAttribute('aria-label') && !document.querySelector('label[for="' + el.id + '"]'));
  return {
    title: document.title,
    text: body.innerText,
    mainCount: document.querySelectorAll('main').length,
    navCount: document.querySelectorAll('nav[aria-label]').length,
    focusableCount: focusables.length,
    unlabeledInputs: unlabeledInputs.length,
    pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    consoleErrors: window.__PHASE3C_ERRORS__ || []
  };
})()`);

const runBrowserQa = async () => {
  const chromePath = chromeCandidates.find(existsSync);
  if (!chromePath) throw new Error("No Chrome/Edge executable found for browser QA.");

  await seedFirestore();
  const appPort = await findOpenPort(5173);
  const debugPort = await findOpenPort(9222);
  const env = {
    ...process.env,
    VITE_TRACKTOZERO_V2_ENABLED: "true",
    VITE_TRACKTOZERO_V2_REPOSITORY_MODE: "firebaseEmulator",
    VITE_TRACKTOZERO_V2_FIREBASE_PROJECT_ID: TRACKTOZERO_V2_EMULATOR_PROJECT_ID,
    VITE_TRACKTOZERO_V2_FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST,
    VITE_TRACKTOZERO_V2_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST,
  };
  const build = spawn("npm", ["run", "build"], {
    cwd: workspaceRoot,
    env,
    shell: process.platform === "win32",
    stdio: "pipe",
  });
  build.stdout.on("data", (chunk) => process.stdout.write(chunk));
  build.stderr.on("data", (chunk) => process.stderr.write(chunk));
  const buildCode = await new Promise((resolveCode) => build.on("close", resolveCode));
  if (buildCode !== 0) throw new Error(`Build failed before browser QA: ${buildCode}`);

  const vite = spawn("npm", ["run", "preview", "--", "--host", "127.0.0.1", "--port", String(appPort), "--strictPort"], {
    cwd: workspaceRoot,
    env,
    shell: process.platform === "win32",
    stdio: "pipe",
  });
  vite.stdout.on("data", (chunk) => process.stdout.write(chunk));
  vite.stderr.on("data", (chunk) => process.stderr.write(chunk));
  await waitForHttp(`http://127.0.0.1:${appPort}/`);

  const findings = [];
  const screenshots = [];
  const browser = await openBrowser({ chromePath, debugPort, url: `http://127.0.0.1:${appPort}/`, width: 1440, height: 900 });
  const { cdp, chrome, profileDir } = browser;
  try {
    await cdp.call("Network.enable");
    await evaluate(cdp, `window.__PHASE3C_ERRORS__ = []; const oldError = console.error; console.error = (...args) => { window.__PHASE3C_ERRORS__.push(args.map(String).join(' ')); oldError(...args); }; true;`);
    await cdp.call("Page.navigate", { url: `http://127.0.0.1:${appPort}/` });
    await waitForText(cdp, "Debt payoff command center");
    screenshots.push(await screenshot(cdp, "personal-home-desktop"));

    const desktop = await auditPage(cdp);
    if (desktop.mainCount !== 1) findings.push("Expected exactly one main landmark on desktop Home.");
    if (desktop.navCount < 1) findings.push("Expected primary nav with aria-label.");
    if (desktop.unlabeledInputs !== 0) findings.push(`Found ${desktop.unlabeledInputs} unlabeled controls.`);
    if (desktop.pageOverflow) findings.push("Desktop page has unintended horizontal overflow.");
    for (const text of ["Next move:", "Total included debt", "Estimated debt-free date", "Planning estimates only"]) {
      if (!desktop.text.includes(text)) findings.push(`Desktop Home missing text: ${text}`);
    }

    await cdp.call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await delay(500);
    screenshots.push(await screenshot(cdp, "personal-home-mobile"));
    const mobile = await auditPage(cdp);
    if (mobile.pageOverflow) findings.push("Mobile Home has unintended horizontal overflow.");

    await cdp.call("Emulation.setDeviceMetricsOverride", { width: 768, height: 1024, deviceScaleFactor: 1, mobile: false });
    await delay(500);
    screenshots.push(await screenshot(cdp, "personal-home-tablet"));
    const tablet = await auditPage(cdp);
    if (tablet.pageOverflow) findings.push("Tablet Home has unintended horizontal overflow.");

    await evaluate(cdp, clickText("Debts"));
    await waitForText(cdp, "What you owe");
    screenshots.push(await screenshot(cdp, "debts-mobile"));
    const debtsMobile = await auditPage(cdp);
    if (debtsMobile.pageOverflow) findings.push("Mobile Debts page has unintended horizontal overflow.");
    for (const text of ["Record payment", "Confirm balance", "Add debt"]) {
      if (!debtsMobile.text.includes(text)) findings.push(`Debts page missing text: ${text}`);
    }

    await evaluate(cdp, fillByLabel("Amount", "25"));
    await evaluate(cdp, clickText("Record payment"));
    await waitForText(cdp, "record payment saved.");

    await cdp.call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await evaluate(cdp, clickText("Plan"));
    await waitForText(cdp, "Active payoff plan");
    screenshots.push(await screenshot(cdp, "plan-desktop"));
    await evaluate(cdp, clickText("Preview reforecast"));
    await waitForText(cdp, "Proposed estimate");
    await evaluate(cdp, clickText("Apply reforecast"));
    await waitForText(cdp, "apply reforecast saved.");

    await evaluate(cdp, clickText("Settings"));
    await waitForText(cdp, "Workspace settings");
    await evaluate(cdp, setSelectByText("Workspace", "Household"));
    await waitForText(cdp, "Workspace type: household");
    await evaluate(cdp, clickText("Settings"));
    screenshots.push(await screenshot(cdp, "household-settings-desktop"));

    await evaluate(cdp, setSelectByText("Role preview", "Baba"));
    await waitForText(cdp, "Current role: admin");
    await evaluate(cdp, clickText("Plan"));
    await waitForText(cdp, "Active payoff plan");
    await evaluate(cdp, clickText("Preview reforecast"));
    await waitForText(cdp, "Proposed estimate");
    await evaluate(cdp, clickText("Apply reforecast"));
    await waitForText(cdp, "apply reforecast saved.");

    await evaluate(cdp, setSelectByText("Role preview", "Contributor"));
    await waitForText(cdp, "Current role: contributor");
    await evaluate(cdp, clickText("Plan"));
    await waitForText(cdp, "Your role can view plans, but cannot change payoff plan setup.");
    await evaluate(cdp, clickText("Debts"));
    await waitForText(cdp, "Your role is read-only for debt setup.");
    await evaluate(cdp, fillByLabel("Amount", "15"));
    await evaluate(cdp, clickText("Record payment"));
    await waitForText(cdp, "record payment saved.");
    const contributorText = (await auditPage(cdp)).text;
    if (!contributorText.includes("Your role is read-only for debt setup.")) findings.push("Contributor restriction copy missing.");

    await evaluate(cdp, setSelectByText("Role preview", "Viewer"));
    await waitForText(cdp, "Current role: viewer");
    const viewerText = (await auditPage(cdp)).text;
    if (!viewerText.includes("Your role is read-only for payment recording.")) findings.push("Viewer read-only payment copy missing.");
    if (!viewerText.includes("Unknown APR")) findings.push("Household unknown-APR debt copy missing.");
    screenshots.push(await screenshot(cdp, "viewer-readonly"));

    await evaluate(cdp, setSelectByText("Role preview", "Non-member"));
    await waitForText(cdp, "You do not have access to this TrackToZero workspace");
    const nonMemberText = (await auditPage(cdp)).text;
    if (!nonMemberText.includes("This account does not have access to that TrackToZero workspace or action.")) findings.push("Non-member safe permission-denied copy missing.");
    if (/FirebaseError|Missing or insufficient permissions/i.test(nonMemberText)) findings.push("Raw Firebase permission error leaked to the UI.");
    screenshots.push(await screenshot(cdp, "non-member-denied"));

    await cdp.call("Emulation.setDeviceMetricsOverride", { width: 340, height: 844, deviceScaleFactor: 1, mobile: true });
    await delay(500);
    const narrow = await auditPage(cdp);
    if (narrow.pageOverflow) findings.push("Narrow mobile page has unintended horizontal overflow.");

    const finalAudit = await auditPage(cdp);
    const seriousConsoleErrors = finalAudit.consoleErrors.filter((line) =>
      !/Download the React DevTools/i.test(line) && !/auth\/invalid-login-credentials/i.test(line)
    );
    if (seriousConsoleErrors.length) findings.push(`Console errors: ${seriousConsoleErrors.join(" | ")}`);

    if (findings.length) throw new Error(findings.join("\n"));
    writeFileSync(resolve(artifactDir, "phase3c-browser-qa.json"), JSON.stringify({
      status: "passed",
      browser: chromePath,
      appPort,
      asOf: V2_TEST_NOW,
      viewports: ["1440x900", "768x1024", "390x844", "340x844"],
      screenshots,
    }, null, 2));
  } catch (error) {
    try {
      const diagnostic = await evaluate(cdp, `(() => ({
        url: location.href,
        title: document.title,
        text: document.body?.innerText || "",
        html: document.body?.innerHTML?.slice(0, 5000) || "",
        errors: window.__PHASE3C_ERRORS__ || [],
        startupErrorCacheSize: window.__startupErrorCache?.size || 0,
        resources: performance.getEntriesByType('resource').map((entry) => ({
          name: entry.name,
          initiatorType: entry.initiatorType,
          transferSize: entry.transferSize,
          duration: entry.duration
        }))
      }))()`);
      diagnostic.directAppImport = await evaluate(cdp, `
        import('/src/App.jsx')
          .then((mod) => ({ ok: !!mod.default }))
          .catch((error) => ({ ok: false, message: error?.message || String(error), stack: error?.stack || "" }))
      `);
      diagnostic.cdpEvents = cdp.events
        .filter((event) => ["Runtime.exceptionThrown", "Runtime.consoleAPICalled", "Log.entryAdded", "Network.loadingFailed", "Network.responseReceived"].includes(event.method))
        .slice(-80);
      writeFileSync(resolve(artifactDir, "phase3c-failure.json"), JSON.stringify(diagnostic, null, 2));
      await screenshot(cdp, "failure-state");
    } catch {
      // best-effort diagnostics only
    }
    throw error;
  } finally {
    killProcessTree(chrome);
    killProcessTree(vite);
    await delay(1000);
    try {
      rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    } catch {
      // Chrome can hold a temp profile lock briefly on Windows. The profile lives
      // under the OS temp directory and is not part of the repository artifact.
    }
  }
};

runBrowserQa().catch((error) => {
  console.error(error);
  process.exit(1);
});
