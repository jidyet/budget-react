import TopNav from "./TopNav";
import MobileHeader from "./MobileHeader";
import InstallPromptCard from "./InstallPromptCard";
import BrandLockup from "../ui/BrandLockup";
import LandingPage from "../marketing/LandingPage";
import InlineAuthCard from "./InlineAuthCard";

export default function AppChrome(props) {
  const {
    hasAuthenticatedUser,
    pwaInstalled,
    showInstallPrompt,
    returnPrompt,
    offlineReady,
    installPromptEvent,
    handleInstallApp,
    dismissInstallPrompt,
    patchReminderPreferences,
    isMobile,
    mobileChromeRef,
    c,
    safeTop,
    today,
    isOnline,
    hasPendingSync,
    isLocalUser,
    currentUserLabel,
    userProfile,
    setCmdkOpen,
    setCmdkQuery,
    exportAllData,
    theme,
    setTheme,
    user,
    setUser,
    setIsLocalUser,
    showToast,
    authLoading,
    safeBottom,
    mobileTopChrome,
    authMode,
    handleAuthSubmit,
    authEmail,
    setAuthEmail,
    authPass,
    setAuthPass,
    showAuthPass,
    setShowAuthPass,
    firebaseStatus,
    authError,
    authResetLoading,
    handleForgotPassword,
    allowLocalFallbackAuth,
    setAuthError,
    setAuthMode,
    NAV,
    page,
    showMoreDrawer,
    setShowMoreDrawer,
    navigateTo,
    subscription,
    openBillingPage,
    logout,
  } = props;

  // ── User identity derived values ─────────────────────────────────────────────
  const signedInLabel = String(
    currentUserLabel
    || userProfile?.displayName
    || user?.displayName
    || user?.email?.split?.("@")?.[0]
    || "Signed-in user"
  ).trim();
  const signedInEmail = String(userProfile?.email || user?.email || "").trim();
  const signedInInitial = String(signedInLabel || "U").charAt(0).toUpperCase();
  const signedInColor = String(userProfile?.avatarColor || "#3b82f6");

  // ── Shared sign-out handler ──────────────────────────────────────────────────
  const handleSignOut = async () => {
    if (user?.isLocal || isLocalUser) {
      setUser(null);
      setIsLocalUser(false);
      showToast("Signed out");
    } else {
      try {
        await logout();
        setUser(null);
        showToast("Signed out");
      } catch (e) {
        console.error(e);
        setUser(null);
        showToast("Signed out");
      }
    }
  };

  // ── Desktop status badge ─────────────────────────────────────────────────────
  const desktopStatusBadge = !isOnline ? (
    <span style={{ fontSize: 11, fontWeight: 700, color: c.wa, background: `${c.wa}18`, border: `1px solid ${c.wa}40`, borderRadius: 99, padding: "3px 10px", display: "inline-flex", alignItems: "center", gap: 5, marginLeft: 6 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.wa, display: "inline-block" }} />
      Offline
    </span>
  ) : hasPendingSync ? (
    <span style={{ fontSize: 11, fontWeight: 700, color: c.ac, background: c.acD, border: `1px solid ${c.ac}40`, borderRadius: 99, padding: "3px 10px", display: "inline-flex", alignItems: "center", gap: 5, marginLeft: 6 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.ac, display: "inline-block", animation: "spin 1s linear infinite" }} />
      Syncing...
    </span>
  ) : isLocalUser ? (
    <span style={{ fontSize: 11, fontWeight: 600, color: c.muted, background: c.surf2, border: `1px solid ${c.border}`, borderRadius: 99, padding: "3px 10px", marginLeft: 6 }}>
      Local
    </span>
  ) : (
    <span style={{ fontSize: 11, fontWeight: 600, color: c.go, background: `${c.go}12`, border: `1px solid ${c.go}40`, borderRadius: 99, padding: "3px 10px", display: "inline-flex", alignItems: "center", gap: 5, marginLeft: 6 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.go, display: "inline-block" }} />
      Live
    </span>
  );

  // ── Desktop header row (unchanged layout) ────────────────────────────────────
  const desktopHeaderRow = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "18px 14px 14px",
        borderBottom: `1px solid ${c.border}`,
        marginBottom: 6,
        background: `linear-gradient(90deg, ${c.acD}, transparent 46%, ${c.waD})`,
        borderRadius: 12,
        gap: 12,
        flexWrap: "nowrap",
        pointerEvents: "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <BrandLockup size="md" />
        <span style={{ fontSize: 13, color: c.muted, marginLeft: 10, fontWeight: 400 }}>
          {today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </span>
        {desktopStatusBadge}
      </div>
      <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "nowrap", justifyContent: "flex-end" }}>
        {hasAuthenticatedUser && (
          <div
            title={signedInEmail || signedInLabel}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 11px", borderRadius: 12, border: `1px solid ${c.border}`, background: c.surf2, color: c.tx, minWidth: 0, flexShrink: 0, maxWidth: 230 }}
          >
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: signedInColor, color: "#ffffff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
              {signedInInitial}
            </div>
            <div style={{ display: "grid", minWidth: 0, lineHeight: 1.1 }}>
              <span style={{ fontSize: 10, color: c.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Signed In</span>
              <span style={{ fontSize: 12, color: c.tx, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{signedInLabel}</span>
            </div>
          </div>
        )}
        {hasAuthenticatedUser && (
          <>
            <button
              onClick={() => { setCmdkOpen(true); setCmdkQuery(""); }}
              title="Search (Ctrl+K)"
              style={{ padding: "6px 8px", borderRadius: 7, border: `1.5px solid ${c.border2}`, background: "transparent", color: c.tx2, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 12, flexShrink: 0 }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" /><path d="M9.5 9.5l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
              <span>Ctrl+K</span>
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={exportAllData}
              title="Download all your data as JSON"
              style={{ padding: "7px 13px", borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Instrument Sans',sans-serif", display: "flex", alignItems: "center", gap: 5, flexShrink: 0, whiteSpace: "nowrap" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              Export
            </button>
          </>
        )}
        <button
          className="btn-ghost"
          style={{ padding: "7px 13px", borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Instrument Sans',sans-serif", display: "flex", alignItems: "center", gap: 5, flexShrink: 0, whiteSpace: "nowrap" }}
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          title="Toggle light / dark mode"
        >
          {theme === "dark"
            ? <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg> Light</>
            : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg> Dark</>}
        </button>
        {hasAuthenticatedUser && (
          <button
            className="btn-ghost"
            onClick={handleSignOut}
            style={{ padding: "7px 13px", borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Instrument Sans',sans-serif", display: "flex", alignItems: "center", gap: 5, flexShrink: 0, whiteSpace: "nowrap" }}
            title="Sign out of your account"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
            Sign out
          </button>
        )}
      </div>
    </div>
  );

  const authCard = (
    <InlineAuthCard
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
      authResetLoading={authResetLoading}
      onForgotPassword={handleForgotPassword}
      localFallbackEnabled={allowLocalFallbackAuth}
      setAuthMode={(updater) => {
        setAuthError(null);
        setAuthMode(updater);
      }}
    />
  );

  return (
    <>
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

      {/* ── Mobile chrome ─────────────────────────────────────────────────── */}
      {isMobile && (
        <div>
          {/* Fixed header — floats above content */}
          <MobileHeader
            palette={c}
            safeTop={safeTop}
            fixed
            today={today}
            isOnline={isOnline}
            hasPendingSync={hasPendingSync}
            isLocalUser={isLocalUser}
            hasAuthenticatedUser={hasAuthenticatedUser}
            theme={theme}
            onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            onExportData={exportAllData}
            onOpenNotifications={() => navigateTo("notifications")}
            onOpenMenu={() => setShowMoreDrawer(true)}
            onSignOut={handleSignOut}
            signedInInitial={signedInInitial}
            signedInColor={signedInColor}
            signedInLabel={signedInLabel}
          />
          {/* Invisible spacer — measured by ResizeObserver to push content down */}
          <div ref={mobileChromeRef} aria-hidden style={{ visibility: "hidden", pointerEvents: "none", marginBottom: 24 }}>
            <MobileHeader
              palette={c}
              safeTop={safeTop}
              fixed={false}
              today={today}
              isOnline={isOnline}
              hasPendingSync={hasPendingSync}
              isLocalUser={isLocalUser}
              hasAuthenticatedUser={hasAuthenticatedUser}
              theme={theme}
              onToggleTheme={() => {}}
              onExportData={() => {}}
              onOpenNotifications={() => {}}
              onOpenMenu={() => {}}
              onSignOut={() => {}}
              signedInInitial={signedInInitial}
              signedInColor={signedInColor}
              signedInLabel={signedInLabel}
            />
          </div>
          {!hasAuthenticatedUser && (
            <div style={{ marginTop: 6 }}>
              <LandingPage palette={c} isMobile={isMobile} authCard={authCard} />
            </div>
          )}
        </div>
      )}

      {/* ── Desktop chrome ────────────────────────────────────────────────── */}
      {!isMobile && (
        <div
          style={{
            position: "relative",
            background: `linear-gradient(180deg, ${c.bg}EE 0%, ${c.bg}D8 65%, transparent 100%)`,
            backdropFilter: "blur(8px)",
            paddingBottom: 8,
            marginBottom: 6,
            pointerEvents: "none",
          }}
        >
          <div style={{ pointerEvents: "auto" }}>
            {desktopHeaderRow}
          </div>
          {!hasAuthenticatedUser && (
            <div style={{ pointerEvents: "auto", marginTop: 12 }}>
              <LandingPage palette={c} isMobile={isMobile} authCard={authCard} />
            </div>
          )}
          <div style={{ pointerEvents: "auto" }}>
            {hasAuthenticatedUser && (
              <TopNav
                navItems={NAV}
                page={page}
                palette={c}
                isMobile={false}
                showMoreDrawer={showMoreDrawer}
                setShowMoreDrawer={setShowMoreDrawer}
                navigateTo={navigateTo}
                subscription={subscription}
                onOpenBilling={openBillingPage}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
