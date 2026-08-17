// UX-6.2: the one place Personal-vs-Household HEADING VOICE is decided -
// "My debt"/"My payoff plan" for a single-owner Personal workspace, "Our
// debt"/"Household payoff plan" for Household. Deliberately narrow in scope:
// this is copy-level only (a couple of page-title strings), not a second
// competing workspace-mode flag and not a layout/structural change - the
// existing `workspace.type === "household"` checks scattered through the
// codebase (already confirmed correct everywhere they're used - owner
// badges, scope selectors, breakdown cards) are untouched. Home is
// deliberately NOT wired to this (reserved for UX-7's fuller Home redesign).
export const getWorkspacePresentation = (workspace) => {
  const isHousehold = workspace?.type === "household";
  return {
    isHousehold,
    debtHeading: isHousehold ? "Our debt" : "My debt",
    planHeading: isHousehold ? "Household payoff plan" : "My payoff plan",
  };
};
