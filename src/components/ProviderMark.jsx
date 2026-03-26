import { useState } from "react";

function bankIcon(s = "") {
  const l = s.toLowerCase();
  if (l.includes("discover")) return "🟠";
  if (l.includes("chase")) return "🔵";
  if (l.includes("capital one")) return "🔴";
  if (l.includes("bank of america") || l.includes("boa")) return "🔷";
  if (l.includes("navy federal")) return "⚓";
  if (l.includes("us bank") || l.includes("usbank")) return "🟥";
  if (l.includes("sofi")) return "🟩";
  if (l.includes("wells fargo")) return "🟤";
  if (l.includes("amex")) return "🔳";
  return "◈";
}

function bankLogoSource(bank = "", name = "") {
  const s = `${bank} ${name}`.toLowerCase();
  const map = [
    { m: ["chase"], logo: "https://upload.wikimedia.org/wikipedia/commons/6/6f/Chase_logo_2007.svg", fallback: "chase.com" },
    { m: ["discover"], logo: "https://upload.wikimedia.org/wikipedia/commons/5/56/Discover_Card_logo.svg", fallback: "discover.com" },
    { m: ["capital one"], logo: "https://upload.wikimedia.org/wikipedia/commons/5/59/Capital_One_logo.svg", fallback: "capitalone.com" },
    { m: ["bank of america", "bofa"], logo: "https://upload.wikimedia.org/wikipedia/commons/2/20/Bank_of_America_logo.svg", fallback: "bankofamerica.com" },
    { m: ["american express", "amex"], logo: "https://upload.wikimedia.org/wikipedia/commons/3/30/American_Express_logo.svg", fallback: "americanexpress.com" },
    { m: ["us bank", "usbank"], logo: "https://upload.wikimedia.org/wikipedia/commons/9/9d/U.S._Bank_logo.svg", fallback: "usbank.com" },
    { m: ["citi"], logo: "https://upload.wikimedia.org/wikipedia/commons/1/1b/Citi.svg", fallback: "citi.com" },
    { m: ["sofi"], logo: "https://upload.wikimedia.org/wikipedia/commons/6/6b/SoFi_logo.svg", fallback: "sofi.com" },
    { m: ["affirm"], logo: "https://upload.wikimedia.org/wikipedia/commons/b/b3/Affirm_logo.svg", fallback: "affirm.com" },
    { m: ["wells fargo"], logo: "https://upload.wikimedia.org/wikipedia/commons/b/b3/Wells_Fargo_Bank.svg", fallback: "wellsfargo.com" },
    { m: ["navy federal"], logo: "", fallback: "navyfederal.org" },
  ];
  for (const entry of map) {
    if (entry.m.some((k) => s.includes(k))) return entry;
  }
  return null;
}

export default function ProviderMark({ bank = "", name = "", size = 16 }) {
  const [stage, setStage] = useState(0);
  const srcs = [];
  const found = bankLogoSource(bank, name);
  if (found?.logo) srcs.push(found.logo);
  if (found?.fallback) srcs.push(`https://logo.clearbit.com/${found.fallback}`);
  const src = srcs[stage] || "";
  if (!src) {
    return (
      <span
        style={{
          display: "inline-flex",
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
          background: "rgba(255,255,255,0.88)",
          border: "1px solid rgba(0,0,0,.18)",
          boxShadow: "0 2px 6px rgba(0,0,0,.16)",
          fontSize: Math.max(12, Math.floor(size * 0.58)),
          lineHeight: 1,
        }}
      >
        {bankIcon(bank || name)}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={bank || name}
      width={size}
      height={size}
      style={{
        borderRadius: 8,
        objectFit: "contain",
        background: "#fff",
        border: "1px solid rgba(0,0,0,.18)",
        boxShadow: "0 2px 6px rgba(0,0,0,.16)",
        padding: 2,
      }}
      onError={() => setStage((s) => s + 1)}
    />
  );
}
