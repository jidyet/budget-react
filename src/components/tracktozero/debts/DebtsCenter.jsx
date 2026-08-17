import React, { useEffect, useState } from "react";
import PortfolioHeader from "./PortfolioHeader.jsx";
import ScopeSelector from "./ScopeSelector.jsx";
import CategoryGrid from "./CategoryGrid.jsx";
import CategoryDetailPage from "./CategoryDetailPage.jsx";
import QuickUpdateRail from "./QuickUpdateRail.jsx";
import AddDebtModal from "./AddDebtModal.jsx";
import ReviewEditDebtDrawer from "./ReviewEditDebtDrawer.jsx";
import ImportCenter from "../import/ImportCenter.jsx";
import { deriveDebtPortfolioView } from "../debtPortfolioView.js";
import { resolveDebtsDestination, buildDebtsPath } from "./debtsRouting.js";
import { useIsTablet } from "../useViewport.js";

// UX-6.1: replaces the monolith's inline Debts component. The root view is
// navigation (portfolio header + owner scope + visual category grid), not a
// flat list of every debt card - clicking a category opens a focused
// CategoryDetailPage, mirroring PlanSection.jsx's own pushState-based
// sub-routing pattern (destination state + popstate listener) rather than
// adding a router dependency.
//
// UX-6.2: the caller (TrackToZeroV2App.jsx) renders this with
// `key={snapshot.workspace?.id}` - a real remount (not a useEffect reset) on
// workspace switch. Without it, ownerFilter/destination (and any open Add
// Debt/Import panel) silently carried over from one workspace into another -
// e.g. an owner-scope filter set to a specific household member's uid stayed
// set after switching to Personal (or a different household) where that uid
// is meaningless, producing an empty/wrong category page with no visible
// cause. A full remount is simpler and more robust than manually resetting
// each piece of local state, and correctly closes any open modal too.
export default function DebtsCenter({ snapshot, service, refresh, refreshReview, runAction, writeState, reviewSnapshot, onGoToReview, initialAction, onInitialActionHandled }) {
  const [destination, setDestination] = useState(() => resolveDebtsDestination(typeof window !== "undefined" ? window.location.pathname : "/debts"));
  const [ownerFilter, setOwnerFilter] = useState("all");
  // UX-8: mobile quick-action sheet support - `initialAction` ("add-debt" |
  // "import" | null) is a one-shot navigation intent from
  // TrackToZeroV2App.jsx's QuickActionSheet, consumed only via this lazy
  // initializer (never a useEffect+setState mirroring a prop, which this
  // repo's react-hooks/set-state-in-effect rule forbids). The effect below
  // only tells the PARENT the intent has been consumed, so it doesn't
  // reappear on a later, unrelated remount of this component.
  const [addDebtOpen, setAddDebtOpen] = useState(() => initialAction === "add-debt");
  const [addDebtPrefillName, setAddDebtPrefillName] = useState("");
  const [importOpen, setImportOpen] = useState(() => initialAction === "import-statement");
  const [reviewDebtId, setReviewDebtId] = useState(null);
  const isTablet = useIsTablet();

  useEffect(() => {
    if (initialAction) onInitialActionHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const syncDestination = () => setDestination(resolveDebtsDestination(window.location.pathname));
    window.addEventListener("popstate", syncDestination);
    syncDestination();
    return () => window.removeEventListener("popstate", syncDestination);
  }, []);


  const navigate = (nextDestination) => {
    const path = buildDebtsPath(nextDestination);
    if (typeof window !== "undefined" && window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
    setDestination(nextDestination);
  };

  // ScopeSelector/CategoryDetailPage only DISPLAY people (never create one -
  // "+ Add a household person" lives inside OwnerField, used by AddDebtModal
  // and the import candidate editor, each of which manages its own
  // newly-created-person state locally, mirroring the pre-existing pattern
  // where Debts and ImportPanel already kept separate local copies).
  const people = snapshot.people || [];
  const canManage = snapshot.permissions.manageDebts && snapshot.mode !== "legacy_preview";
  const canObserve = snapshot.permissions.recordObservations && snapshot.mode !== "legacy_preview";
  const portfolio = deriveDebtPortfolioView(snapshot);

  const rail = (
    <QuickUpdateRail snapshot={snapshot} service={service} refresh={refresh} runAction={runAction} writeState={writeState} canObserve={canObserve} />
  );

  const mainContent = importOpen ? (
    <ImportCenter
      snapshot={snapshot}
      service={service}
      refresh={refresh}
      refreshReview={refreshReview}
      canManage={canManage}
      reviewSnapshot={reviewSnapshot}
      onGoToReview={onGoToReview}
      onClose={() => setImportOpen(false)}
      onAddAsDebt={(prefillName) => { setImportOpen(false); setAddDebtPrefillName(prefillName || ""); setAddDebtOpen(true); }}
    />
  ) : destination === "all" ? (
    <div style={{ display: "grid", gap: "var(--ttz-space-5, 24px)" }}>
      <ScopeSelector snapshot={snapshot} ownerFilter={ownerFilter} onChange={setOwnerFilter} people={people} />
      <CategoryGrid portfolio={portfolio} ownerFilter={ownerFilter} latestSnapshotsByDebt={snapshot.latestSnapshotsByDebt} onSelectCategory={navigate} />
    </div>
  ) : (
    <CategoryDetailPage
      snapshot={snapshot}
      portfolio={portfolio}
      categorySlug={destination}
      ownerFilter={ownerFilter}
      onOwnerFilterChange={setOwnerFilter}
      onBack={() => navigate("all")}
      people={people}
      onReviewDebt={(debt) => setReviewDebtId(debt.id)}
    />
  );

  const reviewDebt = (snapshot.debts || []).find((debt) => debt.id === reviewDebtId) || null;

  return (
    <>
      <PortfolioHeader
        portfolio={portfolio}
        workspace={snapshot.workspace}
        canManage={canManage}
        onAddDebt={() => setAddDebtOpen(true)}
        onImportStatement={() => setImportOpen(true)}
      />
      <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "1fr 320px", gap: "var(--ttz-space-5, 24px)", alignItems: "start", marginTop: "var(--ttz-space-5, 24px)" }}>
        <div>{mainContent}</div>
        <div>{rail}</div>
      </div>
      <AddDebtModal
        key={`${addDebtOpen}-${addDebtPrefillName}`}
        open={addDebtOpen}
        onClose={() => setAddDebtOpen(false)}
        snapshot={snapshot}
        service={service}
        refresh={refresh}
        runAction={runAction}
        writeState={writeState}
        canManage={canManage}
        prefillName={addDebtPrefillName}
      />
      <ReviewEditDebtDrawer
        key={reviewDebt?.id || "none"}
        open={!!reviewDebt}
        debt={reviewDebt}
        onClose={() => setReviewDebtId(null)}
        snapshot={snapshot}
        service={service}
        refresh={refresh}
        runAction={runAction}
        writeState={writeState}
        canManage={canManage}
        canObserve={canObserve}
      />
    </>
  );
}
