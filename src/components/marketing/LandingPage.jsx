import { FilePenLine, FileSpreadsheet, FileText, Scale, ShieldCheck, Target } from "lucide-react";

function SectionCard({ children, style }) {
  return (
    <div
      style={{
        background: "var(--landing-card-bg)",
        border: "1px solid var(--landing-card-border)",
        borderRadius: 24,
        padding: "22px 22px",
        boxShadow: "0 18px 42px rgba(16, 24, 40, 0.06)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function BulletList({ items, color }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {items.map((item) => (
        <div key={item} style={{ display: "flex", gap: 10, alignItems: "flex-start", color }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "currentColor", marginTop: 8, flexShrink: 0, opacity: 0.9 }} />
          <span style={{ fontSize: 16, lineHeight: 1.55 }}>{item}</span>
        </div>
      ))}
    </div>
  );
}

function LandingPageVisuals({ palette: c, isMobile }) {
  return (
    <div style={{ display: "grid", gap: 64 }}>
      <section
        style={{
          background: `linear-gradient(145deg, ${c.surf} 0%, ${c.surf2} 55%, ${c.bg2} 100%)`,
          border: `1px solid ${c.border}`,
          borderRadius: 30,
          padding: isMobile ? "24px 20px" : "32px",
          boxShadow: "0 24px 60px rgba(0,0,0,0.16)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, borderRadius: 18, background: `${c.wa}20`, display: "grid", placeItems: "center" }}>
            <Target color={c.wa} size={28} />
          </div>
          <h3 style={{ margin: 0, fontSize: isMobile ? 26 : 32, lineHeight: 1.05, color: c.tx, fontFamily: "'Syne',sans-serif", textWrap: "balance" }}>
            Your Household Path to Zero
          </h3>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 28, alignItems: "center" }}>
          <div
            style={{
              background: `${c.bg}CC`,
              border: `1px solid ${c.border}`,
              padding: "24px",
              borderRadius: 24,
            }}
          >
            <div style={{ fontSize: 12, color: c.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 800 }}>
              Total Household Debt
            </div>
            <div style={{ fontSize: isMobile ? 34 : 42, fontWeight: 900, color: c.tx, marginBottom: 16, lineHeight: 1 }}>
              $42,500 <span style={{ fontSize: 14, fontWeight: 500, color: c.tx2 }}>/ $105,000 to Zero</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginBottom: 16 }}>
              <div style={{ padding: "10px 12px", borderRadius: 16, background: `${c.go}12`, border: `1px solid ${c.go}24` }}>
                <div style={{ fontSize: 11, color: c.tx2, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800, marginBottom: 4 }}>
                  Paid Off
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, color: c.go }}>$42,500</div>
              </div>
              <div style={{ padding: "10px 12px", borderRadius: 16, background: `${c.ac}10`, border: `1px solid ${c.ac}24` }}>
                <div style={{ fontSize: 11, color: c.tx2, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800, marginBottom: 4 }}>
                  Remaining
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, color: c.tx }}>$62,500</div>
              </div>
            </div>
            <div style={{ width: "100%", height: 16, background: c.bg2, borderRadius: 999, overflow: "hidden" }}>
              <div style={{ height: "100%", width: "40%", borderRadius: 999, background: `linear-gradient(90deg, ${c.wa}, ${c.go})` }} />
            </div>
            <div style={{ textAlign: "center", fontSize: 14, color: c.go, marginTop: 10, fontWeight: 800 }}>
              40% of the way there!
            </div>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 20, color: c.tx, fontWeight: 800, lineHeight: 1.4 }}>
              Stop managing bills in the dark.
            </p>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.7, color: c.tx2 }}>
              TrackToZero brings everything together when debts are spread across partners and accounts, so everyone sees the full picture in one shared view.
            </p>
          </div>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 32, alignItems: "center" }}>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: 16, background: `${c.go}20`, display: "grid", placeItems: "center" }}>
              <Scale color={c.go} size={26} />
            </div>
            <h3 style={{ margin: 0, fontSize: isMobile ? 24 : 30, lineHeight: 1.08, color: c.tx, fontFamily: "'Syne',sans-serif" }}>
              Shared Responsibility
            </h3>
          </div>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.7, color: c.tx2 }}>
            Go beyond just splitting costs. Decide exactly who is paying which bill so the whole house stays on track.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
          {[
            { initial: "A", name: "Alex's List", tone: c.wa },
            { initial: "J", name: "Jordan's List", tone: c.go },
          ].map((person) => (
            <div key={person.name} style={{ background: `linear-gradient(145deg, ${c.surf}, ${c.surf2})`, border: `1px solid ${c.border}`, padding: "20px", borderRadius: 20, display: "grid", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: person.tone, display: "grid", placeItems: "center", color: "#fff", fontSize: 13, fontWeight: 900 }}>
                  {person.initial}
                </div>
                <span style={{ fontWeight: 800, color: c.tx }}>{person.name}</span>
              </div>
              <div style={{ height: 6, background: c.border, borderRadius: 999, width: "80%" }} />
              <div style={{ height: 6, background: c.border, borderRadius: 999, width: "60%" }} />
              <div style={{ height: 6, background: c.border, borderRadius: 999, width: "90%" }} />
            </div>
          ))}
        </div>
      </section>

      <section
        style={{
          background: `linear-gradient(145deg, ${c.go}10 0%, ${c.surf} 50%, ${c.surf2} 100%)`,
          padding: isMobile ? "28px 20px" : "48px 32px",
          borderRadius: 30,
          border: `1px solid ${c.go}30`,
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 20 }}>
          <div style={{ width: 52, height: 52, borderRadius: 18, background: `${c.go}20`, display: "grid", placeItems: "center" }}>
            <ShieldCheck color={c.go} size={28} />
          </div>
          <h2 style={{ margin: 0, fontSize: isMobile ? 28 : 36, lineHeight: 1.04, color: c.tx, fontFamily: "'Syne',sans-serif", textWrap: "balance" }}>
            Your Private Command Center
          </h2>
        </div>
        <p style={{ margin: "0 auto 32px", maxWidth: 720, fontSize: 17, lineHeight: 1.7, color: c.tx2 }}>
          Most apps want your bank password. We don't. You stay in control of your info while working together as a team.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 16, maxWidth: 980, margin: "0 auto" }}>
          {[
            { label: "Manual Bill Entry", tone: c.go, icon: FilePenLine },
            { label: "Upload PDF Bills", tone: c.wa, icon: FileText },
            { label: "Upload Spreadsheets", tone: c.go, icon: FileSpreadsheet },
          ].map((item) => (
            <div key={item.label} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "18px 16px", background: `${c.bg}CC`, borderRadius: 18, border: `1px solid ${c.border}`, color: c.tx, fontSize: 15, fontWeight: 700 }}>
              <item.icon size={20} color={item.tone} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function LandingPage({ palette: c, isMobile, authCard }) {
  const twoPillarsCols = isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))";
  const sharedSpacePoints = [
    "Bring your household into one shared view.",
    "See who is handling what.",
    "Keep bills, payments, and responsibilities aligned.",
    "Work together without guessing across different accounts.",
  ];
  const debtMissionPoints = [
    "Keep the mission clear: reach zero.",
    "Stay focused on balances, due items, and progress.",
    "Use one command center instead of scattered notes and apps.",
    "Move together toward the same payoff goal.",
  ];

  return (
    <div
      style={{
        "--landing-card-bg": `linear-gradient(135deg, ${c.surf} 0%, ${c.surf2} 100%)`,
        "--landing-card-border": c.border,
        display: "grid",
        gap: 14,
        marginBottom: 18,
        paddingBottom: 96,
        overflowX: "hidden",
      }}
    >
      <SectionCard
        style={{
          background: `linear-gradient(135deg, ${c.ac}14 0%, ${c.surf} 34%, ${c.surf2} 82%, ${c.wa}10 100%)`,
          border: `1px solid ${c.ac}33`,
          overflow: "hidden",
          position: "relative",
          padding: isMobile ? "18px 18px 16px" : "18px 22px 20px",
        }}
      >
        <div style={{ position: "absolute", inset: "auto -56px -70px auto", width: 240, height: 240, borderRadius: "50%", background: `radial-gradient(circle, ${c.ac}22, transparent 70%)`, pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: "-44px auto auto -52px", width: 180, height: 180, borderRadius: "50%", background: `radial-gradient(circle, ${c.wa}16, transparent 72%)`, pointerEvents: "none" }} />
        <div style={{ position: "relative", display: "grid", gap: 12, justifyItems: "center", textAlign: "center" }}>
          <div style={{ display: "grid", gap: 0, maxWidth: 780, justifyItems: "center" }}>
            <div style={{ fontSize: isMobile ? 11 : 13, fontWeight: 900, letterSpacing: isMobile ? "0.08em" : "0.12em", textTransform: "uppercase", color: c.tx2, marginBottom: 10, maxWidth: isMobile ? 300 : "none", lineHeight: 1.35 }}>
              Shared household debt command center
            </div>
            <h1
              style={{
                margin: 0,
                marginBottom: 14,
                fontSize: isMobile ? 22 : 56,
                lineHeight: isMobile ? 1.08 : 0.96,
                letterSpacing: "-0.05em",
                fontFamily: "'Syne',sans-serif",
                color: c.tx,
                textWrap: "balance",
                maxWidth: isMobile ? 280 : "none",
              }}
            >
              <span>Shared bills. </span>
              <span style={{ whiteSpace: isMobile ? "normal" : "nowrap" }}>Debt-focused.</span>
              <span> One path to zero.</span>
            </h1>
            <div
              style={{
                fontSize: isMobile ? 15 : 21,
                lineHeight: 1.5,
                color: c.tx2,
                maxWidth: isMobile ? 290 : 760,
                marginBottom: 16,
              }}
            >
              Manage household or personal debt without bank linking.
            </div>
            <div style={{ width: "100%", maxWidth: isMobile ? 330 : 760 }}>{authCard}</div>
          </div>
        </div>
      </SectionCard>

      <div style={{ paddingTop: 28 }}>
        <LandingPageVisuals palette={c} isMobile={isMobile} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: twoPillarsCols, gap: 18 }}>
        <SectionCard>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: c.tx2, marginBottom: 10 }}>
            Shared household space
          </div>
          <div
            style={{
              fontSize: isMobile ? 24 : 30,
              lineHeight: 1.08,
              fontFamily: "'Syne',sans-serif",
              color: c.tx,
              marginBottom: 12,
              textWrap: "balance",
            }}
          >
            Keep the whole team aligned.
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.65, color: c.tx2, marginBottom: 12 }}>
            Built for couples, roommates, families, and solo users.
          </div>
          <BulletList items={sharedSpacePoints} color={c.tx} />
        </SectionCard>

        <SectionCard>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: c.tx2, marginBottom: 10 }}>
            A simple path to zero
          </div>
          <div
            style={{
              fontSize: isMobile ? 24 : 30,
              lineHeight: 1.08,
              fontFamily: "'Syne',sans-serif",
              color: c.tx,
              marginBottom: 12,
              textWrap: "balance",
            }}
          >
            Reach zero together.
          </div>
          <BulletList items={debtMissionPoints} color={c.tx} />
        </SectionCard>
      </div>

      <SectionCard
        style={{
          width: "100%",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: c.tx2, marginBottom: 10 }}>
          No-bank trust section
        </div>
        <div
          style={{
            fontSize: isMobile ? 24 : 30,
            lineHeight: 1.08,
            fontFamily: "'Syne',sans-serif",
            color: c.tx,
            marginBottom: 12,
            textWrap: "balance",
          }}
        >
          Use the app without sharing bank credentials.
        </div>
        <div style={{ fontSize: 16, lineHeight: 1.65, color: c.tx2 }}>
          Most people don't struggle with bills alone, they struggle because information is spread across different people. TrackToZero brings your whole house into one view.
        </div>
      </SectionCard>

      <div style={{ paddingTop: 48 }}>
        <div style={{ display: "flex", justifyContent: "center", padding: isMobile ? "4px 4px 10px" : "8px 8px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: c.tx2, fontSize: 13, fontWeight: 700 }}>
            <span>(C)</span>
            <span>TrackToZero</span>
          </div>
        </div>
      </div>
    </div>
  );
}
