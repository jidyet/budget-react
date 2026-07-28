import { Eye, EyeOff } from "lucide-react";
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
  embedded = false,
}) {
  if (authLoading || user) return null;
  const c = palette;
  const isEmbeddedMobile = embedded && isMobile;

  return (
    <div style={embedded ? { pointerEvents: "auto" } : { position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: isMobile ? `calc(${safeTop} + ${mobileTopChrome}) 12px calc(${safeBottom} + 16px)` : '180px 16px 24px', background: 'rgba(0,0,0,0.25)', zIndex: 1200, pointerEvents: 'auto' }}>
      <div style={{ width: embedded ? "100%" : 440, maxWidth: embedded ? '100%' : '96vw', maxHeight: embedded ? 'none' : 'min(92vh, 92dvh)', borderRadius: 16, background: c.surf, border: `1px solid ${c.border}`, boxShadow: embedded ? '0 12px 28px rgba(0,0,0,.08)' : '0 24px 60px rgba(0,0,0,.22)', overflow: 'auto', pointerEvents: 'auto' }}>
        <div style={{ background: `linear-gradient(135deg, ${c.acD}, ${c.waD})`, padding: embedded ? (isMobile ? '24px 16px 18px' : '30px 24px 22px') : '22px 24px 18px', borderBottom: `1px solid ${c.border}`, textAlign: embedded ? "center" : "left", display: "grid", justifyItems: embedded ? "center" : "start" }}>
          <BrandLockup size={embedded ? "lg" : "md"} showTagline />
          {!embedded && <div style={{ fontSize: 13, color: c.tx2, marginTop: 10 }}>{authMode === 'login' ? 'Sign in to access your data' : 'Create a new account'}</div>}
        </div>
        <form onSubmit={handleAuthSubmit} autoComplete="on" style={{ padding: isEmbeddedMobile ? '16px 14px 18px' : '20px 24px 22px' }}>
          <div style={{ fontSize: 13, color: c.tx2, marginBottom: 12, textAlign: embedded ? "center" : "left" }}>{embedded ? 'Sign in to access your data.' : 'Use Email and Password to access your user-scoped data.'}</div>
          <div style={{ marginBottom: 8 }}>
            <input id="auth-email" name="email" placeholder="Email" type="email" autoComplete="email username" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} style={{ width: '100%', border: `1.5px solid ${c.border2}`, background: c.surf, color: c.tx, borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
            <div style={{ position: "relative" }}>
              <input id="auth-password" name="password" placeholder="Password" type={showAuthPass ? 'text' : 'password'} autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} value={authPass} onChange={(event) => setAuthPass(event.target.value)} style={{ minWidth: 0, width: '100%', border: `1.5px solid ${c.border2}`, background: c.surf, color: c.tx, borderRadius: 10, padding: '10px 50px 10px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
              <button
                type="button"
                aria-label={showAuthPass ? "Hide password" : "Show password"}
                onClick={() => setShowAuthPass((current) => !current)}
                style={{
                  position: "absolute",
                  top: "50%",
                  right: 8,
                  transform: "translateY(-50%)",
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  border: "none",
                  background: "transparent",
                  color: c.tx2,
                  display: "grid",
                  placeItems: "center",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {showAuthPass ? <EyeOff size={18} strokeWidth={2.1} /> : <Eye size={18} strokeWidth={2.1} />}
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
          <div style={{ display: 'grid', gridTemplateColumns: isEmbeddedMobile ? '1fr' : 'minmax(0, 1fr) auto', gap: 8, marginTop: 8 }}>
            <button type="submit" style={{ minWidth: 0, width: '100%', padding: 10, borderRadius: 8, background: c.ac, border: 'none', fontWeight: 800, cursor: 'pointer' }}>{authMode === 'login' ? 'Sign In' : 'Create Account'}</button>
            <button type="button" onClick={() => { setAuthMode((current) => current === 'login' ? 'signup' : 'login'); }} style={{ minWidth: 0, width: isEmbeddedMobile ? '100%' : 'auto', padding: 10, borderRadius: 8, border: `1px solid ${c.border2}`, background: c.surf, color: c.tx, cursor: 'pointer' }}>{authMode === 'login' ? 'Need account?' : 'Have account?'}</button>
          </div>
          {authMode === "login" && (
            <button
              type="button"
              onClick={() => onForgotPassword?.(authEmail)}
              disabled={authResetLoading}
              style={{ marginTop: 10, padding: 0, border: "none", background: "transparent", color: c.ac, fontSize: 12, fontWeight: 800, cursor: authResetLoading ? "wait" : "pointer", width: isEmbeddedMobile ? "100%" : "auto", textAlign: isEmbeddedMobile ? "center" : "left" }}
            >
              {authResetLoading ? "Sending reset email..." : "Forgot password?"}
            </button>
          )}
          <div style={{ marginTop: 12, fontSize: 12, color: c.muted, textAlign: isEmbeddedMobile ? "center" : "left" }}>New here? Enter your email and password, then choose Create Account.</div>
        </form>
      </div>
    </div>
  );
}
