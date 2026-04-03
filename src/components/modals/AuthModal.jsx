import BrandLockup from "../ui/BrandLockup";

export default function AuthModal({
  authLoading,
  user,
  isMobile,
  safeTop,
  safeBottom,
  mobileTopChrome,
  palette,
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
  setAuthMode,
  onForgotPassword,
  authResetLoading = false,
  localFallbackEnabled = false,
}) {
  if (authLoading || user) return null;
  const c = palette;

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: isMobile ? `calc(${safeTop} + ${mobileTopChrome}) 12px calc(${safeBottom} + 16px)` : '180px 16px 24px', background: 'rgba(0,0,0,0.25)', zIndex: 1200, pointerEvents: 'auto' }}>
      <div style={{ width: 440, maxWidth: '96vw', maxHeight: 'min(92vh, 92dvh)', borderRadius: 16, background: c.surf, border: `1px solid ${c.border}`, boxShadow: '0 24px 60px rgba(0,0,0,.22)', overflow: 'auto', pointerEvents: 'auto' }}>
        <div style={{ background: `linear-gradient(135deg, ${c.acD}, ${c.waD})`, padding: '22px 24px 18px', borderBottom: `1px solid ${c.border}` }}>
          <BrandLockup size="md" showTagline />
          <div style={{ fontSize: 13, color: c.tx2, marginTop: 4 }}>{authMode === 'login' ? 'Sign in to access your data' : 'Create a new account'}</div>
        </div>
        <form onSubmit={handleAuthSubmit} autoComplete="on" style={{ padding: '20px 24px 22px' }}>
          <div style={{ fontSize: 13, color: c.tx2, marginBottom: 12 }}>Use Email and Password to access your user-scoped data.</div>
          <div style={{ marginBottom: 8 }}>
            <input id="auth-email" name="email" placeholder="Email" type="email" autoComplete="email username" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} style={{ width: '100%', border: `1.5px solid ${c.border2}`, background: c.surf, color: c.tx, borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <input id="auth-password" name="password" placeholder="Password" type={showAuthPass ? 'text' : 'password'} autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} value={authPass} onChange={(event) => setAuthPass(event.target.value)} style={{ flex: 1, border: `1.5px solid ${c.border2}`, background: c.surf, color: c.tx, borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
              <button type="button" onClick={() => setShowAuthPass((current) => !current)} style={{ padding: '0 12px', borderRadius: 8, border: `1px solid ${c.border2}`, background: c.surf2, color: c.tx2, fontWeight: 700, cursor: 'pointer' }}>
                {showAuthPass ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          {!firebaseStatus.configured && (
            <div style={{ color: c.da, marginBottom: 8, fontSize: 12 }}>
              {localFallbackEnabled
                ? "Firebase is not configured. This build can use local preview sign-in."
                : "Firebase is not configured. Sign-in is unavailable in this build."}
            </div>
          )}
          {authError && <div style={{ color: c.da, marginBottom: 8, fontSize: 13 }}>{authError}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="submit" style={{ flex: 1, padding: 10, borderRadius: 8, background: c.ac, border: 'none', fontWeight: 800, cursor: 'pointer' }}>{authMode === 'login' ? 'Sign In' : 'Create Account'}</button>
            <button type="button" onClick={() => { setAuthMode((current) => current === 'login' ? 'signup' : 'login'); }} style={{ padding: 10, borderRadius: 8, border: `1px solid ${c.border2}`, background: c.surf, color: c.tx, cursor: 'pointer' }}>{authMode === 'login' ? 'Need account?' : 'Have account?'}</button>
          </div>
          {authMode === "login" && (
            <button
              type="button"
              onClick={() => onForgotPassword?.(authEmail)}
              disabled={authResetLoading}
              style={{ marginTop: 10, padding: 0, border: "none", background: "transparent", color: c.ac, fontSize: 12, fontWeight: 800, cursor: authResetLoading ? "wait" : "pointer" }}
            >
              {authResetLoading ? "Sending reset email..." : "Forgot password?"}
            </button>
          )}
          <div style={{ marginTop: 12, fontSize: 12, color: c.muted }}>New here? Enter your email and password, then choose Create Account.</div>
        </form>
      </div>
    </div>
  );
}
