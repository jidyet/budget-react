import { BRAND_COLORS } from "./brand";

export function buildPalette(theme) {
  const D = theme === "dark";
  return {
    // Backgrounds
    bg:      D ? "#07131f" : "#f0f6ff",
    bg2:     D ? "#0f2236" : "#e6f0fb",
    // Surfaces
    surf:    D ? "#112235" : "#ffffff",
    surf2:   D ? "#0c1c2c" : "#e8f3ff",
    surf3:   D ? "#162840" : "#deeef9",
    // Borders
    border:  D ? "#274864" : "#c2ddf0",
    border2: D ? "#39729e" : "#7bbee8",
    // Text
    tx:      D ? "#f0f8ff" : "#0a2236",
    tx2:     D ? "#c8dff5" : "#1e3d54",
    muted:   D ? "#8ab4d8" : "#2e6080",
    // Accent - blue-led app theme
    ac:      D ? "#3ab4f2" : BRAND_COLORS.blue,
    acD:     D ? "rgba(58,180,242,.22)" : "rgba(24,167,225,.22)",
    acS:     D ? "rgba(58,180,242,.10)" : "rgba(24,167,225,.10)",
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
