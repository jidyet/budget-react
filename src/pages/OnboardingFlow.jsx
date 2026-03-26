import { LAUNCH_COPY } from "../config/launchCopy";

export default function OnboardingFlow({ c, isMobile, step, setStep, completeOnboarding, openSettings }) {
  if (step <= 0) return null;

  return (
    <>
      <div style={{ position:"fixed", inset:0, zIndex:600, background:"rgba(0,0,0,0.68)" }} />
      <div style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", zIndex:601, background:c.surf, borderRadius:24, padding:isMobile ? "28px 20px" : "34px 38px", width:isMobile ? "92vw" : 500, boxShadow:"0 24px 90px rgba(0,0,0,0.34)", border:`1px solid ${c.border}` }}>
        <div style={{ display:"flex", gap:6, marginBottom:26 }}>
          {[1,2,3].map((item) => (
            <div key={item} style={{ flex:1, height:4, borderRadius:999, background:item <= step ? c.ac : c.border2 }} />
          ))}
        </div>

        {step === 1 && (
          <div style={{ display:"grid", gap:10 }}>
            <div style={{ fontSize:26, fontWeight:900, color:c.tx }}>Welcome to Household Budget</div>
            <div style={{ fontSize:14, color:c.tx2, lineHeight:1.6 }}>
              {LAUNCH_COPY.onboarding.welcomeDetail}
            </div>
            <div style={{ padding:"12px 14px", borderRadius:14, background:c.surf2, border:`1px solid ${c.border}`, fontSize:13, color:c.tx2 }}>
              {LAUNCH_COPY.onboarding.welcomeNote}
            </div>
            <button type="button" onClick={() => setStep(2)} style={{ width:"100%", padding:"13px", borderRadius:12, border:"none", background:c.ac, color:"#001014", fontSize:15, fontWeight:800, cursor:"pointer", marginTop:8 }}>
              Start here
            </button>
          </div>
        )}

        {step === 2 && (
          <div style={{ display:"grid", gap:10 }}>
            <div style={{ fontSize:22, fontWeight:900, color:c.tx }}>Add your first bill</div>
            <div style={{ fontSize:14, color:c.tx2, lineHeight:1.6 }}>
              Start with one bill. The rest can come later.
            </div>
            <div style={{ padding:"12px 14px", borderRadius:14, background:c.surf2, border:`1px solid ${c.border}`, fontSize:13, color:c.tx2 }}>
              {LAUNCH_COPY.onboarding.addBillNote}
            </div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:6 }}>
              <button type="button" onClick={openSettings} style={{ flex:1, minWidth:160, padding:"12px 14px", borderRadius:12, border:"none", background:c.ac, color:"#001014", fontSize:14, fontWeight:800, cursor:"pointer" }}>
                Open settings
              </button>
              <button type="button" onClick={() => setStep(3)} style={{ padding:"12px 14px", borderRadius:12, border:`1px solid ${c.border2}`, background:c.surf, color:c.tx, fontSize:14, fontWeight:700, cursor:"pointer" }}>
                Next
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ display:"grid", gap:10 }}>
            <div style={{ fontSize:22, fontWeight:900, color:c.tx }}>Keep it simple</div>
            <div style={{ fontSize:14, color:c.tx2, lineHeight:1.6 }}>
              {LAUNCH_COPY.onboarding.simpleDetail}
            </div>
            <div style={{ display:"grid", gap:8, padding:"12px 14px", borderRadius:14, background:`linear-gradient(135deg, ${c.ac}10, ${c.surf})`, border:`1px solid ${c.border}` }}>
              <div style={{ fontSize:13, fontWeight:800, color:c.tx }}>Where you are</div>
              <div style={{ fontSize:13, fontWeight:800, color:c.tx }}>What changed</div>
              <div style={{ fontSize:13, fontWeight:800, color:c.tx }}>What to do next</div>
            </div>
            <button type="button" onClick={completeOnboarding} style={{ width:"100%", padding:"13px", borderRadius:12, border:"none", background:c.ac, color:"#001014", fontSize:15, fontWeight:800, cursor:"pointer", marginTop:8 }}>
              Finish setup
            </button>
          </div>
        )}
      </div>
    </>
  );
}
