import { useEffect, useMemo, useState } from "react";
import HouseholdPage from "./HouseholdPage";
import { CURRENCY_OPTIONS, fx, getCurrencyLabel, moneyFieldLabel, pct } from "../utils/budgetUtils";
import { CAT_ICON, MONTHS } from "../data/mockAccounts";
import BillFilterBar from "../components/bills/BillFilterBar";
import PlanStatusCard from "../components/billing/PlanStatusCard";
import UpgradeCard from "../components/billing/UpgradeCard";
import TesterToolsCard from "../components/ui/TesterToolsCard";
import PageErrorBoundary from "../components/ui/PageErrorBoundary";
import { BRAND_NAME } from "../config/brand";
import StatementUpload from "../StatementUpload";
import ExcelImport from "../ExcelImport";
import {
  BILL_TYPE_OPTIONS,
  getBillBadges,
  getBillTypeHelp,
  getBillTypeLabel,
  matchesBillFilter,
  normalizeBillType,
} from "../services/billModel";

function AccordionSection({
  title,
  subtitle,
  badge,
  open,
  onToggle,
  c,
  children,
  noPadding = false,
  sectionId,
  retryKey = 0,
  onRetry,
}) {
  const sectionName = sectionId || title;
  return (
    <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 16, marginBottom: 10, overflow: "hidden" }}>
      <button
        type="button"
        onClick={onToggle}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "16px 20px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 800, fontSize: 15, color: c.tx }}>{title}</span>
            {badge != null && badge > 0 && (
              <span style={{ padding: "2px 7px", borderRadius: 999, background: c.ac, color: "#001014", fontSize: 10, fontWeight: 900 }}>{badge}</span>
            )}
          </div>
          {subtitle && <div style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>{subtitle}</div>}
        </div>
        <span style={{ color: c.muted, fontSize: 20, lineHeight: 1, flexShrink: 0, fontWeight: 300 }}>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <PageErrorBoundary
          key={`${sectionName}-${retryKey}`}
          palette={c}
          sectionName={`settings:${sectionName}`}
          resetToken={`${sectionName}-${retryKey}`}
          onReset={onRetry}
          title={`${title} hit a problem`}
          description="Try again to reopen this section. If it still fails, the rest of Settings is still safe to use."
        >
          <div style={{ borderTop: `1px solid ${c.border}`, padding: noPadding ? 0 : "20px 20px" }}>
            {children}
          </div>
        </PageErrorBoundary>
      )}
    </div>
  );
}

function SectionLabel({ children, c }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 8, marginTop: 16 }}>
      {children}
    </div>
  );
}

export default function SettingsPage(props) {
  const {
    mounted,
    c,
    isMobile,
    appVersionLabel,
    currentUserId,
    currentUserEmail,
    currentUserLabel,
    userIsLocal,
    currencyCode,
    saveCurrencyPreference,
    // refs kept for compat but not used in accordion layout
    // settingsOverviewRef, settingsBillsRef, settingsCategoriesRef, settingsDataRef, scrollToSettingsSection
    householdProfile = {},
    workspaceMode,
    setHouseholdSetupOpen,
    setHouseholdSetupTab,
    currentHouseholdMember,
    householdMembers = [],
    householdRequests = [],
    userProfile,
    subscription = {},
    openBillingPage,
    stripeReady,
    startBillingCheckout,
    manageBilling,
    firebaseStatus = {},
    baseAccounts = [],
    selMonth,
    selYear,
    theme,
    today,
    isNativeApp,
    notifPermission,
    requestBillReminderPermission,
    openNotificationSettings,
    inputStyle,
    newCategoryName,
    setNewCategoryName,
    addCategory,
    saveBtnStyle,
    allCategories = [],
    addBillSectionRef,
    addAcctStep,
    setAddAcctStep,
    lblStyle,
    newAcct,
    setNewAcct,
    selStyle,
    allOwners = [],
    billActivity = [],
    showToast,
    addCustomAccount,
    editingAccountId,
    setEditingAccountId,
    startEditAccount,
    deleteAccount,
    editAcct,
    setEditAcct,
    saveEditAccount,
    deleteAccounts,
    normalizeMonthInput,
    normalizeAprDecimal,
    canManageHousehold,
    handleApproveHouseholdRequest,
    handleRejectHouseholdRequest,
    handleLeaveHousehold,
    handleDeleteHousehold,
    handleRemoveHouseholdMember,
    handleSetMemberRole,
    handleSaveHouseholdProfile,
    handleCopyHouseholdInvite,
    handleShareHouseholdInvite,
    handleInviteHouseholdMemberByUserId,
    householdInviteLink,
    pendingHouseholdId,
    pendingHouseholdName,
    cancelPendingRequest,
    onForgotPassword,
    onUpdatePassword,
    onDeleteAccount,
    passwordUpdateLoading,
    assets = 0,
    saveAssets,
    allAccts = [],
    updateRecord,
    handleUpload,
    paySchedule,
    savePaySchedule,
    exportBackup,
    backupLoading,
    importBackup,
    exportAdminBackup,
    adminBackupLoading,
    openFeedback,
    openPrivacyPage,
    openSupportPage,
    copyToClipboard,
    softLaunchSummary,
    founderAccount,
  } = props;

  const getSessionValue = (key, fallback) => {
    if (typeof window === "undefined") return fallback;
    try {
      const value = window.sessionStorage.getItem(key);
      return value == null || value === "" ? fallback : value;
    } catch {
      return fallback;
    }
  };
  const getSessionJson = (key, fallback) => {
    if (typeof window === "undefined") return fallback;
    try {
      const value = window.sessionStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  };

  const [openSection, setOpenSection] = useState(() => getSessionValue("__ttz_settings_open_section__", "account"));
  const [sectionRetryKeys, setSectionRetryKeys] = useState({});
  const [passwordDraft, setPasswordDraft] = useState({ currentPassword: "", nextPassword: "", confirmPassword: "" });
  const [paycheckDraft, setPaycheckDraft] = useState(null);
  const [paycheckSaved, setPaycheckSaved] = useState(false);
  const [addBillOpen, setAddBillOpen] = useState(false);
  const [addBillImportMode, setAddBillImportMode] = useState("pdf");
  const [manageBillsOpen, setManageBillsOpen] = useState(() => getSessionValue("__ttz_manage_bills_open__", "0") === "1");
  const [billFilterKey, setBillFilterKey] = useState(() => getSessionValue("__ttz_manage_bills_filter__", "all"));
  const [billOwnerFilter, setBillOwnerFilter] = useState(() => getSessionValue("__ttz_manage_bills_owner__", "All"));
  const [openBillGroups, setOpenBillGroups] = useState(() => getSessionJson("__ttz_manage_bills_groups__", {}));
  const [selectedBillIds, setSelectedBillIds] = useState([]);

  const bumpSectionRetry = (sectionId) => {
    setSectionRetryKeys((current) => ({ ...current, [sectionId]: (current[sectionId] || 0) + 1 }));
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    let shouldOpenAddBill = false;
    try {
      shouldOpenAddBill = window.sessionStorage.getItem("__tracktozero_open_add_bill__") === "1";
      if (shouldOpenAddBill) window.sessionStorage.removeItem("__tracktozero_open_add_bill__");
    } catch (error) {
      console.error("SettingsPage failed to restore add bill handoff", error);
    }
    if (!shouldOpenAddBill) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenSection("bills");
    setAddBillOpen(true);
    setAddAcctStep?.(1);
    const timer = window.setTimeout(() => {
      addBillSectionRef?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [addBillSectionRef, setAddAcctStep]);

  const toggle = (id) => setOpenSection((prev) => (prev === id ? null : id));
  const isAdmin = founderAccount || canManageHousehold;
  const pendingCount = (householdRequests || []).filter((r) => r.status === "pending").length;
  const normalizedOwnerOptions = useMemo(
    () => [
      "All",
      ...Array.from(
        new Set([
          ...(allOwners || []),
          ...(baseAccounts || []).map((account) => account?.owner).filter(Boolean),
          currentUserLabel || "",
          userProfile?.displayName || "",
          userProfile?.label || "",
          ...(householdMembers || []).flatMap((member) => [member?.displayName || "", member?.label || ""]),
        ].filter((owner) => owner && owner !== "All"))
      ),
    ],
    [allOwners, baseAccounts, currentUserLabel, userProfile, householdMembers]
  );
  const managedBills = useMemo(
    () => (baseAccounts || []).filter((account) => matchesBillFilter(account, billFilterKey, billOwnerFilter)),
    [baseAccounts, billFilterKey, billOwnerFilter]
  );
  const selectedBills = useMemo(
    () => managedBills.filter((account) => selectedBillIds.includes(account.id)),
    [managedBills, selectedBillIds]
  );
  const billOwnerSuggestions = useMemo(
    () => normalizedOwnerOptions.filter((owner) => owner !== "All"),
    [normalizedOwnerOptions]
  );
  const groupedManagedBills = useMemo(() => {
    const grouped = {};
    managedBills.forEach((account) => {
      const key = account.category || "OTHER";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(account);
    });
    return allCategories
      .filter((category) => grouped[category]?.length)
      .map((category) => ({ category, items: grouped[category] }));
  }, [allCategories, managedBills]);
  const recentBillActivity = Array.isArray(billActivity) ? billActivity.slice(0, 8) : [];
  const editBillIsRecurring = editAcct?.startsOverMonthly || normalizeBillType(editAcct) === "monthly";
  const editBillDisablesInterest = editBillIsRecurring || normalizeBillType(editAcct) === "noInterest";
  const missingFirebaseKeys = Array.isArray(firebaseStatus?.missingKeys) ? firebaseStatus.missingKeys : [];
  const safeToday = today instanceof Date && !Number.isNaN(today.getTime()) ? today : new Date();
  const isBillSelected = (id) => selectedBillIds.includes(id);
  const toggleBillSelection = (id) => {
    setSelectedBillIds((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
  };
  const selectAllManaged = () => {
    setSelectedBillIds(managedBills.map((bill) => bill.id));
  };
  const clearSelection = () => setSelectedBillIds([]);
  const handleBulkDelete = async () => {
    if (!selectedBills.length) return;
    const deleted = await deleteAccounts?.(selectedBills);
    if (deleted) clearSelection();
  };

  useEffect(() => {
    try {
      window.sessionStorage.setItem("__ttz_settings_open_section__", openSection || "");
    } catch {
      /* ignore */
    }
  }, [openSection]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem("__ttz_manage_bills_open__", manageBillsOpen ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [manageBillsOpen]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem("__ttz_manage_bills_filter__", billFilterKey || "all");
      window.sessionStorage.setItem("__ttz_manage_bills_owner__", billOwnerFilter || "All");
    } catch {
      /* ignore */
    }
  }, [billFilterKey, billOwnerFilter]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem("__ttz_manage_bills_groups__", JSON.stringify(openBillGroups || {}));
    } catch {
      /* ignore */
    }
  }, [openBillGroups]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedBillIds((current) => current.filter((id) => managedBills.some((bill) => bill.id === id)));
  }, [managedBills]);

  const submitPasswordUpdate = async () => {
    if (userIsLocal) { showToast("Password updates are not available for local preview accounts.", "error"); return; }
    if (!passwordDraft.currentPassword || !passwordDraft.nextPassword) { showToast("Enter your current and new password.", "error"); return; }
    if (passwordDraft.nextPassword.length < 6) { showToast("Use a new password with at least 6 characters.", "error"); return; }
    if (passwordDraft.nextPassword !== passwordDraft.confirmPassword) { showToast("New password confirmation does not match.", "error"); return; }
    const updated = await onUpdatePassword?.({ currentPassword: passwordDraft.currentPassword, nextPassword: passwordDraft.nextPassword });
    if (updated) setPasswordDraft({ currentPassword: "", nextPassword: "", confirmPassword: "" });
  };

  return (
    <div style={{ opacity: mounted ? 1 : 0, transition: "opacity .3s", marginTop: 16, maxWidth: 760 }}>
      <datalist id="bill-owner-options">
        {billOwnerSuggestions.map((owner) => <option key={owner} value={owner} />)}
      </datalist>

      {/* ── Account ── */}
      <AccordionSection
        title="Account"
        subtitle={currentUserEmail || "Personal settings"}
        open={openSection === "account"}
        onToggle={() => toggle("account")}
        c={c}
        sectionId="account"
        retryKey={sectionRetryKeys.account || 0}
        onRetry={() => bumpSectionRetry("account")}
      >
        <div style={{ display: "grid", gap: 18 }}>

          {/* Sign-in info */}
          <div>
            <SectionLabel c={c}>Sign-in</SectionLabel>
            <div style={{ background: c.surf2, borderRadius: 12, border: `1px solid ${c.border}`, overflow: "hidden" }}>
              {[
                ["Signed in as", currentUserEmail ? `${currentUserLabel || "Unknown"} (${currentUserEmail})` : (currentUserLabel || "Unknown")],
                ["Sign-in type", userIsLocal ? "Local preview" : "Firebase email/password"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 14px", borderBottom: `1px solid ${c.border}`, fontSize: 13, flexWrap: "wrap" }}>
                  <span style={{ color: c.muted, fontWeight: 600 }}>{k}</span>
                  <span style={{ color: c.tx, fontWeight: 700 }}>{v}</span>
                </div>
              ))}
              {!!currentUserId && (
                <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <span style={{ color: c.muted, fontSize: 12 }}>Need your user ID for an invite?</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard?.(currentUserId, "User ID copied")}
                    style={{ padding: "7px 12px", borderRadius: 10, border: `1px solid ${c.border2}`, background: c.surf, color: c.tx, fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                  >
                    Copy user ID
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Password */}
          {!userIsLocal && (
            <div>
              <SectionLabel c={c}>Password</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
                <div>
                  <div style={lblStyle}>Current password</div>
                  <input type="password" value={passwordDraft.currentPassword} onChange={(e) => setPasswordDraft((prev) => ({ ...prev, currentPassword: e.target.value }))} style={inputStyle} placeholder="Enter current password" />
                </div>
                <div>
                  <div style={lblStyle}>New password</div>
                  <input type="password" value={passwordDraft.nextPassword} onChange={(e) => setPasswordDraft((prev) => ({ ...prev, nextPassword: e.target.value }))} style={inputStyle} placeholder="At least 6 characters" />
                </div>
                <div style={{ gridColumn: isMobile ? "auto" : "1 / span 2" }}>
                  <div style={lblStyle}>Confirm new password</div>
                  <input type="password" value={passwordDraft.confirmPassword} onChange={(e) => setPasswordDraft((prev) => ({ ...prev, confirmPassword: e.target.value }))} style={inputStyle} placeholder="Re-enter new password" />
                </div>
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={submitPasswordUpdate}
                  disabled={passwordUpdateLoading}
                  style={{ padding: "9px 14px", borderRadius: 999, border: "none", background: c.ac, color: "#001014", fontSize: 12, fontWeight: 800, cursor: passwordUpdateLoading ? "not-allowed" : "pointer", opacity: passwordUpdateLoading ? 0.65 : 1 }}
                >
                  {passwordUpdateLoading ? "Updating..." : "Update password"}
                </button>
                <button
                  type="button"
                  onClick={() => onForgotPassword?.()}
                  disabled={!currentUserEmail}
                  style={{ padding: "9px 14px", borderRadius: 999, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 12, fontWeight: 800, cursor: !currentUserEmail ? "not-allowed" : "pointer", opacity: !currentUserEmail ? 0.65 : 1 }}
                >
                  Send reset email
                </button>
              </div>
            </div>
          )}

          {/* Currency */}
          <div>
            <SectionLabel c={c}>Currency</SectionLabel>
            <div style={{ fontSize: 12, color: c.tx2, marginBottom: 10 }}>Choose how money should display across your app.</div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(220px, 320px) auto", gap: 8, alignItems: "center" }}>
              <select value={currencyCode || "USD"} onChange={(e) => saveCurrencyPreference?.(e.target.value)} style={selStyle}>
                {CURRENCY_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>{option.code} - {option.label}</option>
                ))}
              </select>
              <div style={{ fontSize: 12, color: c.muted }}>Current: {getCurrencyLabel(currencyCode)}</div>
            </div>
          </div>

          <div>
            <SectionLabel c={c}>Delete my account</SectionLabel>
            <div style={{ padding: "14px 16px", borderRadius: 12, border: `1px solid ${c.da}`, background: c.daD, display: "grid", gap: 10 }}>
              <div style={{ fontSize: 13, color: c.tx, fontWeight: 800 }}>Permanently remove this account</div>
              <div style={{ fontSize: 12, color: c.tx2, lineHeight: 1.55 }}>
                This removes your personal bills, settings, invites, notifications, upload history, and related data. If you own a shared household with other members, delete the household or transfer ownership first.
              </div>
              <div>
                <button
                  type="button"
                  onClick={onDeleteAccount}
                  style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${c.da}`, background: c.da, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                >
                  Delete my account
                </button>
              </div>
            </div>
          </div>
        </div>
      </AccordionSection>

      {/* ── Household ── */}
      <AccordionSection
        title="Household"
        subtitle={workspaceMode === "household" ? `${householdMembers?.length || 0} member${householdMembers?.length !== 1 ? "s" : ""} · shared` : pendingHouseholdId ? "Pending approval" : "Solo mode"}
        badge={pendingCount}
        open={openSection === "household"}
        onToggle={() => toggle("household")}
        c={c}
        noPadding
        sectionId="household"
        retryKey={sectionRetryKeys.household || 0}
        onRetry={() => bumpSectionRetry("household")}
      >
        <div style={{ padding: "16px 20px" }}>
          <HouseholdPage
            c={c}
            isMobile={isMobile}
            householdProfile={householdProfile}
            workspaceMode={workspaceMode}
            setHouseholdSetupOpen={setHouseholdSetupOpen}
            setHouseholdSetupTab={setHouseholdSetupTab}
            currentHouseholdMember={currentHouseholdMember}
            householdMembers={householdMembers}
            householdRequests={householdRequests}
            userProfile={userProfile}
            canManageHousehold={canManageHousehold}
            handleLeaveHousehold={handleLeaveHousehold}
            handleRemoveHouseholdMember={handleRemoveHouseholdMember}
            handleSetMemberRole={handleSetMemberRole}
            householdInviteLink={householdInviteLink}
            subscription={subscription}
            openBillingPage={openBillingPage}
            handleApproveHouseholdRequest={handleApproveHouseholdRequest}
            handleRejectHouseholdRequest={handleRejectHouseholdRequest}
            handleSaveHouseholdProfile={handleSaveHouseholdProfile}
            handleCopyHouseholdInvite={handleCopyHouseholdInvite}
            handleShareHouseholdInvite={handleShareHouseholdInvite}
            handleInviteHouseholdMemberByUserId={handleInviteHouseholdMemberByUserId}
            pendingHouseholdId={pendingHouseholdId}
            pendingHouseholdName={pendingHouseholdName}
            cancelPendingRequest={cancelPendingRequest}
          />
        </div>
        {workspaceMode === "household" && (
          <div style={{ padding: "0 20px 20px" }}>
            <SectionLabel c={c}>{currentHouseholdMember?.role === "owner" ? "Delete household" : "Leave household"}</SectionLabel>
            <div style={{ padding: "14px 16px", borderRadius: 12, border: `1px solid ${currentHouseholdMember?.role === "owner" ? c.da : c.border}`, background: currentHouseholdMember?.role === "owner" ? c.daD : c.surf2, display: "grid", gap: 10 }}>
              {currentHouseholdMember?.role === "owner" ? (
                <>
                  <div style={{ fontSize: 13, color: c.tx, fontWeight: 800 }}>Remove this shared household</div>
                  <div style={{ fontSize: 12, color: c.tx2, lineHeight: 1.55 }}>
                    This permanently removes the household, join code, invite links, shared bills, payoff data, notes, and member relationships. Everyone here will be switched back to solo mode.
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={handleDeleteHousehold}
                      style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${c.da}`, background: c.da, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                    >
                      Delete household
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: c.tx, fontWeight: 800 }}>Leave this household</div>
                  <div style={{ fontSize: 12, color: c.tx2, lineHeight: 1.55 }}>
                    This removes you from the shared household and switches you back to solo mode. The remaining household data stays with the household.
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={handleLeaveHousehold}
                      style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${c.border2}`, background: c.surf, color: c.tx, fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                    >
                      Leave household
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </AccordionSection>

      {/* ── Bills & Budget ── */}
      <AccordionSection
        title="Bills & Budget"
        subtitle={`${baseAccounts.length} active bill${baseAccounts.length !== 1 ? "s" : ""} · reminders · groups`}
        open={openSection === "bills"}
        onToggle={() => toggle("bills")}
        c={c}
        sectionId="bills"
        retryKey={sectionRetryKeys.bills || 0}
        onRetry={() => bumpSectionRetry("bills")}
      >
        <div style={{ display: "grid", gap: 20 }}>

          {/* Reminders */}
          <div>
            <SectionLabel c={c}>Reminders</SectionLabel>
            <div style={{ fontSize: 12, color: c.tx2, marginBottom: 14 }}>
              {isNativeApp ? "Phone reminders for bills due today and tomorrow." : "Browser reminders for bills due today and tomorrow."}
            </div>
            {!subscription?.premium && subscription?.billingEnabled && (
              <div style={{ marginBottom: 12, padding: "12px 14px", borderRadius: 12, border: `1px solid ${c.border}`, background: c.surf2, fontSize: 12, color: c.tx2, lineHeight: 1.5 }}>
                Premium adds calm reminders when you want a little more support.
                <button type="button" onClick={openBillingPage} style={{ marginLeft: 10, padding: "7px 10px", borderRadius: 999, border: `1px solid ${c.border2}`, background: c.surf, color: c.tx, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
                  See billing
                </button>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {notifPermission === "granted" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: c.go, fontWeight: 700 }}>
                  Notifications on
                </div>
              ) : notifPermission === "denied" ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 12, color: c.da }}>
                    {isNativeApp ? "Blocked in Android settings." : "Blocked in browser settings."}
                  </div>
                  <button onClick={requestBillReminderPermission} style={{ width: "fit-content", padding: "9px 18px", borderRadius: 8, border: "none", background: c.ac, color: "#000", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Try again</button>
                </div>
              ) : notifPermission === "unsupported" ? (
                <div style={{ fontSize: 12, color: c.da }}>Not supported on this device.</div>
              ) : (
                <button onClick={requestBillReminderPermission} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: c.ac, color: "#000", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Enable notifications</button>
              )}
              <button type="button" onClick={openNotificationSettings} style={{ padding: "9px 18px", borderRadius: 8, border: `1.5px solid ${c.border2}`, background: c.surf, color: c.tx, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Reminder settings</button>
            </div>
          </div>

          {/* Paycheck setup */}
          {(() => {
            const draft = paycheckDraft ?? paySchedule ?? {};
            const get = (key, fallback) => draft[key] ?? fallback;
            const set = (key, value) => { setPaycheckDraft((prev) => ({ ...(prev ?? paySchedule ?? {}), [key]: value })); setPaycheckSaved(false); };
            const handleSave = async () => {
              await savePaySchedule(draft);
              setPaycheckDraft(null);
              setPaycheckSaved(true);
              setTimeout(() => setPaycheckSaved(false), 2500);
            };
            return (
              <div>
                <SectionLabel c={c}>Paycheck Schedule</SectionLabel>
                <div style={{ fontSize: 12, color: c.tx2, marginBottom: 14, lineHeight: 1.5 }}>
                  Set up your regular paychecks so the Income tracker can show each pay period and let you mark when you've been paid. Leave amount at 0 to hide a paycheck slot.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 14 }}>
                  {[
                    { labelKey: "paycheckALabel", baseKey: "paycheckABase", deltaKey: "paycheckAHolidayDelta", defaultLabel: "Paycheck A", freqNote: "Weekly · every Friday" },
                    { labelKey: "paycheckBLabel", baseKey: "paycheckBBase", deltaKey: null, defaultLabel: "Paycheck B", freqNote: "Bi-weekly · every other Friday" },
                  ].map(({ labelKey, baseKey, deltaKey, defaultLabel, freqNote }) => (
                    <div key={labelKey} style={{ padding: "14px 16px", borderRadius: 12, border: `1px solid ${c.border}`, background: c.surf2, display: "grid", gap: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: c.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>{freqNote}</div>
                      <div>
                        <div style={lblStyle}>Label</div>
                        <input style={inputStyle} value={get(labelKey, defaultLabel)} placeholder={defaultLabel} onChange={(e) => set(labelKey, e.target.value)} />
                      </div>
                      <div>
                        <div style={lblStyle}>Amount per paycheck</div>
                        <input type="number" step="0.01" style={inputStyle} value={get(baseKey, 0)} placeholder="0.00" onChange={(e) => set(baseKey, parseFloat(e.target.value) || 0)} />
                      </div>
                      {deltaKey && (
                        <div>
                          <div style={lblStyle}>Holiday reduction per day off</div>
                          <input type="number" step="0.01" style={inputStyle} value={get(deltaKey, 0)} placeholder="0.00" onChange={(e) => set(deltaKey, parseFloat(e.target.value) || 0)} />
                          <div style={{ fontSize: 11, color: c.muted, marginTop: 4 }}>Optional — reduces amount on weeks with bank holidays.</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleSave}
                  style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: paycheckSaved ? c.go : c.ac, color: "#001014", fontSize: 13, fontWeight: 800, cursor: "pointer", transition: "background 0.2s" }}
                >
                  {paycheckSaved ? "Saved ✓" : "Save paycheck schedule"}
                </button>
              </div>
            );
          })()}

          {/* Bill groups */}
          <div>
            <SectionLabel c={c}>Groups</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 8, marginBottom: 10 }}>
              <input style={inputStyle} placeholder="Add group (e.g. MEDICAL)" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addCategory(); }} />
              <button type="button" style={saveBtnStyle} onClick={addCategory}>Add group</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {allCategories.map((cat) => (
                <span key={cat} style={{ padding: "4px 8px", borderRadius: 999, border: `1px solid ${c.border2}`, background: c.surf2, fontSize: 11, fontWeight: 700, color: c.tx2 }}>
                  {CAT_ICON[cat] || "·"} {cat}
                </span>
              ))}
            </div>
          </div>

          {/* Add Bill (inner collapsible) */}
          <div ref={addBillSectionRef} style={{ border: `1px solid ${c.border}`, borderRadius: 12, overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => setAddBillOpen((v) => !v)}
              style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "14px 16px", background: c.surf2, border: "none", cursor: "pointer", textAlign: "left" }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: c.tx }}>Add a bill</div>
                <div style={{ fontSize: 12, color: c.muted }}>3-step setup with bill type, owner, and due details.</div>
              </div>
              <span style={{ color: c.muted, fontSize: 16, fontWeight: 700, flexShrink: 0 }}>{addBillOpen ? "▲" : "▼"}</span>
            </button>
            {addBillOpen && (
              <div style={{ padding: "16px", borderTop: `1px solid ${c.border}` }}>
                <div style={{ display: "grid", gap: 8, marginBottom: 18 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: c.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    Add manually
                  </div>
                  <div style={{ fontSize: 12, color: c.tx2, lineHeight: 1.6 }}>
                    Use the guided form below, or import a statement in this same section if that is faster.
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                  {[1, 2, 3].map((s) => <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: s <= addAcctStep ? c.ac : c.border2, transition: "background 0.25s" }} />)}
                </div>
                <div style={{ fontSize: 11, fontWeight: 800, color: c.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>
                  Step {addAcctStep} of 3 — {["Basic info", "Amounts & due date", "APR & promo"][addAcctStep - 1]}
                </div>
                <datalist id="category-options">
                  {allCategories.map((cat) => <option key={cat} value={cat} />)}
                </datalist>
                {addAcctStep === 1 && (
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <div><div style={lblStyle}>Account name</div><input style={inputStyle} value={newAcct.name} onChange={(e) => setNewAcct((v) => ({ ...v, name: e.target.value }))} /></div>
                    <div><div style={lblStyle}>Category</div><select style={selStyle} value={newAcct.category} onChange={(e) => setNewAcct((v) => ({ ...v, category: e.target.value }))}>{allCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}</select></div>
                    <div><div style={lblStyle}>Owner</div><input list="bill-owner-options" style={inputStyle} value={newAcct.owner || billOwnerSuggestions[0] || "Unassigned"} onChange={(e) => setNewAcct((v) => ({ ...v, owner: e.target.value }))} placeholder="Pick or type a bill owner" /></div>
                    <div style={{ gridColumn: isMobile ? "auto" : "1 / -1" }}>
                      <div style={lblStyle}>What type of bill is this?</div>
                      <div style={{ display: "grid", gap: 8 }}>
                        {BILL_TYPE_OPTIONS.map((option) => {
                          const active = normalizeBillType(newAcct) === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setNewAcct((v) => ({
                                ...v,
                                billType: option.value,
                                startsOverMonthly: option.value === "monthly",
                                interest_type: option.value === "monthly" || option.value === "noInterest" ? "interest_free" : (v.interest_type || "variable_apr"),
                              }))}
                              style={{ textAlign: "left", padding: "12px 14px", borderRadius: 12, border: `1px solid ${active ? c.ac : c.border2}`, background: active ? `${c.ac}10` : c.surf2, color: c.tx, cursor: "pointer" }}
                            >
                              <div style={{ fontSize: 13, fontWeight: 800 }}>{option.label}</div>
                              <div style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>{option.help}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
                {addAcctStep === 2 && (
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <div><div style={lblStyle}>{moneyFieldLabel("Balance", currencyCode)}</div><input type="number" step="0.01" style={inputStyle} value={newAcct.bal} onChange={(e) => setNewAcct((v) => ({ ...v, bal: e.target.value }))} /></div>
                    <div><div style={lblStyle}>Due day</div><input type="number" min="0" max="31" style={inputStyle} value={newAcct.due} onChange={(e) => setNewAcct((v) => ({ ...v, due: e.target.value }))} /></div>
                    <div><div style={lblStyle}>{moneyFieldLabel("Min due", currencyCode)}</div><input type="number" step="0.01" style={inputStyle} value={newAcct.min} onChange={(e) => setNewAcct((v) => ({ ...v, min: e.target.value }))} /></div>
                  </div>
                )}
                {addAcctStep === 3 && (
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <div style={{ gridColumn: "1 / -1", padding: "10px 12px", borderRadius: 10, border: `1px solid ${c.border}`, background: c.surf2, fontSize: 12, color: c.tx2 }}>
                      <div style={{ fontWeight: 800, color: c.tx, marginBottom: 4 }}>Does this bill start over each month?</div>
                      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={Boolean(newAcct.startsOverMonthly || normalizeBillType(newAcct) === "monthly")}
                          onChange={(e) => setNewAcct((v) => ({
                            ...v,
                            startsOverMonthly: e.target.checked,
                            billType: e.target.checked ? "monthly" : (normalizeBillType(v) === "monthly" ? "paydown" : normalizeBillType(v)),
                            interest_type: e.target.checked || normalizeBillType(v) === "noInterest" ? "interest_free" : (v.interest_type || "variable_apr"),
                          }))}
                        />
                        <span>This bill starts fresh each month and is tracked as covered, not paid off forever.</span>
                      </label>
                    </div>
                    <div><div style={lblStyle}>Interest type</div>
                      <select disabled={Boolean(newAcct.startsOverMonthly || normalizeBillType(newAcct) === "monthly" || normalizeBillType(newAcct) === "noInterest")} style={{ ...selStyle, opacity: newAcct.startsOverMonthly || normalizeBillType(newAcct) === "monthly" || normalizeBillType(newAcct) === "noInterest" ? 0.6 : 1 }} value={newAcct.interest_type || "variable_apr"} onChange={(e) => setNewAcct((v) => ({ ...v, interest_type: e.target.value }))}>
                        <option value="variable_apr">Variable APR (Credit Cards)</option>
                        <option value="fixed_apr">Fixed APR (Student / Personal Loans)</option>
                        <option value="simple">Simple Interest (Auto Loans)</option>
                        <option value="fixed_monthly">Fixed Monthly Fee</option>
                        <option value="promo_zero">0% Promotional</option>
                        <option value="interest_free">Interest-Free</option>
                      </select>
                    </div>
                    <div><div style={lblStyle}>Current APR</div><input disabled={Boolean(newAcct.startsOverMonthly || normalizeBillType(newAcct) === "monthly" || normalizeBillType(newAcct) === "noInterest")} type="number" step="0.0001" style={{ ...inputStyle, opacity: newAcct.startsOverMonthly || normalizeBillType(newAcct) === "monthly" || normalizeBillType(newAcct) === "noInterest" ? 0.6 : 1 }} value={newAcct.apr} onChange={(e) => setNewAcct((v) => ({ ...v, apr: e.target.value }))} /></div>
                    <div><div style={lblStyle}>Provider</div><input style={inputStyle} value={newAcct.bank} onChange={(e) => setNewAcct((v) => ({ ...v, bank: e.target.value }))} /></div>
                    <div><div style={lblStyle}>Promo APR</div><input disabled={Boolean(newAcct.startsOverMonthly || normalizeBillType(newAcct) === "monthly" || normalizeBillType(newAcct) === "noInterest")} type="number" step="0.0001" style={{ ...inputStyle, opacity: newAcct.startsOverMonthly || normalizeBillType(newAcct) === "monthly" || normalizeBillType(newAcct) === "noInterest" ? 0.6 : 1 }} value={newAcct.promoApr} onChange={(e) => setNewAcct((v) => ({ ...v, promoApr: e.target.value }))} placeholder="0 for a 0% promo" /></div>
                    <div><div style={lblStyle}>Promo ends</div><input disabled={Boolean(newAcct.startsOverMonthly || normalizeBillType(newAcct) === "monthly" || normalizeBillType(newAcct) === "noInterest")} type="month" style={{ ...inputStyle, opacity: newAcct.startsOverMonthly || normalizeBillType(newAcct) === "monthly" || normalizeBillType(newAcct) === "noInterest" ? 0.6 : 1 }} value={newAcct.promoUntil} onChange={(e) => setNewAcct((v) => ({ ...v, promoUntil: e.target.value }))} /></div>
                    <div><div style={lblStyle}>APR after promo</div><input disabled={Boolean(newAcct.startsOverMonthly || normalizeBillType(newAcct) === "monthly" || normalizeBillType(newAcct) === "noInterest")} type="number" step="0.0001" style={{ ...inputStyle, opacity: newAcct.startsOverMonthly || normalizeBillType(newAcct) === "monthly" || normalizeBillType(newAcct) === "noInterest" ? 0.6 : 1 }} value={newAcct.aprAfterPromo} onChange={(e) => setNewAcct((v) => ({ ...v, aprAfterPromo: e.target.value }))} /></div>
                    <div style={{ fontSize: 11, color: c.muted, lineHeight: 1.5, display: "flex", alignItems: "end" }}>{newAcct.startsOverMonthly || normalizeBillType(newAcct) === "monthly" ? "Monthly bills keep these rate fields on file, but the app ignores them while this is on." : normalizeBillType(newAcct) === "noInterest" ? "This bill is tracked as a no-interest plan, so rate fields stay off." : "Promo APR 0, promo end 2026-12 switches back to the regular APR after the promo ends."}</div>
                  </div>
                )}
                <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                  {addAcctStep > 1 && <button type="button" onClick={() => setAddAcctStep((s) => s - 1)} style={{ padding: "9px 18px", borderRadius: 8, border: `1.5px solid ${c.border2}`, background: "transparent", color: c.tx, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Back</button>}
                  {addAcctStep < 3 ? (
                    <button type="button" onClick={() => { if (addAcctStep === 1 && !(newAcct.name || "").trim()) { showToast("Name is required", "error"); return; } setAddAcctStep((s) => s + 1); }} style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: c.ac, color: "#000", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Next</button>
                  ) : (
                    <button type="button" onClick={() => { addCustomAccount(); setAddAcctStep(1); }} style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: c.ac, color: "#000", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Add bill</button>
                  )}
                </div>

                <div style={{ height: 1, background: c.border, margin: "20px 0 18px" }} />

                <div style={{ display: "grid", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: c.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
                      Import from statement
                    </div>
                    <div style={{ fontSize: 12, color: c.tx2, lineHeight: 1.6 }}>
                      Upload a PDF statement or bill image here. This uses the same import flow you already have in the More tab.
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[
                      { id: "pdf", label: "Upload PDF statement" },
                      { id: "other", label: "Upload image/file" },
                      { id: "sheet", label: "Upload Excel / CSV" },
                    ].map((option) => {
                      const active = addBillImportMode === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setAddBillImportMode(option.id)}
                          style={{
                            padding: "9px 12px",
                            borderRadius: 999,
                            border: `1px solid ${active ? c.ac : c.border2}`,
                            background: active ? `${c.ac}12` : c.surf2,
                            color: active ? c.ac : c.tx,
                            fontSize: 12,
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ borderRadius: 12, border: `1px solid ${c.border}`, background: c.surf2, padding: "0 16px 16px" }}>
                    {addBillImportMode === "sheet" ? (
                      <ExcelImport
                        accounts={allAccts}
                        theme={theme}
                        onImported={async (id, updates) => {
                          await updateRecord?.(id, updates);
                          showToast?.("Updated from spreadsheet");
                        }}
                        onUpload={handleUpload}
                      />
                    ) : (
                      <StatementUpload
                        accounts={allAccts}
                        theme={theme}
                        sourceMode={addBillImportMode}
                        ownerOptions={billOwnerSuggestions}
                        onCreateAccount={addCustomAccount}
                        onSaved={async (id, updates) => {
                          await updateRecord?.(id, updates);
                        }}
                        onUpload={handleUpload}
                        onComplete={() => {
                          setOpenSection("bills");
                          setAddBillOpen(true);
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Manage Bills (inner collapsible) */}
          <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => setManageBillsOpen((v) => !v)}
              style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "14px 16px", background: c.surf2, border: "none", cursor: "pointer", textAlign: "left" }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: c.tx }}>Manage bills</div>
                <div style={{ fontSize: 12, color: c.muted }}>Edit or delete. {baseAccounts.length} active bill{baseAccounts.length !== 1 ? "s" : ""}.</div>
              </div>
              <span style={{ color: c.muted, fontSize: 16, fontWeight: 700, flexShrink: 0 }}>{manageBillsOpen ? "▲" : "▼"}</span>
            </button>
            {manageBillsOpen && (
              <div style={{ padding: "14px 16px", borderTop: `1px solid ${c.border}`, display: "grid", gap: 14 }}>
                <BillFilterBar
                  c={c}
                  filterKey={billFilterKey}
                  setFilterKey={setBillFilterKey}
                  ownerFilter={billOwnerFilter}
                  setOwnerFilter={setBillOwnerFilter}
                  ownerOptions={billOwnerSuggestions}
                  compact={isMobile}
                />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={() => (selectedBillIds.length === managedBills.length ? clearSelection() : selectAllManaged())}
                      disabled={!managedBills.length}
                      style={{ padding: "6px 10px", borderRadius: 999, border: `1px solid ${c.border2}`, background: c.surf, color: c.tx, fontSize: 11, fontWeight: 700, cursor: managedBills.length ? "pointer" : "not-allowed", opacity: managedBills.length ? 1 : 0.6 }}
                    >
                      {selectedBillIds.length === managedBills.length && managedBills.length > 0 ? "Clear selection" : "Select all filtered"}
                    </button>
                    {selectedBillIds.length > 0 && (
                      <span style={{ fontSize: 11, color: c.muted }}>{selectedBillIds.length} selected</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    disabled={!selectedBillIds.length}
                    style={{ padding: "7px 12px", borderRadius: 10, border: `1px solid ${c.da}`, background: selectedBillIds.length ? c.daD : c.surf2, color: c.da, fontSize: 12, fontWeight: 800, cursor: selectedBillIds.length ? "pointer" : "not-allowed", opacity: selectedBillIds.length ? 1 : 0.6 }}
                  >
                    Delete selected
                  </button>
                </div>
                {groupedManagedBills.map(({ category, items }) => {
                  const isOpen = openBillGroups[category] ?? true;
                  return (
                    <div key={category} style={{ borderRadius: 12, border: `1px solid ${c.border}`, background: c.surf2, overflow: "hidden" }}>
                      <button
                        type="button"
                        onClick={() => setOpenBillGroups((prev) => ({ ...prev, [category]: !isOpen }))}
                        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 14px", border: "none", background: "transparent", color: c.tx, cursor: "pointer", textAlign: "left" }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 15 }}>{CAT_ICON[category] || "•"}</span>
                          <span style={{ fontWeight: 800, fontSize: 13 }}>{category}</span>
                          <span style={{ padding: "2px 8px", borderRadius: 999, background: c.surf, border: `1px solid ${c.border}`, fontSize: 11, color: c.muted, fontWeight: 700 }}>{items.length}</span>
                        </div>
                        <span style={{ color: c.muted, fontSize: 16, fontWeight: 700 }}>{isOpen ? "▲" : "▼"}</span>
                      </button>
                      {isOpen && (
                        <div style={{ borderTop: `1px solid ${c.border}`, padding: "10px", display: "grid", gap: 10 }}>
                          {items.map((account) => (
                            <div key={account.id} style={{ borderRadius: 10, border: `1px solid ${editingAccountId === account.id ? c.ac : c.border}`, background: c.surf, overflow: "hidden" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, padding: "12px 12px 10px", flexWrap: "wrap" }}>
                                <div style={{ flex: 1, minWidth: isMobile ? "100%" : 280 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <input
                                      type="checkbox"
                                      checked={isBillSelected(account.id)}
                                      onChange={() => toggleBillSelection(account.id)}
                                    />
                                    <div style={{ fontWeight: 700, fontSize: 14 }}>{account.name}</div>
                                  </div>
                                  <div style={{ fontSize: 12, color: c.muted, marginTop: 3 }}>{account.owner || "Unassigned"} · Due day {account.due_day || "N/A"} · Min {fx(account.budgeted_min || 0)} · Bal {fx(account.cur_bal || account.starting_bal || 0)}</div>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                                    <span style={{ padding: "4px 8px", borderRadius: 999, border: `1px solid ${c.border2}`, background: c.surf2, fontSize: 11, fontWeight: 700, color: c.tx2 }}>{getBillTypeLabel(account.billType)}</span>
                                    {getBillBadges(account).map((badge) => (
                                      <span key={`${account.id}-${badge.key}`} style={{ padding: "4px 8px", borderRadius: 999, border: `1px solid ${c.border2}`, background: c.surf2, fontSize: 11, fontWeight: 700, color: c.tx2 }}>{badge.label}</span>
                                    ))}
                                  </div>
                                </div>
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                  <button type="button" onClick={() => editingAccountId === account.id ? setEditingAccountId(null) : startEditAccount(account)} style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${c.ac}`, background: editingAccountId === account.id ? c.ac : c.acD, color: editingAccountId === account.id ? "#fff" : c.ac, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{editingAccountId === account.id ? "Cancel" : "Edit"}</button>
                                  <button type="button" onClick={() => deleteAccount(account)} style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${c.da}`, background: c.daD, color: c.da, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Delete</button>
                                </div>
                              </div>
                              {editingAccountId === account.id && (
                                <div style={{ borderTop: `1px solid ${c.border}`, padding: "12px", display: "grid", gap: 10 }}>
                                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
                                    <div><div style={{ fontSize: 11, color: c.muted, marginBottom: 3 }}>BILL NAME</div><input value={editAcct.name ?? ""} onChange={(e) => setEditAcct((p) => ({ ...p, name: e.target.value }))} style={{ ...inputStyle, width: "100%" }} /></div>
                                    <div><div style={{ fontSize: 11, color: c.muted, marginBottom: 3 }}>OWNER</div><input list="bill-owner-options" value={editAcct.owner || "Unassigned"} onChange={(e) => setEditAcct((p) => ({ ...p, owner: e.target.value }))} style={{ ...inputStyle, width: "100%" }} placeholder="Pick or type a bill owner" /></div>
                                    <div><div style={{ fontSize: 11, color: c.muted, marginBottom: 3 }}>CATEGORY</div><select value={editAcct.category} onChange={(e) => setEditAcct((p) => ({ ...p, category: e.target.value }))} style={{ ...selStyle, width: "100%" }}>{allCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}</select></div>
                                    <div><div style={{ fontSize: 11, color: c.muted, marginBottom: 3 }}>BILL TYPE</div><select value={normalizeBillType(editAcct)} onChange={(e) => setEditAcct((p) => ({ ...p, billType: e.target.value, startsOverMonthly: e.target.value === "monthly", interest_type: e.target.value === "monthly" || e.target.value === "noInterest" ? "interest_free" : (p.interest_type || "variable_apr") }))} style={{ ...selStyle, width: "100%" }}>{BILL_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><div style={{ fontSize: 11, color: c.muted, marginTop: 4 }}>{getBillTypeHelp(editAcct.billType)}</div></div>
                                    <div><div style={{ fontSize: 11, color: c.muted, marginBottom: 3 }}>{moneyFieldLabel("Balance", currencyCode).toUpperCase()}</div><input type="number" step="0.01" value={editAcct.balance ?? ""} onChange={(e) => setEditAcct((p) => ({ ...p, balance: e.target.value }))} style={{ ...inputStyle, width: "100%" }} /></div>
                                    <div><div style={{ fontSize: 11, color: c.muted, marginBottom: 3 }}>{moneyFieldLabel("Amount Paid", currencyCode).toUpperCase()}</div><input type="number" step="0.01" value={editAcct.paid ?? ""} onChange={(e) => setEditAcct((p) => ({ ...p, paid: e.target.value }))} style={{ ...inputStyle, width: "100%" }} /></div>
                                    <div><div style={{ fontSize: 11, color: c.muted, marginBottom: 3 }}>{moneyFieldLabel("Min Due", currencyCode).toUpperCase()}</div><input type="number" value={editAcct.min ?? ""} onChange={(e) => setEditAcct((p) => ({ ...p, min: e.target.value }))} style={{ ...inputStyle, width: "100%" }} /></div>
                                    <div><div style={{ fontSize: 11, color: c.muted, marginBottom: 3 }}>DUE DAY</div><input type="number" min="0" max="31" value={editAcct.due ?? ""} onChange={(e) => setEditAcct((p) => ({ ...p, due: e.target.value }))} style={{ ...inputStyle, width: "100%" }} /></div>
                                    <div style={{ gridColumn: "1 / -1", padding: "10px 12px", borderRadius: 10, border: `1px solid ${c.border}`, background: c.surf2, fontSize: 12, color: c.tx2 }}>
                                      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                                        <input type="checkbox" checked={Boolean(editAcct.startsOverMonthly || normalizeBillType(editAcct) === "monthly")} onChange={(e) => setEditAcct((p) => ({ ...p, startsOverMonthly: e.target.checked, billType: e.target.checked ? "monthly" : (normalizeBillType(p) === "monthly" ? "paydown" : normalizeBillType(p)), interest_type: e.target.checked || normalizeBillType(p) === "noInterest" ? "interest_free" : (p.interest_type || "variable_apr") }))} />
                                        <span><strong>Does this bill start over each month?</strong><br />This bill starts fresh each month and is tracked as covered, not paid off forever.</span>
                                      </label>
                                    </div>
                                    <div><div style={{ fontSize: 11, color: c.muted, marginBottom: 3 }}>INTEREST TYPE</div><select value={editBillDisablesInterest ? "interest_free" : (editAcct.interest_type || "variable_apr")} onChange={(e) => setEditAcct((p) => ({ ...p, interest_type: e.target.value }))} disabled={editBillDisablesInterest} style={{ ...selStyle, width: "100%", opacity: editBillDisablesInterest ? 0.6 : 1 }}><option value="variable_apr">Variable APR</option><option value="fixed_apr">Fixed APR</option><option value="simple">Simple interest</option><option value="fixed_monthly">Fixed monthly fee</option><option value="promo_zero">Promo 0%</option><option value="interest_free">Interest-free</option></select></div>
                                    <div><div style={{ fontSize: 11, color: c.muted, marginBottom: 3 }}>CURRENT APR</div><input type="number" step="0.0001" value={editAcct.apr ?? ""} onChange={(e) => setEditAcct((p) => ({ ...p, apr: e.target.value }))} disabled={editBillDisablesInterest} style={{ ...inputStyle, width: "100%", opacity: editBillDisablesInterest ? 0.6 : 1 }} /></div>
                                    <div><div style={{ fontSize: 11, color: c.muted, marginBottom: 3 }}>PROMO APR</div><input type="number" step="0.0001" value={editAcct.promoApr ?? ""} onChange={(e) => setEditAcct((p) => ({ ...p, promoApr: e.target.value }))} disabled={editBillDisablesInterest} style={{ ...inputStyle, width: "100%", opacity: editBillDisablesInterest ? 0.6 : 1 }} /></div>
                                    <div><div style={{ fontSize: 11, color: c.muted, marginBottom: 3 }}>PROMO ENDS</div><input type="month" value={editAcct.promoUntil ?? ""} onChange={(e) => setEditAcct((p) => ({ ...p, promoUntil: e.target.value }))} disabled={editBillDisablesInterest} style={{ ...inputStyle, width: "100%", opacity: editBillDisablesInterest ? 0.6 : 1 }} /></div>
                                    <div><div style={{ fontSize: 11, color: c.muted, marginBottom: 3 }}>APR AFTER PROMO</div><input type="number" step="0.0001" value={editAcct.aprAfterPromo ?? ""} onChange={(e) => setEditAcct((p) => ({ ...p, aprAfterPromo: e.target.value }))} disabled={editBillDisablesInterest} style={{ ...inputStyle, width: "100%", opacity: editBillDisablesInterest ? 0.6 : 1 }} /></div>
                                  </div>
                                  {!!normalizeMonthInput(editAcct.promoUntil) && !editBillIsRecurring && <div style={{ fontSize: 12, color: c.muted, lineHeight: 1.5 }}>Promo debt uses {pct(normalizeAprDecimal(editAcct.promoApr || 0))} through {normalizeMonthInput(editAcct.promoUntil)}, then switches to {pct(normalizeAprDecimal(editAcct.aprAfterPromo === "" ? editAcct.apr : editAcct.aprAfterPromo || 0))}.</div>}
                                  {!!editAcct.balance && <div style={{ fontSize: 12, color: c.tx2 }}>Balance here saves to the same live record as Bills.</div>}
                                  <button type="button" onClick={saveEditAccount} style={{ padding: "9px", borderRadius: 8, border: "none", background: c.ac, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Save changes</button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {!groupedManagedBills.length && <div style={{ fontSize: 13, color: c.muted }}>No bills match this filter yet.</div>}
                <div style={{ borderRadius: 12, border: `1px solid ${c.border}`, background: c.surf2, padding: "14px" }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: c.tx, marginBottom: 8 }}>Recent activity</div>
                  {recentBillActivity.length ? recentBillActivity.map((entry) => (
                    <div key={entry.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", paddingBottom: 8, marginBottom: 8, borderBottom: `1px solid ${c.border}` }}>
                      <div style={{ fontSize: 12, color: c.tx }}>{entry.action}</div>
                      <div style={{ fontSize: 11, color: c.muted }}>{new Date(entry.timestamp).toLocaleString()}</div>
                    </div>
                  )) : <div style={{ fontSize: 12, color: c.muted }}>Changes you make here will start showing up as recent activity.</div>}
                </div>
                {/*
                  <div key={account.id} style={{ borderRadius: 10, border: `1px solid ${editingAccountId === account.id ? c.ac : c.border}`, background: c.surf2, overflow: "hidden" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 12px", flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{account.name}</div>
                        <div style={{ fontSize: 12, color: c.muted }}>{account.category} · Due day {account.due_day || "N/A"} · Min {fx(account.budgeted_min || 0)} · Bal {fx(account.cur_bal || 0)}</div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button type="button" onClick={() => editingAccountId === account.id ? setEditingAccountId(null) : startEditAccount(account)} style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${c.ac}`, background: editingAccountId === account.id ? c.ac : c.acD, color: editingAccountId === account.id ? "#fff" : c.ac, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{editingAccountId === account.id ? "Cancel" : "Edit"}</button>
                        <button type="button" onClick={() => deleteAccount(account)} style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${c.da}`, background: c.daD, color: c.da, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Delete</button>
                      </div>
                    </div>
                    {editingAccountId === account.id && (
                      <div style={{ borderTop: `1px solid ${c.border}`, padding: "12px", display: "grid", gap: 8 }}>
                        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
                          <div><div style={{ fontSize: 11, color: c.muted, marginBottom: 3 }}>CATEGORY</div><select value={editAcct.category} onChange={(e) => setEditAcct((p) => ({ ...p, category: e.target.value }))} style={{ width: "100%", padding: "7px 8px", borderRadius: 7, border: `1px solid ${c.border}`, background: c.surf, color: c.tx, fontSize: 13 }}>{allCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}</select></div>
                          <div><div style={{ fontSize: 11, color: c.muted, marginBottom: 3 }}>{moneyFieldLabel("Balance", currencyCode).toUpperCase()}</div><input type="number" step="0.01" value={editAcct.balance ?? ""} onChange={(e) => setEditAcct((p) => ({ ...p, balance: e.target.value }))} style={{ width: "100%", padding: "7px 8px", borderRadius: 7, border: `1px solid ${c.border}`, background: c.surf, color: c.ac, fontSize: 13, boxSizing: "border-box" }} /></div>
                          <div><div style={{ fontSize: 11, color: c.muted, marginBottom: 3 }}>{moneyFieldLabel("Min Due", currencyCode).toUpperCase()}</div><input type="number" value={editAcct.min} onChange={(e) => setEditAcct((p) => ({ ...p, min: e.target.value }))} style={{ width: "100%", padding: "7px 8px", borderRadius: 7, border: `1px solid ${c.border}`, background: c.surf, color: c.tx, fontSize: 13, boxSizing: "border-box" }} /></div>
                          <div><div style={{ fontSize: 11, color: c.muted, marginBottom: 3 }}>DUE DAY</div><input type="number" min="0" max="31" value={editAcct.due} onChange={(e) => setEditAcct((p) => ({ ...p, due: e.target.value }))} style={{ width: "100%", padding: "7px 8px", borderRadius: 7, border: `1px solid ${c.border}`, background: c.surf, color: c.tx, fontSize: 13, boxSizing: "border-box" }} /></div>
                          <div><div style={{ fontSize: 11, color: c.muted, marginBottom: 3 }}>CURRENT APR</div><input type="number" step="0.0001" value={editAcct.apr} onChange={(e) => setEditAcct((p) => ({ ...p, apr: e.target.value }))} style={{ width: "100%", padding: "7px 8px", borderRadius: 7, border: `1px solid ${c.border}`, background: c.surf, color: c.tx, fontSize: 13, boxSizing: "border-box" }} /></div>
                          <div><div style={{ fontSize: 11, color: c.muted, marginBottom: 3 }}>PROMO APR</div><input type="number" step="0.0001" value={editAcct.promoApr ?? ""} onChange={(e) => setEditAcct((p) => ({ ...p, promoApr: e.target.value }))} style={{ width: "100%", padding: "7px 8px", borderRadius: 7, border: `1px solid ${c.border}`, background: c.surf, color: c.tx, fontSize: 13, boxSizing: "border-box" }} /></div>
                          <div><div style={{ fontSize: 11, color: c.muted, marginBottom: 3 }}>PROMO ENDS</div><input type="month" value={editAcct.promoUntil ?? ""} onChange={(e) => setEditAcct((p) => ({ ...p, promoUntil: e.target.value }))} style={{ width: "100%", padding: "7px 8px", borderRadius: 7, border: `1px solid ${c.border}`, background: c.surf, color: c.tx, fontSize: 13, boxSizing: "border-box" }} /></div>
                          <div><div style={{ fontSize: 11, color: c.muted, marginBottom: 3 }}>APR AFTER PROMO</div><input type="number" step="0.0001" value={editAcct.aprAfterPromo ?? ""} onChange={(e) => setEditAcct((p) => ({ ...p, aprAfterPromo: e.target.value }))} style={{ width: "100%", padding: "7px 8px", borderRadius: 7, border: `1px solid ${c.border}`, background: c.surf, color: c.tx, fontSize: 13, boxSizing: "border-box" }} /></div>
                          <div><div style={{ fontSize: 11, color: c.muted, marginBottom: 3 }}>{moneyFieldLabel("Amount Paid", currencyCode).toUpperCase()}</div><input type="number" step="0.01" value={editAcct.paid ?? ""} onChange={(e) => setEditAcct((p) => ({ ...p, paid: e.target.value }))} style={{ width: "100%", padding: "7px 8px", borderRadius: 7, border: `1px solid ${c.border}`, background: c.surf, color: c.tx, fontSize: 13, boxSizing: "border-box" }} /></div>
                          <div style={{ gridColumn: "1 / -1" }}><div style={{ fontSize: 11, color: c.muted, marginBottom: 3 }}>INTEREST TYPE</div>
                            <select value={editAcct.interest_type || "variable_apr"} onChange={(e) => setEditAcct((p) => ({ ...p, interest_type: e.target.value }))} style={{ width: "100%", padding: "7px 8px", borderRadius: 7, border: `1px solid ${c.border}`, background: c.surf, color: c.tx, fontSize: 13 }}>
                              <option value="variable_apr">Variable APR (Credit Cards)</option>
                              <option value="fixed_apr">Fixed APR (Student / Personal Loans)</option>
                              <option value="simple">Simple Interest (Auto Loans)</option>
                              <option value="fixed_monthly">Fixed Monthly Fee</option>
                              <option value="promo_zero">0% Promotional</option>
                              <option value="interest_free">Interest-Free</option>
                            </select>
                          </div>
                        </div>
                        {!!normalizeMonthInput(editAcct.promoUntil) && <div style={{ fontSize: 12, color: c.muted, lineHeight: 1.5 }}>Promo debt uses {pct(normalizeAprDecimal(editAcct.promoApr || 0))} through {normalizeMonthInput(editAcct.promoUntil)}, then switches to {pct(normalizeAprDecimal(editAcct.aprAfterPromo === "" ? editAcct.apr : editAcct.aprAfterPromo || 0))}.</div>}
                        {!!editAcct.balance && <div style={{ fontSize: 12, color: c.tx2 }}>Balance here saves to the same live record as Bills.</div>}
                        <button type="button" onClick={saveEditAccount} style={{ padding: "9px", borderRadius: 8, border: "none", background: c.ac, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Save changes</button>
                      </div>
                    )}
                  </div>
                ))}
                */}
              </div>
            )}
          </div>
        </div>
      </AccordionSection>

      {/* ── Data & Backup ── */}
      <AccordionSection
        title="Data & Backup"
        subtitle="Assets, net worth, and export"
        open={openSection === "data"}
        onToggle={() => toggle("data")}
        c={c}
        sectionId="data"
        retryKey={sectionRetryKeys.data || 0}
        onRetry={() => bumpSectionRetry("data")}
      >
        <div style={{ display: "grid", gap: 20 }}>

          {/* Sync status */}
          <div style={{ padding: "14px 16px", borderRadius: 12, background: firebaseStatus.configured ? c.acD : c.daD, border: `1px solid ${firebaseStatus.configured ? c.ac : c.da}`, fontSize: 13 }}>
            <div style={{ fontWeight: 700, marginBottom: 4, color: firebaseStatus.configured ? c.ac : c.da }}>{firebaseStatus.configured ? "Synced to Firestore" : "Cloud setup is missing"}</div>
            {firebaseStatus.configured ? (
              <div style={{ color: c.tx }}>Changes save automatically across sessions and devices.</div>
            ) : (
              <div>
                Add missing VITE_FIREBASE_* keys in <code>.env</code> and restart.
                <div style={{ marginTop: 6, color: c.muted }}>Missing: {missingFirebaseKeys.join(", ") || "Unknown keys"}</div>
              </div>
            )}
          </div>

          {/* Assets */}
          <div>
            <SectionLabel c={c}>Assets & net worth</SectionLabel>
            <div style={{ fontSize: 12, color: c.tx2, marginBottom: 10 }}>Your total savings, checking, and investments.</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, maxWidth: 360 }}>
              <span style={{ fontSize: 14, color: c.tx2 }}>$</span>
              <input type="number" min="0" step="100" defaultValue={assets} onBlur={(e) => saveAssets(e.target.value)} placeholder="Total assets" style={{ flex: 1, padding: "9px 10px", borderRadius: 8, border: `1.5px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 13, fontFamily: "'DM Mono',monospace", outline: "none" }} />
            </div>
            {(() => {
              const totalDebt = allAccts.reduce((s, a) => s + (Number(a.cur_bal) || 0), 0);
              const netWorth = assets - totalDebt;
              const nwColor = netWorth >= 0 ? c.go : c.da;
              return (
                <div style={{ marginTop: 14, display: "flex", gap: 24, flexWrap: "wrap" }}>
                  <div><div style={{ fontSize: 10, fontWeight: 800, color: c.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>Assets</div><div style={{ fontSize: 18, fontWeight: 800, color: c.go, fontFamily: "'DM Mono',monospace" }}>{fx(assets)}</div></div>
                  <div><div style={{ fontSize: 10, fontWeight: 800, color: c.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>Debt</div><div style={{ fontSize: 18, fontWeight: 800, color: c.da, fontFamily: "'DM Mono',monospace" }}>-{fx(totalDebt)}</div></div>
                  <div><div style={{ fontSize: 10, fontWeight: 800, color: c.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>Net worth</div><div style={{ fontSize: 18, fontWeight: 800, color: nwColor, fontFamily: "'DM Mono',monospace" }}>{netWorth >= 0 ? "" : "-"}{fx(Math.abs(netWorth))}</div></div>
                </div>
              );
            })()}
          </div>

          {/* Backup */}
          <div style={{ position: "relative", zIndex: 30, isolation: "isolate", pointerEvents: "auto" }}>
            <SectionLabel c={c}>Settings backup</SectionLabel>
            <div style={{ fontSize: 12, color: c.tx2, marginBottom: 12 }}>Export your settings and personal preferences as JSON, or restore a previous settings backup. Bills, payment history, and monthly records are not included yet.</div>
            {!subscription?.premium && subscription?.billingEnabled && (
              <div style={{ marginBottom: 12, padding: "12px 14px", borderRadius: 12, border: `1px solid ${c.border}`, background: c.surf2, fontSize: 12, color: c.tx2, lineHeight: 1.5 }}>
                Export stays ready on premium when you want a fuller progress toolkit.
              </div>
            )}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", position: "relative", zIndex: 31, pointerEvents: "auto" }}>
              <button onClick={exportBackup} disabled={backupLoading} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: c.ac, color: "#000", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: backupLoading ? 0.6 : 1, position: "relative", zIndex: 32, pointerEvents: "auto", touchAction: "manipulation" }}>{backupLoading ? "Exporting..." : "Export settings"}</button>
              <label style={{ padding: "9px 18px", borderRadius: 8, border: `1.5px solid ${c.border2}`, background: "transparent", color: c.tx, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-block", position: "relative", zIndex: 32, pointerEvents: "auto", touchAction: "manipulation" }}>
                Restore settings
                <input type="file" accept=".json" onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])} style={{ display: "none" }} />
              </label>
            </div>
          </div>

          {isAdmin && (
            <div style={{ position: "relative", zIndex: 30, isolation: "isolate", pointerEvents: "auto" }}>
              <SectionLabel c={c}>Admin workspace backup</SectionLabel>
              <div style={{ fontSize: 12, color: c.tx2, marginBottom: 12 }}>
                Download a fuller local JSON backup of the active workspace. This includes settings plus the selected month&apos;s records, income, and payoff plans.
              </div>
              <div style={{ padding: "12px 14px", borderRadius: 12, border: `1px solid ${c.border}`, background: c.surf2, marginBottom: 12, fontSize: 12, color: c.tx2, lineHeight: 1.5 }}>
                This export is meant for admin recovery and safekeeping. It does not replace the lighter settings restore flow above.
              </div>
              <button
                type="button"
                onClick={exportAdminBackup}
                disabled={adminBackupLoading}
                style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: c.go, color: "#04110b", fontSize: 13, fontWeight: 800, cursor: "pointer", opacity: adminBackupLoading ? 0.6 : 1, position: "relative", zIndex: 32, pointerEvents: "auto", touchAction: "manipulation" }}
              >
                {adminBackupLoading ? "Exporting full backup..." : "Download admin backup"}
              </button>
            </div>
          )}
        </div>
      </AccordionSection>

      {/* ── Help ── */}
      <AccordionSection
        title="Help"
        subtitle="Privacy, support, and feedback"
        open={openSection === "help"}
        onToggle={() => toggle("help")}
        c={c}
        sectionId="help"
        retryKey={sectionRetryKeys.help || 0}
        onRetry={() => bumpSectionRetry("help")}
      >
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 13, color: c.tx2 }}>
            Found something confusing or helpful? Send a quick note.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={openPrivacyPage} style={{ padding: "9px 14px", borderRadius: 999, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Privacy</button>
            <button type="button" onClick={openSupportPage} style={{ padding: "9px 14px", borderRadius: 999, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Help & FAQ</button>
            <button type="button" onClick={() => openFeedback("settings")} style={{ padding: "9px 14px", borderRadius: 999, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Send feedback</button>
          </div>
          <div style={{ fontSize: 12, color: c.muted, marginTop: 4 }}>
            Version {appVersionLabel}
          </div>
        </div>
      </AccordionSection>

      {/* ── Admin Console (gated) ── */}
      {isAdmin && (
        <AccordionSection
          title="Admin Console"
          subtitle="System tools and diagnostics"
          open={openSection === "admin"}
          onToggle={() => toggle("admin")}
          c={c}
          sectionId="admin"
          retryKey={sectionRetryKeys.admin || 0}
          onRetry={() => bumpSectionRetry("admin")}
        >
          <div style={{ display: "grid", gap: 20 }}>

            {/* System stats */}
            <div>
              <SectionLabel c={c}>System info</SectionLabel>
              <div style={{ background: c.surf2, borderRadius: 12, border: `1px solid ${c.border}`, overflow: "hidden" }}>
                {[
                  ["Version", `${BRAND_NAME} ${appVersionLabel}`],
                  ["Database", firebaseStatus.configured ? "Firestore (cloud)" : "Local preview"],
                  ["Accounts loaded", String(baseAccounts.length)],
                  ["Month", `${MONTHS[selMonth - 1]} ${selYear}`],
                  ["Currency", `${currencyCode || "USD"} · ${getCurrencyLabel(currencyCode)}`],
                  ["Theme", theme === "dark" ? "Dark" : "Light"],
                  ["Workspace", workspaceMode || "solo"],
                  ["User ID", currentUserId || "—"],
                  ["Today", safeToday.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 14px", borderBottom: `1px solid ${c.border}`, fontSize: 12, flexWrap: "wrap" }}>
                    <span style={{ color: c.muted, fontWeight: 600 }}>{k}</span>
                    <span style={{ color: c.tx, fontFamily: k === "User ID" ? "'DM Mono',monospace" : "inherit", fontSize: k === "User ID" ? 11 : 12 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tester tools */}
            <div>
              <SectionLabel c={c}>Tools</SectionLabel>
              <TesterToolsCard
                palette={c}
                versionLabel={appVersionLabel}
                userId={currentUserId}
                workspaceMode={workspaceMode}
                launchSummary={softLaunchSummary}
                onCopyVersion={() => copyToClipboard(appVersionLabel, "Version copied")}
                onCopyUserId={() => copyToClipboard(currentUserId, "User ID copied")}
              />
            </div>

            {/* Billing */}
            <div>
              <SectionLabel c={c}>Billing</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                <PlanStatusCard
                  palette={c}
                  subscription={subscription}
                  onManageBilling={manageBilling}
                  onUpgrade={() => startBillingCheckout("monthly")}
                />
                <UpgradeCard
                  palette={c}
                  title={subscription?.billingEnabled ? "Go further with your household" : "Billing stays off during soft launch"}
                  detail={subscription?.billingEnabled
                    ? (stripeReady
                      ? "Premium opens richer progress, reminders, exports, and more room for the people doing this with you."
                      : "Your billing screen is ready. Add Stripe keys when you want checkout to go live.")
                    : "Paid plans are hidden during soft launch while checkout and subscription syncing are still being finalized."}
                  cta={subscription?.billingEnabled ? "Open billing" : "Billing off"}
                  onClick={openBillingPage}
                  disabled={!subscription?.billingEnabled}
                />
              </div>
            </div>
          </div>
        </AccordionSection>
      )}
    </div>
  );
}
