import React, { useEffect, useMemo, useState } from "react";
import PortfolioHeader from "./PortfolioHeader.jsx";
import CategoryGrid from "./CategoryGrid.jsx";
import CategoryDetailPage from "./CategoryDetailPage.jsx";
import TopLendersCard from "./TopLendersCard.jsx";
import QuickUpdateRail from "./QuickUpdateRail.jsx";
import AddDebtModal from "./AddDebtModal.jsx";
import ReviewEditDebtDrawer from "./ReviewEditDebtDrawer.jsx";
import ImportCenter from "../import/ImportCenter.jsx";
import Card from "../ui/Card.jsx";
import Button from "../ui/Button.jsx";
import MoneyInput from "../ui/MoneyInput.jsx";
import DateInput from "../ui/DateInput.jsx";
import Select from "../ui/Select.jsx";
import { TYPE_SCALE, ttzPalette } from "../theme.js";
import { formatMoney as money } from "../formatting.js";
import { deriveDebtPortfolioView, filterDebtsByOwnerScope } from "../debtPortfolioView.js";
import { resolveDebtsDestination, buildDebtsPath } from "./debtsRouting.js";
import LenderIdentity from "./LenderIdentity.jsx";
import { resolveWorkingBalance } from "../../../domain/tracktozero/paymentCycle.js";
import { useIsTablet } from "../useViewport.js";
import {
  BALANCE_RANGE_OPTIONS,
  DEBT_EXPLORER_SORTS,
  DUE_TIMING_FILTER_OPTIONS,
  applyDebtExplorerFilters,
  groupDebtsByLender,
  sortDebtExplorerDebts,
} from "./debtExplorerView.js";

function RootPaymentPanel({ debt, snapshot, runAction, service, refresh, writeState, canObserve }) {
  const palette = ttzPalette;
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));

  if (!debt) return null;

  const latestSnapshot = snapshot.latestSnapshotsByDebt?.[debt.id] || null;
  const paymentEvents = snapshot.paymentEventsByDebt?.[debt.id] || [];
  const working = resolveWorkingBalance({ debt, latestSnapshot, paymentEvents });
  const projectedBalance = paymentAmount !== "" ? Math.max(0, Number(working.amount || 0) - Number(paymentAmount || 0)) : working.amount;

  const submitPayment = (event) => {
    event.preventDefault();
    if (!paymentAmount) return;
    runAction("record payment", async () => {
      await service.recordPayment(snapshot.workspace.id, debt.id, {
        amount: Number(paymentAmount),
        paidAt: paymentDate ? new Date(paymentDate).toISOString() : undefined,
      });
      setPaymentAmount("");
      await refresh();
    });
  };

  return (
    <Card
      variant="default"
      style={{
        padding: 20,
        display: "grid",
        gap: 14,
        position: "sticky",
        top: 108,
        background: `linear-gradient(180deg, ${palette.surf2} 0%, ${palette.surf} 100%)`,
        border: `1px solid ${palette.border2 || palette.border}`,
        boxShadow: "var(--ttz-shadow-md)",
      }}
    >
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ ...TYPE_SCALE.sectionTitle, color: palette.tx }}>Record payment</div>
        <div style={{ ...TYPE_SCALE.supporting, color: palette.tx2 }}>Selected debt</div>
      </div>

      <Card variant="default" padding="14px" style={{ display: "grid", gap: 10, background: palette.surf, border: `1px solid ${palette.border}` }}>
        <LenderIdentity
          creditorName={debt.name}
          debtType={debt.debtType}
          lastFour={debt.accountReferenceSafe}
          size="md"
        />
        <div style={{ ...TYPE_SCALE.supporting, color: palette.tx2 }}>
          {debt.ownerLabel || debt.ownerType === "joint" ? debt.ownerLabel || "Joint / Household" : "You"}
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        <Card variant="default" padding="12px" style={{ display: "grid", gap: 4, background: palette.surf, border: `1px solid ${palette.border}` }}>
          <div style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>Current balance</div>
          <div style={{ ...TYPE_SCALE.metricSm, color: palette.tx }}>{working.amount != null ? money(working.amount) : "Unknown"}</div>
        </Card>
        <Card variant="default" padding="12px" style={{ display: "grid", gap: 4, background: palette.surf, border: `1px solid ${palette.border}` }}>
          <div style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>Current minimum due</div>
          <div style={{ ...TYPE_SCALE.metricSm, color: palette.tx }}>{debt.minimumRequiredPayment != null ? money(debt.minimumRequiredPayment) : "Unknown"}</div>
        </Card>
      </div>

      <form onSubmit={submitPayment} style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>Actual payment</div>
          <MoneyInput value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} />
          <div style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>You can pay more than the minimum.</div>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>Payment date</div>
          <DateInput value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
        </div>

        <Card variant="default" padding="12px" style={{ display: "grid", gap: 8, background: palette.surf, border: `1px solid ${palette.border}` }}>
          <div style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>New balance (after payment)</div>
          <div style={{ ...TYPE_SCALE.metricSm, color: palette.tx }}>{projectedBalance != null ? money(projectedBalance) : "Unknown"}</div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, color: palette.tx2, fontSize: 12 }}>
            <span>Current-cycle minimum</span>
            <span>{debt.minimumRequiredPayment != null ? money(debt.minimumRequiredPayment) : "Unknown"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, color: palette.tx2, fontSize: 12 }}>
            <span>Next estimated minimum</span>
            <span>{debt.estimatedNextMinimumPayment != null ? money(debt.estimatedNextMinimumPayment) : "Unknown"}</span>
          </div>
          <div style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>
            Actual payment can be higher than the minimum. Your next minimum may change as interest and new charges post.
          </div>
        </Card>

        <Button type="submit" variant="primary" disabled={!canObserve || writeState.inProgress || paymentAmount === ""}>
          {writeState.action === "record payment" ? "Saving..." : "Save payment"}
        </Button>
      </form>
    </Card>
  );
}

function RootFilterBar({
  palette,
  snapshot,
  ownerFilter,
  setOwnerFilter,
  statusFilter,
  setStatusFilter,
  lenderFilter,
  setLenderFilter,
  balanceFilter,
  setBalanceFilter,
  dueTimingFilter,
  setDueTimingFilter,
  sort,
  setSort,
  lenderOptions,
  resultsCount,
}) {
  const ownerOptions = [
    ["all", "All owners"],
    ...(snapshot.workspace?.type === "household"
      ? [
          ...(snapshot.people || []).map((person) => [person.id, person.displayName || person.name || "Member"]),
          ["joint", "Joint"],
          ["unassigned", "Unassigned"],
        ]
      : []),
  ];
  const hasActiveFilters = statusFilter !== "all"
    || ownerFilter !== "all"
    || lenderFilter !== "all"
    || balanceFilter !== "all"
    || dueTimingFilter !== "all"
    || sort !== "payoff_order";

  const clearFilters = () => {
    setStatusFilter("all");
    setOwnerFilter("all");
    setLenderFilter("all");
    setBalanceFilter("all");
    setDueTimingFilter("all");
    setSort("payoff_order");
  };

  return (
    <Card
      variant="default"
      style={{
        display: "grid",
        gap: 12,
        background: `linear-gradient(180deg, ${palette.surf2} 0%, ${palette.surf} 100%)`,
        border: `1px solid ${palette.border2 || palette.border}`,
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(0, 1fr))", gap: 10, alignItems: "end" }}>
        <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
          <div style={{ ...TYPE_SCALE.caption, color: palette.tx2, fontWeight: 800 }}>Status</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button size="sm" variant={statusFilter === "all" ? "primary" : "secondary"} onClick={() => setStatusFilter("all")}>All</Button>
            <Button size="sm" variant={statusFilter === "needs_attention" ? "primary" : "secondary"} onClick={() => setStatusFilter("needs_attention")}>Needs attention</Button>
            <Button size="sm" variant={statusFilter === "paid_off" ? "primary" : "secondary"} onClick={() => setStatusFilter("paid_off")}>Paid off</Button>
          </div>
        </div>

        {ownerOptions.length > 1 ? (
          <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
            <div style={{ ...TYPE_SCALE.caption, color: palette.tx2, fontWeight: 800 }}>Owner</div>
            <Select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
              {ownerOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
          <div style={{ ...TYPE_SCALE.caption, color: palette.tx2, fontWeight: 800 }}>Lender</div>
          <Select value={lenderFilter} onChange={(event) => setLenderFilter(event.target.value)}>
            <option value="all">All lenders</option>
            {lenderOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </div>

        <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
          <div style={{ ...TYPE_SCALE.caption, color: palette.tx2, fontWeight: 800 }}>Balance</div>
          <Select value={balanceFilter} onChange={(event) => setBalanceFilter(event.target.value)}>
            {BALANCE_RANGE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </div>

        <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
          <div style={{ ...TYPE_SCALE.caption, color: palette.tx2, fontWeight: 800 }}>Due date</div>
          <Select value={dueTimingFilter} onChange={(event) => setDueTimingFilter(event.target.value)}>
            {DUE_TIMING_FILTER_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </div>

        <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
          <div style={{ ...TYPE_SCALE.caption, color: palette.tx2, fontWeight: 800 }}>Sort</div>
          <Select value={sort} onChange={(event) => setSort(event.target.value)}>
            {DEBT_EXPLORER_SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ ...TYPE_SCALE.caption, color: palette.tx2 }}>
          Showing {resultsCount} debt{resultsCount === 1 ? "" : "s"} in this view.
        </div>
        {hasActiveFilters ? <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button> : null}
      </div>
    </Card>
  );
}

export default function DebtsCenter({ snapshot, service, refresh, refreshReview, runAction, writeState, reviewSnapshot, onGoToReview, initialAction, onInitialActionHandled }) {
  const [destination, setDestination] = useState(() => resolveDebtsDestination(typeof window !== "undefined" ? window.location.pathname : "/debts"));
  const [ownerFilter, setOwnerFilter] = useState("all");
  const initialActionKey = typeof initialAction === "string" ? initialAction : initialAction?.action || null;
  const initialActionDebtId = initialAction && typeof initialAction === "object" ? initialAction.debtId : null;
  const [addDebtOpen, setAddDebtOpen] = useState(() => initialActionKey === "add-debt");
  const [addDebtPrefillName, setAddDebtPrefillName] = useState("");
  const [importOpen, setImportOpen] = useState(() => initialActionKey === "import-statement");
  const [reviewDebtId, setReviewDebtId] = useState(() => (
    initialActionDebtId && (initialActionKey === "record-payment" || initialActionKey === "update-balance") ? initialActionDebtId : null
  ));
  const [reviewSection, setReviewSection] = useState(() => (
    initialActionKey === "record-payment" ? "payment" : initialActionKey === "update-balance" ? "balance" : "details"
  ));
  const [initialQuickUpdateMode] = useState(() => (
    !initialActionDebtId && initialActionKey === "record-payment" ? "payment"
      : !initialActionDebtId && initialActionKey === "update-balance" ? "balance"
      : null
  ));
  const [statusFilter, setStatusFilter] = useState("all");
  const [lenderFilter, setLenderFilter] = useState("all");
  const [balanceFilter, setBalanceFilter] = useState("all");
  const [dueTimingFilter, setDueTimingFilter] = useState("all");
  const [sort, setSort] = useState("payoff_order");
  const [selectedDebtId, setSelectedDebtId] = useState(null);
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

  const people = snapshot.people || [];
  const canManage = snapshot.permissions.manageDebts && snapshot.mode !== "legacy_preview";
  const canObserve = snapshot.permissions.recordObservations && snapshot.mode !== "legacy_preview";
  const portfolio = deriveDebtPortfolioView(snapshot);
  const palette = ttzPalette;

  const rail = (
    <QuickUpdateRail snapshot={snapshot} service={service} refresh={refresh} runAction={runAction} writeState={writeState} canObserve={canObserve} initialMode={initialQuickUpdateMode} />
  );

  const openReviewDrawer = (debt, section) => {
    setReviewSection(section);
    setReviewDebtId(debt.id);
  };

  const lenderOptions = useMemo(() => {
    const scoped = filterDebtsByOwnerScope([...portfolio.activeDebts, ...portfolio.reviewDebts], ownerFilter);
    return groupDebtsByLender(scoped)
      .filter((group) => !group.ungrouped)
      .map((group) => [group.lenderId, group.canonicalName]);
  }, [portfolio.activeDebts, portfolio.reviewDebts, ownerFilter]);

  const sortedPortfolioDebts = useMemo(() => {
    const scoped = filterDebtsByOwnerScope([...portfolio.activeDebts, ...portfolio.reviewDebts, ...portfolio.paidOffDebts], ownerFilter);
    const reviewIds = new Set(portfolio.reviewDebts.map((debt) => debt.id));
    const paidOffIds = new Set(portfolio.paidOffDebts.map((debt) => debt.id));
    const filtered = applyDebtExplorerFilters(scoped, {
      statusFilter,
      lenderFilter,
      balanceFilter,
      dueTimingFilter,
      reviewIds,
      paidOffIds,
      latestSnapshotsByDebt: snapshot.latestSnapshotsByDebt,
      paymentEventsByDebt: snapshot.paymentEventsByDebt,
    });
    const payoffOrderIndex = new Map((snapshot.activePlanProjection?.payoffOrder || []).map((row, index) => [row.debtId || row.id, index]));
    return sortDebtExplorerDebts(filtered, sort, {
      payoffOrderIndex,
      latestSnapshotsByDebt: snapshot.latestSnapshotsByDebt,
      paymentEventsByDebt: snapshot.paymentEventsByDebt,
    });
  }, [
    portfolio.activeDebts,
    portfolio.reviewDebts,
    portfolio.paidOffDebts,
    ownerFilter,
    statusFilter,
    lenderFilter,
    balanceFilter,
    dueTimingFilter,
    sort,
    snapshot.latestSnapshotsByDebt,
    snapshot.paymentEventsByDebt,
    snapshot.activePlanProjection?.payoffOrder,
  ]);

  useEffect(() => {
    if (!sortedPortfolioDebts.length) {
      setSelectedDebtId(null);
      return;
    }
    if (!selectedDebtId || !sortedPortfolioDebts.some((debt) => debt.id === selectedDebtId)) {
      setSelectedDebtId(sortedPortfolioDebts[0].id);
    }
  }, [sortedPortfolioDebts, selectedDebtId]);

  const selectedDebt = sortedPortfolioDebts.find((debt) => debt.id === selectedDebtId) || sortedPortfolioDebts[0] || null;

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
      <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "minmax(0, 1fr) 326px", gap: "20px", alignItems: "start" }}>
        <div style={{ display: "grid", gap: "var(--ttz-space-5, 24px)" }}>
          <CategoryGrid portfolio={portfolio} ownerFilter={ownerFilter} latestSnapshotsByDebt={snapshot.latestSnapshotsByDebt} onSelectCategory={navigate} />
          <RootFilterBar
            palette={palette}
            snapshot={snapshot}
            ownerFilter={ownerFilter}
            setOwnerFilter={setOwnerFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            lenderFilter={lenderFilter}
            setLenderFilter={setLenderFilter}
            balanceFilter={balanceFilter}
            setBalanceFilter={setBalanceFilter}
            dueTimingFilter={dueTimingFilter}
            setDueTimingFilter={setDueTimingFilter}
            sort={sort}
            setSort={setSort}
            lenderOptions={lenderOptions}
            resultsCount={sortedPortfolioDebts.length}
          />
          <TopLendersCard
            debts={sortedPortfolioDebts}
            onGoToDebts={() => navigate("all")}
            onSelectDebt={(debt) => setSelectedDebtId(debt.id)}
          />
        </div>
        {!isTablet ? (
          <RootPaymentPanel
            debt={selectedDebt}
            snapshot={snapshot}
            runAction={runAction}
            service={service}
            refresh={refresh}
            writeState={writeState}
            canObserve={canObserve}
          />
        ) : null}
      </div>
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
      onReviewDebt={(debt) => openReviewDrawer(debt, "details")}
      onRecordPayment={canObserve ? (debt) => openReviewDrawer(debt, "payment") : undefined}
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
      <div style={{ marginTop: "var(--ttz-space-5, 24px)" }}>{rail}</div>
      <div style={{ marginTop: "var(--ttz-space-5, 24px)" }}>{mainContent}</div>
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
        key={`${reviewDebt?.id || "none"}-${reviewSection}`}
        open={!!reviewDebt}
        debt={reviewDebt}
        initialSection={reviewSection}
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
