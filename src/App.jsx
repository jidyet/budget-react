import { useState, useEffect, useCallback, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { lazy, Suspense } from "react";
import { LocalNotifications } from "@capacitor/local-notifications";
import {
  getMonthKey, saveRecord,
  subscribeRecords, saveIncome, loadIncome,
  login, signup, logout, onAuth, saveUpload, getFirebaseStatus,
  loadUploads, loadPayoffPlans, upsertPayoffPlan, deletePayoffPlan, loadUserSettings, saveUserSettings,
  loadWorkspaceSettings, saveWorkspaceSettings, subscribeUserWorkspace,
  createHousehold, continueSoloWorkspace, searchHouseholds, requestJoinHousehold,
  subscribeHouseholdForUser, subscribeHouseholdMembers, subscribeJoinRequests,
  approveJoinRequest, rejectJoinRequest, saveHouseholdDashboardSnapshot,
  saveHouseholdMemberProfile, saveUserProfile, subscribeUserProfile
} from "./firebase";
import ProviderMark from "./components/ProviderMark";
import EditPanel from "./components/EditPanel";
import { MOCK_ACCOUNTS, CATEGORIES, CAT_ICON, MONTHS, FILTERS } from "./data/mockAccounts";
import { fx, pct, TODAY as today, daysLeft, accountViewModel, defaultRecord } from "./utils/budgetUtils";
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
import SuccessToast from "./components/ui/SuccessToast";
import SyncStatusBar from "./components/ui/SyncStatusBar";
import LoadingState from "./components/ui/LoadingState";
import OverviewPage from "./pages/OverviewPage";
import AccountsPage from "./pages/AccountsPage";
import PayoffPage from "./pages/PayoffPage";
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
import HouseholdSetupPage from "./pages/HouseholdSetupPage";
import { buildHouseholdInviteLink } from "./services/householdService";
import { LAUNCH_COPY } from "./config/launchCopy";
import { APP_VERSION_LABEL } from "./config/appMeta";
import useSubscription from "./hooks/useSubscription";
import useInstallPrompt from "./hooks/useInstallPrompt";
import useReminderPreferences from "./hooks/useReminderPreferences";
import useSoftLaunchSupport from "./hooks/useSoftLaunchSupport";
import useReducedMotion from "./hooks/useReducedMotion";
import { canAccessFounderOps, getLaunchFlags } from "./config/launchFlags";
import { canUseFeature, getUpgradeMessage } from "./utils/planLimits";
import { isStripeReady, openBillingPortal, startStripeCheckout } from "./services/stripeService";
import { buildReturnPrompt } from "./services/retentionService";
import { submitFeedback } from "./services/feedbackService";
import { readFounderOpsState } from "./services/founderOpsService";

const StatementUpload = lazy(() => import("./StatementUpload"));
const ExcelImport = lazy(() => import("./ExcelImport"));
const SUPPORT_EMAIL = String((typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPPORT_EMAIL) || LAUNCH_COPY.supportEmailFallback);

const TOAST_DURATION_MS = 2800;
const AUTH_TIMEOUT_MS = 4500;
const SAVINGS_GOAL = 2000;
const MAX_SIMULATION_MONTHS = 240;
const SIM_DISPLAY_ROWS = 60;
const SYSTEM_INCOME_SOURCES = ["BOA", "EAGLEVIEW"];
const EMPTY_STARTER_ACCOUNTS = [];

export default function BudgetApp() {
  const authInProgress = useRef(false);
  const mobileChromeRef = useRef(null);
  const RECURRING_BOA_BASE = 2378.46;
  const RECURRING_BOA_HOLIDAY_DELTA = 422.1;
  const RECURRING_EAGLEVIEW_BASE = 2029.97;
  const [page, setPage]           = useState("overview");
  const [pageVisible, setPageVisible] = useState(true);
  const pageTransitionRef = useRef(null);
  const [theme, setTheme]         = useState("light");
  const [selMonth, setSelMonth]   = useState(today.getMonth()+1);
  const [selYear, setSelYear]     = useState(today.getFullYear());
  const [ownerF, setOwnerF]       = useState("All");
  const [catF, setCatF]           = useState("All");
  const [filt, setFilt]           = useState("All");
  const [records, setRecords]     = useState({});
  const [editId, setEditId]       = useState(null);
  const [editVals, setEditVals]   = useState({});
  const [toast, setToast]         = useState(null);
  const [income, setIncome]       = useState([]);
  const [incomeReceipts, setIncomeReceipts] = useState({});
  const [incomeTemplates, setIncomeTemplates] = useState([]);
  
  const [newInc, setNewInc]       = useState({src:"Other",amt:""});
  const [showIncome, setShowIncome] = useState(false);
  const [uploadTab, setUploadTab]   = useState("excel");
  const [loading, setLoading]     = useState(true);
  const [mounted, setMounted]     = useState(false);

  const monthKey = getMonthKey(selMonth, selYear);
  const prevD = new Date(selYear, selMonth - 2, 1);
  const prevMonthKey = getMonthKey(prevD.getMonth() + 1, prevD.getFullYear());
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [showAuthPass, setShowAuthPass] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [isLocalUser, setIsLocalUser] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState("solo");
  const [activeHouseholdId, setActiveHouseholdId] = useState("");
  const [householdProfile, setHouseholdProfile] = useState({ activeHousehold: null, memberships: [] });
  const [householdMembers, setHouseholdMembers] = useState([]);
  const [householdRequests, setHouseholdRequests] = useState([]);
  const [userProfile, setUserProfile] = useState({});
  const [householdSetupOpen, setHouseholdSetupOpen] = useState(false);
  const [householdSetupTab, setHouseholdSetupTab] = useState("choose");
  const [householdForm, setHouseholdForm] = useState({ name: "", description: "", joinMode: "approval", search: "" });
  const [householdSearchResults, setHouseholdSearchResults] = useState([]);
  const [householdSearchLoading, setHouseholdSearchLoading] = useState(false);
  const [householdActionLoading, setHouseholdActionLoading] = useState(false);
  const workspaceScope = user && !(user.isLocal || isLocalUser) && activeHouseholdId
    ? {
        householdId: activeHouseholdId,
        actorUid: user.uid,
        actorEmail: user.email || "",
        actorName: householdMembers.find((member) => String(member.uid || member.id) === String(user.uid))?.displayName
          || householdMembers.find((member) => String(member.uid || member.id) === String(user.uid))?.label
          || userProfile?.displayName
          || (user.email ? user.email.split("@")[0] : "Member"),
      }
    : null;
  const [plans, setPlans] = useState([]);
  const [planId, setPlanId] = useState("");
  const [planName, setPlanName] = useState("");
  const [planOwner, setPlanOwner] = useState("All");
  const [planStrategy, setPlanStrategy] = useState("avalanche");
  const [planMonthlyExtra, setPlanMonthlyExtra] = useState("0");
  const [planItems, setPlanItems] = useState({});
  const [whatIfExtra, setWhatIfExtra] = useState("0");
  const [showAllSimRows, setShowAllSimRows] = useState(false);
  const [acctSearch, setAcctSearch] = useState("");
  const [acctOwnerF, setAcctOwnerF] = useState("All");
  const [acctCatF, setAcctCatF] = useState("All");
  const [acctStatusF, setAcctStatusF] = useState("All");
  const [acctGroupBy, setAcctGroupBy] = useState("category");
  const [acctExpanded, setAcctExpanded] = useState({});
  const [planExpanded, setPlanExpanded] = useState({});
  const [dashExpanded, setDashExpanded] = useState({});
  const [customAccounts, setCustomAccounts] = useState([]);
  const [userCategories, setUserCategories] = useState([]);
  const [deletedAccountIds, setDeletedAccountIds] = useState([]);
  const [accountOverrides, setAccountOverrides] = useState({});
  const [editingAccountId, setEditingAccountId] = useState(null);
  const [editAcct, setEditAcct] = useState({});
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newAcct, setNewAcct] = useState({
    name: "",
    owner: "",
    bank: "",
    category: "CREDIT CARDS",
    apr: "",
    promoApr: "",
    promoUntil: "",
    aprAfterPromo: "",
    min: "",
    bal: "",
    due: "",
  });
  const [viewportW, setViewportW] = useState(typeof window !== "undefined" ? window.innerWidth : 1280);
  const [mobileChromeHeight, setMobileChromeHeight] = useState(172);
  const settingsOverviewRef = useRef(null);
  const settingsBillsRef = useRef(null);
  const settingsCategoriesRef = useRef(null);
  const settingsDataRef = useRef(null);
  const addBillSectionRef = useRef(null);
  const dueNextSectionRef = useRef(null);
  const dueNextItemRefs = useRef({});
  const whatIfExtraTimerRef = useRef(null);
  const [jumpToAddBill, setJumpToAddBill] = useState(false);
  const [dueNextExpanded, setDueNextExpanded] = useState({});
  const [dueNextWeekOffset, setDueNextWeekOffset] = useState(0);
  const [showMoreDrawer, setShowMoreDrawer] = useState(false);
  const [showDueSoon, setShowDueSoon] = useState(false);
  const [dueNextTargetId, setDueNextTargetId] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
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
  const [showAddAccountForm, setShowAddAccountForm] = useState(false);
  const [swipeState, setSwipeState] = useState({});
  const [addAcctStep, setAddAcctStep] = useState(1);
  const [showStrategyCompare, setShowStrategyCompare] = useState(false);
  const [dueBanner, setDueBanner] = useState(true);
  const [undoStack, setUndoStack] = useState(null);
  const undoTimerRef = useRef(null);
  const [bulkSelected, setBulkSelected] = useState(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [goalDate, setGoalDate] = useState("");
  const [goalRequiredExtra, setGoalRequiredExtra] = useState(null);

  // Feature 1: Ctrl+K Search
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [cmdkQuery, setCmdkQuery] = useState("");
  const cmdkInputRef = useRef(null);

  // Feature 2: Push Notifications
  const [notifPermission, setNotifPermission] = useState("default");
  const isNativeApp = typeof window !== "undefined" && Capacitor.isNativePlatform();

  // Feature 3: Month Notes
  const [monthNote, setMonthNote] = useState("");
  const [monthNoteSaved, setMonthNoteSaved] = useState(false);

  // Feature: Net Worth Tracker
  const [assets, setAssets] = useState(0);

  // Feature: Onboarding Flow
  const [onboardingStep, setOnboardingStep] = useState(0); // 0 = not shown
  const [, setOnboardingDone] = useState(true); // default true, flip on detection

  // Feature: Data Backup & Restore
  const [backupLoading, setBackupLoading] = useState(false);

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

  useEffect(() => {
    const unsub = onAuth((u) => {
      // Mark that Firebase auth has resolved so the local fallback won't also run
      authInProgress.current = true;
      setUser(u);
      // If Firebase provided a real user, force cloud mode.
      if (u && !u.isLocal) setIsLocalUser(false);
      setAuthLoading(false);
    });
    return () => unsub && unsub();
  }, []);

  useEffect(() => {
    const onResize = () => setViewportW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!user || user.isLocal || isLocalUser) {
      setUserProfile({});
      return () => {};
    }
    return subscribeUserProfile(user.uid, (profile) => {
      setUserProfile(profile || {});
    });
  }, [user, isLocalUser]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const joinCode = new URLSearchParams(window.location.search).get("joinCode");
    if (!joinCode) return;
    setHouseholdForm((prev) => ({ ...prev, search: String(joinCode).toUpperCase() }));
    if (user && !(user.isLocal || isLocalUser)) {
      setHouseholdSetupTab("join");
      setHouseholdSetupOpen(true);
    }
  }, [user, isLocalUser]);

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
    let alive = true;
    const syncNotificationPermission = async () => {
      if (typeof window === "undefined") return;
      if (Capacitor.isNativePlatform()) {
        try {
          const perm = await LocalNotifications.checkPermissions();
          if (alive) setNotifPermission(perm.display || "default");
        } catch {
          if (alive) setNotifPermission("default");
        }
        return;
      }
      if (typeof Notification !== "undefined") {
        setNotifPermission(Notification.permission);
        return;
      }
      setNotifPermission("unsupported");
    };
    syncNotificationPermission();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const syncMobileChromeHeight = () => {
      const nextHeight = Math.ceil(mobileChromeRef.current?.getBoundingClientRect?.().height || 172);
      setMobileChromeHeight((prev) => (Math.abs(prev - nextHeight) > 1 ? nextHeight : prev));
    };
    syncMobileChromeHeight();
    window.addEventListener("resize", syncMobileChromeHeight);
    return () => window.removeEventListener("resize", syncMobileChromeHeight);
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
    if (page !== "settings" || !showAddAccountForm) return;
    const timer = window.setTimeout(() => {
      addBillSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setShowAddAccountForm(false);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [page, showAddAccountForm]);

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

  const allowLocalFallbackAuth = Boolean(import.meta.env.DEV);
  const launchFlags = getLaunchFlags();
  const founderOpsState = readFounderOpsState();
  const currentUserLabel =
    (userProfile?.displayName || "").trim()
    || (user?.email ? user.email.split("@")[0] : "")
    || "Me";
  const defaultOwnerLabel = currentUserLabel;
  const founderOpsVisible = canAccessFounderOps(user?.email);
  const activeHouseholdOwnerEmail =
    householdProfile?.activeHousehold?.ownerEmail
    || householdMembers.find((member) => (member?.role || "") === "owner")?.email
    || "";
  const founderOwnedHousehold = canAccessFounderOps(activeHouseholdOwnerEmail);
  const starterTemplateAccounts = (launchFlags.starterTemplateEnabled || founderOpsVisible)
    ? MOCK_ACCOUNTS
    : EMPTY_STARTER_ACCOUNTS;

  const localData = createLocalDataService({
    seedMonthKey: monthKey,
    seedAccounts: starterTemplateAccounts,
    defaultRecord,
  });
  const ensureLocalUserData = localData.ensureLocalUserData;
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
    setRecords({});
    setIncome([]);
    setIncomeReceipts({});
    setPlans([]);
    setCustomAccounts([]);
    setUserCategories([]);
    setDeletedAccountIds([]);
    setAccountOverrides({});
    setWorkspaceMode("solo");
    setActiveHouseholdId("");
    setHouseholdProfile({ activeHousehold: null, memberships: [] });
    setHouseholdMembers([]);
    setHouseholdRequests([]);
  }, [user?.uid, isLocalUser]);

  useEffect(() => {
    setNewAcct((prev) => (prev.owner ? prev : { ...prev, owner: defaultOwnerLabel }));
  }, [defaultOwnerLabel]);

  useEffect(() => {
    if (page === "founder" && !founderOpsVisible) {
      setPage("overview");
    }
  }, [page, founderOpsVisible]);

  // Subscribe to Firebase for the selected month
  useEffect(() => {
    if (!user) {
      setRecords({}); setIncome([]); setIncomeReceipts({}); setLoading(false); setMounted(false); return;
    }

    // If this is a local user, load from localStorage instead of Firestore
    if (user.isLocal || isLocalUser) {
      const merged = {};
      const lr = localData.loadRecords(user.uid, monthKey);
      starterTemplateAccounts.forEach(a => {
        const fbData = lr[String(a.id)];
        merged[a.id] = fbData ? { ...defaultRecord(a), ...fbData } : defaultRecord(a);
      });
      setRecords(merged);
      const lim = localData.loadIncome(user.uid, monthKey);
      const normalizedIncome = Array.isArray(lim)
        ? { entries: lim, receipts: {} }
        : {
            entries: Array.isArray(lim?.entries) ? lim.entries : [],
            receipts: lim?.receipts && typeof lim.receipts === "object" ? lim.receipts : {},
          };
      setIncome(
        normalizeIncomeEntries(normalizedIncome.entries)
          .filter((entry) => !SYSTEM_INCOME_SOURCES.includes(entry.src.toUpperCase()))
      );
      setIncomeReceipts(normalizedIncome.receipts);
      setLoading(false);
      setTimeout(() => setMounted(true), 50);
      return;
    }

    setLoading(true);
    setIncomeReceipts({});
    setMounted(false);

    const unsub = subscribeRecords(user.uid, monthKey, (fbRecords) => {
      const merged = {};
      starterTemplateAccounts.forEach(a => {
        const fbData = fbRecords[String(a.id)];
        merged[a.id] = fbData ? { ...defaultRecord(a), ...fbData } : defaultRecord(a);
      });
      setRecords(merged);
      setLoading(false);
      setTimeout(() => setMounted(true), 50);
    }, workspaceScope);

    loadIncome(user.uid, monthKey, workspaceScope)
      .then((loadedIncome) => {
        const normalizedIncome = Array.isArray(loadedIncome)
          ? { entries: loadedIncome, receipts: {} }
          : {
              entries: Array.isArray(loadedIncome?.entries) ? loadedIncome.entries : [],
              receipts: loadedIncome?.receipts && typeof loadedIncome.receipts === "object" ? loadedIncome.receipts : {},
            };
        setIncome(
          normalizeIncomeEntries(normalizedIncome.entries)
            .filter((entry) => !SYSTEM_INCOME_SOURCES.includes(entry.src.toUpperCase()))
        );
        setIncomeReceipts(normalizedIncome.receipts);
      })
      .catch((e) => {
        console.error("loadIncome error:", e);
        setIncome([]);
        setIncomeReceipts({});
      })
      .finally(() => undefined);
    const fallbackTimer = setTimeout(() => {
      setLoading(false);
      setMounted(true);
    }, AUTH_TIMEOUT_MS);
    return () => {
      clearTimeout(fallbackTimer);
      unsub();
    };
  }, [monthKey, user, activeHouseholdId, starterTemplateAccounts]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!user) {
        setPlans([]);
        setPlanId("");
        return;
      }
      if (user.isLocal || isLocalUser) {
        const localPlans = localData.loadPlans(user.uid);
        if (alive) setPlans(localPlans);
        return;
      }
      try {
        const remotePlans = await loadPayoffPlans(user.uid, workspaceScope);
        if (alive) setPlans(remotePlans);
      } catch (e) {
        console.error("loadPayoffPlans error", e);
      }
    };
    run();
    return () => { alive = false; };
  }, [user, isLocalUser, activeHouseholdId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!user) {
        setCustomAccounts([]);
        setUserCategories([]);
        setIncomeTemplates([]);
        return;
      }
      if (user.isLocal || isLocalUser) {
        const local = localData.loadSettings(user.uid);
        if (!alive) return;
        setCustomAccounts(Array.isArray(local.customAccounts) ? local.customAccounts : []);
        setUserCategories(Array.isArray(local.userCategories) ? local.userCategories : []);
        setIncomeTemplates(
          normalizeIncomeEntries(Array.isArray(local.incomeTemplates) ? local.incomeTemplates : [])
            .filter((entry) => !SYSTEM_INCOME_SOURCES.includes(entry.src.toUpperCase()))
        );
        setDeletedAccountIds(Array.isArray(local.deletedAccountIds) ? local.deletedAccountIds : []);
        setAccountOverrides(local.accountOverrides && typeof local.accountOverrides === "object" ? local.accountOverrides : {});
        setAssets(Number(local?.assets || 0));
        return;
      }
      try {
        const remote = await loadWorkspaceSettings(user.uid, workspaceScope);
        if (!alive) return;
        setCustomAccounts(Array.isArray(remote.customAccounts) ? remote.customAccounts : []);
        setUserCategories(Array.isArray(remote.userCategories) ? remote.userCategories : []);
        setIncomeTemplates(
          normalizeIncomeEntries(Array.isArray(remote.incomeTemplates) ? remote.incomeTemplates : [])
            .filter((entry) => !SYSTEM_INCOME_SOURCES.includes(entry.src.toUpperCase()))
        );
        setDeletedAccountIds(Array.isArray(remote.deletedAccountIds) ? remote.deletedAccountIds : []);
        setAccountOverrides(remote.accountOverrides && typeof remote.accountOverrides === "object" ? remote.accountOverrides : {});
        setAssets(Number(remote?.assets || 0));
      } catch (e) {
        console.error("loadUserSettings error", e);
      }
    };
    run();
    return () => { alive = false; };
  }, [user, isLocalUser, activeHouseholdId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user || user.isLocal || isLocalUser) {
      setWorkspaceMode("solo");
      setActiveHouseholdId("");
      setHouseholdSetupOpen(false);
      return;
    }
    const unsub = subscribeUserWorkspace(user.uid, (settings) => {
      const nextMode = settings?.workspaceMode || "solo";
      setWorkspaceMode(nextMode);
      setActiveHouseholdId(settings?.activeHouseholdId || "");
      const needsHouseholdChoice = !settings?.householdSetupDone;
      setHouseholdSetupOpen(!!needsHouseholdChoice);
      if (needsHouseholdChoice) setHouseholdSetupTab("choose");
      const isNewUser = !customAccounts.length && !settings?.onboardingDone;
      if (isNewUser) { setOnboardingDone(false); setOnboardingStep(1); }
    });
    return () => unsub && unsub();
  }, [user, isLocalUser, customAccounts.length]);

  useEffect(() => {
    if (!user || user.isLocal || isLocalUser) {
      setHouseholdProfile({ activeHousehold: null, memberships: [] });
      return;
    }
    const unsub = subscribeHouseholdForUser(user.uid, (profile) => {
      setHouseholdProfile(profile);
    });
    return () => unsub && unsub();
  }, [user, isLocalUser]);

  useEffect(() => {
    if (!user || user.isLocal || isLocalUser) return;
    const activeMembershipId = householdProfile?.activeHousehold?.id || "";
    if (!activeMembershipId) return;
    if (activeHouseholdId === activeMembershipId && workspaceMode === "household" && !householdSetupOpen) return;

    setActiveHouseholdId(activeMembershipId);
    setWorkspaceMode("household");
    setHouseholdSetupOpen(false);

    saveUserSettings(user.uid, {
      activeHouseholdId: activeMembershipId,
      householdSetupDone: true,
      workspaceMode: "household",
    }).catch((error) => {
      console.error("sync approved household workspace error", error);
    });
  }, [user, isLocalUser, householdProfile?.activeHousehold?.id, activeHouseholdId, workspaceMode, householdSetupOpen]);

  useEffect(() => {
    if (!activeHouseholdId) {
      setHouseholdMembers([]);
      setHouseholdRequests([]);
      return;
    }
    const unsubMembers = subscribeHouseholdMembers(activeHouseholdId, setHouseholdMembers);
    const unsubRequests = subscribeJoinRequests(activeHouseholdId, setHouseholdRequests);
    return () => {
      unsubMembers && unsubMembers();
      unsubRequests && unsubRequests();
    };
  }, [activeHouseholdId]);

  useEffect(() => {
    if (!plans.length) {
      setPlanId("");
      return;
    }
    if (!planId && (planName || Object.keys(planItems || {}).length)) return;
    const selected = plans.find((p) => p.id === planId) || plans[0];
    setPlanId(selected.id);
    setPlanName(selected.name || "");
    setPlanOwner(selected.owner || "All");
    setPlanStrategy(selected.strategy || "avalanche");
    setPlanMonthlyExtra(String(selected.monthly_extra ?? 0));
    const itemMap = {};
    (selected.items || []).forEach((it) => {
      itemMap[String(it.account_id)] = {
        include: !!it.include,
        extra_payment: String(it.extra_payment ?? 0),
      };
    });
    setPlanItems(itemMap);
  }, [plans, planId, planItems, planName]);

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

  // Month note loader (reloads when month changes)
  useEffect(() => {
    if (!user) return;
    if (user.isLocal || isLocalUser) {
      const s = localData.loadSettings(user.uid);
      setMonthNote(s?.monthNotes?.[monthKey] || "");
      setMonthNoteSaved(false);
      return;
    }
    loadWorkspaceSettings(user.uid, workspaceScope).then(s => {
      setMonthNote(s?.monthNotes?.[monthKey] || "");
      setMonthNoteSaved(false);
    });
  }, [monthKey, user, activeHouseholdId]); // eslint-disable-line react-hooks/exhaustive-deps


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
      // Only run local fallback if Firebase auth hasn't already succeeded (authInProgress guard).
      if (allowLocalFallbackAuth && !firebaseStatus.configured && !authInProgress.current) {
        try {
          if (authMode === "login") {
            const u = localData.signIn(authEmail, authPass);
            setUser(u);
            setIsLocalUser(true);
            setAuthEmail(""); setAuthPass("");
            showToast("Signed in (local)");
          } else {
            const u = localData.createUser(authEmail, authPass);
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

  const getBalanceBase = (account) =>
    Number(
      account?.base_bal_v ??
      ((Number(account?.cur_bal || 0)) + (Number(account?.paid_v || 0)) - (Number(account?.purch_v || 0)))
    );

  const normalizeAprDecimal = (value) => {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric) || numeric < 0) return 0;
    return numeric > 1 ? numeric / 100 : numeric;
  };

  const normalizeMonthInput = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const match = raw.match(/^(\d{4})-(\d{2})$/);
    if (!match) return "";
    const month = Number(match[2]);
    if (!Number.isFinite(month) || month < 1 || month > 12) return "";
    return `${match[1]}-${match[2]}`;
  };

  const compareMonthKeys = (a, b) => {
    if (!a || !b) return 0;
    const [ay, am] = a.split("-").map(Number);
    const [by, bm] = b.split("-").map(Number);
    return ay !== by ? ay - by : am - bm;
  };

  const getPromoMeta = (account, month = selMonth, year = selYear) => {
    const manualApr = account?.apr_v;
    const baseApr = normalizeAprDecimal(account?.apr ?? 0);
    const promoApr = normalizeAprDecimal(account?.promo_apr ?? 0);
    const aprAfterPromo = normalizeAprDecimal(account?.apr_after_promo ?? account?.apr ?? 0);
    const promoUntil = normalizeMonthInput(account?.promo_until);
    const currentMonthKey = getMonthKey(month, year);
    const promoActive = !!promoUntil && compareMonthKeys(currentMonthKey, promoUntil) <= 0;
    if (manualApr !== undefined && manualApr !== null && manualApr !== "") {
      return {
        effectiveApr: normalizeAprDecimal(manualApr),
        baseApr,
        promoApr,
        aprAfterPromo,
        promoUntil,
        promoActive,
        usingManualApr: true,
      };
    }
    return {
      effectiveApr: promoUntil ? (promoActive ? promoApr : aprAfterPromo) : baseApr,
      baseApr,
      promoApr,
      aprAfterPromo,
      promoUntil,
      promoActive,
      usingManualApr: false,
    };
  };

  const getEffectiveApr = (account, month = selMonth, year = selYear) => (
    getPromoMeta(account, month, year).effectiveApr
  );

  const scrollToSettingsSection = (ref) => {
    ref?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const getComputedBalance = (account) =>
    Math.max(0, getBalanceBase(account) - Number(account?.paid_v || 0) + Number(account?.purch_v || 0));

  const updateRecord = useCallback(async (id, updates) => {
    const sourceAccounts = [...starterTemplateAccounts, ...customAccounts];
    const source = (sourceAccounts.find(a=>a.id===id) || { budgeted_min:0, starting_bal:0, apr:0, name:"", bank:"", owner:"", category:"" });
    const current = records[id] || defaultRecord(source);
    const updated  = { ...current, ...updates };
    const touchesBalance = ["base_bal_v", "cur_bal", "paid_v", "purch_v"].some((key) => Object.prototype.hasOwnProperty.call(updates, key));
    if (touchesBalance) {
      const nextPaid = Number(updated.paid_v || 0);
      const nextPurch = Number(updated.purch_v || 0);
      const nextBase = Object.prototype.hasOwnProperty.call(updates, "base_bal_v")
        ? Number(updates.base_bal_v || 0)
        : Object.prototype.hasOwnProperty.call(updates, "cur_bal")
          ? Number(updates.cur_bal || 0) + nextPaid - nextPurch
          : getBalanceBase(current);
      updated.base_bal_v = nextBase;
      updated.cur_bal = Math.max(0, nextBase - nextPaid + nextPurch);
    }
    const labeledPayload = {
      ...updated,
      // Keep numeric document IDs, but store readable labels for console/query clarity.
      account_id: String(id),
      account_name: source.name || "",
      account_bank: source.bank || "",
      account_owner: source.owner || "",
      account_category: source.category || "",
    };
    setRecords(r => ({ ...r, [id]: updated }));
    if (user && !(user.isLocal || isLocalUser)) {
      await saveRecord(user.uid, monthKey, id, labeledPayload, workspaceScope);
    } else if (user && (user.isLocal || isLocalUser)) {
      const data = ensureLocalUserData(user.uid);
      if (!data.months) data.months = {};
      if (!data.months[monthKey]) data.months[monthKey] = { accounts: {}, income: [], uploads: [] };
      const currentAccounts = data.months[monthKey].accounts || {};
      currentAccounts[String(id)] = { ...(currentAccounts[String(id)] || {}), ...labeledPayload };
      data.months[monthKey].accounts = currentAccounts;
      localStorage.setItem(localKey(user.uid), JSON.stringify(data));
    }
  }, [records, monthKey, user, isLocalUser, customAccounts, starterTemplateAccounts]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildAutoBalanceUpdates = (account, nextVals) => {
    const nextPaid = Number(nextVals?.paid_v || 0);
    const nextPurch = Number(nextVals?.purch_v || 0);
    const nextMinDue = Number(nextVals?.min_due_v ?? account?.min_due_v ?? 0);
    const nextCurBal = Number(nextVals?.cur_bal ?? NaN);
    const baseBal = Number.isFinite(nextCurBal)
      ? Math.max(0, nextCurBal) + nextPaid - nextPurch
      : getBalanceBase(account);

    const result = {
      base_bal_v: baseBal,
      paid_v: nextPaid,
      min_due_v: nextMinDue,
      cur_bal: Math.max(0, baseBal - nextPaid + nextPurch),
      purch_v: nextPurch,
    };
    if (nextVals?.interest_paid_v !== undefined) {
      result.interest_paid_v = Number(nextVals.interest_paid_v) || 0;
    }
    if (nextVals?.apr_v !== undefined || nextVals?.apr_pct !== undefined) {
      const aprSource = nextVals?.apr_v !== undefined ? nextVals.apr_v : (Number(nextVals?.apr_pct || 0) / 100);
      result.apr_v = normalizeAprDecimal(aprSource);
    }
    return result;
  };

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
    const defaultInterest = ((getEffectiveApr(a) / 12) * Number(a.cur_bal || 0)).toFixed(2);
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
  const normalizeIncomeEntries = (list) => {
    if (!Array.isArray(list)) return [];
    return list
      .map((x) => ({ src: String(x?.src || "").trim(), amt: Number(x?.amt || 0) }))
      .filter((x) => x.src.length > 0);
  };

  const getObservedHolidayDate = (year, monthIndex, day) => {
    const date = new Date(year, monthIndex, day);
    const weekDay = date.getDay();
    if (weekDay === 6) date.setDate(day - 1);
    if (weekDay === 0) date.setDate(day + 1);
    return date;
  };

  const getNthWeekdayOfMonth = (year, monthIndex, weekday, nth) => {
    const date = new Date(year, monthIndex, 1);
    const offset = (weekday - date.getDay() + 7) % 7;
    date.setDate(1 + offset + ((nth - 1) * 7));
    return date;
  };

  const getLastWeekdayOfMonth = (year, monthIndex, weekday) => {
    const date = new Date(year, monthIndex + 1, 0);
    const offset = (date.getDay() - weekday + 7) % 7;
    date.setDate(date.getDate() - offset);
    return date;
  };

  const getBankHolidays = (year) => {
    const holidays = [
      { name: "New Year's Day", date: getObservedHolidayDate(year, 0, 1) },
      { name: "Martin Luther King Jr. Day", date: getNthWeekdayOfMonth(year, 0, 1, 3) },
      { name: "Presidents Day", date: getNthWeekdayOfMonth(year, 1, 1, 3) },
      { name: "Memorial Day", date: getLastWeekdayOfMonth(year, 4, 1) },
      { name: "Juneteenth", date: getObservedHolidayDate(year, 5, 19) },
      { name: "Independence Day", date: getObservedHolidayDate(year, 6, 4) },
      { name: "Labor Day", date: getNthWeekdayOfMonth(year, 8, 1, 1) },
      { name: "Columbus Day", date: getNthWeekdayOfMonth(year, 9, 1, 2) },
      { name: "Veterans Day", date: getObservedHolidayDate(year, 10, 11) },
      { name: "Thanksgiving Day", date: getNthWeekdayOfMonth(year, 10, 4, 4) },
      { name: "Christmas Day", date: getObservedHolidayDate(year, 11, 25) },
    ];

    return holidays
      .map((holiday) => ({
        ...holiday,
        key: holiday.date.toISOString().slice(0, 10),
      }))
      .sort((a, b) => a.date - b.date);
  };

  const _getMonthlyBankHolidayCount = (month, year) =>
    getBankHolidays(year).filter((holiday) => holiday.date.getMonth() + 1 === month).length;

  const getFridaysInMonth = (month, year) => {
    const fridays = [];
    const cursor = new Date(year, month - 1, 1);
    while (cursor.getMonth() === month - 1) {
      if (cursor.getDay() === 5) fridays.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return fridays;
  };

  const getFirstFridayOfYear = (year) => {
    const date = new Date(year, 0, 1);
    while (date.getDay() !== 5) date.setDate(date.getDate() + 1);
    return date;
  };

  const getStartOfWeek = (date) => {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    start.setDate(start.getDate() - start.getDay());
    return start;
  };

  const getPayWeekHolidayCount = (payDate, holidays) => {
    const weekStart = new Date(payDate);
    weekStart.setDate(payDate.getDate() - 4);
    return holidays.filter((holiday) => holiday.date >= weekStart && holiday.date <= payDate).length;
  };

  const createBOAPayPeriods = (month, year) => {
    const holidays = getBankHolidays(year);
    return getFridaysInMonth(month, year).map((payDate, index) => {
      const holidayCount = getPayWeekHolidayCount(payDate, holidays);
      return {
        key: `boa-${payDate.toISOString().slice(0, 10)}`,
        src: "BOA",
        label: `Week ${index + 1} - ${payDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        amount: Math.max(0, RECURRING_BOA_BASE - (holidayCount * RECURRING_BOA_HOLIDAY_DELTA)),
        holidayCount,
      };
    });
  };

  const createEagleviewPayPeriods = (month, year) => {
    const periods = [];
    const cursor = getFirstFridayOfYear(year);
    while (cursor.getFullYear() === year) {
      if (cursor.getMonth() + 1 === month) {
        periods.push({
          key: `eagleview-${cursor.toISOString().slice(0, 10)}`,
          src: "EAGLEVIEW",
          label: `Bi-weekly - ${cursor.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
          amount: RECURRING_EAGLEVIEW_BASE,
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
    const payload = { entries: normalized, receipts: incomeReceipts };
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
      .filter((x) => !SYSTEM_INCOME_SOURCES.includes(x.src.toUpperCase()));
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
    const nextReceipts = { ...incomeReceipts, [periodKey]: isReceived };
    // Update state immediately so the select stays selected without waiting for the async save
    setIncomeReceipts(nextReceipts);
    const payload = { entries: normalizeIncomeEntries(income), receipts: nextReceipts };
    if (user && !(user.isLocal || isLocalUser)) await saveIncome(user.uid, monthKey, payload, workspaceScope);
    if (user && (user.isLocal || isLocalUser)) localData.saveIncome(user.uid, monthKey, payload);
    showToast(isReceived ? "Income marked as received" : "Income marked as pending");
  };

  const buildDefaultPlanItems = (owner, accounts) => {
    const scoped = owner === "All" ? accounts : accounts.filter((a) => a.owner === owner);
    return scoped.map((a) => ({
      account_id: a.id,
      include: true,
      extra_payment: 0,
    }));
  };

  const savePlan = async (targetId = "", opts = {}) => {
    const silent = !!opts.silent;
    if (!user) return;
    const scoped = (planOwner === "All" ? allAccts : allAccts.filter((a) => a.owner === planOwner))
      .filter((a) => !deletedAccountIds.includes(a.id));
    const builtItems = scoped.map((a) => {
      const key = String(a.id);
      return {
        account_id: a.id,
        include: !!planItems[key]?.include,
        extra_payment: Number(planItems[key]?.extra_payment || 0),
      };
    });

    const payload = {
      name: (planName || "New Plan").trim(),
      owner: planOwner,
      strategy: planStrategy,
      monthly_extra: Number(planMonthlyExtra || 0),
      items: builtItems,
    };

    if (user.isLocal || isLocalUser) {
      const id = localData.savePlan(user.uid, payload, targetId);
      const updated = localData.loadPlans(user.uid);
      setPlans(updated);
      setPlanId(id);
      if (!silent) showToast("Plan saved locally");
      return;
    }

    try {
      const id = await upsertPayoffPlan(user.uid, payload, targetId || null, workspaceScope);
      const updated = await loadPayoffPlans(user.uid, workspaceScope);
      setPlans(updated);
      setPlanId(id);
      if (!silent) showToast("Plan saved");
    } catch (e) {
      console.error("savePlan error", e);
      if (!silent) showToast("Plan save failed", "error");
    }
  };

  const payoffSimulate = (accounts, strategy, monthlyExtra, perAccountExtra, maxMonths = MAX_SIMULATION_MONTHS) => {
    const state = accounts
      .map((a) => ({
        id: a.id,
        name: a.name,
        apr: getEffectiveApr(a),
        promo_apr: a.promo_apr ?? 0,
        promo_until: a.promo_until ?? "",
        apr_after_promo: a.apr_after_promo ?? a.apr ?? 0,
        min_due: Number(a.min_due_v || 0),
        bal: Math.max(0, Number(a.cur_bal || 0)),
      }))
      .filter((a) => a.bal > 0);
    if (!state.length) return [];

    const rows = [];
    const startDate = new Date(selYear, selMonth - 1, 1);

    for (let m = 0; m < maxMonths; m++) {
      const active = state.filter((a) => a.bal > 0.01);
      if (!active.length) break;

      const monthDate = new Date(startDate.getFullYear(), startDate.getMonth() + m, 1);
      let totalInterest = 0;

      active.forEach((a) => {
        const monthApr = getEffectiveApr(a, monthDate.getMonth() + 1, monthDate.getFullYear());
        a.apr = monthApr;
        const interest = a.bal * (monthApr / 12);
        totalInterest += interest;
        a.bal += interest;
      });

      active.forEach((a) => {
        const base = Math.max(0, a.min_due + Number(perAccountExtra[a.id] || 0));
        const pay = Math.min(a.bal, base);
        a.bal -= pay;
      });

      let extraPool = Math.max(0, Number(monthlyExtra || 0));
      const targetOrder = [...active]
        .filter((a) => a.bal > 0.01)
        .sort((a, b) => {
          if (strategy === "snowball") return a.bal - b.bal;
          return b.apr - a.apr;
        });
      for (const t of targetOrder) {
        if (extraPool <= 0) break;
        const extraPay = Math.min(t.bal, extraPool);
        t.bal -= extraPay;
        extraPool -= extraPay;
      }

      rows.push({
        month: monthDate.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
        remaining_debt: state.reduce((s, a) => s + Math.max(0, a.bal), 0),
        total_interest: totalInterest,
      });
    }

    return rows;
  };

  const persistUserSettings = async (
    nextAccounts,
    nextCategories,
    nextIncomeTemplates = incomeTemplates,
    nextDeletedAccountIds = deletedAccountIds,
    nextAccountOverrides = accountOverrides,
  ) => {
    if (!user) return;
    if (user.isLocal || isLocalUser) {
      localData.saveSettings(user.uid, {
        customAccounts: nextAccounts,
        userCategories: nextCategories,
        incomeTemplates: nextIncomeTemplates,
        deletedAccountIds: nextDeletedAccountIds,
        accountOverrides: nextAccountOverrides,
      });
      return;
    }
    try {
      await saveWorkspaceSettings(user.uid, {
        customAccounts: nextAccounts,
        userCategories: nextCategories,
        incomeTemplates: nextIncomeTemplates,
        deletedAccountIds: nextDeletedAccountIds,
        accountOverrides: nextAccountOverrides,
      }, workspaceScope);
    } catch (e) {
      console.error("persistUserSettings error", e);
      showToast("Could not save custom settings", "error");
    }
  };

  const saveMonthNote = async (note) => {
    if (!user) return;
    if (user.isLocal || isLocalUser) {
      const existing = localData.loadSettings(user.uid);
      localData.saveSettings(user.uid, {
        ...existing,
        monthNotes: { ...(existing?.monthNotes || {}), [monthKey]: note }
      });
      setMonthNoteSaved(true);
      setTimeout(() => setMonthNoteSaved(false), 2000);
      return;
    }
    try {
      const existing = await loadWorkspaceSettings(user.uid, workspaceScope);
      await saveWorkspaceSettings(user.uid, {
        ...existing,
        monthNotes: { ...(existing?.monthNotes || {}), [monthKey]: note }
      }, workspaceScope);
      setMonthNoteSaved(true);
      setTimeout(() => setMonthNoteSaved(false), 2000);
    } catch (e) {
      console.error("saveMonthNote error", e);
      showToast("Could not save note", "error");
    }
  };

  const saveAssets = async (val) => {
    if (!user) return;
    const numVal = Number(val) || 0;
    if (user.isLocal || isLocalUser) {
      const existing = localData.loadSettings(user.uid);
      localData.saveSettings(user.uid, { ...existing, assets: numVal });
      setAssets(numVal);
      showToast("Assets saved");
      return;
    }
    const existing = await loadWorkspaceSettings(user.uid, workspaceScope) || {};
    await saveWorkspaceSettings(user.uid, { ...existing, assets: numVal }, workspaceScope);
    setAssets(numVal);
    showToast("Assets saved");
  };

  const completeOnboarding = async () => {
    setOnboardingStep(0);
    setOnboardingDone(true);
    if (user) {
      if (user.isLocal || isLocalUser) {
        const existing = localData.loadSettings(user.uid);
        localData.saveSettings(user.uid, { ...existing, onboardingDone: true });
        return;
      }
      const existing = await loadUserSettings(user.uid) || {};
      await saveUserSettings(user.uid, { ...existing, onboardingDone: true });
    }
  };

  const currentHouseholdMember = householdMembers.find((member) => String(member.uid || member.id) === String(user?.uid || ""));
  const canManageHousehold = ["owner", "admin"].includes(currentHouseholdMember?.role || "");
  const resolvedHousehold =
    householdProfile.activeHousehold
    || householdProfile.memberships?.find((item) => String(item.id) === String(activeHouseholdId))
    || null;
  const householdInviteLink = buildHouseholdInviteLink(
    resolvedHousehold,
    typeof window !== "undefined" ? window.location.origin : ""
  );

  const createCurrentHousehold = async () => {
    if (!user || user.isLocal || isLocalUser) return;
    const name = String(householdForm.name || "").trim();
    if (!name) {
      showToast("Household name is required", "error");
      return;
    }
    setHouseholdActionLoading(true);
    try {
      const seed = {
        settings: {
          customAccounts,
          userCategories,
          incomeTemplates,
          deletedAccountIds,
          accountOverrides,
          assets,
          monthNotes: { [monthKey]: monthNote || "" },
        },
        records: { [monthKey]: records },
        income: { [monthKey]: { entries: income, receipts: incomeReceipts } },
        plans,
      };
      const created = await createHousehold({ ...user, ...userProfile }, householdForm, seed);
      setHouseholdProfile((prev) => ({
        activeHousehold: created,
        memberships: [
          created,
          ...((prev?.memberships || []).filter((item) => String(item.id) !== String(created.id))),
        ],
      }));
      setActiveHouseholdId(created.id);
      setWorkspaceMode("household");
      setHouseholdSetupOpen(false);
      setHouseholdSetupTab("choose");
      showToast(`Household ready. Share ${created.joinCode} or send the link.`, "success");
    } catch (e) {
      console.error("createCurrentHousehold error", e);
      showToast(`Could not create household${e?.message ? `: ${e.message}` : ""}`, "error");
    } finally {
      setHouseholdActionLoading(false);
    }
  };

  const searchForHouseholds = async (overrideTerm = "") => {
    setHouseholdSearchLoading(true);
    try {
      const results = await searchHouseholds(overrideTerm || householdForm.search);
      setHouseholdSearchResults(results);
    } catch (e) {
      console.error("searchForHouseholds error", e);
      showToast("Search failed", "error");
    } finally {
      setHouseholdSearchLoading(false);
    }
  };

  const createPlanDraft = (opts = {}) => {
    const silent = !!opts.silent;
    const initialOwner = "All";
    const defaults = buildDefaultPlanItems(initialOwner, allAccts);
    const nextItems = {};
    defaults.forEach((item) => {
      nextItems[String(item.account_id)] = {
        include: true,
        extra_payment: "0",
      };
    });
    setPlanId("");
    setPlanName(`${MONTHS[selMonth - 1]} ${selYear} Draft`);
    setPlanOwner(initialOwner);
    setPlanStrategy("avalanche");
    setPlanMonthlyExtra("0");
    setWhatIfExtra("0");
    setPlanItems(nextItems);
    setShowAllSimRows(false);
    if (!silent) showToast("New draft ready");
  };

  const removePlan = async (targetId = "") => {
    if (!user || !targetId) return;
    if (user.isLocal || isLocalUser) {
      const updated = localData.deletePlan(user.uid, targetId);
      setPlans(updated);
      createPlanDraft({ silent: true });
      showToast("Plan deleted");
      return;
    }
    try {
      await deletePayoffPlan(user.uid, targetId, workspaceScope);
      const updated = await loadPayoffPlans(user.uid, workspaceScope);
      setPlans(updated);
      createPlanDraft({ silent: true });
      showToast("Plan deleted");
    } catch (e) {
      console.error("removePlan error", e);
      showToast("Could not delete plan", "error");
    }
  };

  useEffect(() => {
    if (typeof window === "undefined" || !user || user.isLocal || isLocalUser) return;
    const joinCode = new URLSearchParams(window.location.search).get("joinCode");
    if (!joinCode) return;
    searchForHouseholds(String(joinCode).toUpperCase());
  }, [user, isLocalUser]);

  const joinSelectedHousehold = async (household) => {
    if (!user || user.isLocal || isLocalUser) return;
    setHouseholdActionLoading(true);
    try {
      const result = await requestJoinHousehold({ ...user, ...userProfile }, household);
      if (result.status === "joined") {
        setActiveHouseholdId(household.id);
        setWorkspaceMode("household");
        setHouseholdSetupOpen(false);
        showToast(`Joined ${household.name}`, "success");
      } else {
        setHouseholdSetupOpen(false);
        showToast(`Join request sent to ${household.name}`, "success");
      }
    } catch (e) {
      console.error("joinSelectedHousehold error", e);
      showToast("Could not join household", "error");
    } finally {
      setHouseholdActionLoading(false);
    }
  };

  const continueSoloMode = async () => {
    if (!user || user.isLocal || isLocalUser) return;
    setHouseholdActionLoading(true);
    try {
      await continueSoloWorkspace(user.uid);
      setWorkspaceMode("solo");
      setActiveHouseholdId("");
      setHouseholdSetupOpen(false);
      showToast("Continuing in solo mode");
    } catch (e) {
      console.error("continueSoloMode error", e);
      showToast("Could not update workspace mode", "error");
    } finally {
      setHouseholdActionLoading(false);
    }
  };

  const handleSaveHouseholdProfile = async (profile) => {
    if (!user || user.isLocal || isLocalUser) return;
    const nextProfile = {
      uid: user.uid,
      email: user.email || "",
      displayName: String(profile?.displayName || "").trim() || (user.email ? user.email.split("@")[0] : "Member"),
      photoURL: String(profile?.photoURL || "").trim(),
      avatarColor: String(profile?.avatarColor || "").trim(),
    };
    try {
      await saveUserProfile(user.uid, nextProfile);
      if (activeHouseholdId) {
        await saveHouseholdMemberProfile(activeHouseholdId, user.uid, nextProfile);
      }
      setUserProfile((prev) => ({ ...prev, ...nextProfile }));
      showToast("Your details are saved", "success");
    } catch (e) {
      console.error("handleSaveHouseholdProfile error", e);
      showToast("Could not save your details", "error");
    }
  };

  const handleCopyHouseholdInvite = async (link) => {
    const nextLink = String(link || householdInviteLink || "").trim();
    if (!nextLink) {
      showToast("No link yet", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(nextLink);
      showToast("Invite link copied", "success");
    } catch (e) {
      console.error("handleCopyHouseholdInvite error", e);
      showToast("Could not copy the link", "error");
    }
  };

  const handleShareHouseholdInvite = async (link) => {
    const nextLink = String(link || householdInviteLink || "").trim();
    if (!nextLink) {
      showToast("No link yet", "error");
      return;
    }
    try {
      if (navigator.share) {
        await navigator.share({
          title: householdProfile.activeHousehold?.name || "Household Budget",
          text: "Join our shared budget space.",
          url: nextLink,
        });
        return;
      }
      await handleCopyHouseholdInvite(nextLink);
    } catch (e) {
      if (e?.name === "AbortError") return;
      console.error("handleShareHouseholdInvite error", e);
      showToast("Could not share the link", "error");
    }
  };

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
      await approveJoinRequest(activeHouseholdId, requestUserId, user);
      showToast("Join request approved");
    } catch (e) {
      console.error("handleApproveHouseholdRequest error", e);
      showToast("Could not approve request", "error");
    }
  };

  const handleRejectHouseholdRequest = async (requestUserId) => {
    if (!activeHouseholdId || !user) return;
    try {
      await rejectJoinRequest(activeHouseholdId, requestUserId, user);
      showToast("Join request rejected");
    } catch (e) {
      console.error("handleRejectHouseholdRequest error", e);
      showToast("Could not reject request", "error");
    }
  };

  const exportBackup = async () => {
    if (!canUseFeature(subscription, "export")) {
      showToast(getUpgradeMessage("export"));
      openBillingPage();
      return;
    }
    setBackupLoading(true);
    try {
      let settings;
      if (user && (user.isLocal || isLocalUser)) {
        settings = localData.loadSettings(user.uid);
      } else {
        settings = await loadWorkspaceSettings(user?.uid || "local", workspaceScope);
      }
      const backup = {
        version: 2,
        exportedAt: new Date().toISOString(),
        user: user?.email || "local",
        settings,
        records,
        income,
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `budget-backup-${monthKey}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Backup downloaded");
    } catch (e) {
      showToast("Backup failed: " + e.message, "error");
    } finally {
      setBackupLoading(false);
    }
  };

  const importBackup = async (file) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.version || !data.settings) throw new Error("Invalid backup file");
      const confirmed = await askConfirm({
        title: "Restore Backup",
        message: "This will overwrite your current settings and categories.",
        confirmLabel: "Restore",
        tone: "danger",
      });
      if (!confirmed) return;
      if (user) {
        if (user.isLocal || isLocalUser) {
          localData.saveSettings(user.uid, data.settings);
        } else {
          await saveWorkspaceSettings(user.uid, data.settings, workspaceScope);
        }
      }
      showToast("Backup restored  -  reloading...");
      setCustomAccounts(Array.isArray(data.settings?.customAccounts) ? data.settings.customAccounts : []);
      setUserCategories(Array.isArray(data.settings?.userCategories) ? data.settings.userCategories : []);
      setIncomeTemplates(
        normalizeIncomeEntries(Array.isArray(data.settings?.incomeTemplates) ? data.settings.incomeTemplates : [])
          .filter((entry) => !SYSTEM_INCOME_SOURCES.includes(entry.src.toUpperCase()))
      );
      setDeletedAccountIds(Array.isArray(data.settings?.deletedAccountIds) ? data.settings.deletedAccountIds : []);
      setAccountOverrides(data.settings?.accountOverrides && typeof data.settings.accountOverrides === "object" ? data.settings.accountOverrides : {});
      setAssets(Number(data.settings?.assets || 0));
    } catch (e) {
      showToast("Restore failed: " + e.message, "error");
    }
  };

  const addCategory = async () => {
    const name = (newCategoryName || "").trim().toUpperCase();
    if (!name) return;
    if (allCategories.includes(name)) {
      setNewCategoryName("");
      showToast("Category already exists", "error");
      return;
    }
    const nextCategories = [...userCategories, name];
    setUserCategories(nextCategories);
    setNewCategoryName("");
    await persistUserSettings(customAccounts, nextCategories);
    showToast("Category added");
  };

  const addCustomAccount = async () => {
    const name = (newAcct.name || "").trim();
    const category = (newAcct.category || "").trim().toUpperCase();
    if (!name || !category) {
      showToast("Name and category are required", "error");
      return;
    }
    const aprVal = newAcct.apr === "" ? 0 : Number(newAcct.apr);
    const promoAprVal = newAcct.promoApr === "" ? 0 : Number(newAcct.promoApr);
    const aprAfterPromoVal = newAcct.aprAfterPromo === "" ? aprVal : Number(newAcct.aprAfterPromo);
    const promoUntil = normalizeMonthInput(newAcct.promoUntil);
    if (!isFinite(aprVal) || aprVal < 0) {
      showToast("APR must be a number 0 or greater", "error");
      return;
    }
    if (!isFinite(promoAprVal) || promoAprVal < 0) {
      showToast("Promo APR must be a number 0 or greater", "error");
      return;
    }
    if (!isFinite(aprAfterPromoVal) || aprAfterPromoVal < 0) {
      showToast("APR after promo must be a number 0 or greater", "error");
      return;
    }
    if (String(newAcct.promoUntil || "").trim() && !promoUntil) {
      showToast("Promo end must use YYYY-MM", "error");
      return;
    }
    const id = Date.now();
    const account = {
      id,
      name,
      owner: newAcct.owner || defaultOwnerLabel,
      bank: (newAcct.bank || name).trim(),
      category,
      apr: aprVal,
      promo_apr: promoAprVal,
      promo_until: promoUntil,
      apr_after_promo: aprAfterPromoVal,
      budgeted_min: Number(newAcct.min || 0),
      due_day: Number(newAcct.due || 0),
      starting_bal: Number(newAcct.bal || 0),
    };
    const nextAccounts = [...customAccounts, account];
    const nextCategories = allCategories.includes(category) ? userCategories : [...userCategories, category];
    setCustomAccounts(nextAccounts);
    if (!allCategories.includes(category)) setUserCategories(nextCategories);
    setNewAcct({
      name: "",
      owner: newAcct.owner || defaultOwnerLabel,
      bank: "",
      category,
      apr: "",
      promoApr: "",
      promoUntil: "",
      aprAfterPromo: "",
      min: "",
      bal: "",
      due: "",
    });
    await persistUserSettings(nextAccounts, nextCategories, incomeTemplates, deletedAccountIds);
    showToast("Account added");
  };

  const deleteAccount = async (account) => {
    const confirmed = await askConfirm({
      title: "Delete Bill",
      message: `Delete "${account.name}"? This can be restored only by re-adding it.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!confirmed) return;
    const nextDeletedAccountIds = Array.from(new Set([...deletedAccountIds, account.id]));
    setDeletedAccountIds(nextDeletedAccountIds);
    await persistUserSettings(customAccounts, userCategories, incomeTemplates, nextDeletedAccountIds);
    showToast("Bill deleted");
  };

  const startEditAccount = (account) => {
    setEditingAccountId(account.id);
    setEditAcct({
      category: account.category || "",
      min: account.budgeted_min ?? "",
      due: account.due_day ?? "",
      balance: account.cur_bal ?? "",
      apr: account.apr ?? "",
      promoApr: account.promo_apr ?? "",
      promoUntil: normalizeMonthInput(account.promo_until),
      aprAfterPromo: account.apr_after_promo ?? account.apr ?? "",
      paid: account.paid_v ?? "",
    });
  };

  const saveEditAccount = async () => {
    const category = (editAcct.category || "").trim().toUpperCase();
    if (!category) { showToast("Category is required", "error"); return; }
    const aprVal = editAcct.apr === "" ? 0 : Number(editAcct.apr);
    const promoAprVal = editAcct.promoApr === "" ? 0 : Number(editAcct.promoApr);
    const aprAfterPromoVal = editAcct.aprAfterPromo === "" ? aprVal : Number(editAcct.aprAfterPromo);
    const promoUntil = normalizeMonthInput(editAcct.promoUntil);
    if (!isFinite(aprVal) || aprVal < 0) { showToast("APR must be a number 0 or greater", "error"); return; }
    if (!isFinite(promoAprVal) || promoAprVal < 0) { showToast("Promo APR must be a number 0 or greater", "error"); return; }
    if (!isFinite(aprAfterPromoVal) || aprAfterPromoVal < 0) { showToast("APR after promo must be a number 0 or greater", "error"); return; }
    if (String(editAcct.promoUntil || "").trim() && !promoUntil) { showToast("Promo end must use YYYY-MM", "error"); return; }
    const nextOverrides = {
      ...accountOverrides,
      [editingAccountId]: {
        ...(accountOverrides[editingAccountId] || {}),
        category,
        budgeted_min: editAcct.min === "" ? 0 : Number(editAcct.min),
        due_day: editAcct.due === "" ? 0 : Number(editAcct.due),
        apr: aprVal,
        promo_apr: promoAprVal,
        promo_until: promoUntil,
        apr_after_promo: aprAfterPromoVal,
      },
    };
    const nextCategories = allCategories.includes(category) ? userCategories : [...userCategories, category];
    setAccountOverrides(nextOverrides);
    if (!allCategories.includes(category)) setUserCategories(nextCategories);
    // Sync APR and paid amount to the monthly record so both storage layers stay consistent
    const acctForSync = allAccts.find(a => a.id === editingAccountId);
    if (acctForSync) {
      const recordUpdates = { apr_v: aprVal };
      if (editAcct.paid !== "" && editAcct.paid != null) {
        Object.assign(recordUpdates, buildAutoBalanceUpdates(acctForSync, { paid_v: Number(editAcct.paid) || 0 }));
      }
      if (editAcct.balance !== "" && editAcct.balance != null) {
        recordUpdates.cur_bal = Number(editAcct.balance) || 0;
      }
      await updateRecord(editingAccountId, recordUpdates);
    }
    setEditingAccountId(null);
    await persistUserSettings(customAccounts, nextCategories, incomeTemplates, deletedAccountIds, nextOverrides);
    showToast("Bill updated");
  };

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
      getBadge(a).label.replace(/[^\w\s.-]/g, "").trim(),
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
  const c = {
    // Backgrounds
    bg:      D ? "#07131f" : "#f8f8f6",
    bg2:     D ? "#0f2236" : "#e6f0ff",
    // Surfaces
    surf:    D ? "#112235" : "#ffffff",
    surf2:   D ? "#0c1c2c" : "#f2f1ec",
    surf3:   D ? "#162840" : "#e8f3ff",
    // Borders
    border:  D ? "#243d5c" : "#c0d8ff",
    border2: D ? "#325a82" : "#88b8ff",
    // Text
    tx:      D ? "#eef6ff" : "#0e1f3d",
    tx2:     D ? "#b0cceb" : "#3d3d3d",
    muted:   D ? "#7aa0c4" : "#5a7aa8",
    // Accent  -  teal
    ac:      D ? "#00c9a7" : "#0bbfa0",
    acD:     D ? "rgba(0,201,167,.22)" : "rgba(11,191,160,.15)",
    acS:     D ? "rgba(0,201,167,.10)" : "rgba(11,191,160,.08)",
    acText:  "#000000",
    // Indigo  -  secondary accent for edit/export/secondary actions
    in:      "#6366f1",
    inD:     "rgba(99,101,241,0.12)",
    // Success  -  green
    go:      D ? "#3dd68c" : "#0a8f38",
    goD:     D ? "rgba(61,214,140,.20)" : "rgba(10,143,56,.11)",
    // Warning  -  amber
    wa:      D ? "#f5b944" : "#d97a00",
    waD:     D ? "rgba(245,185,68,.20)" : "rgba(217,122,0,.12)",
    // Danger  -  red
    da:      D ? "#ff5f74" : "#d42828",
    daD:     D ? "rgba(255,95,116,.20)" : "rgba(212,40,40,.11)",
    // Info  -  blue
    info:    D ? "#5ba4f5" : "#1a6dd4",
    infoD:   D ? "rgba(91,164,245,.18)" : "rgba(26,109,212,.10)",
    // Urgent  -  today-due (bright amber, one step hotter than warning)
    ur:      D ? "#ffb01f" : "#c96800",
    urD:     D ? "rgba(255,176,31,.22)" : "rgba(201,104,0,.13)",
  };
  const firebaseStatus = getFirebaseStatus();
  const isMobile = viewportW < 760;
  const isTablet = viewportW < 1100;
  const safeTop = "env(safe-area-inset-top, 0px)";
  const safeBottom = "env(safe-area-inset-bottom, 0px)";
  const mobileTopChrome = `${mobileChromeHeight}px`;

  const sharedLegacyAccounts =
    workspaceMode === "household" && activeHouseholdId && founderOwnedHousehold && !customAccounts.length
      ? MOCK_ACCOUNTS
      : starterTemplateAccounts;

  const baseAccounts = [...sharedLegacyAccounts, ...customAccounts]
    .filter((account) => !deletedAccountIds.includes(account.id))
    .map((account) => ({ ...account, ...(accountOverrides[account.id] || {}) }));
  const allCategories = Array.from(new Set([...CATEGORIES, ...userCategories, ...baseAccounts.map((a) => a.category)])).filter(Boolean);
  const ownerOptions = Array.from(new Set(baseAccounts.map((a) => a.owner))).filter(Boolean);
  if (!ownerOptions.length) ownerOptions.push(defaultOwnerLabel);
  const allOwners = ["All", ...ownerOptions];
  const incomeSources = Array.from(new Set([...incomeTemplates.map((x) => x.src), ...income.map((x) => x.src), "Other"].filter(Boolean)));
  const isCur = selYear===today.getFullYear() && selMonth===today.getMonth()+1;
  const allAccts = baseAccounts.map(a => {
    const merged = {
      ...a,
      ...(records[a.id] || defaultRecord(a)),
    };
    const promoMeta = getPromoMeta(merged);
    return {
      ...merged,
      ...promoMeta,
      cur_bal: getComputedBalance(merged),
      d_left: isCur ? daysLeft(a.due_day, selMonth, selYear) : null,
    };
  });

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

  
  // Bill due notifications
  useEffect(() => {
    if (!reminderPreferences.dueSoon || notifPermission !== "granted" || isNativeApp || typeof Notification === "undefined") return;
    const upcoming = allAccts.filter(a => !a.is_paid && a.d_left !== null && a.d_left >= 0 && a.d_left <= 3);
    upcoming.forEach(a => {
      if (a.d_left === 0) {
        new Notification(`${a.name} due today`, {
          body: `Minimum payment: ${fx(a.min_due_v || a.budgeted_min || 0)}`,
          tag: `bill-${a.id}-today`,
        });
      } else if (a.d_left === 1) {
        new Notification(`${a.name} due tomorrow`, {
          body: `Minimum payment: ${fx(a.min_due_v || a.budgeted_min || 0)}`,
          tag: `bill-${a.id}-tomorrow`,
        });
      }
    });
  }, [allAccts, isNativeApp, notifPermission, reminderPreferences.dueSoon]);
  useEffect(() => {
    if (!reminderPreferences.dueSoon || !isNativeApp || notifPermission !== "granted") return;
    const upcoming = allAccts.filter((a) => !a.is_paid && a.d_left !== null && a.d_left >= 0 && a.d_left <= 2);
    if (!upcoming.length) return;

    const syncNativeReminders = async () => {
      try {
        const now = Date.now();
        const notifications = [];
        const cancelIds = [];
        upcoming.forEach((a) => {
          const amount = fx(a.min_due_v || a.budgeted_min || 0);
          const dueAt = new Date(selYear, selMonth - 1, a.due_day || 1, 9, 0, 0, 0);
          const reminderAt = new Date(dueAt);
          reminderAt.setDate(reminderAt.getDate() - 1);
          const tomorrowId = accountReminderId(a.id, "tomorrow");
          const todayId = accountReminderId(a.id, "today");
          cancelIds.push({ id: tomorrowId }, { id: todayId });

          if (a.d_left === 0) {
            if (shouldDispatchReminder("native-today", a.id)) {
              notifications.push({
                id: todayId,
                title: `${a.name} due today`,
                body: `Minimum payment: ${amount}`,
                schedule: { at: new Date(now + 4000), allowWhileIdle: true },
              });
            }
            return;
          }

          if (reminderAt.getTime() > now + 60000) {
            notifications.push({
              id: tomorrowId,
              title: `${a.name} due tomorrow`,
              body: `Minimum payment: ${amount}`,
              schedule: { at: reminderAt, allowWhileIdle: true },
            });
          }
          if (dueAt.getTime() > now + 60000) {
            notifications.push({
              id: todayId,
              title: `${a.name} due today`,
              body: `Minimum payment: ${amount}`,
              schedule: { at: dueAt, allowWhileIdle: true },
            });
          }
        });

        if (cancelIds.length) await LocalNotifications.cancel({ notifications: cancelIds });
        if (notifications.length) await LocalNotifications.schedule({ notifications });
      } catch (e) {
        console.error("native reminder scheduling error", e);
      }
    };
    syncNativeReminders();
  }, [allAccts, isNativeApp, notifPermission, reminderPreferences.dueSoon, selMonth, selYear]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Ctrl+K search results
  const cmdkResults = cmdkQuery.trim().length < 1 ? [] : (() => {
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
  })();
  
  const showToast = (msg, type="success") => {
    setToast({msg,type});
    setTimeout(() => setToast(null), TOAST_DURATION_MS);
  };
  
  const showUndoToast = (label, restoreFn) => {
    clearTimeout(undoTimerRef.current);
    setUndoStack({ label, restore: restoreFn });
    undoTimerRef.current = setTimeout(() => setUndoStack(null), 5000);
  };

  const askConfirm = ({ title, message, confirmLabel = "Confirm", tone = "default" }) =>
    new Promise((resolve) => {
      setConfirmState({ title, message, confirmLabel, tone, resolve });
    });

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
  const reminderStampKey = (scope, id) => {
    const stamp = new Date().toISOString().slice(0, 10);
    return `budget_reminder_${scope}_${id}_${stamp}`;
  };
  const shouldDispatchReminder = (scope, id) => {
    if (typeof window === "undefined") return true;
    const key = reminderStampKey(scope, id);
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, "1");
    return true;
  };
  const accountReminderId = (accountId, kind) => {
    const seed = `${accountId}-${kind}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) hash = ((hash * 31) + seed.charCodeAt(i)) % 2147480000;
    return Math.max(1, hash);
  };
  const requestBillReminderPermission = async () => {
    if (!canUseFeature(subscription, "reminders")) {
      showToast(getUpgradeMessage("reminders"));
      openBillingPage();
      return;
    }
    try {
      if (isNativeApp) {
        const perm = await LocalNotifications.requestPermissions();
        const next = perm.display || "default";
        setNotifPermission(next);
        showToast(next === "granted" ? "Phone bill reminders enabled" : "Phone notifications are still blocked");
        return;
      }
      if (typeof Notification === "undefined") {
        setNotifPermission("unsupported");
        showToast("Notifications are not supported on this device");
        return;
      }
      const next = await Notification.requestPermission();
      setNotifPermission(next);
      showToast(next === "granted" ? "Browser bill reminders enabled" : "Browser notifications are blocked");
    } catch (e) {
      console.error("notification permission error", e);
      showToast("Unable to enable notifications right now");
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

  const passes = a => {
    if (ownerF!=="All" && a.owner!==ownerF) return false;
    if (catF!=="All"   && a.category!==catF) return false;
    const d = a.d_left;
    if (filt==="Unpaid"          && a.is_paid)                  return false;
    if (filt==="Paid"            && !a.is_paid)                 return false;
    if (filt==="Due this week"   && (d==null||d>7||a.is_paid))  return false;
    if (filt==="Overdue"         && (d==null||d>=0||a.is_paid)) return false;
    if (filt==="High APR (>20%)" && getEffectiveApr(a)<0.20)         return false;
    return true;
  };

  const view = allAccts.filter(passes).sort((a,b) => {
    if (a.is_paid !== b.is_paid) return a.is_paid ? 1 : -1;
    return (a.d_left??999) - (b.d_left??999);
  });

  const totalDue  = allAccts.reduce((s,a) => s+(a.min_due_v||0), 0);
  const totalPaid = allAccts.reduce((s,a) => s+(a.paid_v||0),    0);
  const totalBal  = allAccts.reduce((s,a) => s+(a.cur_bal||0),   0);
  const nPaid     = allAccts.filter(a => a.is_paid).length;
  const dueSoon   = allAccts.filter(a => isCur&&a.d_left!=null&&a.d_left>=0&&a.d_left<=7&&!a.is_paid);
  const remaining = Math.max(totalDue - totalPaid, 0);
  const bankHolidays = getBankHolidays(selYear);
  const selectedMonthBankHolidays = bankHolidays.filter((holiday) => holiday.date.getMonth() + 1 === selMonth);
  const boaPayPeriods = createBOAPayPeriods(selMonth, selYear);
  const eagleviewPayPeriods = createEagleviewPayPeriods(selMonth, selYear);
  const recurringIncomeEntries = normalizeIncomeEntries([
    { src: "BOA", amt: boaPayPeriods.reduce((sum, period) => sum + period.amount, 0) },
    { src: "EAGLEVIEW", amt: eagleviewPayPeriods.reduce((sum, period) => sum + period.amount, 0) },
    ...incomeTemplates,
  ]);
  const manualIncomeEntries = normalizeIncomeEntries(income);
  const incomeEntriesForDisplay = [...recurringIncomeEntries, ...manualIncomeEntries];
  const recurringPayPeriods = [...boaPayPeriods, ...eagleviewPayPeriods];
  const receivedIncomeTotal = recurringPayPeriods.reduce(
    (sum, period) => sum + (incomeReceipts?.[period.key] ? period.amount : 0),
    manualIncomeEntries.reduce((manualSum, entry) => manualSum + entry.amt, 0),
  );
  const weekReference = isCur ? today : new Date(selYear, selMonth - 1, 1);
  const weekAnchor = getStartOfWeek(weekReference);
  weekAnchor.setDate(weekAnchor.getDate() + (dueNextWeekOffset * 7));
  const weekEnd = new Date(weekAnchor);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const dueNextBills = allAccts
    .filter((a) => Number(a.due_day) > 0 && !a.is_paid)
    .map((a) => {
      const dueDate = new Date(selYear, selMonth - 1, Number(a.due_day));
      const daysUntilDue = Math.ceil((dueDate - new Date(weekAnchor.getFullYear(), weekAnchor.getMonth(), weekAnchor.getDate())) / 86400000);
      return {
        ...a,
        dueDate,
        daysUntilDue,
        dueLabel: dueDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
      };
    })
    .filter((a) => a.dueDate >= new Date(weekAnchor.getFullYear(), weekAnchor.getMonth(), weekAnchor.getDate()) && a.dueDate <= weekEnd)
    .sort((a, b) => a.dueDate - b.dueDate);
  const dueNextGroups = dueNextBills.reduce((groups, account) => {
    const key = account.dueDate.toISOString().slice(0, 10);
    if (!groups[key]) groups[key] = { label: account.dueLabel, items: [], categories: {} };
    groups[key].items.push(account);
    if (!groups[key].categories[account.category]) groups[key].categories[account.category] = [];
    groups[key].categories[account.category].push(account);
    return groups;
  }, {});
  useEffect(() => {
    if (!dueNextTargetId) return;
    const target = dueNextBills.find((account) => String(account.id) === String(dueNextTargetId));
    if (!target) return;
    const dateKey = target.dueDate.toISOString().slice(0, 10);
    const categoryKey = `${dateKey}::${target.category}`;
    setDueNextExpanded((prev) => ({ ...prev, [dateKey]: true, [categoryKey]: true }));
  }, [dueNextBills, dueNextTargetId]);
  const pctDone   = totalDue>0 ? Math.min(totalPaid/totalDue, 1) : 0;
  const totalInc  = incomeEntriesForDisplay.reduce((s,r) => s+r.amt, 0);
  const netAfterBills = totalInc - totalDue;
  const _netAfterSav   = netAfterBills - SAVINGS_GOAL;
  const progColor = pctDone>0.85?c.go:pctDone>0.4?c.wa:c.da;

  const grouped = {};
  view.forEach(a => { (grouped[a.category]||(grouped[a.category]=[])).push(a); });
  const ownerStats = allOwners
    .filter((o) => o !== "All")
    .map((owner) => ({
      owner,
      debt: allAccts.filter((a) => a.owner === owner).reduce((s, a) => s + (a.cur_bal || 0), 0),
      due: allAccts.filter((a) => a.owner === owner).reduce((s, a) => s + (a.min_due_v || 0), 0),
    }))
    .sort((a, b) => b.debt - a.debt);
  const maxOwnerDebt = ownerStats[0]?.debt || 1;
  const catStats = allCategories.map((cat) => ({
    cat,
    debt: allAccts.filter((a) => a.category === cat).reduce((s, a) => s + (a.cur_bal || 0), 0),
  })).filter((x) => x.debt > 0).sort((a, b) => b.debt - a.debt).slice(0, 6);
  const maxCatDebt = catStats[0]?.debt || 1;
  const dueBuckets = [
    { label: "0-7d", count: allAccts.filter((a) => !a.is_paid && a.d_left != null && a.d_left >= 0 && a.d_left <= 7).length },
    { label: "8-14d", count: allAccts.filter((a) => !a.is_paid && a.d_left != null && a.d_left >= 8 && a.d_left <= 14).length },
    { label: "15-30d", count: allAccts.filter((a) => !a.is_paid && a.d_left != null && a.d_left >= 15 && a.d_left <= 30).length },
    { label: "Overdue", count: allAccts.filter((a) => !a.is_paid && a.d_left != null && a.d_left < 0).length },
  ];
  const maxDueBucket = Math.max(1, ...dueBuckets.map((b) => b.count));
  const monthStart = new Date(selYear, selMonth - 1, 1);
  const monthEnd = new Date(selYear, selMonth, 0);
  const dueBands = [];
  const dueCursor = getStartOfWeek(monthStart);
  while (dueCursor <= monthEnd) {
    const start = new Date(dueCursor);
    const end = new Date(dueCursor);
    end.setDate(end.getDate() + 6);
    const visibleStart = start < monthStart ? monthStart : start;
    const visibleEnd = end > monthEnd ? monthEnd : end;
    dueBands.push({
      start: new Date(start),
      end: new Date(end),
      label: `${visibleStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })}-${visibleEnd.toLocaleDateString("en-US", { day: "numeric" })}`,
    });
    dueCursor.setDate(dueCursor.getDate() + 7);
  }
  const dueSeries = dueBands.map((band) => ({
    label: band.label,
    val: allAccts
      .filter((a) => {
        const dueDay = Number(a.due_day || 0);
        if (!dueDay) return false;
        const dueDate = new Date(selYear, selMonth - 1, dueDay);
        return dueDate >= band.start && dueDate <= band.end && dueDate >= monthStart && dueDate <= monthEnd;
      })
      .reduce((s, a) => s + (a.min_due_v || 0), 0),
  }));
  const maxDueSeries = Math.max(1, ...dueSeries.map((d) => d.val));

  const getBadge = (a) => {
    if (a.is_paid)                              return { type:"paid",    label:"Paid",        cls:"" };
    if (a.d_left!=null && a.d_left<0)           return { type:"overdue", label:`Overdue by ${Math.abs(a.d_left)}d`, cls:"bill-overdue" };
    if (a.d_left!=null && a.d_left===0)         return { type:"today",   label:"Due TODAY",     cls:"bill-today" };
    if (a.d_left!=null && a.d_left===1)         return { type:"soon",    label:"Due Tomorrow",  cls:"" };
    if (a.d_left!=null && a.d_left<=3)          return { type:"soon",    label:`Due in ${a.d_left} days`, cls:"" };
    if (a.d_left!=null && a.d_left<=7)          return { type:"soon",    label:`${a.d_left} days left`,   cls:"" };
    if (a.d_left!=null) { const daysInSelMonth = new Date(selYear, selMonth, 0).getDate(); const displayDay = Math.min(Number(a.due_day) || 1, daysInSelMonth); return { type:"normal",  label:`Due ${displayDay < 10 ? "0"+displayDay : displayDay}/${String(selMonth).padStart(2,"0")}`, cls:"" }; }
    return { type:"normal", label:"No due date", cls:"" };
  };

  const badgeStyle = (type) => {
    const map = {
      paid:    { bg:c.goD,   color:c.go,    border:c.go    },
      overdue: { bg:c.daD,   color:c.da,    border:c.da    },
      today:   { bg:c.urD,   color:c.ur,    border:c.ur    },
      soon:    { bg:c.waD,   color:c.wa,    border:c.wa    },
      normal:  { bg:c.surf2, color:c.muted, border:c.border2 },
    }[type] || { bg:c.surf2, color:c.muted, border:c.border2 };
    return {
      display:"inline-flex", alignItems:"center", padding:"3px 9px",
      borderRadius:99, fontSize:11, fontWeight:800, letterSpacing:"0.05em",
      textTransform:"uppercase", border:`1px solid ${map.border}`,
      background:map.bg, color:map.color, whiteSpace:"nowrap",
      fontFamily:"'Instrument Sans',sans-serif",
    };
  };

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

  const mobileActionBarConfig = (() => {
    if (!isMobile) return { title: "", subtitle: "", actions: [], status: null };

    const status = !isOnline
      ? <span style={{ padding:"5px 8px", borderRadius:999, background:`${c.wa}18`, border:`1px solid ${c.wa}40`, color:c.wa, fontSize:11, fontWeight:800 }}>Offline</span>
      : hasPendingSync
        ? <span style={{ padding:"5px 8px", borderRadius:999, background:c.acD, border:`1px solid ${c.ac}40`, color:c.ac, fontSize:11, fontWeight:800 }}>Syncing</span>
        : null;

    if (page === "overview") {
      return {
        title: "Monthly snapshot",
        subtitle: `${MONTHS[selMonth - 1]} ${selYear} ? ${dueSoon.length} due this week`,
        status,
        actions: [
          { label: "Add income", tone: "primary", onClick: () => setShowIncome(true) },
          { label: "Due next", onClick: () => openDueNextView() },
        ],
      };
    }
    if (page === "bills") {
      return {
        title: "Bills workspace",
        subtitle: `${allAccts.length} accounts ? grouped for quick mobile review`,
        status,
        actions: [
          { label: "Add bill", tone: "primary", onClick: () => { navigateTo("settings"); setShowMoreDrawer(false); setShowAddAccountForm(true); } },
          { label: "Filters", onClick: () => setShowFilterSheet(true) },
        ],
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
  })();

  const NAV = [
    { id:"overview",  label:"Overview",  sub:"Overview",    icon:
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg> },
    { id:"bills",     label:"Bills",     sub:"Manage",      icon:
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg> },
    { id:"payoff",    label:"Payoff",    sub:"Strategy",    icon:
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg> },
    { id:"insights",  label:"Trends",  sub:"History",     icon:
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 20h18M5 20V12m4 8V8m4 12V4m4 16v-6"/></svg> },
    { id:"more",      label:"More",      sub:"More",        icon:
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
      isMore: true },
  ];

  const Spinner = ({label}) => (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:`radial-gradient(900px 500px at 10% 10%, ${c.acD}, transparent 60%), linear-gradient(180deg, ${c.bg}, ${c.bg2})`,color:c.muted,fontFamily:"'Instrument Sans',sans-serif",fontSize:14,flexDirection:"column",gap:14}}>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      <div style={{position:"relative",width:56,height:56}}>
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" style={{animation:"spin 1s linear infinite"}}>
          <circle cx="28" cy="28" r="22" stroke={c.border2} strokeWidth="4"/>
          <circle cx="28" cy="28" r="22" stroke={c.ac} strokeWidth="4" strokeLinecap="round" strokeDasharray="30 110"/>
        </svg>
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:c.ac,fontFamily:"'Syne',sans-serif",fontWeight:800}}>◇</div>
      </div>
      <div style={{color:c.tx2,fontWeight:600}}>{label}</div>
    </div>
  );

  if (authLoading) return <LoadingScreen label="Checking authentication..." palette={c} />;
  if (loading) return <LoadingScreen label={`Loading ${MONTHS[selMonth-1]} ${selYear} from cloud...`} palette={c} />;

  const Dashboard = () => (
    <DashboardPage
      mounted={mounted}
      c={c}
      isMobile={isMobile}
      isTablet={isTablet}
      D={D}
      selMonth={selMonth}
      setSelMonth={setSelMonth}
      selYear={selYear}
      setSelYear={setSelYear}
      showFilterSheet={showFilterSheet}
      setShowFilterSheet={setShowFilterSheet}
      showFilters={showFilters}
      setShowFilters={setShowFilters}
      ownerF={ownerF}
      setOwnerF={setOwnerF}
      catF={catF}
      setCatF={setCatF}
      filt={filt}
      setFilt={setFilt}
      allOwners={allOwners}
      allCategories={allCategories}
      lblStyle={lblStyle}
      selStyle={selStyle}
      monthNote={monthNote}
      setMonthNote={setMonthNote}
      setMonthNoteSaved={setMonthNoteSaved}
      monthNoteSaved={monthNoteSaved}
      saveMonthNote={saveMonthNote}
      totalBal={totalBal}
      totalDue={totalDue}
      totalPaid={totalPaid}
      nPaid={nPaid}
      remaining={remaining}
      dueSoon={dueSoon}
      dueNextSectionRef={dueNextSectionRef}
      setShowDueSoon={setShowDueSoon}
      showDueSoon={showDueSoon}
      allAccts={allAccts}
      view={view}
      grouped={grouped}
      dashExpanded={dashExpanded}
      setDashExpanded={setDashExpanded}
      getBadge={getBadge}
      badgeStyle={badgeStyle}
      editId={editId}
      setEditId={setEditId}
      swipeState={swipeState}
      setSwipeState={setSwipeState}
      updateRecord={updateRecord}
      showToast={showToast}
      showUndoToast={showUndoToast}
      getPrevRecord={getPrevRecord}
      getEffectiveApr={getEffectiveApr}
      markPaid={markPaid}
      openEdit={openEdit}
      theme={theme}
      buildAutoBalanceUpdates={buildAutoBalanceUpdates}
      selectedMonthBankHolidays={selectedMonthBankHolidays}
      ownerStats={ownerStats}
      maxOwnerDebt={maxOwnerDebt}
      catStats={catStats}
      maxCatDebt={maxCatDebt}
      dueBuckets={dueBuckets}
      maxDueBucket={maxDueBucket}
      pctDone={pctDone}
      progColor={progColor}
      openDueNextView={openDueNextView}
      income={income}
      showIncome={showIncome}
      setShowIncome={setShowIncome}
      assets={assets}
      savingsGoal={SAVINGS_GOAL}
      dueSeries={dueSeries}
      maxDueSeries={maxDueSeries}
      setPage={setPage}
      setJumpToAddBill={setJumpToAddBill}
      workspaceMode={workspaceMode}
      activeHouseholdId={activeHouseholdId}
      monthKey={monthKey}
      householdProfile={householdProfile}
      householdMembers={householdMembers}
      householdRequests={householdRequests}
      canManageHousehold={canManageHousehold}
      handleApproveHouseholdRequest={handleApproveHouseholdRequest}
      handleRejectHouseholdRequest={handleRejectHouseholdRequest}
      payoffSimulate={payoffSimulate}
      subscription={subscription}
      openBillingPage={openBillingPage}
      reducedMotion={reducedMotion}
      openFeedback={openFeedback}
      reminderPreferences={reminderPreferences}
      pwaInstalled={pwaInstalled}
      launchFlags={launchFlags}
      softLaunchState={softLaunchState}
      patchSoftLaunchState={patchSoftLaunchState}
      onInstallApp={handleInstallApp}
    />
  );

  const Accounts = () => (
    <AccountsPage
      mounted={mounted}
      c={c}
      isMobile={isMobile}
      allAccts={allAccts}
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
      allOwners={allOwners}
      allCategories={allCategories}
      inputStyle={inputStyle}
      selStyle={selStyle}
      bulkMode={bulkMode}
      setBulkMode={setBulkMode}
      bulkSelected={bulkSelected}
      setBulkSelected={setBulkSelected}
      openDueNextView={openDueNextView}
      acctExpanded={acctExpanded}
      setAcctExpanded={setAcctExpanded}
      swipeState={swipeState}
      setSwipeState={setSwipeState}
      updateRecord={updateRecord}
      showToast={showToast}
      showUndoToast={showUndoToast}
      setEditId={setEditId}
      editId={editId}
      getPrevRecord={getPrevRecord}
      getEffectiveApr={getEffectiveApr}
      markPaid={markPaid}
      openEdit={openEdit}
      setPage={setPage}
      theme={theme}
      buildAutoBalanceUpdates={buildAutoBalanceUpdates}
    />
  );

  const Trends = () => {
    const bycat = {};
    allAccts.forEach((a) => { bycat[a.category] = (bycat[a.category] || 0) + (a.cur_bal || 0); });
    const catRows = Object.entries(bycat).sort((a, b) => b[1] - a[1]);
    const ownerRows = allOwners
      .filter((o) => o !== "All")
      .map((owner) => ({
        owner,
        bal: allAccts.filter((a) => a.owner === owner).reduce((s, a) => s + (a.cur_bal || 0), 0),
      }))
      .sort((a, b) => b.bal - a.bal);
    const CHART_COLORS = [c.ac, c.go, c.wa, c.da, "#6366f1"];

    const totalCatDebt = catRows.reduce((s, [, v]) => s + v, 0) || 1;
    const topCategory = catRows[0];
    const topOwner = ownerRows[0];
    const topRateRows = allAccts
      .filter((a) => (a.effectiveApr ?? getEffectiveApr(a)) > 0 && Number(a.cur_bal || 0) > 0)
      .map((a) => ({
        id: a.id,
        name: a.name,
        owner: a.owner,
        balance: Number(a.cur_bal || 0),
        apr: a.effectiveApr ?? getEffectiveApr(a),
      }))
      .sort((a, b) => b.apr - a.apr || b.balance - a.balance)
      .slice(0, 4);
    let accPct = 0;
    const donutStops = catRows.slice(0, 5).map(([, v], i) => {
      const from = accPct;
      const pctV = (v / totalCatDebt) * 100;
      accPct += pctV;
      return `${CHART_COLORS[i % CHART_COLORS.length]} ${from}% ${accPct}%`;
    });
    const donutBg = donutStops.length
      ? `conic-gradient(${donutStops.join(", ")})`
      : `conic-gradient(${c.border2} 0% 100%)`;

    const monthStart = new Date(selYear, selMonth - 1, 1);
    const monthEnd = new Date(selYear, selMonth, 0);
    const dueBands = [];
    const cursor = getStartOfWeek(monthStart);
    while (cursor <= monthEnd) {
      const start = new Date(cursor);
      const end = new Date(cursor);
      end.setDate(end.getDate() + 6);
      const visibleStart = start < monthStart ? monthStart : start;
      const visibleEnd = end > monthEnd ? monthEnd : end;
      dueBands.push({
        start: new Date(start),
        end: new Date(end),
        label: `${visibleStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })}-${visibleEnd.toLocaleDateString("en-US", { day: "numeric" })}`,
      });
      cursor.setDate(cursor.getDate() + 7);
    }
    const dueSeries = dueBands.map((band) => ({
      label: band.label,
      val: allAccts
        .filter((a) => {
          const dueDay = Number(a.due_day || 0);
          if (!dueDay) return false;
          const dueDate = new Date(selYear, selMonth - 1, dueDay);
          return dueDate >= band.start && dueDate <= band.end && dueDate >= monthStart && dueDate <= monthEnd;
        })
        .reduce((s, a) => s + (a.min_due_v || 0), 0),
    }));
    const maxDueSeries = Math.max(1, ...dueSeries.map((d) => d.val));
    return (
        <div style={{opacity:mounted?1:0,transition:"opacity .3s",marginTop:16}}>
          <div
            style={{
              display:"grid",
              gridTemplateColumns:isMobile ? "1fr 1fr" : "repeat(4,minmax(0,1fr))",
              gap:12,
              marginBottom:12,
            }}
          >
            <div style={{background:`linear-gradient(135deg, ${c.ac}14, ${c.surf})`,border:`1px solid ${c.border}`,borderRadius:16,padding:"14px 16px"}}>
              <div style={{fontSize:11,fontWeight:900,letterSpacing:"0.1em",textTransform:"uppercase",color:c.muted,marginBottom:8}}>Biggest share</div>
              <div style={{fontSize:18,fontWeight:900,color:c.tx,marginBottom:4}}>{topCategory ? topCategory[0] : "No data yet"}</div>
              <div style={{fontSize:12,color:c.tx2}}>{topCategory ? `${Math.round((topCategory[1] / totalCatDebt) * 100)}% of debt` : "Add bills to see trends"}</div>
            </div>
            <div style={{background:`linear-gradient(135deg, ${c.wa}12, ${c.surf})`,border:`1px solid ${c.border}`,borderRadius:16,padding:"14px 16px"}}>
              <div style={{fontSize:11,fontWeight:900,letterSpacing:"0.1em",textTransform:"uppercase",color:c.muted,marginBottom:8}}>Top owner</div>
              <div style={{fontSize:18,fontWeight:900,color:c.tx,marginBottom:4}}>{topOwner?.owner || "No data yet"}</div>
              <div style={{fontSize:12,color:c.tx2}}>{topOwner ? fx(topOwner.bal) : "Waiting for balances"}</div>
            </div>
            <div style={{background:`linear-gradient(135deg, ${c.go}12, ${c.surf})`,border:`1px solid ${c.border}`,borderRadius:16,padding:"14px 16px"}}>
              <div style={{fontSize:11,fontWeight:900,letterSpacing:"0.1em",textTransform:"uppercase",color:c.muted,marginBottom:8}}>This month due</div>
              <div style={{fontSize:18,fontWeight:900,color:c.tx,marginBottom:4}}>{fx(dueSeries.reduce((sum, item) => sum + item.val, 0))}</div>
              <div style={{fontSize:12,color:c.tx2}}>Spread across {dueSeries.length} weekly view{dueSeries.length === 1 ? "" : "s"}</div>
            </div>
            <div style={{background:`linear-gradient(135deg, ${c.da}10, ${c.surf})`,border:`1px solid ${c.border}`,borderRadius:16,padding:"14px 16px"}}>
              <div style={{fontSize:11,fontWeight:900,letterSpacing:"0.1em",textTransform:"uppercase",color:c.muted,marginBottom:8}}>Highest rate</div>
              <div style={{fontSize:18,fontWeight:900,color:c.tx,marginBottom:4}}>
                {topRateRows[0] ? `${Math.round(topRateRows[0].apr * 100)}%` : "No APR yet"}
              </div>
              <div style={{fontSize:12,color:c.tx2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                {topRateRows[0] ? topRateRows[0].name : "Add APR to compare"}
              </div>
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1.2fr",gap:12,marginBottom:12}}>
            <div style={{background:c.surf,border:`1px solid ${c.border}`,borderRadius:12,padding:"14px 16px"}}>
              <div style={{fontSize:11,fontWeight:900,letterSpacing:"0.1em",textTransform:"uppercase",color:c.muted,marginBottom:10}}>Debt mix</div>
              <div style={{display:"flex",alignItems:isMobile?"flex-start":"center",gap:14,flexDirection:isMobile?"column":"row"}}>
              <div
                style={{width:170,height:170,borderRadius:"50%",background:donutBg,display:"grid",placeItems:"center",cursor:"pointer",transition:"opacity 0.2s"}}
                onClick={() => { setCatF("All"); navigateTo("bills"); }}
                onMouseEnter={e => e.currentTarget.style.opacity = "0.75"}
                onMouseLeave={e => e.currentTarget.style.opacity = "1"}
              >
                <div style={{width:108,height:108,borderRadius:"50%",background:c.surf,display:"grid",placeItems:"center",border:`1px solid ${c.border}`}}>
                  <div style={{textAlign:"center"}}>
                    <div style={{fontSize:11,color:c.muted,textTransform:"uppercase",letterSpacing:"0.1em"}}>Debt</div>
                    <div style={{fontFamily:"'DM Mono',monospace",fontSize:15,fontWeight:700}}>{fx(totalCatDebt)}</div>
                  </div>
                </div>
              </div>
              <div style={{flex:1,width:isMobile?"100%":"auto"}}>
                {catRows.slice(0, 5).map(([cat, val], i) => (
                  <div
                    key={cat}
                    style={{display:"grid",gridTemplateColumns:"14px 1fr auto",gap:8,alignItems:"center",marginBottom:6,fontSize:12,cursor:"pointer"}}
                    onClick={() => { setCatF(cat); navigateTo("bills"); }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "0.75"}
                    onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                  >
                    <span style={{width:10,height:10,borderRadius:99,background:CHART_COLORS[i % CHART_COLORS.length],display:"inline-block",flexShrink:0}} />
                    <span style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{CAT_ICON[cat] || "-"} {cat}</span>
                    <span style={{fontFamily:"'DM Mono',monospace"}}>{Math.round((val / totalCatDebt) * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
            <div style={{background:c.surf,border:`1px solid ${c.border}`,borderRadius:12,padding:"14px 16px"}}>
              {(() => {
                const ownerColors = [c.ac, "#6366f1", c.wa, c.go, c.da];
                const ownerTotals = ownerRows.map((o, i) => ({ owner: o.owner, total: o.bal, color: ownerColors[i % ownerColors.length] })).filter(d=>d.total>0).sort((a,b)=>b.total-a.total);
                const grandTotal = ownerTotals.reduce((s,d)=>s+d.total,0) || 1;
                return (
                  <div style={{ marginBottom:24 }}>
                    <div style={{ fontSize:11, fontWeight:800, color:c.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10 }}>Who holds the balance</div>
                    <div style={{ height:28, borderRadius:8, overflow:"hidden", display:"flex", marginBottom:12 }}>
                    {ownerTotals.map((d)=>(
                      <div key={d.owner} title={`${d.owner}: ${fx(d.total)}`}
                        style={{ width:`${(d.total/grandTotal)*100}%`, background:d.color, transition:"width 0.5s" }}/>
                    ))}
                  </div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:"8px 20px" }}>
                    {ownerTotals.map((d)=>(
                      <div key={d.owner} style={{ display:"flex", alignItems:"center", gap:6, fontSize:12 }}>
                        <div style={{ width:10, height:10, borderRadius:3, background:d.color, flexShrink:0 }}/>
                        <span style={{ color:c.tx2 }}>{d.owner}</span>
                        <span style={{ color:c.tx, fontWeight:700, fontFamily:"'DM Mono',monospace" }}>{fx(d.total)}</span>
                        <span style={{ color:c.muted }}>({pct(d.total/grandTotal)})</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1.1fr 1fr",gap:12}}>
          <div style={{background:c.surf,border:`1px solid ${c.border}`,borderRadius:12,padding:"14px 16px"}}>
            {(() => {
              // Build last 6 months of total balance data
              // records is only for the current selected month (keyed by account id)
              // For the current month use allAccts; for prior months fall back to starting_bal
              const curMk = getMonthKey(selMonth, selYear);
              const last6Months = [];
              for (let i = 5; i >= 0; i--) {
                const d = new Date(selYear, selMonth - 1 - i, 1);
                const mk = getMonthKey(d.getMonth()+1, d.getFullYear());
                const monthLabel = d.toLocaleString("default", { month: "short" });
                let total;
                if (mk === curMk) {
                  total = allAccts.reduce((sum, a) => sum + (Number(a.cur_bal) || 0), 0);
                } else {
                  total = allAccts.reduce((sum, a) => sum + (Number(a.starting_bal) || 0), 0);
                }
                last6Months.push({ label: monthLabel, total });
              }
              const W = 400, H = 160, PAD = { t:16, r:16, b:32, l:56 };
              const cW = W - PAD.l - PAD.r;
              const cH = H - PAD.t - PAD.b;
              const maxV = Math.max(...last6Months.map(d=>d.total), 1);
              const minV = Math.min(...last6Months.map(d=>d.total), 0);
              const range = maxV - minV || 1;
              const pts = last6Months.map((d,idx) => ({
                x: PAD.l + (idx/(last6Months.length-1||1))*cW,
                y: PAD.t + cH - ((d.total - minV)/range)*cH,
                val: d.total, label: d.label
              }));
              const polyline = pts.map(p=>`${p.x},${p.y}`).join(" ");
              const areaPath = `M${pts[0].x},${PAD.t+cH} ` + pts.map(p=>`L${p.x},${p.y}`).join(" ") + ` L${pts[pts.length-1].x},${PAD.t+cH} Z`;
              return (
                <div style={{ marginBottom:24 }}>
                  <div style={{ fontSize:11, fontWeight:800, color:c.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10 }}>Debt over time</div>
                  <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow:"visible" }}>
                    <defs>
                      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={c.ac} stopOpacity="0.25"/>
                        <stop offset="100%" stopColor={c.ac} stopOpacity="0.02"/>
                      </linearGradient>
                    </defs>
                    {[0,0.5,1].map((f,gi)=>(
                      <line key={gi} x1={PAD.l} x2={W-PAD.r} y1={PAD.t+cH*f} y2={PAD.t+cH*f} stroke={c.border} strokeWidth="1" strokeDasharray="3,4"/>
                    ))}
                    {[0,0.5,1].map((f,gi)=>(
                      <text key={gi} x={PAD.l-6} y={PAD.t+cH*f+4} textAnchor="end" fontSize="9" fill={c.muted} fontFamily="'DM Mono',monospace">
                        {fx(minV+(1-f)*range)}
                      </text>
                    ))}
                    <path d={areaPath} fill="url(#areaGrad)"/>
                    <polyline points={polyline} fill="none" stroke={c.ac} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    {pts.map((p,pi)=>(
                      <g key={pi}>
                        <circle cx={p.x} cy={p.y} r="4" fill={c.ac} stroke={c.surf} strokeWidth="2"/>
                        <text x={p.x} y={H-6} textAnchor="middle" fontSize="9" fill={c.tx2} fontFamily="'Instrument Sans',sans-serif">{p.label}</text>
                      </g>
                    ))}
                  </svg>
                </div>
              );
            })()}
            {(() => {
              // Cash Flow grouped bar chart
              const cfData = [];
              const curMk = getMonthKey(selMonth, selYear);
              for (let i = 5; i >= 0; i--) {
                const d = new Date(selYear, selMonth - 1 - i, 1);
                const mk = getMonthKey(d.getMonth()+1, d.getFullYear());
                const monthLabel = d.toLocaleString("default", { month: "short" });
                let totalBills;
                if (mk === curMk) {
                  totalBills = allAccts.reduce((sum, a) => sum + (Number(a.min_due_v)||0), 0);
                } else {
                  totalBills = allAccts.reduce((sum, a) => sum + (Number(a.budgeted_min)||0), 0);
                }
                const incomeAmt = mk === curMk ? income.reduce((s,e)=>s+(Number(e.amt)||0),0) : 0;
                cfData.push({ label: monthLabel, bills: totalBills, income: incomeAmt });
              }
              const maxCF = Math.max(...cfData.flatMap(d=>[d.bills, d.income]), 1);
              const W = 440, H = 180, PAD = { t:16, r:16, b:32, l:56 };
              const cW = W - PAD.l - PAD.r;
              const cH = H - PAD.t - PAD.b;
              const barGroupW = cW / cfData.length;
              const barW = Math.min(barGroupW * 0.35, 22);
              return (
                <div style={{ marginBottom:24 }}>
                  <div style={{ fontSize:11, fontWeight:800, color:c.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10 }}>Cash in vs bills</div>
                  <div style={{ display:"flex", gap:16, alignItems:"center", marginBottom:8 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:c.tx2 }}><div style={{ width:10,height:10,borderRadius:3,background:c.go }}/> Income</div>
                    <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:c.tx2 }}><div style={{ width:10,height:10,borderRadius:3,background:c.da }}/> Bills</div>
                  </div>
                  <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow:"visible" }}>
                    {[0,0.5,1].map((f,gi)=>(
                      <line key={gi} x1={PAD.l} x2={W-PAD.r} y1={PAD.t+cH*f} y2={PAD.t+cH*f} stroke={c.border} strokeWidth="1" strokeDasharray="3,4"/>
                    ))}
                    {cfData.map((d,ci)=>{
                      const cx = PAD.l + (ci+0.5)*barGroupW;
                      const incomeH = (d.income/maxCF)*cH;
                      const billsH = (d.bills/maxCF)*cH;
                      return (
                        <g key={ci}>
                          <rect x={cx-barW-2} y={PAD.t+cH-incomeH} width={barW} height={incomeH} rx="3" fill={c.go} opacity="0.85"/>
                          <rect x={cx+2} y={PAD.t+cH-billsH} width={barW} height={billsH} rx="3" fill={c.da} opacity="0.85"/>
                          <text x={cx} y={H-6} textAnchor="middle" fontSize="9" fill={c.tx2} fontFamily="'Instrument Sans',sans-serif">{d.label}</text>
                        </g>
                      );
                    })}
                    {[0,0.5,1].map((f,gi)=>(
                      <text key={gi} x={PAD.l-6} y={PAD.t+cH*f+4} textAnchor="end" fontSize="9" fill={c.muted} fontFamily="'DM Mono',monospace">
                        {fx(maxCF*(1-f))}
                      </text>
                    ))}
                  </svg>
                </div>
              );
            })()}
          </div>

            <div style={{background:c.surf,border:`1px solid ${c.border}`,borderRadius:12,padding:"14px 16px"}}>
              <div style={{fontSize:11,fontWeight:900,letterSpacing:"0.1em",textTransform:"uppercase",color:c.muted,marginBottom:6}}>Due flow this month</div>
              <div style={{fontSize:11,color:c.muted,marginBottom:10}}>A calm week-by-week look at what is due next.</div>
            {(() => {
              const W = 520;
              const H = 220;
              const PAD = { t: 28, r: 26, b: 58, l: 48 };
              const cW = W - PAD.l - PAD.r;
              const cH = H - PAD.t - PAD.b;
              const weekStep = dueSeries.length > 1 ? cW / (dueSeries.length - 1) : 0;
              const chartPts = dueSeries.map((d, i) => ({
                x: PAD.l + (i * weekStep),
                y: PAD.t + cH - ((d.val / maxDueSeries) * cH),
                val: d.val,
                label: d.label,
              }));
              const chartLine = chartPts.map((p) => `${p.x},${p.y}`).join(" ");
              const areaPath = chartPts.length
                ? `M${chartPts[0].x},${PAD.t + cH} ` + chartPts.map((p) => `L${p.x},${p.y}`).join(" ") + ` L${chartPts[chartPts.length - 1].x},${PAD.t + cH} Z`
                : "";
              return (
                <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={isMobile ? "210" : "220"} role="img" aria-label="Min due line chart" style={{display:"block"}}>
                  <defs>
                    <linearGradient id="weeklyDueArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c.ac} stopOpacity="0.18"/>
                      <stop offset="100%" stopColor={c.ac} stopOpacity="0.02"/>
                    </linearGradient>
                  </defs>
                  {[0, 0.5, 1].map((f, i) => (
                    <line key={i} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + cH * f} y2={PAD.t + cH * f} stroke={c.border} strokeWidth="1" strokeDasharray="4,6" />
                  ))}
                  {[0, 0.5, 1].map((f, i) => (
                    <text key={i} x={PAD.l - 8} y={PAD.t + cH * f + 4} textAnchor="end" fontSize="10" fill={c.muted} fontFamily="'DM Mono',monospace">
                      {fx(maxDueSeries * (1 - f))}
                    </text>
                  ))}
                  {chartPts.length > 1 && <path d={areaPath} fill="url(#weeklyDueArea)" />}
                  <line x1={PAD.l} y1={PAD.t + cH} x2={W - PAD.r} y2={PAD.t + cH} stroke={c.border2} strokeWidth="1.5" />
                  <polyline points={chartLine} fill="none" stroke={c.ac} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                  {chartPts.map((p) => (
                    <g key={p.label}>
                      <circle cx={p.x} cy={p.y} r="5.5" fill={c.ac} stroke={c.surf} strokeWidth="2.5" />
                      <text x={p.x} y={p.y - 12} textAnchor="middle" fontSize="10" fill={c.muted} fontFamily="'DM Mono',monospace">{fx(p.val)}</text>
                      <text x={p.x} y={H - 18} textAnchor="middle" fontSize="11" fill={c.tx2} fontFamily="'Instrument Sans',sans-serif">{p.label}</text>
                    </g>
                  ))}
                </svg>
              );
            })()}
          </div>
        </div>

        {/* Net Worth Bar */}
        {assets > 0 && (() => {
          const totalDebt = allAccts.reduce((s,a) => s+(Number(a.cur_bal)||0),0);
          const netWorth = assets - totalDebt;
          const total = assets + totalDebt || 1;
          const nwColor = netWorth >= 0 ? c.go : c.da;
          return (
            <div style={{ marginTop:12, background:c.surf, border:`1px solid ${c.border}`, borderRadius:12, padding:"14px 16px", marginBottom:12 }}>
              <div style={{ fontSize:11, fontWeight:800, color:c.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10 }}>Net Worth Snapshot</div>
              <div style={{ height:28, borderRadius:8, overflow:"hidden", display:"flex", marginBottom:10 }}>
                <div title={`Assets: ${fx(assets)}`} style={{ width:`${(assets/total)*100}%`, background:c.go, transition:"width 0.5s", minWidth:2 }}/>
                <div title={`Debt: ${fx(totalDebt)}`} style={{ width:`${(totalDebt/total)*100}%`, background:c.da, transition:"width 0.5s", minWidth:2 }}/>
              </div>
              <div style={{ display:"flex", gap:24, flexWrap:"wrap" }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12 }}>
                  <div style={{ width:10,height:10,borderRadius:3,background:c.go }}/>
                  <span style={{ color:c.tx2 }}>Assets</span>
                  <span style={{ color:c.tx, fontWeight:700, fontFamily:"'DM Mono',monospace" }}>{fx(assets)}</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12 }}>
                  <div style={{ width:10,height:10,borderRadius:3,background:c.da }}/>
                  <span style={{ color:c.tx2 }}>Debt</span>
                  <span style={{ color:c.tx, fontWeight:700, fontFamily:"'DM Mono',monospace" }}>{fx(totalDebt)}</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12 }}>
                  <div style={{ width:10,height:10,borderRadius:3,background:nwColor }}/>
                  <span style={{ color:c.tx2 }}>Net Worth</span>
                  <span style={{ color:nwColor, fontWeight:700, fontFamily:"'DM Mono',monospace" }}>{netWorth>=0?"":"-"}{fx(Math.abs(netWorth))}</span>
                </div>
              </div>
            </div>
          );
        })()}

        {topRateRows.length > 0 && (
          <div style={{ background:c.surf, border:`1px solid ${c.border}`, borderRadius:12, padding:"14px 16px", marginBottom:12 }}>
            <div style={{ fontSize:11, fontWeight:800, color:c.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:6 }}>Highest rates</div>
            <div style={{ fontSize:11, color:c.muted, marginBottom:12 }}>A simple look at the balances that cost the most to carry.</div>
            <div style={{ display:"grid", gap:10 }}>
              {topRateRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => navigateTo("payoff")}
                  style={{
                    display:"grid",
                    gridTemplateColumns:isMobile ? "1fr auto" : "1.4fr auto auto",
                    gap:10,
                    alignItems:"center",
                    width:"100%",
                    textAlign:"left",
                    padding:"12px 14px",
                    borderRadius:12,
                    border:`1px solid ${c.border}`,
                    background:`linear-gradient(135deg, ${c.da}10, ${c.surf})`,
                    cursor:"pointer",
                  }}
                >
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:800, color:c.tx, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{row.name}</div>
                    <div style={{ fontSize:12, color:c.tx2 }}>{row.owner}</div>
                  </div>
                  <div style={{ fontFamily:"'DM Mono',monospace", fontSize:14, fontWeight:800, color:c.da }}>
                    {Math.round(row.apr * 100)}%
                  </div>
                  {!isMobile && (
                    <div style={{ fontFamily:"'DM Mono',monospace", fontSize:13, color:c.tx2 }}>
                      {fx(row.balance)}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const Plans = () => (
    <PayoffPage
      mounted={mounted}
      c={c}
      isMobile={isMobile}
      isTablet={isTablet}
      allAccts={allAccts}
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
      payoffSimulate={payoffSimulate}
      getEffectiveApr={getEffectiveApr}
      setPlanId={setPlanId}
      setPlanName={setPlanName}
      planId={planId}
      plans={plans}
      planName={planName}
      setShowStrategyCompare={setShowStrategyCompare}
      showStrategyCompare={showStrategyCompare}
      lblStyle={lblStyle}
      selStyle={selStyle}
      inputStyle={inputStyle}
      savePlan={savePlan}
      saveBtnStyle={saveBtnStyle}
      buildDefaultPlanItems={buildDefaultPlanItems}
      createPlanDraft={createPlanDraft}
      removePlan={removePlan}
      selMonth={selMonth}
      selYear={selYear}
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
    />
  );

  const Settings = () => (
    <SettingsPage
      mounted={mounted}
      c={c}
      isMobile={isMobile}
      appVersionLabel={APP_VERSION_LABEL}
      currentUserId={user?.uid || ""}
      settingsOverviewRef={settingsOverviewRef}
      settingsBillsRef={settingsBillsRef}
      settingsCategoriesRef={settingsCategoriesRef}
      settingsDataRef={settingsDataRef}
      scrollToSettingsSection={scrollToSettingsSection}
      householdProfile={householdProfile}
      workspaceMode={workspaceMode}
      setHouseholdSetupOpen={setHouseholdSetupOpen}
      setHouseholdSetupTab={setHouseholdSetupTab}
      currentHouseholdMember={currentHouseholdMember}
      householdMembers={householdMembers}
      householdRequests={householdRequests}
      userProfile={userProfile}
      subscription={subscription}
      openBillingPage={openBillingPage}
      stripeReady={stripeReady}
      startBillingCheckout={startBillingCheckout}
      manageBilling={manageBilling}
      firebaseStatus={firebaseStatus}
      baseAccounts={baseAccounts}
      selMonth={selMonth}
      selYear={selYear}
      theme={theme}
      today={today}
      isNativeApp={isNativeApp}
      notifPermission={notifPermission}
      requestBillReminderPermission={requestBillReminderPermission}
      openNotificationSettings={() => navigateTo("notifications")}
      inputStyle={inputStyle}
      newCategoryName={newCategoryName}
      setNewCategoryName={setNewCategoryName}
      addCategory={addCategory}
      saveBtnStyle={saveBtnStyle}
      allCategories={allCategories}
      addBillSectionRef={addBillSectionRef}
      addAcctStep={addAcctStep}
      setAddAcctStep={setAddAcctStep}
      lblStyle={lblStyle}
      newAcct={newAcct}
      setNewAcct={setNewAcct}
      selStyle={selStyle}
      allOwners={allOwners}
      showToast={showToast}
      addCustomAccount={addCustomAccount}
      editingAccountId={editingAccountId}
      setEditingAccountId={setEditingAccountId}
      startEditAccount={startEditAccount}
      deleteAccount={deleteAccount}
      editAcct={editAcct}
      setEditAcct={setEditAcct}
      saveEditAccount={saveEditAccount}
      normalizeMonthInput={normalizeMonthInput}
      normalizeAprDecimal={normalizeAprDecimal}
      canManageHousehold={canManageHousehold}
      handleApproveHouseholdRequest={handleApproveHouseholdRequest}
      handleRejectHouseholdRequest={handleRejectHouseholdRequest}
      householdInviteLink={householdInviteLink}
      handleSaveHouseholdProfile={handleSaveHouseholdProfile}
      handleCopyHouseholdInvite={handleCopyHouseholdInvite}
      handleShareHouseholdInvite={handleShareHouseholdInvite}
      assets={assets}
      saveAssets={saveAssets}
      allAccts={allAccts}
      exportBackup={exportBackup}
      backupLoading={backupLoading}
      importBackup={importBackup}
      openFeedback={openFeedback}
      openPrivacyPage={() => setPage("privacy")}
      openSupportPage={() => setPage("support")}
      copyToClipboard={copyToClipboard}
      softLaunchSummary={softLaunchSummary}
    />
  );

  const Billing = () => (
    <BillingPage
      mounted={mounted}
      c={c}
      isMobile={isMobile}
      subscription={subscription}
      stripeReady={stripeReady}
      onStartCheckout={startBillingCheckout}
      onManageBilling={manageBilling}
    />
  );

  const BetaHelp = () => (
    <BetaHelpPage
      mounted={mounted}
      c={c}
      isMobile={isMobile}
      appVersionLabel={APP_VERSION_LABEL}
      billingEnabled={launchFlags.billingEnabled}
      openFeedback={openFeedback}
      copyToClipboard={copyToClipboard}
    />
  );

  const FounderOps = () => (
    <FounderOpsPage
      mounted={mounted}
      c={c}
      isMobile={isMobile}
      appVersionLabel={APP_VERSION_LABEL}
      supportEmail={SUPPORT_EMAIL}
      launchFlags={launchFlags}
      softLaunchSummary={softLaunchSummary}
      feedbackSentCount={founderOpsState.feedbackSentCount}
      copyToClipboard={copyToClipboard}
      founderOpsTick={founderOpsTick}
    />
  );

  const PrivacySecurity = () => (
    <PrivacySecurityPage
      mounted={mounted}
      c={c}
      isMobile={isMobile}
    />
  );

  const Support = () => (
    <SupportPage
      mounted={mounted}
      c={c}
      isMobile={isMobile}
      supportEmail={SUPPORT_EMAIL}
      openFeedback={openFeedback}
      copyToClipboard={copyToClipboard}
    />
  );

  const NotificationSettings = () => (
    <NotificationSettingsPage
      mounted={mounted}
      c={c}
      isMobile={isMobile}
      notifPermission={notifPermission}
      requestBillReminderPermission={requestBillReminderPermission}
      reminderPreferences={reminderPreferences}
      preferencesLoading={preferencesLoading}
      patchReminderPreferences={patchReminderPreferences}
      pwaInstalled={pwaInstalled}
    />
  );

  const DueNext = () => (
    <DueNextPage
      mounted={mounted}
      c={c}
      isMobile={isMobile}
      dueNextWeekOffset={dueNextWeekOffset}
      setDueNextWeekOffset={setDueNextWeekOffset}
      weekAnchor={weekAnchor}
      weekEnd={weekEnd}
      dueNextBills={dueNextBills}
      dueNextGroups={dueNextGroups}
      dueNextExpanded={dueNextExpanded}
      setDueNextExpanded={setDueNextExpanded}
      selMonth={selMonth}
      selYear={selYear}
      dueNextItemRefs={dueNextItemRefs}
      dueNextTargetId={dueNextTargetId}
      markPaid={markPaid}
    />
  );

  const History = () => (
    <HistoryPage
      mounted={mounted}
      c={c}
      user={user}
      isLocalUser={isLocalUser}
      ensureLocalUserData={ensureLocalUserData}
      monthKey={monthKey}
      loadUploads={loadUploads}
      workspaceScope={workspaceScope}
      selMonth={selMonth}
      selYear={selYear}
      normalizeAprDecimal={normalizeAprDecimal}
      isMobile={isMobile}
    />
  );

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        html, body, #root { width:100%; min-height:100vh; }
        body {
          background:
            radial-gradient(1400px 600px at -8% -12%, ${c.acD}, transparent 60%),
            radial-gradient(1000px 500px at 108% 2%, ${c.waD}, transparent 55%),
            radial-gradient(700px 400px at 50% 100%, ${D?"rgba(0,201,167,.07)":"rgba(0,201,167,.04)"}, transparent 70%),
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
      <div className="app-shell-scroll" style={{minHeight:"100vh",width:"100%",background:`radial-gradient(1200px 520px at -5% -10%, ${c.acD}, transparent 62%), radial-gradient(900px 420px at 105% 0%, ${c.waD}, transparent 58%), linear-gradient(180deg, ${c.bg}, ${c.bg2})`,color:c.tx,fontFamily:"'Instrument Sans','Inter',sans-serif",transition:"background .2s,color .2s",paddingTop:isMobile?`calc(${safeTop} + 6px)`:0,paddingBottom:isMobile?`calc(${safeBottom} + 190px)`:`calc(${safeBottom} + 8px)`}}>
        <div className="app-shell-page" style={{width:"100%",maxWidth:1400,margin:"0 auto",padding:isMobile?"0 12px 96px":"0 32px 80px"}}>
          {!pwaInstalled && (showInstallPrompt || (!!returnPrompt && offlineReady)) && (
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
            ? {position:"fixed",top:0,left:0,right:0,zIndex:140,background:`linear-gradient(180deg, ${c.bg}F2 0%, ${c.bg}E8 75%, ${c.bg}00 100%)`,backdropFilter:"blur(10px)",padding:`calc(${safeTop} + 6px) 10px 8px`,borderBottom:`1px solid ${c.border}`,pointerEvents:"none"}
            : {position:"sticky",top:`calc(${safeTop} + 0px)`,zIndex:20,background:`linear-gradient(180deg, ${c.bg}EE 0%, ${c.bg}D8 65%, transparent 100%)`,backdropFilter:"blur(8px)",paddingBottom:8,marginBottom:6,pointerEvents:"none"}
          }>
          <div style={{display:"flex",alignItems:isMobile?"flex-start":"center",justifyContent:"space-between",padding:isMobile ? "14px 0 12px" : "18px 0 14px",borderBottom:`1px solid ${c.border}`,marginBottom:6,background:`linear-gradient(90deg, ${c.acD}, transparent 46%, ${c.waD})`,borderRadius:12,paddingLeft:isMobile?10:14,paddingRight:isMobile?10:14,gap:12,flexWrap:isMobile?"wrap":"nowrap",pointerEvents:"auto"}}>
            <div style={{display:"flex",alignItems:isMobile?"flex-start":"baseline",gap:8,flexWrap:"wrap"}}>
              <div style={{fontFamily:"'Syne',sans-serif",fontSize:isMobile?16:22,fontWeight:800,letterSpacing:"-0.05em",color:c.tx,display:"flex",alignItems:"center",gap:6}}>
                <span>Household</span>
                <span style={{width:isMobile?8:10,height:isMobile?8:10,borderRadius:"50%",background:c.ac,display:"inline-block",transform:"translateY(-1px)"}} />
                <span>Budget</span>
              </div>
              <span style={{fontSize:isMobile?11:13,color:c.muted,marginLeft:isMobile?0:10,fontWeight:400}}>
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
            <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:isMobile?"wrap":"nowrap",width:isMobile?"100%":"auto",justifyContent:isMobile?"flex-start":"flex-end"}}>
              <button onClick={() => { setCmdkOpen(true); setCmdkQuery(""); }}
                title="Search (Ctrl+K)"
                style={{ padding:isMobile ? "10px 14px" : "6px 8px", borderRadius:7, border:`1.5px solid ${c.border2}`, background:"transparent", color:c.tx2, cursor:"pointer", display:"flex", alignItems:"center", gap:5, fontSize:12 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/><path d="M9.5 9.5l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                {!isMobile && <span>Ctrl+K</span>}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={exportAllData}
                title="Download all your data as JSON"
                style={{padding:"7px 13px",borderRadius:9,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Instrument Sans',sans-serif",display:"flex",alignItems:"center",gap:5}}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export
              </button>
              <button
                className="btn-ghost"
                style={{padding:"7px 13px",borderRadius:9,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Instrument Sans',sans-serif",display:"flex",alignItems:"center",gap:5}}
                onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
                title="Toggle light / dark mode"
              >
                {theme==="dark"
                  ? <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> Light</>
                  : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> Dark</>
                }
              </button>
              {user && (
                <button
                  className="btn-ghost"
                  onClick={async()=>{
                    if (user.isLocal || isLocalUser) {
                      setUser(null); setIsLocalUser(false); showToast('Signed out');
                    } else {
                      try { await logout(); setUser(null); showToast('Signed out'); } catch(e){ console.error(e); setUser(null); showToast('Signed out'); }
                    }
                  }}
                  style={{padding:"7px 13px",borderRadius:9,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Instrument Sans',sans-serif",display:"flex",alignItems:"center",gap:5}}
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
            setAuthMode={(updater) => {
              setAuthError(null);
              setAuthMode(updater);
            }}
          />
          {!isMobile && (
            <div style={{ pointerEvents:"auto" }}>
              <TopNav
                navItems={NAV}
                page={page}
                palette={c}
                isMobile={isMobile}
                showMoreDrawer={showMoreDrawer}
                setShowMoreDrawer={setShowMoreDrawer}
                navigateTo={navigateTo}
              />
            </div>
          )}
          <div style={{ pointerEvents:"auto" }}>
            <DueSoonBanner
              visible={dueBanner}
              accounts={allAccts}
              palette={c}
              onView={openDueNextView}
              onClose={() => setDueBanner(false)}
            />
          </div>
          <div style={{ pointerEvents:"auto" }}>
            <SyncStatusBar
              palette={c}
              isOnline={isOnline}
              hasPendingSync={hasPendingSync}
              isLocalUser={isLocalUser}
              offlineReady={offlineReady}
            />
          </div>
          <div style={{paddingTop:isMobile?`calc(${mobileTopChrome} + 12px)`:16, animation: !reducedMotion && pageVisible ? "pageIn 0.24s ease forwards" : "none", opacity: pageVisible ? undefined : 0, position:"relative", zIndex:isMobile?1:40, isolation:"isolate", pointerEvents:"auto"}}>
            {page === "overview" && (
              <OverviewPage
                showDueSoon={showDueSoon}
                dueNextSectionRef={dueNextSectionRef}
                renderDashboard={Dashboard}
                renderDueNext={DueNext}
              />
            )}
            {page === "bills" && Accounts()}
            {page === "payoff" && Plans()}
            {page === "insights" && Trends()}
            {page === "billing" && Billing()}
            {page === "beta" && BetaHelp()}
            {page === "founder" && founderOpsVisible && FounderOps()}
            {page === "privacy" && PrivacySecurity()}
            {page === "support" && Support()}
            {page === "notifications" && NotificationSettings()}
            {page === "upload" && (
              <div>
                <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
                  {[["excel","From Excel/CSV"],["pdf","From PDF Statement"],["other","From Other Files/Docs"]].map(([id,label])=>(
                    <button key={id}
                      onClick={()=>setUploadTab(id)}
                      style={{padding:"8px 18px",borderRadius:8,border:`1.5px solid ${uploadTab===id?c.ac:c.border}`,background:uploadTab===id?c.acD:c.surf,color:uploadTab===id?c.ac:c.muted,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"'Instrument Sans',sans-serif",transition:"all .15s"}}>
                      {label}
                    </button>
                  ))}
                </div>
                {uploadTab === "excel" && (
                  <Suspense fallback={<LoadingState palette={c} label="Opening import tools..." />}>
                    <ExcelImport
                      accounts={allAccts}
                      monthKey={monthKey}
                      theme={theme}
                      onImported={async (id, updates) => {
                        await updateRecord(id, updates);
                        showToast("Imported from Excel");
                      }}
                      onUpload={handleUpload}
                    />
                  </Suspense>
                )}
                {uploadTab === "pdf" && (
                  <Suspense fallback={<LoadingState palette={c} label="Opening PDF reader..." />}>
                    <StatementUpload
                      accounts={allAccts}
                      monthKey={monthKey}
                      theme={theme}
                      sourceMode="pdf"
                      onSaved={async (id, updates) => {
                        await updateRecord(id, updates);
                        showToast("Updated from statement");
                      }}
                      onUpload={handleUpload}
                    />
                  </Suspense>
                )}
                {uploadTab === "other" && (
                  <Suspense fallback={<LoadingState palette={c} label="Opening image reader..." />}>
                    <StatementUpload
                      accounts={allAccts}
                      monthKey={monthKey}
                      theme={theme}
                      sourceMode="other"
                      onSaved={async (id, updates) => {
                        await updateRecord(id, updates);
                        showToast("Updated from file");
                      }}
                      onUpload={handleUpload}
                    />
                  </Suspense>
                )}
              </div>
            )}
            {page === "history" && History()}
            {page === "settings" && Settings()}
          </div>
        </div>
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
                {householdSetupOpen && user && !(user.isLocal || isLocalUser) && (
          <>
            <div style={{ position:"fixed", inset:0, zIndex:620, background:"rgba(0,0,0,0.7)" }} />
            <div style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", zIndex:621, background:c.surf, borderRadius:20, padding:isMobile?"24px 18px":"28px 30px", width:isMobile?"94vw":640, maxHeight:"88vh", overflowY:"auto", boxShadow:"0 20px 80px rgba(0,0,0,0.4)" }}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:18}}>
                <div>
                  <div style={{fontSize:11,fontWeight:900,letterSpacing:"0.1em",textTransform:"uppercase",color:c.muted,marginBottom:6}}>Household setup</div>
                  <div style={{fontSize:22,fontWeight:800,color:c.tx}}>Choose your shared path</div>
                </div>
                <button type="button" onClick={() => setHouseholdSetupOpen(false)} style={{background:"none",border:"none",color:c.muted,fontSize:24,cursor:"pointer",lineHeight:1}}>×</button>
              </div>
              <HouseholdSetupPage
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
              />
            </div>
          </>
        )}
        <MoreDrawer
          open={showMoreDrawer}
          page={page}
          palette={c}
          isMobile={isMobile}
          onClose={() => setShowMoreDrawer(false)}
          navigateTo={navigateTo}
          founderOpsEnabled={founderOpsVisible}
        />
        {/* Income Modal */}
        {showIncome && (
          <>
            <div onClick={() => setShowIncome(false)} style={{ position:"fixed", inset:0, zIndex:175, background:"rgba(0,0,0,0.45)", transform:"translateZ(0)" }} />
            <div style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%) translateZ(0)", zIndex:176, background:c.surf, borderRadius:18, padding: isMobile ? "20px 16px" : 28, width: isMobile ? "92vw" : 520, maxHeight:"80vh", overflowY:"auto", boxShadow:"0 8px 48px rgba(0,0,0,0.25)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
                <span style={{ fontSize:17, fontWeight:800, color:c.tx }}>Income This Month</span>
                <button onClick={() => setShowIncome(false)} style={{ background:"none", border:"none", color:c.tx2, fontSize:24, cursor:"pointer", lineHeight:1, padding:"0 4px" }}>×</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1.15fr .85fr",gap:16}}>
                <div>
                  <div style={{fontSize:11,fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",color:c.muted,marginBottom:8}}>Paycheck Receipt Tracker</div>
                  <div style={{display:"grid",gap:8}}>
                    {[["BOA", boaPayPeriods], ["Eagleview", eagleviewPayPeriods]].map(([label, periods]) => (
                      <div key={label} style={{padding:"10px 12px",borderRadius:10,border:`1px solid ${c.border}`,background:c.surf2}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                          <div style={{fontWeight:800,fontSize:13}}>{label}</div>
                          <div style={{fontSize:12,color:c.muted}}>
                            {periods.length} pay period{periods.length === 1 ? "" : "s"} - {fx(periods.reduce((sum, period) => sum + period.amount, 0))}
                          </div>
                        </div>
                        <div style={{display:"grid",gap:8}}>
                          {periods.map((period) => {
                            const isReceived = !!incomeReceipts?.[period.key];
                            return (
                            <div key={period.key} style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1.2fr .8fr 1fr",gap:8,alignItems:"center"}}>
                              <div>
                                <div style={{fontWeight:700,fontSize:12}}>{period.label}</div>
                                <div style={{fontSize:11,color:c.muted}}>
                                  {period.holidayCount > 0 ? `${period.holidayCount} calendar adjustment` : "Normal pay period"}
                                </div>
                              </div>
                              <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700}}>{fx(period.amount)}</div>
                              <div style={{display:"flex",gap:8,justifyContent:isMobile?"stretch":"flex-end",flexWrap:"wrap"}}>
                                <button
                                  type="button"
                                  onClick={() => updateIncomeReceipt(period.key, "pending")}
                                  style={{
                                    flex:isMobile?1:"0 0 auto",
                                    minWidth:isMobile?0:104,
                                    padding:"9px 12px",
                                    borderRadius:999,
                                    border:`1px solid ${!isReceived ? c.wa : c.border2}`,
                                    background:!isReceived ? `${c.wa}18` : c.surf,
                                    color:!isReceived ? c.wa : c.tx2,
                                    fontSize:12,
                                    fontWeight:800,
                                    cursor:"pointer"
                                  }}
                                >
                                  {!isReceived ? "Pending" : "Marked pending"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateIncomeReceipt(period.key, "received")}
                                  style={{
                                    flex:isMobile?1:"0 0 auto",
                                    minWidth:isMobile?0:104,
                                    padding:"9px 12px",
                                    borderRadius:999,
                                    border:`1px solid ${isReceived ? c.go : c.border2}`,
                                    background:isReceived ? `${c.go}16` : c.surf,
                                    color:isReceived ? c.go : c.tx2,
                                    fontSize:12,
                                    fontWeight:800,
                                    cursor:"pointer"
                                  }}
                                >
                                  {isReceived ? "✓ Received" : "Received"}
                                </button>
                              </div>
                            </div>
                          )})}
                          {!periods.length && <div style={{fontSize:12,color:c.muted}}>No pay periods found in this month.</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{fontSize:11,fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",color:c.muted,marginBottom:8}}>Recurring And Extra Income</div>
                  <div style={{display:"grid",gap:8,marginBottom:10}}>
                    {[...recurringIncomeEntries, ...manualIncomeEntries].map((entry, index) => (
                      <div key={`${entry.src}-${index}`} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${c.border}`,fontSize:13}}>
                        <span>{entry.src}</span>
                        <span style={{fontFamily:"'DM Mono',monospace"}}>{fx(entry.amt)}</span>
                      </div>
                    ))}
                  </div>
                  <div style={lblStyle}>Extra income source</div>
                  <select style={{...selStyle,marginBottom:8}} value={newInc.src} onChange={e=>setNewInc(v=>({...v,src:e.target.value}))}>
                    {incomeSources.map(o=><option key={o}>{o}</option>)}
                  </select>
                  <div style={lblStyle}>Amount ($)</div>
                  <input type="number" style={{...inputStyle,marginBottom:8}} placeholder="0.00" value={newInc.amt} onChange={e=>setNewInc(v=>({...v,amt:e.target.value}))}/>
                  <button type="button" style={saveBtnStyle} onClick={addIncome}>Add This Month</button>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:8}}>
                    <button type="button" onClick={saveCurrentAsIncomeSchedule} style={{padding:"8px",borderRadius:8,border:`1px solid ${c.border2}`,background:c.surf2,color:c.tx2,fontSize:12,fontWeight:700,cursor:"pointer"}}>
                      Save as Recurring
                    </button>
                    <button type="button" onClick={applyIncomeSchedule} style={{padding:"8px",borderRadius:8,border:`1px solid ${c.border2}`,background:c.surf2,color:c.tx2,fontSize:12,fontWeight:700,cursor:"pointer"}}>
                      Add Recurring Extras
                    </button>
                  </div>
                  <div style={{fontSize:11,color:c.muted,marginTop:8}}>
                    BOA weeks: {boaPayPeriods.length} - Eagleview checks: {eagleviewPayPeriods.length} - Custom recurring: {incomeTemplates.length}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
        {/* EditPanel — bottom sheet on mobile, centered modal on desktop */}
        {editId && (() => {
          const acct = allAccts.find(ac => ac.id === editId);
          if (!acct) return null;
          return (
            <>
              <div onClick={() => setEditId(null)} style={{ position:"fixed", inset:0, zIndex:170, background:"rgba(0,0,0,0.4)", transform:"translateZ(0)" }}/>
              <div style={ isMobile
                ? { position:"fixed", bottom:0, left:0, right:0, zIndex:171, background:c.surf, borderRadius:"18px 18px 0 0", padding:`20px 20px calc(${safeBottom} + 32px)`, maxHeight:"80vh", overflowY:"auto", transform:"translateZ(0)" }
                : { position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%) translateZ(0)", zIndex:171, background:c.surf, borderRadius:16, padding:"24px 28px", width:560, maxHeight:"88vh", overflowY:"auto", boxShadow:"0 8px 48px rgba(0,0,0,0.28)" }
              }>
                {isMobile && <div style={{ width:36, height:4, borderRadius:2, background:c.border2, margin:"0 auto 16px" }}/>}
                <EditPanel
                  key={acct.id}
                  a={acct}
                  theme={theme}
                  onSave={async (vals) => {
                    await updateRecord(acct.id, buildAutoBalanceUpdates(acct, {
                      paid_v: parseFloat(vals.paid_v) || 0,
                      min_due_v: parseFloat(vals.min_due_v) || 0,
                      cur_bal: parseFloat(vals.cur_bal) || 0,
                      purch_v: parseFloat(vals.purch_v) || 0,
                      interest_paid_v: parseFloat(vals.interest_paid_v) || 0,
                      apr_pct: parseFloat(vals.apr_pct) || 0,
                    }));
                    // Sync APR back to accountOverrides so Settings always shows the same value
                    const aprDecimal = (parseFloat(vals.apr_pct) || 0) / 100;
                    const nextOverrides = { ...accountOverrides, [acct.id]: { ...(accountOverrides[acct.id] || {}), apr: aprDecimal } };
                    setAccountOverrides(nextOverrides);
                    await persistUserSettings(customAccounts, userCategories, incomeTemplates, deletedAccountIds, nextOverrides);
                    setEditId(null);
                    showToast(`Saved: ${acct.name}`);
                  }}
                  onClose={() => setEditId(null)}
                />
              </div>
            </>
          );
        })()}
        {isMobile && (
          <>
            <MobileActionBar
              palette={c}
              safeBottom={safeBottom}
              title={mobileActionBarConfig.title}
              subtitle={mobileActionBarConfig.subtitle}
              actions={mobileActionBarConfig.actions}
              status={mobileActionBarConfig.status}
            />
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
          <>
            <div onClick={() => setShowFilterSheet(false)} style={{ position:"fixed", inset:0, zIndex:190, background:"rgba(0,0,0,0.4)", transform:"translateZ(0)" }} />
            <div style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:191, background:c.surf, borderRadius:"18px 18px 0 0", padding:"20px 20px 36px", boxShadow:"0 -4px 32px rgba(0,0,0,0.18)", transform:"translateZ(0)" }}>
              <div style={{ width:36, height:4, borderRadius:2, background:c.border2, margin:"0 auto 20px" }} />
              <div style={{ fontSize:15, fontWeight:800, color:c.tx, marginBottom:18 }}>Filters</div>
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:800, color:c.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:6 }}>Owner</div>
                  <select value={ownerF} onChange={e => setOwnerF(e.target.value)} style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:`1.5px solid ${c.border2}`, background:c.surf, color:c.tx, fontSize:14 }}>
                    <option value="All">All</option>
                    {[...new Set(allAccts.map(a=>a.owner))].filter(Boolean).map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:800, color:c.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:6 }}>Category</div>
                  <select value={catF} onChange={e => setCatF(e.target.value)} style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:`1.5px solid ${c.border2}`, background:c.surf, color:c.tx, fontSize:14 }}>
                    <option value="All">All</option>
                    {[...new Set(allAccts.map(a=>a.category))].filter(Boolean).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:800, color:c.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:6 }}>Status</div>
                  <select value={filt} onChange={e => setFilt(e.target.value)} style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:`1.5px solid ${c.border2}`, background:c.surf, color:c.tx, fontSize:14 }}>
                    {(typeof FILTERS !== "undefined" ? FILTERS : ["All","Unpaid","Paid","Overdue"]).map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>
              <button onClick={() => setShowFilterSheet(false)} style={{ width:"100%", marginTop:20, padding:"13px", borderRadius:10, border:"none", background:c.ac, color:"#000", fontSize:15, fontWeight:700, cursor:"pointer" }}>
                Apply Filters
              </button>
            </div>
          </>
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
          <>
            <div onClick={() => setCmdkOpen(false)} style={{ position:"fixed", inset:0, zIndex:500, background:"rgba(0,0,0,0.5)" }} />
            <div style={{ position:"fixed", top:"18%", left:"50%", transform:"translateX(-50%)", zIndex:501, width: isMobile ? "92vw" : 520, background:c.surf, borderRadius:18, boxShadow:"0 16px 64px rgba(0,0,0,0.35)", overflow:"hidden" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 18px", borderBottom:`1px solid ${c.border}` }}>
                <svg width="16" height="16" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.5" stroke={c.muted} strokeWidth="1.5"/><path d="M9.5 9.5l3 3" stroke={c.muted} strokeWidth="1.5" strokeLinecap="round"/></svg>
                <input ref={cmdkInputRef} value={cmdkQuery} onChange={e => setCmdkQuery(e.target.value)}
                  placeholder="Search accounts, pages..."
                  style={{ flex:1, background:"transparent", border:"none", outline:"none", fontSize:15, color:c.tx, fontFamily:"'Instrument Sans',sans-serif" }} />
                <kbd style={{ fontSize:11, color:c.muted, background:c.surf2, border:`1px solid ${c.border}`, borderRadius:5, padding:"2px 6px" }}>ESC</kbd>
              </div>
              {cmdkResults.length === 0 && cmdkQuery.trim().length > 0 && (
                <div style={{ padding:"24px 18px", textAlign:"center", color:c.muted, fontSize:13 }}>No results for &ldquo;{cmdkQuery}&rdquo;</div>
              )}
              {cmdkResults.length === 0 && cmdkQuery.trim().length === 0 && (
                <div style={{ padding:"16px 18px", color:c.muted, fontSize:12 }}>
                  <div style={{ marginBottom:8, fontWeight:700 }}>Quick Navigate</div>
                  {["Overview","Bills","Payoff Planner","Trends","Beta help", ...(founderOpsVisible ? ["Founder ops"] : []), "Privacy","Help & FAQ","Billing"].map(label => (
                    <div key={label} style={{ padding:"6px 0", fontSize:13, color:c.tx2, cursor:"pointer" }}
                      onClick={() => {
                        setPage(
                          label === "Payoff Planner"
                            ? "payoff"
                            : label === "Trends"
                            ? "insights"
                            : label === "Beta help"
                            ? "beta"
                            : label === "Founder ops"
                            ? "founder"
                            : label === "Help & FAQ"
                            ? "support"
                            : label.toLowerCase()
                        );
                        setCmdkOpen(false);
                      }}>
                      {label}
                    </div>
                  ))}
                </div>
              )}
              {cmdkResults.length > 0 && (
                <div style={{ maxHeight:320, overflowY:"auto" }}>
                  {cmdkResults.map((r, i) => (
                    <div key={i} onClick={r.action}
                      style={{ padding:"11px 18px", display:"flex", alignItems:"center", gap:12, cursor:"pointer", borderBottom:`1px solid ${c.border}` }}
                      onMouseEnter={e => e.currentTarget.style.background = c.surf2}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <div style={{ width:32, height:32, borderRadius:8, background:c.acD, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0 }}>
                        {r.type === "page" ? r.icon : "$"}
                      </div>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:c.tx, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.label}</div>
                        <div style={{ fontSize:11, color:c.muted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.sub}</div>
                      </div>
                      {r.type === "account" && (
                        <div style={{ marginLeft:"auto", fontSize:11, color:c.muted, flexShrink:0 }}>Bills</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ padding:"8px 18px", borderTop:`1px solid ${c.border}`, display:"flex", gap:16, fontSize:11, color:c.muted }}>
                <span>Arrow keys</span><span>Enter select</span><span>ESC close</span>
                <span style={{ marginLeft:"auto" }}>Ctrl+K to toggle</span>
              </div>
            </div>
          </>
        )}
        <SuccessToast toast={toast} palette={c} reducedMotion={reducedMotion} />
      </div>
    </div>
  </>
  );

}




