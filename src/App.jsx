import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Capacitor } from "@capacitor/core";
import {
  getMonthKey, saveRecord,
  subscribeRecords, saveIncome, loadIncome,
  login, signup, logout, saveUpload, getFirebaseStatus,
  loadUploads, loadUserSettings, saveUserSettings,
  loadWorkspaceSettings, saveWorkspaceSettings, subscribeUserWorkspace,
  saveHouseholdDashboardSnapshot
} from "./firebase";
import ProviderMark from "./components/ProviderMark";
import EditPanel from "./components/EditPanel";
import FilterSheet from "./components/overlays/FilterSheet";
import CmdkSearch from "./components/overlays/CmdkSearch";
import EditPanelModal from "./components/overlays/EditPanelModal";
import IncomeModal from "./components/overlays/IncomeModal";
import { MOCK_ACCOUNTS, CATEGORIES, CAT_ICON, MONTHS } from "./data/mockAccounts";
import { fx, pct, TODAY as today, daysLeft, accountViewModel, defaultRecord, normalizeAprDecimal, getBalanceBase, normalizeIncomeEntries, normalizeMonthInput, isSystemIncomeSource, AUTH_TIMEOUT_MS, compareMonthKeys, getBankHolidays, getFridaysInMonth, getFirstFridayOfYear, getStartOfWeek, getPayWeekHolidayCount, getPromoMeta, getEffectiveApr, getComputedBalance, getBadge } from "./utils/budgetUtils";
import { createLocalDataService } from "./services/localDataService";
import TopNav from "./components/app/TopNav";
import MobileBottomNav from "./components/app/MobileBottomNav";
import MobileActionBar from "./components/app/MobileActionBar";
import InstallPromptCard from "./components/app/InstallPromptCard";
import MoreDrawer from "./components/app/MoreDrawer";
import DueSoonBanner from "./components/app/DueSoonBanner";
import LoadingScreen from "./components/feedback/LoadingScreen";
import ConfirmDialog from "./components/feedback/ConfirmDialog";
import UndoToast from "./components/feedback/UndoToast";
import FeedbackModal from "./components/feedback/FeedbackModal";
import AuthModal from "./components/modals/AuthModal";
import HouseholdSetupModal from "./components/modals/HouseholdSetupModal";
import SuccessToast from "./components/ui/SuccessToast";
import LoadingState from "./components/ui/LoadingState";
import BrandLockup from "./components/ui/BrandLockup";
import OverviewPage from "./pages/OverviewPage";
import AccountsPage from "./pages/AccountsPage";
import BillsDashboardPage from "./pages/BillsDashboardPage";
import PayoffPage from "./pages/PayoffPage";
import TrendsPage from "./pages/TrendsPage";
import DueNextPage from "./pages/DueNextPage";
import SettingsPage from "./pages/SettingsPage";
import DashboardPage from "./pages/DashboardPage";
import HistoryPage from "./pages/HistoryPage";
import BillingPage from "./pages/BillingPage";
import NotificationSettingsPage from "./pages/NotificationSettingsPage";
import OnboardingFlow from "./pages/OnboardingFlow";
import BetaHelpPage from "./pages/BetaHelpPage";
import FounderOpsPage from "./pages/FounderOpsPage";
import PrivacySecurityPage from "./pages/PrivacySecurityPage";
import SupportPage from "./pages/SupportPage";
import UploadPage from "./pages/UploadPage";
import { LAUNCH_COPY } from "./config/launchCopy";
import { APP_VERSION_LABEL } from "./config/appMeta";
import { BRAND_NAME } from "./config/brand";
import PageErrorBoundary from "./components/ui/PageErrorBoundary";
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
import { payoffSimulate, MAX_SIMULATION_MONTHS } from "./utils/payoffEngine";
import { isFounderEmail } from "./config/launchFlags";
import { canUseFeature, getUpgradeMessage } from "./utils/planLimits";
import { isStripeReady, openBillingPortal, startStripeCheckout } from "./services/stripeService";
import { buildReturnPrompt } from "./services/retentionService";
import { submitFeedback } from "./services/feedbackService";

const SUPPORT_EMAIL = String((typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPPORT_EMAIL) || LAUNCH_COPY.supportEmailFallback);

const TOAST_DURATION_MS = 2800;
const SAVINGS_GOAL = 2000;
// MAX_SIMULATION_MONTHS now imported from payoffEngine
const SIM_DISPLAY_ROWS = 60;
const EMPTY_STARTER_ACCOUNTS = [];

export default function BudgetApp() {
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
  // plans state now in usePlans (wired below after hook call)
  const [acctSearch, setAcctSearch] = useState("");
  const [acctOwnerF, setAcctOwnerF] = useState("All");
  const [acctCatF, setAcctCatF] = useState("All");
  const [acctStatusF, setAcctStatusF] = useState("All");
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
    const onResize = () => setViewportW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
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
      const nextHeight = Math.ceil(el?.getBoundingClientRect?.().height || 172);
      setMobileChromeHeight((prev) => (Math.abs(prev - nextHeight) > 1 ? nextHeight : prev));
    };
    syncMobileChromeHeight();
    const ro = el && typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncMobileChromeHeight) : null;
    ro?.observe(el);
    window.addEventListener("resize", syncMobileChromeHeight);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", syncMobileChromeHeight);
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
    resolvedHousehold,
    householdInviteLink,
    createCurrentHousehold,
    searchForHouseholds,
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
    handleRemoveHouseholdMember,
  } = useHouseholdWorkspace({
    user,
    userProfile,
    isLocalUser,
    buildHouseholdSeed: buildCurrentHouseholdSeed,
    showToast,
  });
  const activeHouseholdOwnerEmail =
    householdProfile?.activeHousehold?.ownerEmail
    || householdMembers.find((member) => (member?.role || "") === "owner")?.email
    || "";
  const founderOwnedHousehold = isFounderEmail(activeHouseholdOwnerEmail);
  const starterTemplateAccounts = useMemo(
    () => ((launchFlags.starterTemplateEnabled || founderAccount)
      ? MOCK_ACCOUNTS
      : EMPTY_STARTER_ACCOUNTS),
    [launchFlags.starterTemplateEnabled, founderAccount]
  );
  const sharedLegacyAccounts = useMemo(
    () => (
      workspaceMode === "household" && activeHouseholdId && founderOwnedHousehold
        ? MOCK_ACCOUNTS
        : starterTemplateAccounts
    ),
    [workspaceMode, activeHouseholdId, founderOwnedHousehold, starterTemplateAccounts]
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
    monthNote, setMonthNote,
    monthNoteSaved, setMonthNoteSaved,
    onboardingStep, setOnboardingStep,
    onboardingDone: _onboardingDone, setOnboardingDone,
    backupLoading, setBackupLoading,
    saveMonthNote,
    saveAssets,
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

  // Accounts state — customAccounts, categories, overrides, CRUD operations
  const {
    customAccounts, setCustomAccounts,
    userCategories, setUserCategories,
    deletedAccountIds, setDeletedAccountIds,
    accountOverrides, setAccountOverrides,
    incomeTemplates, setIncomeTemplates,
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
    migrateLegacyAccounts,
    startEditAccount,
    saveEditAccount,
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
  });

  useEffect(() => {
    if (page !== "settings" || !showAddAccountForm) return;
    const timer = window.setTimeout(() => {
      addBillSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setShowAddAccountForm(false);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [page, showAddAccountForm]);

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
    records, setRecords,
    income, setIncome,
    incomeReceipts, setIncomeReceipts,
    loading, setLoading,
    mounted, setMounted,
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
  }, [user?.uid, isLocalUser]);

  useEffect(() => {
    setNewAcct((prev) => (prev.owner ? prev : { ...prev, owner: defaultOwnerLabel }));
  }, [defaultOwnerLabel]);

  useEffect(() => {
    if (page === "founder" && !founderOpsVisible) {
      setPage("overview");
    }
  }, [page, founderOpsVisible]);

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
  }, [user, isLocalUser, customAccounts.length]);

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

  // normalizeMonthInput, compareMonthKeys, getPromoMeta, getEffectiveApr now imported from budgetUtils

  const scrollToSettingsSection = (ref) => {
    ref?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // getComputedBalance, updateRecord, buildAutoBalanceUpdates now imported/in hooks

  const markPaid = async (a) => {
    const prevPaid = a.is_paid;
    const newPaid = !a.is_paid;
    await updateRecord(a.id, {
      ...buildAutoBalanceUpdates(a, { paid_v: newPaid ? a.min_due_v : 0 }),
      is_paid: newPaid,
    });
    if (newPaid) showToast(`Saved: ${a.name}`);
    showUndoToast(
      `${a.name} ${newPaid ? "marked paid" : "marked unpaid"}`,
      async () => {
        await updateRecord(a.id, {
          ...buildAutoBalanceUpdates(a, { paid_v: prevPaid ? a.min_due_v : 0 }),
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

  const createBOAPayPeriods = (month, year) => {
    const holidays = getBankHolidays(year);
    const base = Number(paySchedule?.boaBase || 0);
    const delta = Number(paySchedule?.boaHolidayDelta || 0);
    return getFridaysInMonth(month, year).map((payDate, index) => {
      const holidayCount = getPayWeekHolidayCount(payDate, holidays);
      return {
        key: `boa-${payDate.toISOString().slice(0, 10)}`,
        src: "_boa",
        label: `Week ${index + 1} - ${payDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        amount: Math.max(0, base - (holidayCount * delta)),
        holidayCount,
      };
    });
  };

  const createEagleviewPayPeriods = (month, year) => {
    const periods = [];
    const base = Number(paySchedule?.eagleviewBase || 0);
    const cursor = getFirstFridayOfYear(year);
    while (cursor.getFullYear() === year) {
      if (cursor.getMonth() + 1 === month) {
        periods.push({
          key: `eagleview-${cursor.toISOString().slice(0, 10)}`,
          src: "_eagleview",
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

  const openBillingPage = () => navigateTo("billing");

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
    if (!activeHouseholdId || !user) return;
    if (subscription.billingEnabled && !subscription.premium && subscription.memberLimitReached) {
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

  const { exportBackup, importBackup } = useBackup({
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
  });

  // addCategory, addCustomAccount, deleteAccount, migrateLegacyAccounts,
  // startEditAccount, saveEditAccount now in useAccounts

  const exportAllData = () => {
    if (!user) {
      showToast("Sign in first to export", "error");
      return;
    }
    if (!canUseFeature(subscription, "export")) {
      showToast(getUpgradeMessage("export"));
      openBillingPage();
      return;
    }

    const esc = (v) => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    // Sheet 1  -  Accounts
    const acctHeaders = ["Account","Owner","Category","APR %","Current Balance","Min Due","Amount Paid","Paid?","Due Day","Status"];
    const acctRows = allAccts.map(a => [
      a.name,
      a.owner || "",
      a.category || "",
      a.apr_v != null ? (a.apr_v * 100).toFixed(2) : "",
      a.cur_bal != null ? a.cur_bal.toFixed(2) : "",
      a.min_due_v != null ? a.min_due_v.toFixed(2) : "",
      a.paid_v != null ? a.paid_v.toFixed(2) : "",
      a.is_paid ? "Yes" : "No",
      a.due_day || "",
      getBadge(a, selMonth, selYear).label.replace(/[^\w\s.-]/g, "").trim(),
    ]);

    // Sheet 2  -  Income
    const incHeaders = ["Source","Amount","Type"];
    const incRows = [
      ...boaPayPeriods.map(p    => [p.src, p.amount.toFixed(2), "Paycheck"]),
      ...eagleviewPayPeriods.map(p => [p.src, p.amount.toFixed(2), "Paycheck"]),
      ...income.map(e => [e.src, e.amt.toFixed(2), "Other"]),
    ];

    const toCsv = (headers, rows) =>
      [headers, ...rows].map(r => r.map(esc).join(",")).join("\r\n");

    const nl = "\r\n";
    const csv =
      `Budget Export  -  ${MONTHS[selMonth-1]} ${selYear}${nl}` +
      `Exported,${new Date().toLocaleString()}${nl}${nl}` +
      `ACCOUNTS${nl}` +
      toCsv(acctHeaders, acctRows) + nl + nl +
      `INCOME${nl}` +
      toCsv(incHeaders, incRows);

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `budget-${monthKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Exported as CSV");
  };

  const handleUpload = async (upload) => {
    if (!user) return;
    const payload = {
      fileName: upload.fileName || upload.fileName,
      type: upload.type || "unknown",
      rows: upload.rows || [],
      parsed: upload.parsed || null,
      uploader: user.email || user.uid,
    };
    if (user.isLocal || isLocalUser) {
      localData.saveUpload(user.uid, monthKey, payload);
      showToast('Upload saved locally');
    } else {
      try {
        await saveUpload(user.uid, monthKey, payload, workspaceScope);
        showToast('Upload saved');
      } catch (e) {
        console.error('saveUpload error', e);
        showToast('Upload save failed', 'error');
      }
    }
  };

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
  const allOwners = useMemo(() => {
    const opts = Array.from(new Set(baseAccounts.map((a) => a.owner))).filter(Boolean);
    if (!opts.length) opts.push(defaultOwnerLabel);
    return ["All", ...opts];
  }, [baseAccounts, defaultOwnerLabel]);
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
    return {
      ...merged,
      ...promoMeta,
      cur_bal: getComputedBalance(merged),
      d_left: isCur ? daysLeft(a.due_day, selMonth, selYear) : null,
    };
  }), [baseAccounts, records, selMonth, selYear, isCur]); // eslint-disable-line react-hooks/exhaustive-deps
  // Update cross-cutting ref so useAccounts' saveEditAccount always sees current allAccts
  allAcctsRef.current = allAccts;

  const {
    plans, setPlans,
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
  });
  // Keep plansRef current so useHouseholdWorkspace can seed household creation with latest plans
  plansRef.current = plans;

  useEffect(() => {
    if (!activeHouseholdId || !user || user.isLocal || isLocalUser) return;
    const totals = {
      totalBalance: allAccts.reduce((sum, a) => sum + (Number(a.cur_bal) || 0), 0),
      totalMinDue: allAccts.reduce((sum, a) => sum + (Number(a.min_due_v) || Number(a.budgeted_min) || 0), 0),
      paidCount: allAccts.filter((a) => a.is_paid).length,
      accountCount: allAccts.length,
      incomeTotal: income.reduce((sum, entry) => sum + (Number(entry.amt) || 0), 0),
    };
    saveHouseholdDashboardSnapshot(activeHouseholdId, monthKey, totals, workspaceScope);
  }, [activeHouseholdId, allAccts, income, monthKey, user, isLocalUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const { notifPermission, requestBillReminderPermission } = useNotificationScheduler({
    reminderPreferences,
    allAccts,
    selMonth,
    selYear,
    subscription,
    showToast,
    openBillingPage,
  });
  const isNativeApp = typeof window !== "undefined" && Capacitor.isNativePlatform();
  const showMobileActionBar = isMobile && isNativeApp;
  
  // Ctrl+K search results
  const cmdkResults = useMemo(() => {
    if (cmdkQuery.trim().length < 1) return [];
    const q = cmdkQuery.toLowerCase();
    const acctMatches = allAccts
      .filter(a => [a.name, a.bank, a.category, a.owner].some(f => (f||"").toLowerCase().includes(q)))
      .slice(0, 6)
      .map(a => ({ type:"account", label: a.name, sub: `${a.owner} • ${a.category} • ${fx(a.cur_bal)}`, id: a.id, action: () => { navigateTo("bills"); setCmdkOpen(false); } }));
    const navPages = [
      { id:"overview", label:"Overview", icon:"◫" },
      { id:"bills", label:"Bills", icon:"▣" },
      { id:"payoff", label:"Payoff Planner", icon:"📈" },
      { id:"insights", label:"Trends", icon:"📊" },
      { id:"beta", label:"Beta help", icon:"🛟" },
      ...(founderOpsVisible ? [{ id:"founder", label:"Founder ops", icon:"🧭" }] : []),
      { id:"privacy", label:"Privacy", icon:"🔒" },
      { id:"support", label:"Help & FAQ", icon:"❓" },
      { id:"billing", label:"Billing", icon:"✦" },
      { id:"notifications", label:"Notifications", icon:"🔔" },
      { id:"upload", label:"Import", icon:"↑" },
      { id:"history", label:"History", icon:"🕐" },
      { id:"settings", label:"Settings", icon:"⚙" },
    ].filter(p => p.label.toLowerCase().includes(q))
     .map(p => ({ type:"page", label: p.label, sub: "Navigate", icon: p.icon, action: () => { navigateTo(p.id); setCmdkOpen(false); } }));
    return [...navPages, ...acctMatches];
  }, [cmdkQuery, allAccts, founderOpsVisible]); // eslint-disable-line react-hooks/exhaustive-deps
  
  const showUndoToast = (label, restoreFn) => {
    clearTimeout(undoTimerRef.current);
    setUndoStack({ label, restore: restoreFn });
    undoTimerRef.current = setTimeout(() => setUndoStack(null), 5000);
  };

  // askConfirm defined near showToast above

  const closeConfirm = (confirmed) => {
    if (confirmState?.resolve) confirmState.resolve(confirmed);
    setConfirmState(null);
  };
  const openFeedback = (pageName = page) => {
    if (!user || user.isLocal || isLocalUser) {
      showToast("Sign in to send feedback", "error");
      return;
    }
    if (!firebaseStatus.configured) {
      showToast("Feedback is coming soon in this build");
      return;
    }
    setFeedbackError("");
    setFeedbackValues({
      page: String(pageName || page || "overview"),
      category: "confusing",
      rating: null,
      message: "",
      whatConfused: "",
      whatHelped: "",
      whatShouldChange: "",
    });
    setFeedbackOpen(true);
  };
  const closeFeedback = () => {
    if (feedbackSending) return;
    setFeedbackOpen(false);
    setFeedbackError("");
  };
  const patchFeedback = (field, value) => {
    setFeedbackValues((current) => ({ ...current, [field]: value }));
  };
  const sendFeedback = async () => {
    if (feedbackSending) return;
    setFeedbackError("");
    setFeedbackSending(true);
    try {
      await submitFeedback({
        user,
        userProfile,
        page: feedbackValues.page,
        category: feedbackValues.category,
        rating: feedbackValues.rating,
        message: feedbackValues.message,
        whatConfused: feedbackValues.whatConfused,
        whatHelped: feedbackValues.whatHelped,
        whatShouldChange: feedbackValues.whatShouldChange,
        workspaceMode,
      });
      setFeedbackOpen(false);
      setFounderOpsTick((value) => value + 1);
      showToast("Thanks. Feedback sent.");
    } catch (e) {
      console.error("sendFeedback error", e);
      setFeedbackError(e?.message || "Could not send feedback right now.");
    } finally {
      setFeedbackSending(false);
    }
  };
  const copyToClipboard = async (value, successLabel = "Copied") => {
    const text = String(value || "").trim();
    if (!text) {
      showToast("Nothing to copy", "error");
      return false;
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const input = document.createElement("textarea");
        input.value = text;
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.focus();
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      showToast(successLabel);
      return true;
    } catch (e) {
      console.error("copyToClipboard error", e);
      showToast("Could not copy right now", "error");
      return false;
    }
  };
  
  const navigateTo = (newPage) => {
    if (newPage === page) return;
    setPageVisible(false);
    clearTimeout(pageTransitionRef.current);
    pageTransitionRef.current = setTimeout(() => {
      setPage(newPage);
      setPageVisible(true);
    }, 100);
  };
  const getPrevRecord = (accountId) => {
    return records[prevMonthKey]?.[accountId] || null;
  };
  const openDueNextView = (accountId = null) => {
    setDueBanner(false);
    setShowDueSoon(true);
    setDueNextTargetId(accountId);
    if (page !== "overview") navigateTo("overview");
  };

  const totalDue  = useMemo(() => allAccts.reduce((s,a) => s+(a.min_due_v||0), 0), [allAccts]);
  const totalPaid = useMemo(() => allAccts.reduce((s,a) => s+(a.paid_v||0), 0), [allAccts]);
  const totalBal  = useMemo(() => allAccts.reduce((s,a) => s+(a.cur_bal||0), 0), [allAccts]);
  const nPaid     = useMemo(() => allAccts.filter(a => a.is_paid).length, [allAccts]);
  const dueSoon   = useMemo(() => allAccts.filter(a => isCur&&a.d_left!=null&&a.d_left>=0&&a.d_left<=7&&!a.is_paid), [allAccts, isCur]);
  const remaining = Math.max(totalDue - totalPaid, 0);
  const bankHolidays = useMemo(() => getBankHolidays(selYear), [selYear]);
  const selectedMonthBankHolidays = useMemo(() => bankHolidays.filter((holiday) => holiday.date.getMonth() + 1 === selMonth), [bankHolidays, selMonth]);
  // createBOAPayPeriods/createEagleviewPayPeriods close over paySchedule — include those values
  const boaPayPeriods = useMemo(
    () => createBOAPayPeriods(selMonth, selYear),
    [selMonth, selYear, paySchedule?.boaBase, paySchedule?.boaHolidayDelta], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const eagleviewPayPeriods = useMemo(
    () => createEagleviewPayPeriods(selMonth, selYear),
    [selMonth, selYear, paySchedule?.eagleviewBase], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const recurringPayPeriods = useMemo(
    () => [...boaPayPeriods, ...eagleviewPayPeriods],
    [boaPayPeriods, eagleviewPayPeriods],
  );
  const recurringIncomeEntries = useMemo(
    () => normalizeIncomeEntries([
      { src: "_boa", amt: boaPayPeriods.reduce((sum, p) => sum + p.amount, 0) },
      { src: "_eagleview", amt: eagleviewPayPeriods.reduce((sum, p) => sum + p.amount, 0) },
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
        if (a.is_paid && dueDateMonth === selMonth && dueDateYear === selYear) return null;
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
  useEffect(() => {
    if (!dueNextTargetId) return;
    const target = dueNextBills.find((account) => String(account.id) === String(dueNextTargetId));
    if (!target) return;
    const dateKey = target.dueDate.toISOString().slice(0, 10);
    const categoryKey = `${dateKey}::${target.category}`;
    setDueNextExpanded((prev) => ({ ...prev, [dateKey]: true, [categoryKey]: true }));
  }, [dueNextBills, dueNextTargetId]);
  const totalInc  = incomeEntriesForDisplay.reduce((s,r) => s+r.amt, 0);
  const netAfterBills = totalInc - totalDue;
  const _netAfterSav   = netAfterBills - SAVINGS_GOAL;

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
  const _navUrgentCount = allAccts.filter(a => !a.is_paid && a.d_left != null && a.d_left <= 0).length;

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
      <style>{`
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        html, body, #root { width:100%; min-height:100vh; }
        body {
          background:
            radial-gradient(1400px 700px at -8% -12%, ${c.acD}, transparent 58%),
            radial-gradient(1000px 600px at 108% 2%, ${c.waD}, transparent 52%),
            radial-gradient(700px 400px at 50% 100%, ${D?"rgba(0,201,167,.10)":"rgba(24,167,225,.12)"}, transparent 70%),
            linear-gradient(180deg, ${c.bg}, ${c.bg2});
        }
        input[type=number]::-webkit-inner-spin-button { opacity:.4; }
        select option { background:${c.surf}; color:${c.tx}; }
        input, select, button, textarea { transition: border-color .15s, box-shadow .15s, background .15s, color .15s !important; }

        /* Focus rings  -  keyboard accessible + visually elite */
        input:focus-visible, select:focus-visible, button:focus-visible, textarea:focus-visible {
          outline: none !important;
          box-shadow: 0 0 0 3px ${c.acD}, 0 0 0 1.5px ${c.ac} !important;
        }
        select:focus { outline: none !important; box-shadow: 0 0 0 3px ${c.acD}, 0 0 0 1.5px ${c.ac} !important; }
        input:focus  { outline: none !important; box-shadow: 0 0 0 3px ${c.acD}, 0 0 0 1.5px ${c.ac} !important; }
        input:hover:not(:focus), select:hover:not(:focus) { border-color: ${c.border2} !important; }

        @keyframes slideUp   { from{transform:translateX(-50%) translateY(20px);opacity:0} to{transform:translateX(-50%) translateY(0);opacity:1} }
        @keyframes fadeInUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shimmer   { 0%{transform:translateX(-100%)} 100%{transform:translateX(250%)} }
        @keyframes spin      { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes urgentPulse { 0%,100%{box-shadow:0 0 0 0 ${c.da}55} 50%{box-shadow:0 0 0 6px ${c.da}00} }
        @keyframes todayPulse  { 0%,100%{box-shadow:0 0 0 0 ${c.wa}66} 50%{box-shadow:0 0 0 7px ${c.wa}00} }
        @keyframes overduePulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(212,40,40,0); }
          50% { box-shadow: 0 0 0 6px rgba(212,40,40,0.2); }
        }
        @keyframes toastIn   { from{transform:translateX(-50%) translateY(24px) scale(.94);opacity:0} to{transform:translateX(-50%) translateY(0) scale(1);opacity:1} }
        @keyframes riseFade  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes softGlow  { 0%{box-shadow:0 0 0 rgba(0,0,0,0)} 100%{box-shadow:0 16px 32px rgba(0,0,0,0.12)} }
        @keyframes badgePop  { 0%{transform:scale(.85)} 60%{transform:scale(1.08)} 100%{transform:scale(1)} }
        @keyframes pageIn    { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pageOut   { from { opacity: 1; } to { opacity: 0; } }

        /* KPI cards */
        .kpi-card { animation: fadeInUp .36s cubic-bezier(.34,1.56,.64,1) both; transition: transform .2s, box-shadow .2s !important; cursor:default; }
        .kpi-card:hover { transform: translateY(-5px) scale(1.015) !important; box-shadow: 0 24px 48px rgba(0,201,167,.18), 0 4px 18px rgba(0,0,0,.14) !important; }

        /* Bill cards */
        .bill-card { position:relative; overflow:hidden; transition: transform .17s, box-shadow .17s !important; }
        .bill-card::after { content:""; position:absolute; inset:0; border-radius:inherit; opacity:0; background:linear-gradient(135deg, ${c.acD} 0%, transparent 55%); transition:opacity .22s; pointer-events:none; }
        .bill-card:hover { transform: translateY(-3px); box-shadow: 0 0 0 1.5px ${c.ac}80, 0 18px 40px ${c.ac}28 !important; }
        .bill-card:hover::after { opacity:1; }

        /* Overdue  -  red pulse */
        .bill-overdue { animation: overduePulse 1.6s infinite; }
        /* Due today  -  amber pulse */
        .bill-today   { animation: todayPulse 2.2s ease-in-out infinite; }

        /* Mark paid toggle */
        .mark-toggle { border-radius:8px; transition: background .15s !important; }
        .mark-toggle:hover { background: ${c.acD} !important; }
        .mark-toggle:hover .mark-box { border-color: ${c.ac} !important; box-shadow: 0 0 0 3px ${c.acD}; background:${c.acD} !important; }
        .mark-toggle:hover span { color: ${c.ac} !important; }

        /* Edit / action buttons */
        .edit-action { transition: all .15s !important; }
        .edit-action:hover { border-color: ${c.ac} !important; color: ${c.ac} !important; background: ${c.acD} !important; transform:translateY(-1px); box-shadow:0 4px 12px ${c.ac}22; }

        /* Navigation */
        .nav-btn { position:relative; transition: all .2s cubic-bezier(.4,0,.2,1) !important; overflow:hidden; }
        .nav-btn::before { content:""; position:absolute; inset:0; opacity:0; background:linear-gradient(180deg, ${c.ac}18, transparent); transition:opacity .2s; pointer-events:none; border-radius:inherit; }
        .nav-btn::after  { content:""; position:absolute; bottom:0; left:50%; width:0; height:3px; background:linear-gradient(90deg, ${c.ac}, ${c.go}); border-radius:99px 99px 0 0; transform:translateX(-50%); transition:width .25s cubic-bezier(.34,1.56,.64,1); }
        .nav-btn.active::after  { width:60%; }
        .nav-btn.active::before { opacity:1; }
        .nav-btn:not(.active):hover { color:${c.tx} !important; background:${c.surf} !important; border-color:${c.border2} !important; }
        .nav-btn:not(.active):hover::before { opacity:.5; }
        .top-nav { -ms-overflow-style:none; scrollbar-width:none; }
        .top-nav::-webkit-scrollbar { display:none; width:0; height:0; }

        /* Nav urgency badge */
        .nav-urgent { display:inline-flex; align-items:center; justify-content:center; min-width:17px; height:17px; padding:0 4px; border-radius:99px; background:${c.da}; color:#fff; font-size:9px; font-weight:800; margin-left:5px; vertical-align:middle; animation: badgePop .4s cubic-bezier(.34,1.56,.64,1); }

        /* Progress bar */
        .progress-fill { position:relative; overflow:hidden; }
        .progress-fill::after { content:""; position:absolute; inset:0; background:linear-gradient(90deg, transparent 0%, rgba(255,255,255,.38) 50%, transparent 100%); animation: shimmer 2.6s ease-in-out infinite; }

        /* Category groups */
        .cat-group { transition: box-shadow .18s, transform .18s !important; }
        .cat-group:hover { box-shadow: 0 6px 24px rgba(0,0,0,.1) !important; transform:translateY(-1px); }

        /* Section headings */
        .section-label { display:flex; align-items:center; gap:8px; font-size:10px; font-weight:800; letter-spacing:.1em; text-transform:uppercase; color:${c.muted}; margin-bottom:10px; }
        .section-label::after { content:""; flex:1; height:1px; background:linear-gradient(90deg,${c.border},transparent); border-radius:99px; }

        /* Primary action button */
        .btn-primary { background:linear-gradient(135deg, ${c.ac}, ${D?"#00a88a":"#00b396"}) !important; color:#000 !important; font-weight:800 !important; border:none !important; box-shadow:0 4px 14px ${c.ac}40 !important; transition:all .18s !important; }
        .btn-primary:hover { transform:translateY(-2px) !important; box-shadow:0 8px 22px ${c.ac}55 !important; filter:brightness(1.07); }
        .btn-primary:active { transform:translateY(0) !important; }

        /* Ghost / secondary button */
        .btn-ghost { background:${c.surf} !important; border:1.5px solid ${c.border} !important; color:${c.tx2} !important; transition:all .15s !important; }
        .btn-ghost:hover { border-color:${c.ac} !important; color:${c.ac} !important; background:${c.acD} !important; }

        /* Danger button */
        .btn-danger { background:${c.daD} !important; border:1.5px solid ${c.da} !important; color:${c.da} !important; transition:all .15s !important; }
        .btn-danger:hover { background:${c.da} !important; color:#fff !important; }

        /* Table rows */
        .tbl-row { transition: background .14s !important; cursor:pointer; }
        .tbl-row:hover { background: ${c.surf2} !important; }
        .tbl-row:hover .tbl-name { color:${c.ac} !important; }

        /* Toast */
        .toast-wrap { animation: toastIn .28s cubic-bezier(.34,1.56,.64,1) both; }

        /* Scrollbars */
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:${c.border2}; border-radius:99px; }
        ::-webkit-scrollbar-thumb:hover { background:${c.ac}; }

        /* Smooth color-scheme transitions */
        * { transition: background-color .18s, border-color .18s, color .18s; }
        img, svg, canvas, video { transition: none !important; }

        /* Mobile WebView fixes */
        * { -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; }
        input, select, textarea { -webkit-appearance: none; appearance: none; font-size: 16px !important; }
        button { -webkit-appearance: none; cursor: pointer; }
        ::-webkit-scrollbar { display: none; }
        .scroll-x { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      `}</style>
      <div className="app-shell-scroll" style={{minHeight:"100vh",width:"100%",background:`radial-gradient(1200px 520px at -5% -10%, ${c.acD}, transparent 62%), radial-gradient(900px 420px at 105% 0%, ${c.waD}, transparent 58%), linear-gradient(180deg, ${c.bg}, ${c.bg2})`,color:c.tx,fontFamily:"'Instrument Sans','Inter',sans-serif",transition:"background .2s,color .2s",paddingTop:isMobile?`calc(${safeTop} + 4px)`:0,paddingBottom:isMobile?(showMobileActionBar?`calc(${safeBottom} + 190px)`:`calc(${safeBottom} + 104px)`):`calc(${safeBottom} + 8px)`}}>
        <div className="app-shell-page" style={{width:"100%",maxWidth:1400,margin:"0 auto",padding:isMobile?"0 12px 72px":"0 32px 80px"}}>
          {hasAuthenticatedUser && !pwaInstalled && (showInstallPrompt || (!!returnPrompt && offlineReady)) && (
            <InstallPromptCard
              palette={c}
              visible={showInstallPrompt && !!installPromptEvent}
              offlineReady={offlineReady}
              onInstall={handleInstallApp}
              onDismiss={() => {
                dismissInstallPrompt();
                patchReminderPreferences({ installNudgesDismissed: true });
              }}
            />
          )}
          <div ref={isMobile ? mobileChromeRef : null} style={isMobile
            ? {position:"fixed",top:0,left:0,right:0,zIndex:140,background:`linear-gradient(180deg, ${c.bg}F2 0%, ${c.bg}E8 72%, ${c.bg}00 100%)`,backdropFilter:"blur(10px)",padding:`calc(${safeTop} + 4px) 10px 6px`,borderBottom:`1px solid ${c.border}`,pointerEvents:"none"}
            : {position:"sticky",top:`calc(${safeTop} + 0px)`,zIndex:20,background:`linear-gradient(180deg, ${c.bg}EE 0%, ${c.bg}D8 65%, transparent 100%)`,backdropFilter:"blur(8px)",paddingBottom:8,marginBottom:6,pointerEvents:"none"}
          }>
          <div style={{display:"flex",alignItems:isMobile?"flex-start":"center",justifyContent:"space-between",padding:isMobile ? "10px 0 9px" : "18px 0 14px",borderBottom:`1px solid ${c.border}`,marginBottom:isMobile?4:6,background:`linear-gradient(90deg, ${c.acD}, transparent 46%, ${c.waD})`,borderRadius:12,paddingLeft:isMobile?10:14,paddingRight:isMobile?10:14,gap:isMobile?10:12,flexWrap:isMobile?"wrap":"nowrap",pointerEvents:"auto"}}>
            <div style={{display:"flex",alignItems:isMobile?"flex-start":"baseline",gap:8,flexWrap:"wrap"}}>
              <BrandLockup size={isMobile ? "sm" : "md"} />
              <span style={{fontSize:isMobile?10:13,color:c.muted,marginLeft:isMobile?0:10,fontWeight:400}}>
                {today.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}
              </span>
              {!isOnline ? (
                <span style={{ fontSize:11, fontWeight:700, color:c.wa, background:`${c.wa}18`, border:`1px solid ${c.wa}40`, borderRadius:99, padding:"3px 10px", display:"inline-flex", alignItems:"center", gap:5, marginLeft:6 }}>
                  <span style={{ width:6, height:6, borderRadius:"50%", background:c.wa, display:"inline-block" }}/>
                  Offline
                </span>
              ) : hasPendingSync ? (
                <span style={{ fontSize:11, fontWeight:700, color:c.ac, background:c.acD, border:`1px solid ${c.ac}40`, borderRadius:99, padding:"3px 10px", display:"inline-flex", alignItems:"center", gap:5, marginLeft:6 }}>
                  <span style={{ width:6, height:6, borderRadius:"50%", background:c.ac, display:"inline-block", animation:"spin 1s linear infinite" }}/>
                  Syncing...
                </span>
              ) : isLocalUser ? (
                <span style={{ fontSize:11, fontWeight:600, color:c.muted, background:c.surf2, border:`1px solid ${c.border}`, borderRadius:99, padding:"3px 10px", marginLeft:6 }}>
                  Local
                </span>
              ) : (
                <span style={{ fontSize:11, fontWeight:600, color:c.go, background:`${c.go}12`, border:`1px solid ${c.go}40`, borderRadius:99, padding:"3px 10px", display:"inline-flex", alignItems:"center", gap:5, marginLeft:6 }}>
                  <span style={{ width:6, height:6, borderRadius:"50%", background:c.go, display:"inline-block" }}/>
                  Live
                </span>
              )}
            </div>
            <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"nowrap",overflowX:isMobile?"auto":"visible",width:isMobile?"100%":"auto",justifyContent:isMobile?"flex-start":"flex-end",paddingBottom:isMobile?2:0}}>
              {hasAuthenticatedUser && (
                <>
                  <button onClick={() => { setCmdkOpen(true); setCmdkQuery(""); }}
                    title="Search (Ctrl+K)"
                    style={{ padding:isMobile ? "9px 12px" : "6px 8px", borderRadius:7, border:`1.5px solid ${c.border2}`, background:"transparent", color:c.tx2, cursor:"pointer", display:"flex", alignItems:"center", gap:5, fontSize:12, flexShrink:0 }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/><path d="M9.5 9.5l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                    {!isMobile && <span>Ctrl+K</span>}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={exportAllData}
                    title="Download all your data as JSON"
                    style={{padding:isMobile?"9px 12px":"7px 13px",borderRadius:9,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Instrument Sans',sans-serif",display:"flex",alignItems:"center",gap:5,flexShrink:0,whiteSpace:"nowrap"}}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Export
                  </button>
                </>
              )}
              <button
                className="btn-ghost"
                style={{padding:isMobile?"9px 12px":"7px 13px",borderRadius:9,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Instrument Sans',sans-serif",display:"flex",alignItems:"center",gap:5,flexShrink:0,whiteSpace:"nowrap"}}
                onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
                title="Toggle light / dark mode"
              >
                {theme==="dark"
                  ? <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> Light</>
                  : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> Dark</>
                }
              </button>
              {hasAuthenticatedUser && (
                <button
                  className="btn-ghost"
                  onClick={async()=>{
                    if (user.isLocal || isLocalUser) {
                      setUser(null); setIsLocalUser(false); showToast('Signed out');
                    } else {
                      try { await logout(); setUser(null); showToast('Signed out'); } catch(e){ console.error(e); setUser(null); showToast('Signed out'); }
                    }
                  }}
                  style={{padding:isMobile?"9px 12px":"7px 13px",borderRadius:9,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Instrument Sans',sans-serif",display:"flex",alignItems:"center",gap:5,flexShrink:0,whiteSpace:"nowrap"}}
                  title="Sign out of your account"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  Sign out
                </button>
              )}
            </div>
          </div>
          <AuthModal
            authLoading={authLoading}
            user={user}
            isMobile={isMobile}
            safeTop={safeTop}
            safeBottom={safeBottom}
            mobileTopChrome={mobileTopChrome}
            palette={c}
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
            localFallbackEnabled={allowLocalFallbackAuth}
            setAuthMode={(updater) => {
              setAuthError(null);
              setAuthMode(updater);
            }}
          />
          {hasAuthenticatedUser && !isMobile && (
            <div style={{ pointerEvents:"auto" }}>
              <TopNav
                navItems={NAV}
                page={page}
                palette={c}
                isMobile={isMobile}
                showMoreDrawer={showMoreDrawer}
                setShowMoreDrawer={setShowMoreDrawer}
                navigateTo={navigateTo}
                subscription={subscription}
                onOpenBilling={openBillingPage}
              />
            </div>
          )}
          {hasAuthenticatedUser && (
            <>
              <div
                style={{
                  paddingTop: isMobile ? `calc(${mobileTopChrome} + 12px)` : 0,
                  position: "relative",
                  zIndex: isMobile ? 1 : 40,
                  isolation: "isolate",
                  pointerEvents: "auto",
                }}
              >
                <div style={{ pointerEvents:"auto" }}>
                  <DueSoonBanner
                    visible={dueBanner}
                    accounts={allAccts}
                    palette={c}
                    onView={openDueNextView}
                    onClose={() => setDueBanner(false)}
                  />
                </div>
                <PageErrorBoundary key={page} palette={c}>
                <div style={{paddingTop:isMobile?12:16, animation: !reducedMotion && pageVisible ? "pageIn 0.24s ease forwards" : "none", opacity: pageVisible ? undefined : 0, position:"relative", zIndex:isMobile?1:40, isolation:"isolate", pointerEvents:"auto"}}>
                {page === "overview" && (
                  <OverviewPage
                    showDueSoon={showDueSoon}
                    dueNextSectionRef={dueNextSectionRef}
                    dashboard={<DashboardPage
                      mounted={mounted} c={c} isMobile={isMobile}
                      selMonth={selMonth} setSelMonth={setSelMonth} selYear={selYear} setSelYear={setSelYear}
                      lblStyle={lblStyle} selStyle={selStyle}
                      totalBal={totalBal} totalDue={totalDue} totalPaid={totalPaid}
                      remaining={remaining} dueSoon={dueSoon}
                      setShowDueSoon={setShowDueSoon} showDueSoon={showDueSoon}
                      allAccts={allAccts} getPrevRecord={getPrevRecord} openDueNextView={openDueNextView}
                      setPage={setPage}
                      workspaceMode={workspaceMode} activeHouseholdId={activeHouseholdId}
                      monthKey={monthKey} householdProfile={householdProfile}
                      householdMembers={householdMembers} householdRequests={householdRequests}
                      canManageHousehold={canManageHousehold}
                      handleApproveHouseholdRequest={handleApproveHouseholdRequest}
                      handleRejectHouseholdRequest={handleRejectHouseholdRequest}
                      payoffSimulate={payoffSimulate} subscription={subscription}
                      openBillingPage={openBillingPage} reducedMotion={reducedMotion}
                      openFeedback={openFeedback} reminderPreferences={reminderPreferences}
                      pwaInstalled={pwaInstalled} launchFlags={launchFlags}
                      softLaunchState={softLaunchState} patchSoftLaunchState={patchSoftLaunchState}
                      onInstallApp={handleInstallApp}
                      onOpenHouseholdSetupCreate={() => { setHouseholdSetupTab("create"); setHouseholdSetupOpen(true); }}
                      onOpenHouseholdSetupJoin={() => { setHouseholdSetupTab("join"); setHouseholdSetupOpen(true); }}
                      householdInviteLink={householdInviteLink}
                      onCopyInvite={handleCopyHouseholdInvite}
                      onShareInvite={handleShareHouseholdInvite}
                      totalInc={totalInc} receivedIncomeTotal={receivedIncomeTotal} netAfterBills={netAfterBills}
                      recurringIncomeEntries={recurringIncomeEntries} recurringPayPeriods={recurringPayPeriods}
                      incomeReceipts={incomeReceipts} setShowIncome={setShowIncome}
                    />}
                    dueNext={<DueNextPage
                      mounted={mounted} c={c} isMobile={isMobile}
                      dueNextWeekOffset={dueNextWeekOffset} setDueNextWeekOffset={setDueNextWeekOffset}
                      weekAnchor={weekAnchor} weekEnd={weekEnd}
                      dueNextBills={dueNextBills} dueNextGroups={dueNextGroups}
                      dueNextExpanded={dueNextExpanded} setDueNextExpanded={setDueNextExpanded}
                      selMonth={selMonth} selYear={selYear}
                      dueNextItemRefs={dueNextItemRefs} dueNextTargetId={dueNextTargetId}
                      markPaid={markPaid}
                    />}
                  />
                )}
                {page === "bills" && <AccountsPage
                  mounted={mounted} c={c} isMobile={isMobile} allAccts={allAccts}
                  acctOwnerF={acctOwnerF} setAcctOwnerF={setAcctOwnerF}
                  acctCatF={acctCatF} setAcctCatF={setAcctCatF}
                  acctStatusF={acctStatusF} setAcctStatusF={setAcctStatusF}
                  acctSearch={acctSearch} setAcctSearch={setAcctSearch}
                  acctGroupBy={acctGroupBy} setAcctGroupBy={setAcctGroupBy}
                  allOwners={allOwners} allCategories={allCategories}
                  inputStyle={inputStyle} selStyle={selStyle}
                  bulkMode={bulkMode} setBulkMode={setBulkMode}
                  bulkSelected={bulkSelected} setBulkSelected={setBulkSelected}
                  openDueNextView={openDueNextView}
                  acctExpanded={acctExpanded} setAcctExpanded={setAcctExpanded}
                  swipeState={swipeState} setSwipeState={setSwipeState}
                  updateRecord={updateRecord} showToast={showToast} showUndoToast={showUndoToast}
                  setEditId={setEditId} editId={editId}
                  getPrevRecord={getPrevRecord} getEffectiveApr={getEffectiveAprCurrent}
                  markPaid={markPaid} openEdit={openEdit} setPage={setPage} theme={theme}
                  buildAutoBalanceUpdates={buildAutoBalanceUpdates}
                />}
                {page === "payoff" && <PayoffPage
                  mounted={mounted} c={c} isMobile={isMobile} isTablet={isTablet}
                  allAccts={allAccts} planOwner={planOwner} setPlanOwner={setPlanOwner}
                  planItems={planItems} setPlanItems={setPlanItems}
                  planMonthlyExtra={planMonthlyExtra} setPlanMonthlyExtra={setPlanMonthlyExtra}
                  whatIfExtra={whatIfExtra} setWhatIfExtra={setWhatIfExtra}
                  planStrategy={planStrategy} setPlanStrategy={setPlanStrategy}
                  payoffSimulate={payoffSimulate} getEffectiveApr={getEffectiveAprCurrent}
                  setPlanId={setPlanId} setPlanName={setPlanName}
                  planId={planId} plans={plans} planName={planName}
                  setShowStrategyCompare={setShowStrategyCompare} showStrategyCompare={showStrategyCompare}
                  lblStyle={lblStyle} selStyle={selStyle} inputStyle={inputStyle}
                  savePlan={savePlan} saveBtnStyle={saveBtnStyle}
                  buildDefaultPlanItems={buildDefaultPlanItems} createPlanDraft={createPlanDraft}
                  removePlan={removePlan} selMonth={selMonth} selYear={selYear}
                  setPlanExpanded={setPlanExpanded} planExpanded={planExpanded}
                  whatIfExtraTimerRef={whatIfExtraTimerRef}
                  goalDate={goalDate} setGoalDate={setGoalDate}
                  goalRequiredExtra={goalRequiredExtra} setGoalRequiredExtra={setGoalRequiredExtra}
                  showAllSimRows={showAllSimRows} setShowAllSimRows={setShowAllSimRows}
                  MAX_SIMULATION_MONTHS={MAX_SIMULATION_MONTHS} SIM_DISPLAY_ROWS={SIM_DISPLAY_ROWS}
                />}
                {page === "insights" && <TrendsPage
                  c={c} isMobile={isMobile} mounted={mounted} allAccts={allAccts}
                  allOwners={allOwners} selMonth={selMonth} selYear={selYear}
                  income={income} assets={assets} setCatF={setAcctCatF} navigateTo={navigateTo}
                />}
                {page === "billing" && <BillingPage
                  mounted={mounted} c={c} isMobile={isMobile}
                  subscription={subscription} stripeReady={stripeReady}
                  onStartCheckout={startBillingCheckout} onManageBilling={manageBilling}
                />}
                {page === "beta" && <BetaHelpPage
                  mounted={mounted} c={c} isMobile={isMobile}
                  appVersionLabel={APP_VERSION_LABEL} billingEnabled={launchFlags.billingEnabled}
                  openFeedback={openFeedback} copyToClipboard={copyToClipboard}
                />}
                {page === "founder" && founderOpsVisible && <FounderOpsPage
                  mounted={mounted} c={c} isMobile={isMobile}
                  appVersionLabel={APP_VERSION_LABEL} supportEmail={SUPPORT_EMAIL}
                  launchFlags={launchFlags} softLaunchSummary={softLaunchSummary}
                  feedbackSentCount={founderOpsState.feedbackSentCount}
                  copyToClipboard={copyToClipboard} founderOpsTick={founderOpsTick}
                />}
                {page === "privacy" && <PrivacySecurityPage mounted={mounted} c={c} isMobile={isMobile} />}
                {page === "support" && <SupportPage
                  mounted={mounted} c={c} isMobile={isMobile}
                  supportEmail={SUPPORT_EMAIL} openFeedback={openFeedback} copyToClipboard={copyToClipboard}
                />}
                {page === "notifications" && <NotificationSettingsPage
                  mounted={mounted} c={c} isMobile={isMobile}
                  notifPermission={notifPermission}
                  requestBillReminderPermission={requestBillReminderPermission}
                  reminderPreferences={reminderPreferences} preferencesLoading={preferencesLoading}
                  patchReminderPreferences={patchReminderPreferences} pwaInstalled={pwaInstalled}
                  subscription={subscription}
                />}
                {page === "upload" && <UploadPage
                  c={c} allAccts={allAccts} monthKey={monthKey} theme={theme}
                  updateRecord={updateRecord} showToast={showToast} handleUpload={handleUpload}
                />}
                {page === "history" && <HistoryPage
                  mounted={mounted} c={c} user={user} isLocalUser={isLocalUser}
                  ensureLocalUserData={ensureLocalUserData} monthKey={monthKey}
                  loadUploads={loadUploads} workspaceScope={workspaceScope}
                  selMonth={selMonth} selYear={selYear}
                  normalizeAprDecimal={normalizeAprDecimal} isMobile={isMobile}
                />}
                {page === "settings" && <SettingsPage
                  mounted={mounted} c={c} isMobile={isMobile}
                  appVersionLabel={APP_VERSION_LABEL} currentUserId={user?.uid || ""}
                  settingsOverviewRef={settingsOverviewRef} settingsBillsRef={settingsBillsRef}
                  settingsCategoriesRef={settingsCategoriesRef} settingsDataRef={settingsDataRef}
                  scrollToSettingsSection={scrollToSettingsSection}
                  householdProfile={householdProfile} workspaceMode={workspaceMode}
                  setHouseholdSetupOpen={setHouseholdSetupOpen} setHouseholdSetupTab={setHouseholdSetupTab}
                  currentHouseholdMember={currentHouseholdMember}
                  householdMembers={householdMembers} householdRequests={householdRequests}
                  userProfile={userProfile} subscription={subscription}
                  openBillingPage={openBillingPage} stripeReady={stripeReady}
                  startBillingCheckout={startBillingCheckout} manageBilling={manageBilling}
                  firebaseStatus={firebaseStatus} baseAccounts={baseAccounts}
                  selMonth={selMonth} selYear={selYear} theme={theme} today={today}
                  isNativeApp={isNativeApp} notifPermission={notifPermission}
                  requestBillReminderPermission={requestBillReminderPermission}
                  openNotificationSettings={() => navigateTo("notifications")}
                  inputStyle={inputStyle} newCategoryName={newCategoryName}
                  setNewCategoryName={setNewCategoryName} addCategory={addCategory}
                  saveBtnStyle={saveBtnStyle} allCategories={allCategories}
                  addBillSectionRef={addBillSectionRef} addAcctStep={addAcctStep}
                  setAddAcctStep={setAddAcctStep} lblStyle={lblStyle}
                  newAcct={newAcct} setNewAcct={setNewAcct} selStyle={selStyle}
                  allOwners={allOwners} showToast={showToast}
                  addCustomAccount={addCustomAccount}
                  editingAccountId={editingAccountId} setEditingAccountId={setEditingAccountId}
                  startEditAccount={startEditAccount} deleteAccount={deleteAccount}
                  editAcct={editAcct} setEditAcct={setEditAcct} saveEditAccount={saveEditAccount}
                  normalizeMonthInput={normalizeMonthInput} normalizeAprDecimal={normalizeAprDecimal}
                  canManageHousehold={canManageHousehold}
                  handleApproveHouseholdRequest={handleApproveHouseholdRequest}
                  handleRejectHouseholdRequest={handleRejectHouseholdRequest}
                  handleLeaveHousehold={handleLeaveHousehold}
                  handleRemoveHouseholdMember={handleRemoveHouseholdMember}
                  householdInviteLink={householdInviteLink}
                  handleSaveHouseholdProfile={handleSaveHouseholdProfile}
                  handleCopyHouseholdInvite={handleCopyHouseholdInvite}
                  handleShareHouseholdInvite={handleShareHouseholdInvite}
                  pendingHouseholdId={pendingHouseholdId}
                  pendingHouseholdName={pendingHouseholdName}
                  cancelPendingRequest={cancelPendingRequest}
                  assets={assets} saveAssets={saveAssets} allAccts={allAccts}
                  paySchedule={paySchedule} savePaySchedule={savePaySchedule}
                  exportBackup={exportBackup} backupLoading={backupLoading}
                  importBackup={importBackup} openFeedback={openFeedback}
                  openPrivacyPage={() => setPage("privacy")}
                  openSupportPage={() => setPage("support")}
                  copyToClipboard={copyToClipboard} softLaunchSummary={softLaunchSummary}
                />}
                </div>
                </PageErrorBoundary>
              </div>
            </>
          )}
        </div>
        {hasAuthenticatedUser && (
          <OnboardingFlow
            c={c}
            isMobile={isMobile}
            step={onboardingStep}
            setStep={setOnboardingStep}
            completeOnboarding={completeOnboarding}
            openSettings={() => {
              navigateTo("settings");
              setOnboardingStep(3);
            }}
          />
        )}
        {hasAuthenticatedUser && user && !(user.isLocal || isLocalUser) && (
          <HouseholdSetupModal
            open={householdSetupOpen}
            palette={c}
            isMobile={isMobile}
            tab={householdSetupTab}
            setTab={setHouseholdSetupTab}
            form={householdForm}
            setForm={setHouseholdForm}
            actionLoading={householdActionLoading}
            searchLoading={householdSearchLoading}
            searchResults={householdSearchResults}
            lblStyle={lblStyle}
            inputStyle={inputStyle}
            selStyle={selStyle}
            onCreate={createCurrentHousehold}
            onSearch={searchForHouseholds}
            onJoin={joinSelectedHousehold}
            onContinueSolo={continueSoloMode}
            onDismiss={() => setHouseholdSetupOpen(false)}
            inviteLink={householdInviteLink}
            onCopyInvite={handleCopyHouseholdInvite}
            onShareInvite={handleShareHouseholdInvite}
          />
        )}
        {hasAuthenticatedUser && (
          <MoreDrawer
            open={showMoreDrawer}
            page={page}
            palette={c}
            isMobile={isMobile}
            onClose={() => setShowMoreDrawer(false)}
            navigateTo={navigateTo}
            founderOpsEnabled={founderOpsVisible}
          />
        )}
        {/* Income Modal */}
        {hasAuthenticatedUser && showIncome && (
          <IncomeModal
            c={c}
            isMobile={isMobile}
            incomeReceipts={incomeReceipts}
            boaPayPeriods={boaPayPeriods}
            eagleviewPayPeriods={eagleviewPayPeriods}
            boaLabel={paySchedule?.boaLabel || "Paycheck A"}
            eagleviewLabel={paySchedule?.eagleviewLabel || "Paycheck B"}
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
            onClose={() => setShowIncome(false)}
          />
        )}
        {/* EditPanel — bottom sheet on mobile, centered modal on desktop */}
        <EditPanelModal
          c={c} isMobile={isMobile} safeBottom={safeBottom}
          editId={editId} allAccts={allAccts} theme={theme}
          updateRecord={updateRecord} buildAutoBalanceUpdates={buildAutoBalanceUpdates}
          accountOverrides={accountOverrides} setAccountOverrides={setAccountOverrides}
          customAccounts={customAccounts}
          userCategories={userCategories} setUserCategories={setUserCategories}
          allCategories={allCategories}
          incomeTemplates={incomeTemplates}
          deletedAccountIds={deletedAccountIds} showToast={showToast}
          onClose={() => setEditId(null)}
        />
        {isMobile && (
          <>
            {showMobileActionBar && (
              <MobileActionBar
                palette={c}
                safeBottom={safeBottom}
                title={mobileActionBarConfig.title}
                subtitle={mobileActionBarConfig.subtitle}
                actions={mobileActionBarConfig.actions}
                status={mobileActionBarConfig.status}
              />
            )}
            <MobileBottomNav
              navItems={NAV}
              page={page}
              palette={c}
              showMoreDrawer={showMoreDrawer}
              setShowMoreDrawer={setShowMoreDrawer}
              navigateTo={navigateTo}
              safeBottom={safeBottom}
            />
          </>
        )}
        {/* Filter Bottom Sheet (mobile) */}
        {isMobile && showFilterSheet && (
          <FilterSheet
            c={c} allAccts={allAccts}
            ownerF={acctOwnerF} setOwnerF={setAcctOwnerF}
            catF={acctCatF} setCatF={setAcctCatF}
            filt={acctStatusF} setFilt={setAcctStatusF}
            FILTERS={["All","Unpaid","Paid"]}
            onClose={() => setShowFilterSheet(false)}
          />
        )}
        <ConfirmDialog state={confirmState} palette={c} isMobile={isMobile} onClose={closeConfirm} />
        <FeedbackModal
          open={feedbackOpen}
          palette={c}
          isMobile={isMobile}
          values={feedbackValues}
          sending={feedbackSending}
          error={feedbackError}
          onClose={closeFeedback}
          onChange={patchFeedback}
          onSubmit={sendFeedback}
        />
        <UndoToast
          undoStack={undoStack}
          palette={c}
          isMobile={isMobile}
          onUndo={() => { undoStack.restore(); setUndoStack(null); clearTimeout(undoTimerRef.current); }}
          onDismiss={() => { setUndoStack(null); clearTimeout(undoTimerRef.current); }}
        />
        {/* Ctrl+K Search */}
        {cmdkOpen && (
          <CmdkSearch
            c={c} isMobile={isMobile}
            cmdkQuery={cmdkQuery} setCmdkQuery={setCmdkQuery}
            cmdkResults={cmdkResults} cmdkInputRef={cmdkInputRef}
            founderOpsVisible={founderOpsVisible}
            navigateTo={navigateTo}
            onClose={() => setCmdkOpen(false)}
          />
        )}
        <SuccessToast toast={toast} palette={c} reducedMotion={reducedMotion} />
      </div>
    </div>
  </>
  );

}
