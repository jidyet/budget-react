import { BRAND_COLORS } from "./brand";

export function buildPalette(theme) {
  const D = theme === "dark";
  return {
    // Backgrounds
    bg:      D ? "#08111d" : "#f5f9ff",
    bg2:     D ? "#0d1b2b" : "#edf5ff",
    // Surfaces
    surf:    D ? "#0d1726" : "#ffffff",
    surf2:   D ? "#122136" : "#f4f9ff",
    surf3:   D ? "#172942" : "#e9f2ff",
    // Borders
    border:  D ? "#21364f" : "#d7e7f6",
    border2: D ? "#2f5f8b" : "#a9cae8",
    // Text
    tx:      D ? "#eef6ff" : "#10263d",
    tx2:     D ? "#bfd4ea" : "#34556f",
    muted:   D ? "#85a7c8" : "#5d7b95",
    // Accent - blue-led app theme
    ac:      D ? "#3ab4f2" : BRAND_COLORS.blue,
    acD:     D ? "rgba(58,180,242,.24)" : "rgba(24,167,225,.20)",
    acS:     D ? "rgba(58,180,242,.12)" : "rgba(24,167,225,.08)",
    acText:  "#000000",
    // Secondary accent - deeper blue
    in:      D ? "#6cc8ff" : "#0d8ecb",
    inD:     D ? "rgba(108,200,255,.18)" : "rgba(13,142,203,.12)",
    // Success / green — brand green, visually distinct from accent blue
    go:      D ? "#4ade80" : BRAND_COLORS.green,
    goD:     D ? "rgba(74,222,128,.20)" : BRAND_COLORS.greenSoft,
    // Warning  -  amber
    wa:      D ? "#ffb44d" : BRAND_COLORS.orange,
    waD:     D ? "rgba(255,180,77,.20)" : BRAND_COLORS.orangeSoft,
    // Danger / red
    da:      D ? "#ff5f74" : "#d42828",
    daD:     D ? "rgba(255,95,116,.20)" : "rgba(212,40,40,.11)",
    re:      D ? "#ff5f74" : "#d42828",
    reD:     D ? "rgba(255,95,116,.20)" : "rgba(212,40,40,.11)",
    // Info  -  blue
    info:    D ? "#6bbdff" : BRAND_COLORS.blue,
    infoD:   D ? "rgba(107,189,255,.18)" : BRAND_COLORS.blueSoft,
    // Urgent  -  today-due (bright amber, one step hotter than warning)
    ur:      D ? "#ffb64f" : "#d66d00",
    urD:     D ? "rgba(255,182,79,.22)" : "rgba(214,109,0,.13)",
  };
}
