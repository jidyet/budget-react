import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AppShell from "./AppShell.jsx";
import BrandMark from "./BrandMark.jsx";
import PrimaryNav from "./PrimaryNav.jsx";
import WorkspaceIdentity from "./WorkspaceIdentity.jsx";
import UserMenu from "./UserMenu.jsx";
import EnvironmentBadge from "./EnvironmentBadge.jsx";
import PageContainer from "./PageContainer.jsx";
import PageHeader from "./PageHeader.jsx";
import SectionHeader from "./SectionHeader.jsx";
import { TRACKTOZERO_V2_REPOSITORY_MODES } from "../../../services/tracktozero/repositoryRuntime.js";
import { toneColors } from "../theme.js";

const render = (element) => renderToStaticMarkup(element);

describe("UX-1 shell and brand components", () => {
  it("BrandMark renders the authentic TrackToZero wordmark", () => {
    const html = render(h(BrandMark, { showTagline: true }));
    expect(html).toContain("Track");
    expect(html).toContain("To");
    expect(html).toContain("Zero");
    expect(html).toContain("Track. Reduce. Find freedom.");
  });

  it("PrimaryNav exposes a semantic nav and clear active page", () => {
    const html = render(h(PrimaryNav, { activeTab: "debts", onSelect: () => {} }));
    expect(html).toContain('aria-label="Primary"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Debts");
  });

  it("REVIEW-1B: PrimaryNav shows Review with an open-count badge, and it is never a danger/red tone", () => {
    const withCount = render(h(PrimaryNav, { activeTab: "review", onSelect: () => {}, badges: { review: 3 } }));
    expect(withCount).toContain("Review");
    expect(withCount).toContain("3");
    expect(withCount).not.toContain(toneColors().danger.fg);
    const withoutCount = render(h(PrimaryNav, { activeTab: "home", onSelect: () => {}, badges: { review: 0 } }));
    expect(withoutCount).toContain("Review");
  });

  it("WorkspaceIdentity labels personal and household workspaces without guessing names", () => {
    expect(render(h(WorkspaceIdentity, { workspace: { type: "personal" } }))).toContain("Personal workspace");
    expect(render(h(WorkspaceIdentity, { workspace: { type: "household" } }))).toContain("Household workspace");
  });

  it("UserMenu keeps role/email behind an account menu button", () => {
    const html = render(h(UserMenu, { name: "Baba", email: "baba@example.com", role: "owner" }));
    expect(html).toContain('aria-label="Account menu"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("baba@example.com");
    expect(html).not.toContain("Role: owner");
  });

  it("EnvironmentBadge stays subtle and omits production badges", () => {
    expect(render(h(EnvironmentBadge, { repositoryMode: TRACKTOZERO_V2_REPOSITORY_MODES.localBeta, snapshotMode: "normal" }))).toContain("LOCAL BETA");
    expect(render(h(EnvironmentBadge, { repositoryMode: TRACKTOZERO_V2_REPOSITORY_MODES.firebaseProduction, snapshotMode: "normal" }))).toBe("");
  });

  it("AppShell owns brand/nav chrome and leaves page content inside the shell", () => {
    const html = render(h(AppShell, {
      topBarProps: {
        workspace: { type: "personal" },
        repositoryMode: TRACKTOZERO_V2_REPOSITORY_MODES.localBeta,
        snapshotMode: "normal",
        activeTab: "home",
        onSelectTab: () => {},
        userName: "Baba",
        userEmail: "baba@example.com",
        userRole: "owner",
      },
    }, h(PageContainer, null, h(PageHeader, { title: "Home", description: "Debt command center" }), h(SectionHeader, { title: "Next payment" }))));

    expect(html).toContain("TrackToZero");
    expect(html).toContain("Personal workspace");
    expect(html).toContain("LOCAL BETA");
    expect(html).toContain("Home");
    expect(html).toContain("Next payment");
    expect(html).not.toContain("Current role:");
    expect(html).not.toContain("Local beta workspace (emulator)");
  });
});
