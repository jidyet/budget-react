import { useState } from "react";
import HouseholdPage from "./HouseholdPage";
import { CURRENCY_OPTIONS, fx, getCurrencyLabel, moneyFieldLabel, pct } from "../utils/budgetUtils";
import { CAT_ICON, MONTHS } from "../data/mockAccounts";
import PlanStatusCard from "../components/billing/PlanStatusCard";
import UpgradeCard from "../components/billing/UpgradeCard";
import TesterToolsCard from "../components/ui/TesterToolsCard";

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
    settingsOverviewRef,
    settingsBillsRef,
    settingsCategoriesRef,
    settingsDataRef,
    scrollToSettingsSection,
    householdProfile,
    workspaceMode,
    setHouseholdSetupOpen,
    setHouseholdSetupTab,
    currentHouseholdMember,
    householdMembers,
    householdRequests,
    userProfile,
    subscription,
    openBillingPage,
    stripeReady,
    startBillingCheckout,
    manageBilling,
    firebaseStatus,
    baseAccounts,
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
    allCategories,
    addBillSectionRef,
    addAcctStep,
    setAddAcctStep,
    lblStyle,
    newAcct,
    setNewAcct,
    selStyle,
    allOwners,
    showToast,
    addCustomAccount,
    editingAccountId,
    setEditingAccountId,
    startEditAccount,
    deleteAccount,
    editAcct,
    setEditAcct,
    saveEditAccount,
    normalizeMonthInput,
    normalizeAprDecimal,
    canManageHousehold,
    handleApproveHouseholdRequest,
    handleRejectHouseholdRequest,
    handleLeaveHousehold,
    handleRemoveHouseholdMember,
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
    passwordUpdateLoading,
    assets,
    saveAssets,
    allAccts,
    exportBackup,
    backupLoading,
    importBackup,
    openFeedback,
    openPrivacyPage,
    openSupportPage,
    copyToClipboard,
    softLaunchSummary,
  } = props;

  const [passwordDraft, setPasswordDraft] = useState({
    currentPassword: "",
    nextPassword: "",
    confirmPassword: "",
  });

  const submitPasswordUpdate = async () => {
    if (userIsLocal) {
      showToast("Password updates are not available for local preview accounts.", "error");
      return;
    }
    if (!passwordDraft.currentPassword || !passwordDraft.nextPassword) {
      showToast("Enter your current and new password.", "error");
      return;
    }
    if (passwordDraft.nextPassword.length < 6) {
      showToast("Use a new password with at least 6 characters.", "error");
      return;
    }
    if (passwordDraft.nextPassword !== passwordDraft.confirmPassword) {
      showToast("New password confirmation does not match.", "error");
      return;
    }
    const updated = await onUpdatePassword?.({
      currentPassword: passwordDraft.currentPassword,
      nextPassword: passwordDraft.nextPassword,
    });
    if (updated) {
      setPasswordDraft({ currentPassword: "", nextPassword: "", confirmPassword: "" });
    }
  };

  return (
    <div style={{ opacity: mounted ? 1 : 0, transition: "opacity .3s", marginTop: 16, maxWidth: 980 }}>
      <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 12, position: isMobile ? "static" : "sticky", top: isMobile ? "auto" : 12, zIndex: 2 }}>
        <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 10, color: c.tx }}>Quick jump</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            ["This app", settingsOverviewRef],
            ["Bills", settingsBillsRef],
            ["Groups", settingsCategoriesRef],
            ["Save & backup", settingsDataRef],
          ].map(([label, ref]) => (
            <button
              key={label}
              type="button"
              onClick={() => scrollToSettingsSection(ref)}
              style={{ padding: "8px 12px", borderRadius: 999, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
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
      <div ref={settingsOverviewRef} style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, margin: "2px 0 8px" }}>This app</div>
      <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "16px 20px", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Account & security</div>
        {[
          ["Signed in as", currentUserEmail ? `${currentUserLabel || "Unknown"} (${currentUserEmail})` : (currentUserLabel || "Unknown")],
          ["Logged in email", currentUserEmail || "Not available"],
          ["User ID", currentUserId || "Not available"],
          ["Sign-in type", userIsLocal ? "Local preview" : "Firebase email/password"],
        ].map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", borderBottom: `1px solid ${c.border}`, fontSize: 13, flexWrap: "wrap" }}>
            <span style={{ color: c.muted, fontWeight: 600 }}>{k}</span>
            <span style={{ color: c.tx }}>{v}</span>
          </div>
        ))}
        {!!currentUserId && (
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              onClick={() => copyToClipboard?.(currentUserId, "User ID copied")}
              style={{ padding: "8px 12px", borderRadius: 10, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 12, fontWeight: 800, cursor: "pointer" }}
            >
              Copy user ID
            </button>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8, marginTop: 14 }}>
          <div>
            <div style={lblStyle}>Current password</div>
            <input
              type="password"
              value={passwordDraft.currentPassword}
              onChange={(e) => setPasswordDraft((prev) => ({ ...prev, currentPassword: e.target.value }))}
              style={inputStyle}
              placeholder="Enter current password"
            />
          </div>
          <div>
            <div style={lblStyle}>New password</div>
            <input
              type="password"
              value={passwordDraft.nextPassword}
              onChange={(e) => setPasswordDraft((prev) => ({ ...prev, nextPassword: e.target.value }))}
              style={inputStyle}
              placeholder="At least 6 characters"
            />
          </div>
          <div style={{ gridColumn: isMobile ? "auto" : "1 / span 2" }}>
            <div style={lblStyle}>Confirm new password</div>
            <input
              type="password"
              value={passwordDraft.confirmPassword}
              onChange={(e) => setPasswordDraft((prev) => ({ ...prev, confirmPassword: e.target.value }))}
              style={inputStyle}
              placeholder="Re-enter new password"
            />
          </div>
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={submitPasswordUpdate}
            disabled={passwordUpdateLoading || userIsLocal}
            style={{ padding: "9px 14px", borderRadius: 999, border: "none", background: c.ac, color: "#001014", fontSize: 12, fontWeight: 800, cursor: passwordUpdateLoading || userIsLocal ? "not-allowed" : "pointer", opacity: passwordUpdateLoading || userIsLocal ? 0.65 : 1 }}
          >
            {passwordUpdateLoading ? "Updating password..." : "Update password"}
          </button>
          <button
            type="button"
            onClick={() => onForgotPassword?.()}
            disabled={!currentUserEmail || userIsLocal}
            style={{ padding: "9px 14px", borderRadius: 999, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 12, fontWeight: 800, cursor: !currentUserEmail || userIsLocal ? "not-allowed" : "pointer", opacity: !currentUserEmail || userIsLocal ? 0.65 : 1 }}
          >
            Send reset email
          </button>
        </div>
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${c.border}` }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Currency</div>
          <div style={{ fontSize: 12, color: c.tx2, marginBottom: 10 }}>
            Choose how money should display across your app.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(220px, 320px) auto", gap: 8, alignItems: "center" }}>
            <select
              value={currencyCode || "USD"}
              onChange={(e) => saveCurrencyPreference?.(e.target.value)}
              style={selStyle}
            >
              {CURRENCY_OPTIONS.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.code} - {option.label}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 12, color: c.muted }}>
              Current choice: {getCurrencyLabel(currencyCode)}
            </div>
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, margin: "2px 0 8px" }}>Quick look</div>
      <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "16px 20px", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Your setup</div>
        {[
          ["Version", `Household Budget ${appVersionLabel}`],
          ["Database", firebaseStatus.configured ? "Firestore (cloud)" : "Local preview"],
          ["Accounts", `${baseAccounts.length} loaded`],
          ["Month", `${MONTHS[selMonth - 1]} ${selYear}`],
          ["Currency", `${currencyCode || "USD"} - ${getCurrencyLabel(currencyCode)}`],
          ["Theme", theme === "dark" ? "Dark" : "Light"],
          ["Today", today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })],
        ].map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${c.border}`, fontSize: 13 }}>
            <span style={{ color: c.muted, fontWeight: 600 }}>{k}</span>
            <span>{v}</span>
          </div>
        ))}
        <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: c.tx2, lineHeight: 1.5 }}>
            Found something confusing or helpful? Send a quick note.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={openPrivacyPage}
              style={{ padding: "9px 14px", borderRadius: 999, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 12, fontWeight: 800, cursor: "pointer" }}
            >
              Privacy
            </button>
            <button
              type="button"
              onClick={openSupportPage}
              style={{ padding: "9px 14px", borderRadius: 999, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 12, fontWeight: 800, cursor: "pointer" }}
            >
              Help
            </button>
            <button
              type="button"
              onClick={() => openFeedback("settings")}
              style={{ padding: "9px 14px", borderRadius: 999, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 12, fontWeight: 800, cursor: "pointer" }}
            >
              Send feedback
            </button>
          </div>
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <TesterToolsCard
          palette={c}
          versionLabel={appVersionLabel}
          userId={currentUserId}
          workspaceMode={workspaceMode}
          launchSummary={softLaunchSummary}
          onCopyVersion={() => copyToClipboard(appVersionLabel, "Version copied")}
          onCopyUserId={() => copyToClipboard(currentUserId, "User id copied")}
        />
      </div>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, margin: "2px 0 8px" }}>Billing</div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <PlanStatusCard
          palette={c}
          subscription={subscription}
          onManageBilling={manageBilling}
          onUpgrade={() => startBillingCheckout("monthly")}
        />
        <UpgradeCard
          palette={c}
          title={subscription?.billingEnabled ? "Go further with your household" : "Tester access is on"}
          detail={subscription?.billingEnabled
            ? (stripeReady
              ? "Premium opens richer progress, reminders, exports, and more room for the people doing this with you."
              : "Your billing screen is ready. Add Stripe keys when you want checkout to go live.")
            : "All premium features are open for early testers right now. Billing stays off until launch is closer."}
          cta={subscription?.billingEnabled ? "Open billing" : "Coming soon"}
          onClick={openBillingPage}
          disabled={!subscription?.billingEnabled}
        />
      </div>
      <div ref={settingsBillsRef} style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, margin: "2px 0 8px" }}>Bills & reminders</div>
      <div style={{ background: c.surf, border: `1.5px solid ${c.border}`, borderRadius: 14, padding: "18px 22px", marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: c.tx, marginBottom: 4 }}>Bill reminders</div>
        <div style={{ fontSize: 12, color: c.tx2, marginBottom: 14 }}>
          {isNativeApp ? "Turn on phone reminders for bills due tomorrow and due today." : "Turn on browser reminders for bills due tomorrow and due today."}
        </div>
        {!subscription?.premium && subscription?.billingEnabled && (
          <div style={{ marginBottom: 14, padding: "12px 14px", borderRadius: 12, border: `1px solid ${c.border}`, background: c.surf2, fontSize: 12, color: c.tx2, lineHeight: 1.5 }}>
            Premium adds calm reminders when you want a little more support.
            <button type="button" onClick={openBillingPage} style={{ marginLeft: 10, padding: "7px 10px", borderRadius: 999, border: `1px solid ${c.border2}`, background: c.surf, color: c.tx, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
              See billing
            </button>
          </div>
        )}
        {notifPermission === "granted" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: c.go }}>
            <span>OK</span> Notifications enabled
          </div>
        ) : notifPermission === "denied" ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ fontSize: 12, color: c.da }}>
              {isNativeApp ? "Phone notifications are blocked. Enable them in Android app settings." : "Browser notifications are blocked. Enable them in browser settings."}
            </div>
            <button onClick={requestBillReminderPermission} style={{ width: isMobile ? "100%" : "fit-content", padding: "9px 18px", borderRadius: 8, border: "none", background: c.ac, color: "#000", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Try Again
            </button>
          </div>
        ) : notifPermission === "unsupported" ? (
          <div style={{ fontSize: 12, color: c.da }}>Notifications are not supported on this device.</div>
        ) : (
          <button onClick={requestBillReminderPermission} style={{ width: isMobile ? "100%" : "fit-content", padding: "9px 18px", borderRadius: 8, border: "none", background: c.ac, color: "#000", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Enable Notifications
          </button>
        )}
        <button type="button" onClick={openNotificationSettings} style={{ marginTop: 12, width: isMobile ? "100%" : "fit-content", padding: "9px 18px", borderRadius: 8, border: `1.5px solid ${c.border2}`, background: c.surf, color: c.tx, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Reminder settings
        </button>
      </div>
      <div ref={settingsCategoriesRef} style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, margin: "2px 0 8px" }}>Groups</div>
      <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "16px 20px", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Your bill groups</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 150px", gap: 8, marginBottom: 10 }}>
          <input style={inputStyle} placeholder="Add category (e.g. MEDICAL)" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addCategory(); }} />
          <button type="button" style={saveBtnStyle} onClick={addCategory}>Add Category</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {allCategories.map((cat) => (
            <span key={cat} style={{ padding: "4px 8px", borderRadius: 999, border: `1px solid ${c.border2}`, background: c.surf2, fontSize: 11, fontWeight: 700, color: c.tx2 }}>
              {CAT_ICON[cat] || "."} {cat}
            </span>
          ))}
        </div>
      </div>
      <div ref={addBillSectionRef} style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "16px 20px", marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Add Bill</div>
            <div style={{ fontSize: 12, color: c.muted }}>Set the normal APR and any promo deadline up front so the app can plan payoff timing correctly.</div>
          </div>
          <div style={{ fontSize: 12, color: c.muted }}>3-step setup</div>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {[1, 2, 3].map((s) => <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: s <= addAcctStep ? c.ac : c.border2, transition: "background 0.25s" }} />)}
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, color: c.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>
          Step {addAcctStep} of 3 - {["Basic Info", "Amounts & Due Date", "APR & Promo Details"][addAcctStep - 1]}
        </div>
        <datalist id="category-options">
          {allCategories.map((cat) => <option key={cat} value={cat} />)}
        </datalist>
        {addAcctStep === 1 && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div><div style={lblStyle}>Account name</div><input style={inputStyle} value={newAcct.name} onChange={(e) => setNewAcct((v) => ({ ...v, name: e.target.value }))} /></div>
            <div><div style={lblStyle}>Category</div><input list="category-options" style={inputStyle} value={newAcct.category} onChange={(e) => setNewAcct((v) => ({ ...v, category: e.target.value.toUpperCase() }))} /></div>
            <div><div style={lblStyle}>Owner</div><select style={selStyle} value={newAcct.owner} onChange={(e) => setNewAcct((v) => ({ ...v, owner: e.target.value }))}>{allOwners.filter((o) => o !== "All").map((o) => <option key={o}>{o}</option>)}</select></div>
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
            <div><div style={lblStyle}>Current APR</div><input type="number" step="0.0001" style={inputStyle} value={newAcct.apr} onChange={(e) => setNewAcct((v) => ({ ...v, apr: e.target.value }))} /></div>
            <div><div style={lblStyle}>Provider</div><input style={inputStyle} value={newAcct.bank} onChange={(e) => setNewAcct((v) => ({ ...v, bank: e.target.value }))} /></div>
            <div><div style={lblStyle}>Promo APR</div><input type="number" step="0.0001" style={inputStyle} value={newAcct.promoApr} onChange={(e) => setNewAcct((v) => ({ ...v, promoApr: e.target.value }))} placeholder="0 for a 0% promo" /></div>
            <div><div style={lblStyle}>Promo Ends</div><input type="month" style={inputStyle} value={newAcct.promoUntil} onChange={(e) => setNewAcct((v) => ({ ...v, promoUntil: e.target.value }))} /></div>
            <div><div style={lblStyle}>APR After Promo</div><input type="number" step="0.0001" style={inputStyle} value={newAcct.aprAfterPromo} onChange={(e) => setNewAcct((v) => ({ ...v, aprAfterPromo: e.target.value }))} /></div>
            <div style={{ fontSize: 11, color: c.muted, lineHeight: 1.5, display: "flex", alignItems: "end" }}>Example: promo APR `0`, promo end `2026-12`, then the regular APR the bank applies after that.</div>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          {addAcctStep > 1 && <button type="button" onClick={() => setAddAcctStep((s) => s - 1)} style={{ padding: "9px 18px", borderRadius: 8, border: `1.5px solid ${c.border2}`, background: "transparent", color: c.tx, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Back</button>}
          {addAcctStep < 3 ? (
            <button type="button" onClick={() => { if (addAcctStep === 1 && !(newAcct.name || "").trim()) { showToast("Name is required", "error"); return; } setAddAcctStep((s) => s + 1); }} style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: c.ac, color: "#000", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Next</button>
          ) : (
            <button type="button" onClick={() => { addCustomAccount(); setAddAcctStep(1); }} style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: c.ac, color: "#000", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Add Bill</button>
          )}
        </div>
      </div>
      <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 12, padding: "16px 20px", marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Manage Bills</div>
            <div style={{ fontSize: 12, color: c.muted }}>Edit balance, due day, APR, promo window, or delete bills you no longer track.</div>
          </div>
          <div style={{ fontSize: 12, color: c.muted }}>{baseAccounts.length} active bills</div>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {baseAccounts.map((account) => (
            <div key={account.id} style={{ borderRadius: 10, border: `1px solid ${editingAccountId === account.id ? c.ac : c.border}`, background: c.surf2, overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 12px", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{account.name}</div>
                  <div style={{ fontSize: 12, color: c.muted }}>{account.category} - Due day {account.due_day || "N/A"} - Min {fx(account.budgeted_min || 0)} - Bal {fx(account.cur_bal || 0)}</div>
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
                  </div>
                  {!!normalizeMonthInput(editAcct.promoUntil) && <div style={{ fontSize: 12, color: c.muted, lineHeight: 1.5 }}>Promo debt will use {pct(normalizeAprDecimal(editAcct.promoApr || 0))} through {normalizeMonthInput(editAcct.promoUntil)}, then switch to {pct(normalizeAprDecimal(editAcct.aprAfterPromo === "" ? editAcct.apr : editAcct.aprAfterPromo || 0))}.</div>}
                  {!!editAcct.balance && <div style={{ fontSize: 12, color: c.tx2 }}>Current balance in Settings now saves to the same live record as Bills.</div>}
                  <button type="button" onClick={saveEditAccount} style={{ padding: "9px", borderRadius: 8, border: "none", background: c.ac, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Save Changes</button>
                </div>
              )}
            </div>
          ))}
          {!baseAccounts.length && <div style={{ fontSize: 13, color: c.muted }}>No active bills found.</div>}
        </div>
      </div>
      <div ref={settingsDataRef} style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, margin: "2px 0 8px" }}>Save & backup</div>
      <div style={{ background: firebaseStatus.configured ? c.acD : c.daD, border: `1px solid ${firebaseStatus.configured ? c.ac : c.da}`, borderRadius: 12, padding: "14px 16px", fontSize: 13, color: c.tx, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 4, color: firebaseStatus.configured ? c.ac : c.da }}>{firebaseStatus.configured ? "You're synced" : "Cloud setup is missing"}</div>
        {firebaseStatus.configured ? (
          <div>All changes save automatically to Firestore. Data persists across sessions and devices.</div>
        ) : (
          <div>
            Add missing VITE_FIREBASE_* keys in <code>.env</code> and restart dev server.
            <div style={{ marginTop: 6, color: c.muted }}>Missing: {firebaseStatus.missingKeys.join(", ")}</div>
          </div>
        )}
      </div>
      <div style={{ background: c.surf, border: `1.5px solid ${c.border}`, borderRadius: 14, padding: "18px 22px", marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: c.tx, marginBottom: 4 }}>Assets & net worth</div>
        <div style={{ fontSize: 12, color: c.tx2, marginBottom: 14 }}>Enter your total savings, checking, and investment balances to track net worth.</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 180 }}>
            <span style={{ fontSize: 14, color: c.tx2 }}>$</span>
            <input type="number" min="0" step="100" defaultValue={assets} onBlur={(e) => saveAssets(e.target.value)} placeholder="Total assets (savings, checking...)" style={{ flex: 1, padding: "9px 10px", borderRadius: 8, border: `1.5px solid ${c.border2}`, background: c.surf2, color: c.tx, fontSize: 13, fontFamily: "'DM Mono',monospace", outline: "none" }} />
          </div>
        </div>
        {(() => {
          const totalDebt = allAccts.reduce((s, a) => s + (Number(a.cur_bal) || 0), 0);
          const netWorth = assets - totalDebt;
          const nwColor = netWorth >= 0 ? c.go : c.da;
          return (
            <div style={{ marginTop: 14, display: "flex", gap: 24, flexWrap: "wrap" }}>
              <div><div style={{ fontSize: 10, fontWeight: 800, color: c.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>Total Assets</div><div style={{ fontSize: 18, fontWeight: 800, color: c.go, fontFamily: "'DM Mono',monospace" }}>{fx(assets)}</div></div>
              <div><div style={{ fontSize: 10, fontWeight: 800, color: c.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>Total Debt</div><div style={{ fontSize: 18, fontWeight: 800, color: c.da, fontFamily: "'DM Mono',monospace" }}>-{fx(totalDebt)}</div></div>
              <div><div style={{ fontSize: 10, fontWeight: 800, color: c.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>Net Worth</div><div style={{ fontSize: 18, fontWeight: 800, color: nwColor, fontFamily: "'DM Mono',monospace" }}>{netWorth >= 0 ? "" : "-"}{fx(Math.abs(netWorth))}</div></div>
            </div>
          );
        })()}
      </div>
      <div style={{ background: c.surf, border: `1.5px solid ${c.border}`, borderRadius: 14, padding: "18px 22px", marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: c.tx, marginBottom: 4 }}>Backup & restore</div>
        <div style={{ fontSize: 12, color: c.tx2, marginBottom: 14 }}>Export all your data as JSON, or restore from a previous backup.</div>
        {!subscription?.premium && subscription?.billingEnabled && (
          <div style={{ marginBottom: 14, padding: "12px 14px", borderRadius: 12, border: `1px solid ${c.border}`, background: c.surf2, fontSize: 12, color: c.tx2, lineHeight: 1.5 }}>
            Export stays ready on premium when you want a fuller progress toolkit.
          </div>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={exportBackup} disabled={backupLoading} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: c.ac, color: "#000", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: backupLoading ? 0.6 : 1 }}>{backupLoading ? "Exporting..." : "Export Backup"}</button>
          <label style={{ padding: "9px 18px", borderRadius: 8, border: `1.5px solid ${c.border2}`, background: "transparent", color: c.tx, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-block" }}>
            Restore Backup
            <input type="file" accept=".json" onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])} style={{ display: "none" }} />
          </label>
        </div>
      </div>
    </div>
  );
}
