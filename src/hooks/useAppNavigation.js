import { useCallback, useMemo } from "react";
import { fx } from "../utils/budgetUtils";

export default function useAppNavigation({
  page,
  setPage,
  setPageVisible,
  pageTransitionRef,
  setDueBanner,
  setShowDueSoon,
  setDueNextTargetId,
  cmdkQuery,
  allAccts,
  founderOpsVisible,
  founderAccount,
  setCmdkOpen,
}) {
  const navigateTo = useCallback((newPage) => {
    if (newPage === page) return;
    setPageVisible(false);
    clearTimeout(pageTransitionRef.current);
    pageTransitionRef.current = setTimeout(() => {
      setPage(newPage);
      setPageVisible(true);
    }, 100);
  }, [page, pageTransitionRef, setPage, setPageVisible]);

  const openDueNextView = useCallback((accountId = null) => {
    setDueBanner(false);
    setShowDueSoon(true);
    setDueNextTargetId(accountId);
    if (page !== "overview") navigateTo("overview");
  }, [page, navigateTo, setDueBanner, setDueNextTargetId, setShowDueSoon]);

  const cmdkResults = useMemo(() => {
    if (cmdkQuery.trim().length < 1) return [];
    const q = cmdkQuery.toLowerCase();
    const acctMatches = allAccts
      .filter((account) =>
        [account.name, account.bank, account.category, account.owner]
          .some((field) => (field || "").toLowerCase().includes(q))
      )
      .slice(0, 6)
      .map((account) => ({
        type: "account",
        label: account.name,
        sub: `${account.owner} • ${account.category} • ${fx(account.cur_bal)}`,
        id: account.id,
        action: () => {
          navigateTo("bills");
          setCmdkOpen(false);
        },
      }));

    const navPages = [
      { id: "overview", label: "Overview", icon: "◫" },
      { id: "bills", label: "Bills", icon: "▣" },
      { id: "payoff", label: "Payoff Planner", icon: "📈" },
      { id: "insights", label: "Trends", icon: "📊" },
      { id: "beta", label: "Beta help", icon: "🛟" },
      ...(founderOpsVisible ? [{ id: "founder", label: "Founder ops", icon: "🧭" }] : []),
      ...(founderAccount ? [{ id: "admin", label: "Admin", icon: "🛡️" }] : []),
      { id: "privacy", label: "Privacy", icon: "🔒" },
      { id: "support", label: "Help & FAQ", icon: "❓" },
      { id: "billing", label: "Billing", icon: "✦" },
      { id: "notifications", label: "Notifications", icon: "🔔" },
      { id: "upload", label: "Import", icon: "↑" },
      { id: "history", label: "History", icon: "🕐" },
      { id: "settings", label: "Settings", icon: "⚙" },
    ]
      .filter((item) => item.label.toLowerCase().includes(q))
      .map((item) => ({
        type: "page",
        label: item.label,
        sub: "Navigate",
        icon: item.icon,
        action: () => {
          navigateTo(item.id);
          setCmdkOpen(false);
        },
      }));

    return [...navPages, ...acctMatches];
  }, [cmdkQuery, allAccts, founderOpsVisible, founderAccount, navigateTo, setCmdkOpen]);

  return {
    navigateTo,
    openDueNextView,
    cmdkResults,
  };
}
