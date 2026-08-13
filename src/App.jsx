import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Suspense, lazy } from "react";
import { Capacitor } from "@capacitor/core";
import {
  getMonthKey, saveIncome,
  login, signup, logout, requestPasswordReset,
  deleteCurrentUserAccount,
  loadUploads,
  loadWorkspaceSettings, saveWorkspaceSettings, subscribeUserWorkspace,
  saveHouseholdDashboardSnapshot, saveReminderSnapshot, updateCurrentUserPassword
} from "./firebase";
import ProviderMark from "./components/ProviderMark";
import EditPanel from "./components/EditPanel";
import { MOCK_ACCOUNTS, CATEGORIES, CAT_ICON, MONTHS } from "./data/mockAccounts";
import { CURRENCY_OPTIONS, TODAY as today, daysLeft, defaultRecord, normalizeAprDecimal, normalizeIncomeEntries, normalizeMonthInput, isSystemIncomeSource, AUTH_TIMEOUT_MS, getBankHolidays, getFridaysInMonth, getFirstFridayOfYear, getStartOfWeek, getPayWeekHolidayCount, getPromoMeta, getEffectiveApr, getComputedBalance, setActiveCurrencyCode } from "./utils/budgetUtils";
import { createLocalDataService } from "./services/localDataService";
import AppAuthenticatedContent from "./components/app/AppAuthenticatedContent";
import AppOverlays from "./components/app/AppOverlays";
import AppChrome from "./components/app/AppChrome";
import AppShellStyles from "./components/app/AppShellStyles";
import LoadingScreen from "./components/feedback/LoadingScreen";
import LoadingState from "./components/ui/LoadingState";
import { LAUNCH_COPY } from "./config/launchCopy";
import { APP_VERSION_LABEL } from "./config/appMeta";
import { BRAND_NAME } from "./config/brand";
import { getLaunchFlags } from "./config/launchFlags";
import useAnalytics from "./hooks/useAnalytics";
import { buildPalette } from "./config/palette";
import { NAV_ITEMS } from "./config/nav";
import Spinner from "./components/feedback/Spinner";
import useNotificationScheduler from "./hooks/useNotificationScheduler";
import useBackup from "./hooks/useBackup";
import useSubscription from "./hooks/useSubscription";
import useInstallPrompt from "./hooks/useInstallPrompt";
import useReminderPreferences from "./hooks/useReminderPreferences";
import useSoftLaunchSupport from "./hooks/useSoftLaunchSupport";
import useReducedMotion from "./hooks/useReducedMotion";
import useAppSession from "./hooks/useAppSession";
import useWorkspaceRecords from "./hooks/useWorkspaceRecords";
import useHouseholdWorkspace from "./hooks/useHouseholdWorkspace";
import useAccounts from "./hooks/useAccounts";
import useSettings from "./hooks/useSettings";
import usePlans from "./hooks/usePlans";
import useAppNavigation from "./hooks/useAppNavigation";
import useAppFeedback from "./hooks/useAppFeedback";
import useAppDataIO from "./hooks/useAppDataIO";
import { payoffSimulate, MAX_SIMULATION_MONTHS } from "./utils/payoffEngine";
import { isStripeReady, openBillingPortal, startStripeCheckout } from "./services/stripeService";
import { buildReturnPrompt } from "./services/retentionService";
import { isBillOpenThisCycle, isBillSettledThisCycle, withNormalizedBillFields } from "./services/billModel";
import { buildDebtProgressSnapshot } from "./services/progressEngineService";
import { buildMomentumSnapshot } from "./services/momentumService";
import { buildNextMove } from "./services/nextMoveService";
import { buildWeeklySummary } from "./services/weeklySummaryService";
import { buildDailyCheckIn } from "./services/checkInService";

const SUPPORT_EMAIL = String((typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPPORT_EMAIL) || LAUNCH_COPY.supportEmailFallback);

const TOAST_DURATION_MS = 2800;
const SAVINGS_GOAL = 2000;
// MAX_SIMULATION_MONTHS now imported from payoffEngine
const SIM_DISPLAY_ROWS = 60;
const EMPTY_STARTER_ACCOUNTS = [];
const TrackToZeroV2App = lazy(() => import("./components/tracktozero/TrackToZeroV2App"));

function debugDebtCalculation(bills, displayedTotalDebt = 0) {
  const report = {
    totalBills: bills.length,
    paydownCount: 0,
    monthlyCount: 0,
    includedInTotal: [],
    excludedFromTotal: [],
    suspectedWrongType: [],
    totalPaydownBalance: 0,
    totalMonthlyBalance: 0,
    displayedTotalDebt: Number(displayedTotalDebt || 0),
    matchesDisplayedTotal: false,
  };

  const normalize = (value) => String(value || "").trim().toLowerCase();

  const isMonthlyType = (bill) => {
    const type = normalize(bill.type);
    const category = normalize(bill.category);
    const subtype = normalize(bill.subtype);

    return (
      type === "monthly" ||
      type.includes("monthly") ||
      type.includes("recurring") ||
      subtype.includes("monthly") ||
      subtype.includes("subscription") ||
      category.includes("subscription") ||
      category.includes("utility") ||
      category.includes("insurance") ||
      category.includes("home expense")
    );
  };

  const isPaydownType = (bill) => {
    const type = normalize(bill.type);
    const category = normalize(bill.category);
    const subtype = normalize(bill.subtype);

    return (
      type === "pay down over time" ||
      type.includes("pay down") ||
      type.includes("paydown") ||
      type.includes("loan") ||
      type.includes("credit") ||
      type.includes("line of credit") ||
      subtype.includes("loan") ||
      subtype.includes("credit card") ||
      category.includes("loan") ||
      category.includes("credit")
    );
  };

  bills.forEach((bill) => {
    // Use cur_bal (the computed balance field). Falls back to legacy balance/bal fields.
    const balance = Number(bill.cur_bal ?? bill.balance ?? bill.bal ?? 0);

    const entry = {
      name: bill.name || bill.billName || "(unnamed bill)",
      balance,
      cur_bal: bill.cur_bal,
      base_bal_v: bill.base_bal_v,
      paid_v: bill.paid_v,
      type: bill.type || "",
      billType: bill.billType || "",
      category: bill.category || "",
      subtype: bill.subtype || "",
      owner: bill.owner || bill.accountHolder || "",
    };

    if (isPaydownType(bill)) {
      report.paydownCount += 1;
      report.totalPaydownBalance += balance;
      report.includedInTotal.push(entry);
      return;
    }

    if (isMonthlyType(bill)) {
      report.monthlyCount += 1;
      report.totalMonthlyBalance += balance;
      report.excludedFromTotal.push(entry);
      return;
    }

    report.suspectedWrongType.push(entry);
  });

  report.totalPaydownBalance = Number(report.totalPaydownBalance.toFixed(2));
  report.totalMonthlyBalance = Number(report.totalMonthlyBalance.toFixed(2));
  report.matchesDisplayedTotal =
    Math.abs(report.displayedTotalDebt - report.totalPaydownBalance) < 0.01;

  console.group("=== TRACKTOZERO DEBT DEBUG ===");
  console.log("Displayed Total Debt on screen:", report.displayedTotalDebt);
  console.log(
    "Computed PAYDOWN total (should equal Total Debt):",
    report.totalPaydownBalance
  );
  console.log(
    "Computed MONTHLY total (should NOT be in Total Debt):",
    report.totalMonthlyBalance
  );
  console.log(
    "Displayed total matches paydown total:",
    report.matchesDisplayedTotal
  );
  console.log("Total bills:", report.totalBills);
  console.log("Paydown bills:", report.paydownCount);
  console.log("Monthly bills:", report.monthlyCount);

  console.group("Included in Total Debt");
  report.includedInTotal.forEach((b, i) => {
    console.log(
      `${i + 1}. ${b.name} (${b.owner}) | billType=${b.billType} | category=${b.category} | cur_bal=${b.cur_bal} | base_bal_v=${b.base_bal_v} | paid_v=${b.paid_v}`
    );
  });
  console.groupEnd();

  console.group("Excluded from Total Debt");
  report.excludedFromTotal.forEach((b, i) => {
    console.log(
      `${i + 1}. ${b.name} (${b.owner}) | billType=${b.billType} | category=${b.category} | cur_bal=${b.cur_bal} | base_bal_v=${b.base_bal_v} | paid_v=${b.paid_v}`
    );
  });
  console.groupEnd();

  console.group("Suspected misclassified bills");
  report.suspectedWrongType.forEach((b, i) => {
    console.log(
      `${i + 1}. ${b.name} (${b.owner}) | billType=${b.billType} | category=${b.category} | cur_bal=${b.cur_bal} | base_bal_v=${b.base_bal_v} | paid_v=${b.paid_v}`
    );
  });
  console.groupEnd();

  console.groupEnd();

  return report;
}

function BudgetApp() {
  const mobileChromeRef = useRef(null);
  const [page, setPage]           = useState("overview");
  const [pageVisible, setPageVisible] = useState(true);
  const pageTransitionRef = useRef(null);
  const plansRef = useRef([]);
  const buildCurrentHouseholdSeed = () => ({
    settings: {
      customAccounts,
      userCategories,
      incomeTemplates,
      deletedAccountIds,
      accountOverrides,
      assets,
      monthNotes: { [monthKey]: monthNote || "" },
      paySchedule,
    },
    records: { [monthKey]: records },
    income: { [monthKey]: { entries: income, receipts: incomeReceipts } },
    plans: plansRef.current || [],
  });
  const [theme, setTheme]         = useState("light");
  const [selMonth, setSelMonth]   = useState(today.getMonth()+1);
  const [selYear, setSelYear]     = useState(today.getFullYear());
  // records, income, incomeReceipts, loading, mounted → useWorkspaceRecords (wired below)
  const [editId, setEditId]       = useState(null);
  const [editVals, setEditVals]   = useState({});
  const [toast, setToast]         = useState(null);
  // incomeTemplates → useAccounts (wired below)

  const [newInc, setNewInc]       = useState({src:"Other",amt:""});
  const [showIncome, setShowIncome] = useState(false);

  const monthKey = getMonthKey(selMonth, selYear);
  const prevD = new Date(selYear, selMonth - 2, 1);
  const prevMonthKey = getMonthKey(prevD.getMonth() + 1, prevD.getFullYear());
  // Auth / session — source of truth for who is logged in
  const {
    user, setUser,
    authLoading,
    isLocalUser, setIsLocalUser,
    userProfile,
    currentUserLabel,
    defaultOwnerLabel,
    founderAccount,
    founderOpsVisible,
    founderOpsState,
    launchFlags,
    firebaseStatus,
  } = useAppSession();

  // Auth form state (stays local — depends on localData for the fallback path)
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [showAuthPass, setShowAuthPass] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authResetLoading, setAuthResetLoading] = useState(false);
  const [passwordUpdateLoading, setPasswordUpdateLoading] = useState(false);
  // plans state now in usePlans (wired below after hook call)
  const [acctSearch, setAcctSearch] = useState("");
  const [acctOwnerF, setAcctOwnerF] = useState("All");
  const [acctCatF, setAcctCatF] = useState("All");
  const [acctStatusF, setAcctStatusF] = useState("all");
  const [acctGroupBy, setAcctGroupBy] = useState("category");
  const [acctExpanded, setAcctExpanded] = useState({});
  // customAccounts, userCategories, deletedAccountIds, accountOverrides, editingAccountId,
  // editAcct, newCategoryName, newAcct → useAccounts (wired below)
  const [viewportW, setViewportW] = useState(typeof window !== "undefined" ? window.innerWidth : 1280);
  const [mobileChromeHeight, setMobileChromeHeight] = useState(172);
  const settingsOverviewRef = useRef(null);
  const settingsBillsRef = useRef(null);
  const settingsCategoriesRef = useRef(null);
  const settingsDataRef = useRef(null);
  const addBillSectionRef = useRef(null);
  const dueNextSectionRef = useRef(null);
  const dueNextItemRefs = useRef({});
  const [jumpToAddBill, setJumpToAddBill] = useState(false);
  const [dueNextExpanded, setDueNextExpanded] = useState({});
  const [dueNextWeekOffset, setDueNextWeekOffset] = useState(0);
  const [showMoreDrawer, setShowMoreDrawer] = useState(false);
  const [showDueSoon, setShowDueSoon] = useState(false);
  const [dueNextTargetId, setDueNextTargetId] = useState(null);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackValues, setFeedbackValues] = useState({
    page: "overview",
    category: "confusing",
    rating: null,
    message: "",
    whatConfused: "",
    whatHelped: "",
    whatShouldChange: "",
  });
  const [founderOpsTick, setFounderOpsTick] = useState(0);
  // showAddAccountForm → useAccounts (wired below)
  const [swipeState, setSwipeState] = useState({});
  const [addAcctStep, setAddAcctStep] = useState(1);
  const [dueBanner, setDueBanner] = useState(true);
  const [undoStack, setUndoStack] = useState(null);
  const undoTimerRef = useRef(null);
  const [bulkSelected, setBulkSelected] = useState(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  // Feature 1: Ctrl+K Search
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [cmdkQuery, setCmdkQuery] = useState("");
  const cmdkInputRef = useRef(null);
  // Refs to break circular ordering between hooks / derived memos
  const allAcctsRef = useRef([]);
  const updateRecordRef = useRef(null);
  const buildAutoBalanceUpdatesRef = useRef(null);
  // Refs for income state — used by persistIncome/updateIncomeReceipt to read the
  // latest value without stale-closure races when both are called in quick succession.
  const incomeRef = useRef([]);
  const incomeReceiptsRef = useRef({});

  // Feature 2: Push Notifications — managed by useNotificationScheduler (wired after allAccts)

  // monthNote, monthNoteSaved, assets, onboardingStep, backupLoading → useSettings (wired below)

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), TOAST_DURATION_MS);
  }

  const askConfirm = ({ title, message, confirmLabel = "Confirm", tone = "default" }) =>
    new Promise((resolve) => {
      setConfirmState({ title, message, confirmLabel, tone, resolve });
    });

  // Feature: Offline / Sync Indicator
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [hasPendingSync, setHasPendingSync] = useState(false);
  const {
    installPromptEvent,
    showInstallPrompt,
    dismissInstallPrompt,
    pwaInstalled,
    offlineReady,
    handleInstallApp,
  } = useInstallPrompt();
  const reducedMotion = useReducedMotion();
  const { trackPage } = useAnalytics({ user, page });

  // Auth listener + profile subscription now live in useAppSession above

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const root = document.documentElement;
    const syncViewportMetrics = () => {
      const viewport = window.visualViewport;
      const width = Math.round(viewport?.width || window.innerWidth || 1280);
      const height = (viewport?.height || window.innerHeight || 800) * 0.01;
      root.style.setProperty("--app-vh", `${height}px`);
      setViewportW(width);
    };
    syncViewportMetrics();
    const viewport = window.visualViewport;
    window.addEventListener("resize", syncViewportMetrics);
    viewport?.addEventListener("resize", syncViewportMetrics);
    viewport?.addEventListener("scroll", syncViewportMetrics);
    return () => {
      window.removeEventListener("resize", syncViewportMetrics);
      viewport?.removeEventListener("resize", syncViewportMetrics);
      viewport?.removeEventListener("scroll", syncViewportMetrics);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const checkoutStatus = url.searchParams.get("checkout");
    if (!checkoutStatus) return;

    if (checkoutStatus === "success") {
      setPage("overview");
      setShowMoreDrawer(false);
      showToast("Payment received. Welcome back.", "success");
    } else if (checkoutStatus === "cancel") {
      setPage("billing");
      showToast("Checkout canceled.", "error");
    }

    url.searchParams.delete("checkout");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);


  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const el = mobileChromeRef.current;
    const syncMobileChromeHeight = () => {
      const rect = el && typeof el.getBoundingClientRect === "function"
        ? el.getBoundingClientRect()
        : null;
      const nextHeight = Math.ceil(rect?.height || 172);
      setMobileChromeHeight((prev) => (Math.abs(prev - nextHeight) > 1 ? nextHeight : prev));
    };
    syncMobileChromeHeight();
    const ro = el && typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncMobileChromeHeight) : null;
    const viewport = window.visualViewport;
    ro?.observe(el);
    window.addEventListener("resize", syncMobileChromeHeight);
    viewport?.addEventListener("resize", syncMobileChromeHeight);
    viewport?.addEventListener("scroll", syncMobileChromeHeight);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", syncMobileChromeHeight);
      viewport?.removeEventListener("resize", syncMobileChromeHeight);
      viewport?.removeEventListener("scroll", syncMobileChromeHeight);
    };
  }, [theme, viewportW, page, showMoreDrawer, user, isOnline, hasPendingSync, isLocalUser]);

  useEffect(() => {
    if (page !== "settings" || !jumpToAddBill) return;
    const timer = window.setTimeout(() => {
      addBillSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setJumpToAddBill(false);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [page, jumpToAddBill]);

  useEffect(() => {
    if (page !== "overview" || !showDueSoon) return;
    const timer = window.setTimeout(() => {
      dueNextSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [page, showDueSoon]);

  useEffect(() => {
    if (!dueNextTargetId) return;
    const timer = window.setTimeout(() => {
      dueNextItemRefs.current[dueNextTargetId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 260);
    return () => window.clearTimeout(timer);
  }, [dueNextTargetId, page, showDueSoon, dueNextWeekOffset]);

  useEffect(() => {
    setDueNextWeekOffset(0);
    setDueNextExpanded({});
  }, [selMonth, selYear]);

  useEffect(() => { trackPage(page); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const allowLocalFallbackAuth = Boolean(import.meta.env.DEV && launchFlags.localAuthEnabled);
  const {
    workspaceMode,
    activeHouseholdId,
    householdProfile,
    householdMembers,
    householdRequests,
    householdSetupOpen,
    setHouseholdSetupOpen,
    householdSetupTab,
    setHouseholdSetupTab,
    householdForm,
    setHouseholdForm,
    householdSearchResults,
    householdSearchLoading,
    householdActionLoading,
    workspaceScope,
    currentHouseholdMember,
    canManageHousehold,
    householdInviteLink,
    incomingHouseholdInvites,
    createCurrentHousehold,
    searchForHouseholds,
    clearHouseholdSearchResults,
    joinSelectedHousehold,
    continueSoloMode,
    pendingHouseholdId,
    pendingHouseholdName,
    cancelPendingRequest,
    handleSaveHouseholdProfile,
    handleCopyHouseholdInvite,
    handleShareHouseholdInvite,
    handleApproveHouseholdRequest: approveHouseholdRequestAction,
    handleRejectHouseholdRequest: rejectHouseholdRequestAction,
    handleLeaveHousehold,
    handleDeleteHousehold,
    handleRemoveHouseholdMember,
    handleSetMemberRole,
    handleInviteHouseholdMemberByUserId,
    handleAcceptHouseholdInvite,
    handleDeclineHouseholdInvite,
  } = useHouseholdWorkspace({
    user,
    userProfile,
    isLocalUser,
    buildHouseholdSeed: buildCurrentHouseholdSeed,
    showToast,
  });
  const starterTemplateAccounts = useMemo(
    () => ((launchFlags.starterTemplateEnabled || founderAccount)
      ? MOCK_ACCOUNTS
      : EMPTY_STARTER_ACCOUNTS),
    [launchFlags.starterTemplateEnabled, founderAccount]
  );
  const sharedLegacyAccounts = useMemo(
    () => (
      workspaceMode === "household" && activeHouseholdId && founderAccount
        ? MOCK_ACCOUNTS
        : starterTemplateAccounts
    ),
    [workspaceMode, activeHouseholdId, founderAccount, starterTemplateAccounts]
  );
  const hasAuthenticatedUser = Boolean(user);

  // localData must be created before useAccounts (which loads settings via it)
  const localData = useMemo(() => createLocalDataService({
    seedMonthKey: monthKey,
    seedAccounts: starterTemplateAccounts,
    defaultRecord,
  }), [monthKey, starterTemplateAccounts]);
  const ensureLocalUserData = localData.ensureLocalUserData;

  // Settings state — assets, monthNote, onboarding, backup loading
  const {
    assets, setAssets,
    monthNote,
    onboardingStep, setOnboardingStep,
    onboardingDone: _onboardingDone, setOnboardingDone,
    backupLoading, setBackupLoading,
    currencyCode,
    saveAssets,
    saveCurrencyPreference,
    completeOnboarding,
  } = useSettings({
    user,
    isLocalUser,
    workspaceScope,
    localData,
    activeHouseholdId,
    monthKey,
    showToast,
  });

  useEffect(() => {
    setActiveCurrencyCode(currencyCode);
  }, [currencyCode]);

  // Accounts state — customAccounts, categories, overrides, CRUD operations
  const {
    customAccounts, setCustomAccounts,
    userCategories, setUserCategories,
    deletedAccountIds, setDeletedAccountIds,
    accountOverrides, setAccountOverrides,
    incomeTemplates, setIncomeTemplates,
    billActivity,
    paySchedule, setPaySchedule, savePaySchedule,
    editingAccountId, setEditingAccountId,
    editAcct, setEditAcct,
    newCategoryName, setNewCategoryName,
    newAcct, setNewAcct,
    showAddAccountForm, setShowAddAccountForm,
    persistUserSettings,
    addCategory,
    addCustomAccount,
    deleteAccount,
    deleteAccounts,
    startEditAccount,
    saveEditAccount,
    addBillActivity,
    ownerOptions,
  } = useAccounts({
    user,
    isLocalUser,
    workspaceScope,
    localData,
    activeHouseholdId,
    defaultOwnerLabel,
    allAcctsRef,
    updateRecordRef,
    buildAutoBalanceUpdatesRef,
    showToast,
    askConfirm,
    setAssets,
    householdMembers,
    allOwners: [],
    activityActorLabel: currentUserLabel,
  });

  useEffect(() => {
    if (page !== "settings" || !showAddAccountForm) return;
    const timer = window.setTimeout(() => {
      addBillSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setShowAddAccountForm(false);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [page, showAddAccountForm, setShowAddAccountForm]);

  const recordSeedAccounts = useMemo(
    () => {
      const merged = new Map();
      [...sharedLegacyAccounts, ...customAccounts].forEach((a) => merged.set(a.id, a));
      return [...merged.values()]
        .filter((account) => !deletedAccountIds.includes(account.id))
        .map((account) => ({ ...account, ...(accountOverrides[account.id] || {}) }));
    },
    [sharedLegacyAccounts, customAccounts, deletedAccountIds, accountOverrides]
  );

  const allAccounts = useMemo(
    () => [...starterTemplateAccounts, ...customAccounts],
    [starterTemplateAccounts, customAccounts]
  );
  const {
    records,
    income, setIncome,
    incomeReceipts, setIncomeReceipts,
    loading,
    mounted,
    updateRecord,
    buildAutoBalanceUpdates,
  } = useWorkspaceRecords({
    user,
    isLocalUser,
    workspaceScope,
    monthKey,
    recordSeedAccounts,
    localData,
    allAccounts,
  });

  updateRecordRef.current = updateRecord;
  buildAutoBalanceUpdatesRef.current = buildAutoBalanceUpdates;
  incomeRef.current = income;
  incomeReceiptsRef.current = incomeReceipts;

  const {
    reminderPreferences,
    preferencesLoading,
    patchReminderPreferences,
  } = useReminderPreferences({
    user,
    isLocalUser,
    localData,
    loadWorkspaceSettings,
    saveWorkspaceSettings,
    workspaceScope,
  });
  const subscription = useSubscription({
    userProfile,
    householdMembers,
    memberships: householdProfile?.memberships || [],
  });
  const {
    softLaunchState,
    patchSoftLaunchState,
  } = useSoftLaunchSupport();
  const stripeReady = isStripeReady() && launchFlags.billingEnabled;
  const returnPrompt = buildReturnPrompt({
    reminderPreferences,
    pwaInstalled,
    offlineReady,
  });
  const softLaunchSummary = `${softLaunchState.activeDays || 0} active day${Number(softLaunchState.activeDays || 0) === 1 ? "" : "s"} • ${softLaunchState.visitCount || 0} opens`;

  useEffect(() => {
    // records/income reset now in useWorkspaceRecords; plans reset now in usePlans
    setCustomAccounts([]);
    setUserCategories([]);
    setDeletedAccountIds([]);
    setAccountOverrides({});
  }, [user?.uid, isLocalUser, setCustomAccounts, setUserCategories, setDeletedAccountIds, setAccountOverrides]);

  useEffect(() => {
    setNewAcct((prev) => (prev.owner ? prev : { ...prev, owner: defaultOwnerLabel }));
  }, [defaultOwnerLabel, setNewAcct]);

  useEffect(() => {
    if (page === "founder" && !founderOpsVisible) {
      setPage("overview");
    }
    if (page === "admin" && !founderAccount) {
      setPage("overview");
    }
  }, [page, founderOpsVisible, founderAccount]);

  // Records subscription now lives in useWorkspaceRecords
  // Plans load + sync now in usePlans

  // Settings load now in useAccounts

  useEffect(() => {
    if (!user || user.isLocal || isLocalUser) return;
    const unsub = subscribeUserWorkspace(user.uid, (settings) => {
      const isNewUser = !customAccounts.length && !settings?.onboardingDone;
      if (isNewUser) { setOnboardingDone(false); setOnboardingStep(1); }
    });
    return () => unsub && unsub();
  }, [user, isLocalUser, customAccounts.length, setOnboardingDone, setOnboardingStep]);

  // Body scroll lock when any modal is open
  const anyModalOpen = showMoreDrawer || showFilterSheet || cmdkOpen || showIncome || onboardingStep > 0 || feedbackOpen;
  useEffect(() => {
    document.body.style.overflow = anyModalOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [anyModalOpen]);

  // Ctrl+K keyboard listener
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdkOpen(o => !o);
        setCmdkQuery("");
      }
      if (e.key === "Escape") setCmdkOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (cmdkOpen) setTimeout(() => cmdkInputRef.current?.focus(), 50);
  }, [cmdkOpen]);

  // Online/offline detection
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => { setIsOnline(false); setHasPendingSync(true); };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    if (isOnline && hasPendingSync) {
      const t = setTimeout(() => setHasPendingSync(false), 3000);
      return () => clearTimeout(t);
    }
  }, [isOnline, hasPendingSync]);

  // Month note loader now in useSettings


  const handleAuthSubmit = async (e) => {
    e?.preventDefault?.();
    try {
      setAuthError(null);
      if (authMode === "login") {
        await login(authEmail, authPass);
        setIsLocalUser(false);
        showToast("Signed in");
      } else {
        await signup(authEmail, authPass);
        setIsLocalUser(false);
        showToast("Account created");
      }
      setAuthEmail(""); setAuthPass("");
    } catch (e) {
      console.error(e);
      const raw = e?.message || "Auth error";
      // Keep auth cloud-first. Local account fallback is only for non-configured Firebase dev mode.
      if (allowLocalFallbackAuth && !firebaseStatus.configured) {
        try {
          if (authMode === "login") {
            const u = await localData.signIn(authEmail, authPass);
            setUser(u);
            setIsLocalUser(true);
            setAuthEmail(""); setAuthPass("");
            showToast("Signed in (local)");
          } else {
            const u = await localData.createUser(authEmail, authPass);
            setUser(u);
            setIsLocalUser(true);
            setAuthEmail(""); setAuthPass("");
            showToast("Local account created");
          }
          setAuthError(null);
          return;
        } catch (le) {
          console.error('local fallback error', le);
          const lm = le?.message || 'Local auth failed';
          setAuthError(lm);
          showToast(lm, 'error');
          return;
        }
      }
      if (!firebaseStatus.configured && !allowLocalFallbackAuth) {
        const message = "Firebase is not ready in this build.";
        setAuthError(message);
        showToast(message, "error");
        return;
      }
      let msg = raw;
      if (/api[-_ ]key[-_ ]not[-_ ]valid/i.test(raw) || /invalid api key/i.test(raw)) {
        msg = "Firebase API key invalid. Check `src/firebase.js` apiKey and ensure your Firebase project allows this app (Authorized domains / API key).";
      }
      setAuthError(msg);
      showToast(msg, "error");
    }
  };

  const handleForgotPassword = async (email = authEmail) => {
    const nextEmail = String(email || "").trim();
    if (!nextEmail) {
      const message = "Enter your email address first.";
      setAuthError(message);
      showToast(message, "error");
      return;
    }
    setAuthResetLoading(true);
    try {
      await requestPasswordReset(nextEmail);
      setAuthError(null);
      showToast(`Password reset email sent to ${nextEmail}`);
    } catch (error) {
      console.error("handleForgotPassword error", error);
      const message = error?.message || "Could not send reset email";
      setAuthError(message);
      showToast(message, "error");
    } finally {
      setAuthResetLoading(false);
    }
  };

  const handleUpdatePassword = async ({ currentPassword, nextPassword }) => {
    setPasswordUpdateLoading(true);
    try {
      await updateCurrentUserPassword(currentPassword, nextPassword);
      showToast("Password updated");
      return true;
    } catch (error) {
      console.error("handleUpdatePassword error", error);
      showToast(error?.message || "Could not update password", "error");
      return false;
    } finally {
      setPasswordUpdateLoading(false);
    }
  };

  const confirmTypedAction = useCallback(async ({
    title,
    message,
    confirmLabel,
    tone = "danger",
    confirmValue = "DELETE",
  }) => {
    const confirmed = await askConfirm({ title, message, confirmLabel, tone });
    if (!confirmed) return false;
    const typed = window.prompt(`${title}\n\nType ${confirmValue} to continue.`);
    return typed === confirmValue;
  }, []);

  const getDeleteAccountErrorMessage = useCallback((error) => {
    const code = String(error?.code || "").toLowerCase();
    const message = String(error?.message || "");
    const normalized = message.toLowerCase();

    if (normalized.includes("cannot delete while other members exist")) {
      return "Cannot delete while other members exist.";
    }
    if (normalized.includes("failed to delete household")) {
      return "Failed to delete household.";
    }
    if (
      code.includes("unavailable") ||
      code.includes("deadline-exceeded") ||
      code.includes("network") ||
      normalized.includes("network")
    ) {
      return "Network error, try again.";
    }
    return message || "Could not delete your account right now.";
  }, []);

  const handleDeleteHouseholdAction = useCallback(async () => {
    if (!activeHouseholdId) {
      showToast("No household to delete", "error");
      return false;
    }
    const confirmed = await confirmTypedAction({
      title: "Delete household",
      message: "This permanently removes the household, shared bills, payoff data, notes, invite links, join code, and member relationships. Everyone in the household will be switched back to solo mode.",
      confirmLabel: "Delete household",
      confirmValue: "DELETE HOUSEHOLD",
    });
    if (!confirmed) return false;
    const deleted = await handleDeleteHousehold();
    if (deleted) {
      setPage("overview");
    }
    return deleted;
  }, [activeHouseholdId, confirmTypedAction, handleDeleteHousehold]);

  const handleDeleteAccountAction = useCallback(async () => {
    if (!user) {
      showToast("Sign in to delete your account", "error");
      return false;
    }
    const confirmed = await confirmTypedAction({
      title: "Delete my account",
      message: "This permanently removes your account, personal bills, settings, invites, notifications, upload history, and related data. This cannot be undone.",
      confirmLabel: "Delete account",
      confirmValue: "DELETE",
    });
    if (!confirmed) return false;

    try {
      if (user.isLocal || isLocalUser) {
        localData.deleteUser(user.uid, user.email || "");
        setUser(null);
        setIsLocalUser(false);
        setPage("overview");
        showToast("Account deleted", "success");
        return true;
      }

      await deleteCurrentUserAccount();
      try {
        await logout();
      } catch (error) {
        console.warn("logout after deleteCurrentUserAccount failed", error);
      }
      setUser(null);
      setIsLocalUser(false);
      setPage("overview");
      showToast("Account deleted", "success");
      return true;
    } catch (error) {
      console.error("handleDeleteAccountAction error", error);
      showToast(getDeleteAccountErrorMessage(error), "error");
      return false;
    }
  }, [confirmTypedAction, getDeleteAccountErrorMessage, isLocalUser, localData, setIsLocalUser, user]);

  // normalizeMonthInput, compareMonthKeys, getPromoMeta, getEffectiveApr now imported from budgetUtils

  const scrollToSettingsSection = useCallback((ref) => {
    ref?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // getComputedBalance, updateRecord, buildAutoBalanceUpdates now imported/in hooks

  const markPaid = async (a) => {
    const prevPaid = isBillSettledThisCycle(a);
    const newPaid = !isBillSettledThisCycle(a);
    const plannedOrMin = Number(a.planned_v || 0) > 0 ? a.planned_v : a.min_due_v;
    const completesBill = Number(a.cur_bal || 0) > 0 && Number(a.cur_bal || 0) <= Number(plannedOrMin || 0);
    await updateRecord(a.id, {
      ...buildAutoBalanceUpdates(a, { paid_v: newPaid ? plannedOrMin : 0 }),
      is_paid: newPaid,
    });
    await addBillActivity({
      billId: a.id,
      userName: currentUserLabel || defaultOwnerLabel || "Someone",
      action: newPaid
        ? completesBill && !(a.billType === "monthly" || a.startsOverMonthly)
          ? `${a.name} is now fully paid`
          : `${currentUserLabel || defaultOwnerLabel || "Someone"} marked ${a.name} paid`
        : `${currentUserLabel || defaultOwnerLabel || "Someone"} marked ${a.name} unpaid`,
      metadata: {
        type: newPaid
          ? (a.billType === "monthly" || a.startsOverMonthly
            ? "bill.monthly_covered"
            : completesBill
              ? "bill.completed"
              : "bill.marked_paid")
          : "bill.marked_unpaid",
        billName: a.name,
      },
    });
    if (newPaid) showToast(`Saved: ${a.name}`);
    showUndoToast(
      `${a.name} ${newPaid ? "marked paid" : "marked unpaid"}`,
      async () => {
        await updateRecord(a.id, {
          ...buildAutoBalanceUpdates(a, { paid_v: prevPaid ? plannedOrMin : 0 }),
          is_paid: prevPaid,
        });
      }
    );
  };

  const openEdit = (a) => {
    if (editId === a.id) { setEditId(null); return; }
    setEditId(a.id);
    const defaultInterest = ((getEffectiveApr(a, selMonth, selYear) / 12) * Number(a.cur_bal || 0)).toFixed(2);
    setEditVals({
      paid_v:           String(a.paid_v           ?? 0),
      min_due_v:        String(a.min_due_v        ?? 0),
      cur_bal:          String(a.cur_bal           ?? 0),
      purch_v:          String(a.purch_v           ?? 0),
      interest_paid_v:  String(a.interest_paid_v  ?? defaultInterest),
    });
  };

  const _saveEdit = async (a) => {
    await updateRecord(a.id, buildAutoBalanceUpdates(a, {
      paid_v: parseFloat(editVals.paid_v) || 0,
      min_due_v: parseFloat(editVals.min_due_v) || 0,
      cur_bal: parseFloat(editVals.cur_bal) || 0,
      purch_v: parseFloat(editVals.purch_v) || 0,
      interest_paid_v: parseFloat(editVals.interest_paid_v) || 0,
    }));
    setEditId(null);
    showToast(user && (user.isLocal || isLocalUser) ? `Saved locally: ${a.name}` : `Saved to cloud: ${a.name}`);
  };
  // getBankHolidays, getFridaysInMonth, getFirstFridayOfYear, getStartOfWeek,
  // getPayWeekHolidayCount now imported from budgetUtils

  const createPaycheckAPeriods = (month, year) => {
    const holidays = getBankHolidays(year);
    const base = Number(paySchedule?.paycheckABase ?? paySchedule?.boaBase ?? 0);
    const delta = Number(paySchedule?.paycheckAHolidayDelta ?? paySchedule?.boaHolidayDelta ?? 0);
    if (!base) return [];
    return getFridaysInMonth(month, year).map((payDate, index) => {
      const holidayCount = getPayWeekHolidayCount(payDate, holidays);
      return {
        key: `paycheckA-${payDate.toISOString().slice(0, 10)}`,
        src: "_paycheckA",
        label: `Week ${index + 1} - ${payDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        amount: Math.max(0, base - (holidayCount * delta)),
        holidayCount,
      };
    });
  };

  const createPaycheckBPeriods = (month, year) => {
    const periods = [];
    const base = Number(paySchedule?.paycheckBBase ?? paySchedule?.eagleviewBase ?? 0);
    if (!base) return [];
    const cursor = getFirstFridayOfYear(year);
    while (cursor.getFullYear() === year) {
      if (cursor.getMonth() + 1 === month) {
        periods.push({
          key: `paycheckB-${cursor.toISOString().slice(0, 10)}`,
          src: "_paycheckB",
          label: `Bi-weekly - ${cursor.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
          amount: base,
          holidayCount: 0,
        });
      }
      cursor.setDate(cursor.getDate() + 14);
    }
    return periods;
  };

  const persistIncome = async (updated) => {
    const normalized = normalizeIncomeEntries(updated);
    setIncome(normalized);
    incomeRef.current = normalized;
    // Use ref to avoid stale-closure race with concurrent updateIncomeReceipt calls
    const payload = { entries: normalized, receipts: incomeReceiptsRef.current };
    if (user && !(user.isLocal || isLocalUser)) await saveIncome(user.uid, monthKey, payload, workspaceScope);
    if (user && (user.isLocal || isLocalUser)) localData.saveIncome(user.uid, monthKey, payload);
  };

  const mergeIncomeBySource = (base, additions) => {
    const existingKeys = new Set(normalizeIncomeEntries(base).map((x) => x.src.toLowerCase()));
    const merged = [...normalizeIncomeEntries(base)];
    let added = 0;
    normalizeIncomeEntries(additions).forEach((x) => {
      const key = x.src.toLowerCase();
      if (existingKeys.has(key)) return;
      merged.push(x);
      existingKeys.add(key);
      added += 1;
    });
    return { merged, added };
  };

  const addIncome = async () => {
    if (!+newInc.amt) return;
    const updated = [...normalizeIncomeEntries(income), { src: newInc.src, amt: +newInc.amt }];
    await persistIncome(updated);
    setNewInc({ src: "Other", amt: "" });
    showToast("Income saved");
  };

  const saveCurrentAsIncomeSchedule = async () => {
    const cleaned = normalizeIncomeEntries(income)
      .filter((x) => x.amt > 0)
      .filter((x) => !isSystemIncomeSource(x.src));
    if (!cleaned.length) {
      showToast("Add a recurring income source first", "error");
      return;
    }
    setIncomeTemplates(cleaned);
    await persistUserSettings(customAccounts, userCategories, cleaned, deletedAccountIds);
    showToast("Recurring income saved");
  };

  const applyIncomeSchedule = async () => {
    if (!incomeTemplates.length) {
      showToast("No recurring income saved yet", "error");
      return;
    }
    const { merged, added } = mergeIncomeBySource(income, incomeTemplates);
    if (!added) {
      showToast("Recurring income already exists for this month. Edit individual entries to update amounts.");
      return;
    }
    await persistIncome(merged);
    showToast(`Added ${added} recurring extra${added > 1 ? "s" : ""}`);
  };

  const updateIncomeReceipt = async (periodKey, receivedValue) => {
    const isReceived = receivedValue === "received";
    const nextReceipts = { ...incomeReceiptsRef.current, [periodKey]: isReceived };
    // Update state immediately so the UI reflects the change without waiting for the async save
    setIncomeReceipts(nextReceipts);
    incomeReceiptsRef.current = nextReceipts;
    // Use ref for entries to avoid stale-closure race with concurrent persistIncome calls
    const payload = { entries: normalizeIncomeEntries(incomeRef.current), receipts: nextReceipts };
    if (user && !(user.isLocal || isLocalUser)) await saveIncome(user.uid, monthKey, payload, workspaceScope);
    if (user && (user.isLocal || isLocalUser)) localData.saveIncome(user.uid, monthKey, payload);
    showToast(isReceived ? "Income marked as received" : "Income marked as pending");
  };

  // buildDefaultPlanItems, savePlan, createPlanDraft, removePlan now in usePlans
  // payoffSimulate now imported from utils/payoffEngine
  // persistUserSettings now in useAccounts
  // saveMonthNote, saveAssets, completeOnboarding now in useSettings

  function openBillingPage() {
    navigateTo("billing");
  }

  const startBillingCheckout = async (interval = "monthly") => {
    if (!launchFlags.billingEnabled) {
      showToast("Billing is coming soon. Testers already have full access.");
      return;
    }
    if (!user || user.isLocal || isLocalUser) {
      showToast("Sign in to start billing", "error");
      return;
    }
    try {
      await startStripeCheckout({
        uid: user.uid,
        email: user.email || "",
        interval,
        returnUrl: typeof window !== "undefined" ? window.location.href : "",
      });
    } catch (e) {
      console.error("startBillingCheckout error", e);
      showToast(e?.message || "Could not open checkout", "error");
    }
  };

  const manageBilling = async () => {
    if (!launchFlags.billingEnabled) {
      showToast("Billing is coming soon. Testers already have full access.");
      return;
    }
    if (!user || user.isLocal || isLocalUser) {
      showToast("Sign in to manage billing", "error");
      return;
    }
    try {
      await openBillingPortal({
        uid: user.uid,
        email: user.email || "",
        returnUrl: typeof window !== "undefined" ? window.location.href : "",
      });
    } catch (e) {
      console.error("manageBilling error", e);
      showToast(e?.message || "Could not open billing", "error");
    }
  };

  const handleApproveHouseholdRequest = async (requestUserId) => {
    if (!activeHouseholdId || !user) {
      console.warn("handleApproveHouseholdRequest: missing activeHouseholdId or user", {
        activeHouseholdId,
        userId: user?.uid,
      });
      return;
    }
    if (subscription.billingEnabled && !subscription.premium && subscription.memberLimitReached) {
      console.warn("handleApproveHouseholdRequest: member limit reached", {
        billingEnabled: subscription.billingEnabled,
        premium: subscription.premium,
        memberLimitReached: subscription.memberLimitReached,
        memberCount: subscription.memberCount,
        limit: subscription.limits?.householdMembers,
      });
      showToast("Unlock shared progress to add more people", "error");
      openBillingPage();
      return;
    }
    try {
      await approveHouseholdRequestAction(requestUserId);
    } catch (e) {
      console.error("handleApproveHouseholdRequest error", e);
      showToast("Could not approve request", "error");
    }
  };

  const handleRejectHouseholdRequest = async (requestUserId) => {
    if (!activeHouseholdId || !user) return;
    try {
      await rejectHouseholdRequestAction(requestUserId);
    } catch (e) {
      console.error("handleRejectHouseholdRequest error", e);
      showToast("Could not reject request", "error");
    }
  };

  const buildAdminBackupPayload = useCallback(() => ({
    scope: "workspace-backup",
    workspaceMode: workspaceMode || (activeHouseholdId ? "household" : "solo"),
    monthKey,
    monthLabel: `${MONTHS[selMonth - 1]} ${selYear}`,
    activeHouseholdId: activeHouseholdId || "",
    householdName: householdProfile?.name || "",
    exportedByLabel: currentUserLabel || user?.email || "Unknown",
    exportedByUid: user?.uid || "",
    settings: {
      schemaVersion: 2,
      customAccounts,
      userCategories,
      incomeTemplates,
      deletedAccountIds,
      accountOverrides,
      reminderPreferences,
      assets,
      monthNotes: { [monthKey]: monthNote || "" },
      paySchedule,
    },
    personalSettings: {
      paySchedule,
    },
    records,
    income,
    incomeReceipts,
    plans: plansRef.current || [],
  }), [
    workspaceMode,
    activeHouseholdId,
    monthKey,
    selMonth,
    selYear,
    householdProfile,
    currentUserLabel,
    user,
    customAccounts,
    userCategories,
    incomeTemplates,
    deletedAccountIds,
    accountOverrides,
    reminderPreferences,
    assets,
    monthNote,
    paySchedule,
    records,
    income,
    incomeReceipts,
  ]);

  const { exportBackup, importBackup, exportAdminBackup, adminBackupLoading } = useBackup({
    user,
    isLocalUser,
    records,
    income,
    monthKey,
    workspaceScope,
    localData,
    backupLoading,
    setBackupLoading,
    setCustomAccounts,
    setUserCategories,
    setIncomeTemplates,
    setDeletedAccountIds,
    setAccountOverrides,
    setAssets,
    setPaySchedule,
    subscription,
    showToast,
    askConfirm,
    openBillingPage,
    canExportAdminBackup: founderAccount || canManageHousehold,
    buildAdminBackupPayload,
  });
  // addCategory, addCustomAccount, deleteAccount, migrateLegacyAccounts,
  // startEditAccount, saveEditAccount now in useAccounts

  const D = theme === "dark";
  const c = useMemo(() => buildPalette(theme), [theme]);
  const isMobile = viewportW < 760;
  const isTablet = viewportW < 1100;
  const safeTop = "env(safe-area-inset-top, 0px)";
  const safeBottom = "env(safe-area-inset-bottom, 0px)";
  const mobileTopChrome = `${mobileChromeHeight}px`;

  const baseAccounts = recordSeedAccounts;
  const allCategories = useMemo(
    () => Array.from(new Set([...CATEGORIES, ...userCategories, ...baseAccounts.map((a) => a.category)])).filter(Boolean),
    [userCategories, baseAccounts]
  );
  const allOwners = useMemo(
    () => [
      "All",
      ...Array.from(
        new Set([
          ...(ownerOptions || []),
          ...baseAccounts.map((account) => String(account?.owner || "").trim()).filter(Boolean),
        ].filter(Boolean))
      ),
    ],
    [ownerOptions, baseAccounts]
  );
  const incomeSources = useMemo(
    () => Array.from(new Set([...incomeTemplates.map((x) => x.src), ...income.map((x) => x.src), "Other"].filter(Boolean))),
    [incomeTemplates, income]
  );
  const isCur = selYear===today.getFullYear() && selMonth===today.getMonth()+1;
  const allAccts = useMemo(() => baseAccounts.map(a => {
    const merged = {
      ...a,
      ...(records[a.id] || defaultRecord(a)),
    };
    const promoMeta = getPromoMeta(merged, selMonth, selYear);
    return withNormalizedBillFields({
      ...merged,
      ...promoMeta,
      cur_bal: getComputedBalance(merged),
      d_left: isCur ? daysLeft(a.due_day, selMonth, selYear) : null,
    });
  }), [baseAccounts, records, selMonth, selYear, isCur]);
  // Update cross-cutting ref so useAccounts' saveEditAccount always sees current allAccts
  allAcctsRef.current = allAccts;
  const { navigateTo, openDueNextView, cmdkResults } = useAppNavigation({
    page,
    setPage,
    setPageVisible,
    pageTransitionRef,
    setDueBanner,
    setShowDueSoon,
    setDueNextTargetId,
    cmdkQuery,
    allAccts,
    founderOpsVisible,
    founderAccount,
    setCmdkOpen,
  });

  const {
    plans,
    planId, setPlanId,
    planName, setPlanName,
    planOwner, setPlanOwner,
    planStrategy, setPlanStrategy,
    planMonthlyExtra, setPlanMonthlyExtra,
    planItems, setPlanItems,
    whatIfExtra, setWhatIfExtra,
    showAllSimRows, setShowAllSimRows,
    planExpanded, setPlanExpanded,
    showStrategyCompare, setShowStrategyCompare,
    goalDate, setGoalDate,
    goalRequiredExtra, setGoalRequiredExtra,
    whatIfExtraTimerRef,
    savePlan,
    saveRawPlan,
    removePlan,
    createPlanDraft,
    buildDefaultPlanItems,
  } = usePlans({
    user,
    isLocalUser,
    activeHouseholdId,
    workspaceScope,
    localData,
    allAccts,
    deletedAccountIds,
    selMonth,
    selYear,
    showToast,
    updateRecord,
  });
  // Keep plansRef current so useHouseholdWorkspace can seed household creation with latest plans
  plansRef.current = plans;

  const {
    showUndoToast,
    closeConfirm,
    openFeedback,
    closeFeedback,
    patchFeedback,
    sendFeedback,
    copyToClipboard,
  } = useAppFeedback({
    user,
    isLocalUser,
    firebaseStatus,
    page,
    showToast,
    setFeedbackError,
    setFeedbackValues,
    setFeedbackOpen,
    feedbackSending,
    setFeedbackSending,
    feedbackValues,
    userProfile,
    workspaceMode,
    setFounderOpsTick,
    confirmState,
    setConfirmState,
    undoTimerRef,
    setUndoStack,
  });
  useEffect(() => {
    if (!activeHouseholdId || !user || user.isLocal || isLocalUser) return;
    const totals = {
      totalBalance: allAccts.reduce((sum, a) => sum + (Number(a.cur_bal) || 0), 0),
      totalMinDue: allAccts.reduce((sum, a) => sum + (Number(a.min_due_v) || Number(a.budgeted_min) || 0), 0),
      paidCount: allAccts.filter((a) => isBillSettledThisCycle(a)).length,
      accountCount: allAccts.length,
      incomeTotal: income.reduce((sum, entry) => sum + (Number(entry.amt) || 0), 0),
    };
    saveHouseholdDashboardSnapshot(activeHouseholdId, monthKey, totals, workspaceScope);
  }, [activeHouseholdId, allAccts, income, monthKey, user, isLocalUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const { notifPermission, requestBillReminderPermission } = useNotificationScheduler({
    reminderPreferences,
    allAccts,
    activeHouseholdId,
    currentUserId: user?.uid || "",
    selMonth,
    selYear,
    subscription,
    showToast,
    openBillingPage,
    billActivity,
  });
  const isNativeApp = typeof window !== "undefined" && Capacitor.isNativePlatform();
  const showMobileActionBar = isMobile && isNativeApp;
  const useDocumentScroll = isMobile && !isNativeApp;
  
  // askConfirm defined near showToast above
  
  const getPrevRecord = useCallback((accountId) => {
    return records[prevMonthKey]?.[accountId] || null;
  }, [records, prevMonthKey]);

  const totalDue  = useMemo(() => allAccts.reduce((s,a) => s+(a.min_due_v||0), 0), [allAccts]);
  const totalPaid = useMemo(() => allAccts.reduce((s,a) => s+(a.paid_v||0), 0), [allAccts]);
  const totalBal  = useMemo(() => allAccts.reduce((s,a) => s+(a.cur_bal||0), 0), [allAccts]);
  const dueSoon   = useMemo(
    () => [...allAccts]
      .filter((a) => isCur && a.d_left != null && a.d_left >= 0 && a.d_left <= 7 && isBillOpenThisCycle(a))
      .sort((a, b) => {
        const dayDelta = Number(a.d_left ?? 999) - Number(b.d_left ?? 999);
        if (dayDelta !== 0) return dayDelta;
        const dueDayDelta = Number(a.due_day ?? 99) - Number(b.due_day ?? 99);
        if (dueDayDelta !== 0) return dueDayDelta;
        return String(a.name || "").localeCompare(String(b.name || ""));
      }),
    [allAccts, isCur]
  );
  const remaining = Math.max(totalDue - totalPaid, 0);
  const reminderProgress = useMemo(() => buildDebtProgressSnapshot({
    accounts: allAccts,
    totalPaid,
    totalDue,
    getPrevRecord,
    payoffSimulate,
    selMonth,
    selYear,
    workspaceMode,
    householdMembers,
  }), [allAccts, totalPaid, totalDue, getPrevRecord, selMonth, selYear, workspaceMode, householdMembers]);
  const reminderMomentum = useMemo(() => buildMomentumSnapshot({
    accounts: allAccts,
    activity: billActivity,
    progress: reminderProgress,
    getPrevRecord,
  }), [allAccts, billActivity, reminderProgress, getPrevRecord]);
  const reminderNextMove = useMemo(() => buildNextMove({
    progress: reminderProgress,
    accounts: allAccts,
    dueSoon,
    getPrevRecord,
    workspaceMode,
    activity: billActivity,
  }), [reminderProgress, allAccts, dueSoon, getPrevRecord, workspaceMode, billActivity]);
  const reminderWeeklySummary = useMemo(() => buildWeeklySummary({
    workspaceMode,
    progress: reminderProgress,
    momentum: reminderMomentum,
    dueSoon,
    activity: billActivity,
  }), [workspaceMode, reminderProgress, reminderMomentum, dueSoon, billActivity]);
  const reminderCheckIn = useMemo(() => buildDailyCheckIn({
    workspaceMode,
    dueSoon,
    progress: reminderProgress,
    nextMove: reminderNextMove,
    momentum: reminderMomentum,
    weeklySummary: reminderWeeklySummary,
    activity: billActivity,
  }), [workspaceMode, dueSoon, reminderProgress, reminderNextMove, reminderMomentum, reminderWeeklySummary, billActivity]);

  useEffect(() => {
    debugDebtCalculation(allAccts, totalBal);
  }, [allAccts, totalBal]);
  // createPaycheckAPeriods/createPaycheckBPeriods close over paySchedule — include those values
  const boaPayPeriods = useMemo(
    () => createPaycheckAPeriods(selMonth, selYear),
    [selMonth, selYear, paySchedule?.paycheckABase, paySchedule?.paycheckAHolidayDelta, paySchedule?.boaBase, paySchedule?.boaHolidayDelta], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const eagleviewPayPeriods = useMemo(
    () => createPaycheckBPeriods(selMonth, selYear),
    [selMonth, selYear, paySchedule?.paycheckBBase, paySchedule?.eagleviewBase], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const recurringPayPeriods = useMemo(
    () => [...boaPayPeriods, ...eagleviewPayPeriods],
    [boaPayPeriods, eagleviewPayPeriods],
  );
  const recurringIncomeEntries = useMemo(
    () => normalizeIncomeEntries([
      ...(boaPayPeriods.length ? [{ src: "_paycheckA", amt: boaPayPeriods.reduce((sum, p) => sum + p.amount, 0) }] : []),
      ...(eagleviewPayPeriods.length ? [{ src: "_paycheckB", amt: eagleviewPayPeriods.reduce((sum, p) => sum + p.amount, 0) }] : []),
      ...incomeTemplates,
    ]),
    [boaPayPeriods, eagleviewPayPeriods, incomeTemplates],
  );
  const manualIncomeEntries = useMemo(
    () => normalizeIncomeEntries(income),
    [income],
  );
  const incomeEntriesForDisplay = useMemo(
    () => [...recurringIncomeEntries, ...manualIncomeEntries],
    [recurringIncomeEntries, manualIncomeEntries],
  );
  const receivedIncomeTotal = useMemo(
    () => recurringPayPeriods.reduce(
      (sum, period) => sum + (incomeReceipts?.[period.key] ? period.amount : 0),
      manualIncomeEntries.reduce((s, e) => s + e.amt, 0),
    ),
    [recurringPayPeriods, incomeReceipts, manualIncomeEntries],
  );
  const weekReference = isCur ? today : new Date(selYear, selMonth - 1, 1);
  const weekAnchor = useMemo(() => {
    const anchor = getStartOfWeek(weekReference);
    anchor.setDate(anchor.getDate() + (dueNextWeekOffset * 7));
    return anchor;
  }, [selMonth, selYear, isCur, dueNextWeekOffset]); // eslint-disable-line react-hooks/exhaustive-deps
  const weekEnd = useMemo(() => {
    const end = new Date(weekAnchor);
    end.setDate(end.getDate() + 6);
    return end;
  }, [weekAnchor]);
  const dueNextBills = useMemo(() => {
    const wYear = weekAnchor.getFullYear();
    const wMonth = weekAnchor.getMonth(); // 0-indexed
    const weekStart = new Date(wYear, wMonth, weekAnchor.getDate());
    return allAccts
      .filter((a) => Number(a.due_day) > 0)
      .map((a) => {
        const d = Number(a.due_day);
        // Try the due day in the anchor month
        const maxDayA = new Date(wYear, wMonth + 1, 0).getDate();
        let dueDate = new Date(wYear, wMonth, Math.min(d, maxDayA));
        // If already before this week's start, roll to next month (same logic as daysLeft)
        if (dueDate < weekStart) {
          const nextMonth = wMonth === 11 ? 0 : wMonth + 1;
          const nextYear = wMonth === 11 ? wYear + 1 : wYear;
          const maxDayN = new Date(nextYear, nextMonth + 1, 0).getDate();
          dueDate = new Date(nextYear, nextMonth, Math.min(d, maxDayN));
        }
        // is_paid reflects the selected month's record — only hide the bill if it was
        // paid in that same month. For cross-month occurrences (e.g. landlord due Apr 1
        // when March is already paid) always show the upcoming bill.
        const dueDateMonth = dueDate.getMonth() + 1; // 1-indexed
        const dueDateYear = dueDate.getFullYear();
        if (isBillSettledThisCycle(a) && dueDateMonth === selMonth && dueDateYear === selYear) return null;
        const daysUntilDue = Math.ceil((dueDate - weekStart) / 86400000);
        return {
          ...a,
          dueDate,
          daysUntilDue,
          dueLabel: dueDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
        };
      })
      .filter((a) => a != null && a.dueDate >= weekStart && a.dueDate <= weekEnd)
      .sort((a, b) => a.dueDate - b.dueDate);
  }, [allAccts, weekAnchor, weekEnd, selMonth, selYear]);
  const dueNextGroups = useMemo(() => dueNextBills.reduce((groups, account) => {
    const key = account.dueDate.toISOString().slice(0, 10);
    if (!groups[key]) groups[key] = { label: account.dueLabel, items: [], categories: {} };
    groups[key].items.push(account);
    if (!groups[key].categories[account.category]) groups[key].categories[account.category] = [];
    groups[key].categories[account.category].push(account);
    return groups;
  }, {}), [dueNextBills]);
  const homeDueBills = useMemo(
    () => [...dueNextBills].sort((a, b) => {
      const dueDateDelta = a.dueDate - b.dueDate;
      if (dueDateDelta !== 0) return dueDateDelta;
      return String(a.name || "").localeCompare(String(b.name || ""));
    }),
    [dueNextBills]
  );
  useEffect(() => {
    if (!dueNextTargetId) return;
    const target = dueNextBills.find((account) => String(account.id) === String(dueNextTargetId));
    if (!target) return;
    const dateKey = target.dueDate.toISOString().slice(0, 10);
    const categoryKey = `${dateKey}::${target.category}`;
    setDueNextExpanded((prev) => ({ ...prev, [dateKey]: true, [categoryKey]: true }));
  }, [dueNextBills, dueNextTargetId]);
  useEffect(() => {
    if (!user || user.isLocal || isLocalUser) return;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    saveReminderSnapshot(user.uid, {
      timezone,
      activeHouseholdId: String(activeHouseholdId || ""),
      workspaceMode,
      monthKey,
      reminderPreferences,
      totals: {
        totalDue,
        totalPaid,
        remaining,
      },
      progress: {
        totalDebtLeft: Number(reminderProgress?.totalDebtLeft || 0),
        totalReduction: Number(reminderProgress?.totalReduction || 0),
        paidThisMonth: Number(reminderProgress?.paidThisMonth || 0),
        totalDue: Number(reminderProgress?.totalDue || 0),
      },
      momentum: reminderMomentum,
      nextMove: reminderNextMove,
      weeklySummary: reminderWeeklySummary,
      dailyCheckIn: reminderCheckIn,
      dueSoon: dueSoon.slice(0, 8).map((account) => ({
        id: String(account.id || ""),
        name: String(account.name || ""),
        d_left: Number(account.d_left ?? 0),
        min_due_v: Number(account.min_due_v ?? account.budgeted_min ?? 0),
      })),
      accounts: allAccts.slice(0, 80).map((account) => ({
        id: String(account.id || ""),
        name: String(account.name || ""),
        owner: String(account.owner || ""),
        billType: String(account.billType || ""),
        startsOverMonthly: account.startsOverMonthly === true,
        due_day: Number(account.due_day || 0),
        d_left: account.d_left == null ? null : Number(account.d_left),
        min_due_v: Number(account.min_due_v ?? account.budgeted_min ?? 0),
        budgeted_min: Number(account.budgeted_min ?? 0),
        paid_v: Number(account.paid_v || 0),
        cur_bal: Number(account.cur_bal || 0),
        is_paid: account.is_paid === true,
      })),
    }).catch((error) => console.error("save reminder snapshot error", error));
  }, [
    user,
    isLocalUser,
    activeHouseholdId,
    workspaceMode,
    monthKey,
    reminderPreferences,
    totalDue,
    totalPaid,
    remaining,
    reminderProgress,
    reminderMomentum,
    reminderNextMove,
    reminderWeeklySummary,
    reminderCheckIn,
    dueSoon,
    allAccts,
  ]);
  const totalInc  = incomeEntriesForDisplay.reduce((s,r) => s+r.amt, 0);
  const netAfterBills = totalInc - totalDue;
  const _netAfterSav   = netAfterBills - SAVINGS_GOAL;
  const { exportAllData, handleUpload } = useAppDataIO({
    user,
    isLocalUser,
    subscription,
    openBillingPage,
    showToast,
    askConfirm,
    founderAccount,
    allAccts,
    selMonth,
    selYear,
    boaPayPeriods,
    eagleviewPayPeriods,
    income,
    monthKey,
    localData,
    workspaceScope,
  });

  // Bound wrappers passed as props to page components (so pages don't need selMonth/selYear)
  const getEffectiveAprCurrent = (a, m = selMonth, y = selYear) => getEffectiveApr(a, m, y);

  const selStyle = {
    width:"100%", padding:"9px 12px", borderRadius:9,
    border:`1.5px solid ${c.border}`, background:c.surf, color:c.tx,
    fontSize:13, fontWeight:500, cursor:"pointer",
    fontFamily:"'Instrument Sans',sans-serif", outline:"none",
    appearance:"auto",
  };
  const lblStyle = {
    fontSize:11, fontWeight:800, letterSpacing:"0.1em",
    textTransform:"uppercase", color:c.muted, marginBottom:6,
    fontFamily:"'Instrument Sans',sans-serif", display:"flex", alignItems:"center", gap:5,
  };
  const inputStyle = {
    width:"100%", padding:"9px 11px", borderRadius:9,
    border:`1.5px solid ${c.border}`, background:c.surf, color:c.tx,
    fontSize:13, fontFamily:"'DM Mono',monospace", outline:"none", boxSizing:"border-box",
  };
  // Primary CTA  -  gradient teal, strong hierarchy
  const saveBtnStyle = {
    width:"100%", padding:"10px 16px", borderRadius:10,
    background:`linear-gradient(135deg, ${c.ac}, ${D?"#00a88a":"#00b396"})`,
    border:"none", color:"#000", fontSize:13, fontWeight:800,
    cursor:"pointer", fontFamily:"'Instrument Sans',sans-serif",
    boxShadow:`0 4px 14px ${c.ac}40`, letterSpacing:"0.02em",
  };
  // Secondary ghost button
  const _ghostBtnStyle = {
    padding:"8px 14px", borderRadius:9,
    border:`1.5px solid ${c.border}`, background:c.surf, color:c.tx2,
    fontSize:12, fontWeight:600, cursor:"pointer",
    fontFamily:"'Instrument Sans',sans-serif",
  };

  // Urgency count for nav badge  -  overdue + due today
  const _navUrgentCount = allAccts.filter((a) => isBillOpenThisCycle(a) && a.d_left != null && a.d_left <= 0).length;

  const mobileActionBarConfig = useMemo(() => {
    if (!isMobile) return { title: "", subtitle: "", actions: [], status: null };

    const status = !isOnline
      ? <span style={{ padding:"5px 8px", borderRadius:999, background:`${c.wa}18`, border:`1px solid ${c.wa}40`, color:c.wa, fontSize:11, fontWeight:800 }}>Offline</span>
      : hasPendingSync
        ? <span style={{ padding:"5px 8px", borderRadius:999, background:c.acD, border:`1px solid ${c.ac}40`, color:c.ac, fontSize:11, fontWeight:800 }}>Syncing</span>
        : null;

    if (page === "overview") {
      return {
        title: "Monthly snapshot",
        subtitle: `${MONTHS[selMonth - 1]} ${selYear} · ${dueSoon.length} due this week`,
        status,
        actions: [
          { label: "Add income", tone: "primary", onClick: () => setShowIncome(true) },
          { label: "Due next", onClick: () => openDueNextView() },
        ],
      };
    }
    if (page === "bills") {
      return {
        title: "",
        subtitle: "",
        status: null,
        actions: [],
      };
    }
    if (page === "payoff") {
      return {
        title: "Payoff planner",
        subtitle: "Tune strategy, compare scenarios, and keep the plan moving.",
        status,
        actions: [
          { label: "Strategy", tone: "primary", onClick: () => setShowStrategyCompare((value) => !value) },
          { label: "This month", onClick: () => navigateTo("overview") },
        ],
      };
    }
    if (page === "insights") {
      return {
        title: "Trends",
        subtitle: "Quick charts and month-to-month patterns.",
        status,
        actions: [
          { label: "History", tone: "primary", onClick: () => navigateTo("history") },
          { label: "Export", onClick: () => exportAllData() },
        ],
      };
    }
    return { title: "", subtitle: "", actions: [], status };
  }, [isMobile, page, isOnline, hasPendingSync, selMonth, selYear, dueSoon.length, allAccts.length, c.wa, c.acD, c.ac]); // eslint-disable-line react-hooks/exhaustive-deps

  const NAV = NAV_ITEMS;


  if (authLoading) return <LoadingScreen label="Checking authentication..." palette={c} />;
  if (loading) return <LoadingScreen label={`Loading ${MONTHS[selMonth-1]} ${selYear} from cloud...`} palette={c} />;


  return (
    <>
      <AppShellStyles c={c} dark={D} />
      <div className="app-shell-scroll" style={{height:useDocumentScroll?"auto":"calc(var(--app-vh, 1vh) * 100)",minHeight:"calc(var(--app-vh, 1vh) * 100)",width:"100%",maxWidth:"100vw",overflowX:"clip",overflowY:useDocumentScroll?"visible":"auto",WebkitOverflowScrolling:"touch",scrollbarWidth:"thin",background:`radial-gradient(1200px 520px at -5% -10%, ${c.acD}, transparent 62%), radial-gradient(900px 420px at 105% 0%, ${c.waD}, transparent 58%), linear-gradient(180deg, ${c.bg}, ${c.bg2})`,color:c.tx,fontFamily:"'Instrument Sans','Inter',sans-serif",transition:"background .2s,color .2s",paddingTop:0,paddingBottom:isMobile?(showMobileActionBar?`calc(${safeBottom} + 190px)`:`calc(${safeBottom} + 104px)`):`calc(${safeBottom} + 8px)`}}>
        <div className="app-shell-page" style={{width:"100%",maxWidth:1400,margin:"0 auto",padding:isMobile?"0 12px 72px":"0 32px 80px",overflowX:"clip"}}>
          <AppChrome
            hasAuthenticatedUser={hasAuthenticatedUser}
            pwaInstalled={pwaInstalled}
            showInstallPrompt={showInstallPrompt}
            returnPrompt={returnPrompt}
            offlineReady={offlineReady}
            installPromptEvent={installPromptEvent}
            handleInstallApp={handleInstallApp}
            dismissInstallPrompt={dismissInstallPrompt}
            patchReminderPreferences={patchReminderPreferences}
            isMobile={isMobile}
            mobileChromeRef={mobileChromeRef}
            c={c}
            safeTop={safeTop}
            today={today}
            isOnline={isOnline}
            hasPendingSync={hasPendingSync}
            isLocalUser={isLocalUser}
            currentUserLabel={currentUserLabel}
            userProfile={userProfile}
            setCmdkOpen={setCmdkOpen}
            setCmdkQuery={setCmdkQuery}
            exportAllData={exportAllData}
            theme={theme}
            setTheme={setTheme}
            user={user}
            setUser={setUser}
            setIsLocalUser={setIsLocalUser}
            showToast={showToast}
            authLoading={authLoading}
            safeBottom={safeBottom}
            mobileTopChrome={mobileTopChrome}
            authMode={authMode}
            handleAuthSubmit={handleAuthSubmit}
            authEmail={authEmail}
            setAuthEmail={setAuthEmail}
            authPass={authPass}
            setAuthPass={setAuthPass}
            showAuthPass={showAuthPass}
            setShowAuthPass={setShowAuthPass}
            firebaseStatus={firebaseStatus}
            authError={authError}
            authResetLoading={authResetLoading}
            handleForgotPassword={handleForgotPassword}
            allowLocalFallbackAuth={allowLocalFallbackAuth}
            setAuthError={setAuthError}
            setAuthMode={setAuthMode}
            NAV={NAV}
            page={page}
            showMoreDrawer={showMoreDrawer}
            setShowMoreDrawer={setShowMoreDrawer}
            navigateTo={navigateTo}
            subscription={subscription}
            openBillingPage={openBillingPage}
            logout={logout}
          />
          <AppAuthenticatedContent
            hasAuthenticatedUser={hasAuthenticatedUser}
            page={page}
            c={c}
            isMobile={isMobile}
            mounted={mounted}
            reducedMotion={reducedMotion}
            pageVisible={pageVisible}
            setPage={setPage}
            selMonth={selMonth}
            setSelMonth={setSelMonth}
            selYear={selYear}
            setSelYear={setSelYear}
            monthKey={monthKey}
            theme={theme}
            user={user}
            isLocalUser={isLocalUser}
            allAccts={allAccts}
            allOwners={allOwners}
            allCategories={allCategories}
            income={income}
            assets={assets}
            subscription={subscription}
            launchFlags={launchFlags}
            workspaceMode={workspaceMode}
            householdProfile={householdProfile}
            householdMembers={householdMembers}
            householdRequests={householdRequests}
            canManageHousehold={canManageHousehold}
            founderOpsVisible={founderOpsVisible}
            founderAccount={founderAccount}
            founderOpsState={founderOpsState}
            founderOpsTick={founderOpsTick}
            currentUserLabel={currentUserLabel}
            userProfile={userProfile}
            currentHouseholdMember={currentHouseholdMember}
            supportEmail={SUPPORT_EMAIL}
            appVersionLabel={APP_VERSION_LABEL}
            today={today}
            currencyCode={currencyCode}
            currencyOptions={CURRENCY_OPTIONS}
            firebaseStatus={firebaseStatus}
            baseAccounts={baseAccounts}
            pwaInstalled={pwaInstalled}
            notifPermission={notifPermission}
            showDueSoon={showDueSoon}
            dueNextSectionRef={dueNextSectionRef}
            lblStyle={lblStyle}
            selStyle={selStyle}
            totalBal={totalBal}
            totalDue={totalDue}
            totalPaid={totalPaid}
            remaining={remaining}
            dueSoon={dueSoon}
            homeDueBills={homeDueBills}
            setShowDueSoon={setShowDueSoon}
            getPrevRecord={getPrevRecord}
            openDueNextView={openDueNextView}
            activeHouseholdId={activeHouseholdId}
            incomingHouseholdInvites={incomingHouseholdInvites}
            handleApproveHouseholdRequest={handleApproveHouseholdRequest}
            handleRejectHouseholdRequest={handleRejectHouseholdRequest}
            handleAcceptHouseholdInvite={handleAcceptHouseholdInvite}
            handleDeclineHouseholdInvite={handleDeclineHouseholdInvite}
            payoffSimulate={payoffSimulate}
            openBillingPage={openBillingPage}
            openFeedback={openFeedback}
            reminderPreferences={reminderPreferences}
            softLaunchState={softLaunchState}
            patchSoftLaunchState={patchSoftLaunchState}
            handleInstallApp={handleInstallApp}
            setHouseholdSetupTab={setHouseholdSetupTab}
            setHouseholdSetupOpen={setHouseholdSetupOpen}
            householdInviteLink={householdInviteLink}
            handleCopyHouseholdInvite={handleCopyHouseholdInvite}
            handleShareHouseholdInvite={handleShareHouseholdInvite}
            totalInc={totalInc}
            receivedIncomeTotal={receivedIncomeTotal}
            netAfterBills={netAfterBills}
            recurringIncomeEntries={recurringIncomeEntries}
            recurringPayPeriods={recurringPayPeriods}
            incomeReceipts={incomeReceipts}
            setShowIncome={setShowIncome}
            dueNextWeekOffset={dueNextWeekOffset}
            setDueNextWeekOffset={setDueNextWeekOffset}
            weekAnchor={weekAnchor}
            weekEnd={weekEnd}
            dueNextBills={dueNextBills}
            dueNextGroups={dueNextGroups}
            dueNextExpanded={dueNextExpanded}
            setDueNextExpanded={setDueNextExpanded}
            dueNextItemRefs={dueNextItemRefs}
            dueNextTargetId={dueNextTargetId}
            markPaid={markPaid}
            acctOwnerF={acctOwnerF}
            setAcctOwnerF={setAcctOwnerF}
            acctCatF={acctCatF}
            setAcctCatF={setAcctCatF}
            acctStatusF={acctStatusF}
            setAcctStatusF={setAcctStatusF}
            acctSearch={acctSearch}
            setAcctSearch={setAcctSearch}
            acctGroupBy={acctGroupBy}
            setAcctGroupBy={setAcctGroupBy}
            inputStyle={inputStyle}
            bulkMode={bulkMode}
            setBulkMode={setBulkMode}
            bulkSelected={bulkSelected}
            setBulkSelected={setBulkSelected}
            acctExpanded={acctExpanded}
            setAcctExpanded={setAcctExpanded}
            swipeState={swipeState}
            setSwipeState={setSwipeState}
            updateRecord={updateRecord}
            showToast={showToast}
            showUndoToast={showUndoToast}
            setEditId={setEditId}
            editId={editId}
            getEffectiveAprCurrent={getEffectiveAprCurrent}
            openEdit={openEdit}
            isTablet={isTablet}
            planOwner={planOwner}
            setPlanOwner={setPlanOwner}
            planItems={planItems}
            setPlanItems={setPlanItems}
            planMonthlyExtra={planMonthlyExtra}
            setPlanMonthlyExtra={setPlanMonthlyExtra}
            whatIfExtra={whatIfExtra}
            setWhatIfExtra={setWhatIfExtra}
            planStrategy={planStrategy}
            setPlanStrategy={setPlanStrategy}
            setPlanId={setPlanId}
            setPlanName={setPlanName}
            planId={planId}
            plans={plans}
            planName={planName}
            setShowStrategyCompare={setShowStrategyCompare}
            showStrategyCompare={showStrategyCompare}
            savePlan={savePlan}
            saveRawPlan={saveRawPlan}
            saveBtnStyle={saveBtnStyle}
            buildDefaultPlanItems={buildDefaultPlanItems}
            createPlanDraft={createPlanDraft}
            removePlan={removePlan}
            setPlanExpanded={setPlanExpanded}
            planExpanded={planExpanded}
            whatIfExtraTimerRef={whatIfExtraTimerRef}
            goalDate={goalDate}
            setGoalDate={setGoalDate}
            goalRequiredExtra={goalRequiredExtra}
            setGoalRequiredExtra={setGoalRequiredExtra}
            showAllSimRows={showAllSimRows}
            setShowAllSimRows={setShowAllSimRows}
            MAX_SIMULATION_MONTHS={MAX_SIMULATION_MONTHS}
            SIM_DISPLAY_ROWS={SIM_DISPLAY_ROWS}
            navigateTo={navigateTo}
            stripeReady={stripeReady}
            startBillingCheckout={startBillingCheckout}
            manageBilling={manageBilling}
            copyToClipboard={copyToClipboard}
            softLaunchSummary={softLaunchSummary}
            requestBillReminderPermission={requestBillReminderPermission}
            preferencesLoading={preferencesLoading}
            patchReminderPreferences={patchReminderPreferences}
            handleUpload={handleUpload}
            ensureLocalUserData={ensureLocalUserData}
            loadUploads={loadUploads}
            workspaceScope={workspaceScope}
            normalizeAprDecimal={normalizeAprDecimal}
            saveCurrencyPreference={saveCurrencyPreference}
            settingsOverviewRef={settingsOverviewRef}
            settingsBillsRef={settingsBillsRef}
            settingsCategoriesRef={settingsCategoriesRef}
            settingsDataRef={settingsDataRef}
            scrollToSettingsSection={scrollToSettingsSection}
            isNativeApp={isNativeApp}
            billActivity={billActivity}
            newCategoryName={newCategoryName}
            setNewCategoryName={setNewCategoryName}
            addCategory={addCategory}
            addBillSectionRef={addBillSectionRef}
            addAcctStep={addAcctStep}
            setAddAcctStep={setAddAcctStep}
            newAcct={newAcct}
            setNewAcct={setNewAcct}
            addCustomAccount={addCustomAccount}
            editingAccountId={editingAccountId}
            setEditingAccountId={setEditingAccountId}
            startEditAccount={startEditAccount}
            deleteAccount={deleteAccount}
            deleteAccounts={deleteAccounts}
            editAcct={editAcct}
            setEditAcct={setEditAcct}
            saveEditAccount={saveEditAccount}
            normalizeMonthInput={normalizeMonthInput}
            handleLeaveHousehold={handleLeaveHousehold}
            handleDeleteHousehold={handleDeleteHouseholdAction}
            handleRemoveHouseholdMember={handleRemoveHouseholdMember}
            handleSetMemberRole={handleSetMemberRole}
            handleSaveHouseholdProfile={handleSaveHouseholdProfile}
            handleInviteHouseholdMemberByUserId={handleInviteHouseholdMemberByUserId}
            pendingHouseholdId={pendingHouseholdId}
            pendingHouseholdName={pendingHouseholdName}
            cancelPendingRequest={cancelPendingRequest}
            handleForgotPassword={handleForgotPassword}
            authEmail={authEmail}
            handleUpdatePassword={handleUpdatePassword}
            handleDeleteAccount={handleDeleteAccountAction}
            passwordUpdateLoading={passwordUpdateLoading}
            saveAssets={saveAssets}
            paySchedule={paySchedule}
              savePaySchedule={savePaySchedule}
              exportBackup={exportBackup}
              backupLoading={backupLoading}
              importBackup={importBackup}
              exportAdminBackup={exportAdminBackup}
              adminBackupLoading={adminBackupLoading}
              buildAutoBalanceUpdates={buildAutoBalanceUpdates}
            dueBanner={dueBanner}
            setDueBanner={setDueBanner}
            onboardingStep={onboardingStep}
            setOnboardingStep={setOnboardingStep}
            completeOnboarding={completeOnboarding}
            householdSetupOpen={householdSetupOpen}
            householdSetupTab={householdSetupTab}
            householdForm={householdForm}
            setHouseholdForm={setHouseholdForm}
            householdActionLoading={householdActionLoading}
            householdSearchLoading={householdSearchLoading}
            householdSearchResults={householdSearchResults}
            clearHouseholdSearchResults={clearHouseholdSearchResults}
            createCurrentHousehold={createCurrentHousehold}
            searchForHouseholds={searchForHouseholds}
            joinSelectedHousehold={joinSelectedHousehold}
            continueSoloMode={continueSoloMode}
          />
        </div>
        <AppOverlays
          hasAuthenticatedUser={hasAuthenticatedUser}
          showMoreDrawer={showMoreDrawer}
          page={page}
          c={c}
          isMobile={isMobile}
          navigateTo={navigateTo}
          founderOpsVisible={founderOpsVisible}
          founderAccount={founderAccount}
          currentUserLabel={currentUserLabel}
          userProfile={userProfile}
          workspaceMode={workspaceMode}
          householdProfile={householdProfile}
          showIncome={showIncome}
          incomeReceipts={incomeReceipts}
          boaPayPeriods={boaPayPeriods}
          eagleviewPayPeriods={eagleviewPayPeriods}
          paySchedule={paySchedule}
          updateIncomeReceipt={updateIncomeReceipt}
          recurringIncomeEntries={recurringIncomeEntries}
          manualIncomeEntries={manualIncomeEntries}
          newInc={newInc}
          setNewInc={setNewInc}
          incomeSources={incomeSources}
          lblStyle={lblStyle}
          selStyle={selStyle}
          inputStyle={inputStyle}
          saveBtnStyle={saveBtnStyle}
          addIncome={addIncome}
          saveCurrentAsIncomeSchedule={saveCurrentAsIncomeSchedule}
          applyIncomeSchedule={applyIncomeSchedule}
          incomeTemplates={incomeTemplates}
          setShowIncome={setShowIncome}
          safeTop={safeTop}
          safeBottom={safeBottom}
          editId={editId}
          allAccts={allAccts}
          theme={theme}
          updateRecord={updateRecord}
          buildAutoBalanceUpdates={buildAutoBalanceUpdates}
          accountOverrides={accountOverrides}
          setAccountOverrides={setAccountOverrides}
          customAccounts={customAccounts}
          userCategories={userCategories}
          setUserCategories={setUserCategories}
          allCategories={allCategories}
          deletedAccountIds={deletedAccountIds}
          showToast={showToast}
          setEditId={setEditId}
          showMobileActionBar={showMobileActionBar}
          mobileActionBarConfig={mobileActionBarConfig}
          NAV={NAV}
          setShowMoreDrawer={setShowMoreDrawer}
          showFilterSheet={showFilterSheet}
          acctOwnerF={acctOwnerF}
          setAcctOwnerF={setAcctOwnerF}
          acctCatF={acctCatF}
          setAcctCatF={setAcctCatF}
          acctStatusF={acctStatusF}
          setAcctStatusF={setAcctStatusF}
          setShowFilterSheet={setShowFilterSheet}
          confirmState={confirmState}
          closeConfirm={closeConfirm}
          feedbackOpen={feedbackOpen}
          feedbackValues={feedbackValues}
          feedbackSending={feedbackSending}
          feedbackError={feedbackError}
          closeFeedback={closeFeedback}
          patchFeedback={patchFeedback}
          sendFeedback={sendFeedback}
          undoStack={undoStack}
          undoTimerRef={undoTimerRef}
          setUndoStack={setUndoStack}
          cmdkOpen={cmdkOpen}
          cmdkQuery={cmdkQuery}
          setCmdkQuery={setCmdkQuery}
          cmdkResults={cmdkResults}
          cmdkInputRef={cmdkInputRef}
          setCmdkOpen={setCmdkOpen}
          toast={toast}
          reducedMotion={reducedMotion}
          onSignOut={async () => {
            if (user?.isLocal || isLocalUser) {
              setUser(null);
              setIsLocalUser(false);
              showToast("Signed out");
            } else {
              try { await logout(); } catch (e) { console.error(e); }
              setUser(null);
              showToast("Signed out");
            }
          }}
        />
    </div>
  </>
  );

}

export default function App() {
  if (getLaunchFlags().trackToZeroV2Enabled) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <TrackToZeroV2App />
      </Suspense>
    );
  }
  return <BudgetApp />;
}
