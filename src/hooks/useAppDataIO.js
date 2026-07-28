import { useCallback } from "react";
import { saveUpload } from "../firebase";
import { MONTHS } from "../data/mockAccounts";
import { getBillDisplayStatus } from "../services/billModel";
import { getStatusLabel } from "../utils/guidanceRules";
import { canUseFeature } from "../utils/planLimits";

export default function useAppDataIO({
  user,
  isLocalUser,
  subscription,
  openBillingPage,
  showToast,
  askConfirm,
  founderAccount = false,
  allAccts,
  selMonth,
  selYear,
  boaPayPeriods,
  eagleviewPayPeriods,
  income,
  monthKey,
  localData,
  workspaceScope,
}) {
  const exportAllData = useCallback(async () => {
    if (!user) {
      showToast("Sign in first to export", "error");
      return;
    }
    // Admins (founderAccount) always have full export access regardless of plan
    if (!founderAccount && !canUseFeature(subscription, "export")) {
      const goToBilling = await askConfirm({
        title: "Export is a premium feature",
        message: "Download a full CSV of your accounts, balances, and income for the selected month. Upgrade to TrackToZero Premium to unlock this and other features.",
        confirmLabel: "See upgrade options",
        cancelLabel: "Not now",
        tone: "neutral",
      });
      if (goToBilling) openBillingPage();
      return;
    }

    const esc = (value) => {
      const stringValue = String(value ?? "");
      return stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")
        ? `"${stringValue.replace(/"/g, '""')}"`
        : stringValue;
    };

    const acctHeaders = ["Account", "Owner", "Category", "APR %", "Current Balance", "Min Due", "Amount Paid", "Paid?", "Due Day", "Status"];
    const acctRows = allAccts.map((account) => [
      account.name,
      account.owner || "",
      account.category || "",
      account.apr_v != null ? (account.apr_v * 100).toFixed(2) : "",
      account.cur_bal != null ? account.cur_bal.toFixed(2) : "",
      account.min_due_v != null ? account.min_due_v.toFixed(2) : "",
      account.paid_v != null ? account.paid_v.toFixed(2) : "",
      ["covered", "paid_cycle", "paid_off"].includes(getBillDisplayStatus(account)?.key) ? "Yes" : "No",
      account.due_day || "",
      getStatusLabel(account).replace(/[^\w\s.-]/g, "").trim(),
    ]);

    const incHeaders = ["Source", "Amount", "Type"];
    const incRows = [
      ...boaPayPeriods.map((period) => [period.src, period.amount.toFixed(2), "Paycheck"]),
      ...eagleviewPayPeriods.map((period) => [period.src, period.amount.toFixed(2), "Paycheck"]),
      ...income.map((entry) => [entry.src, entry.amt.toFixed(2), "Other"]),
    ];

    const toCsv = (headers, rows) => [headers, ...rows].map((row) => row.map(esc).join(",")).join("\r\n");
    const newline = "\r\n";
    const csv =
      `Budget Export - ${MONTHS[selMonth - 1]} ${selYear}${newline}` +
      `Exported,${new Date().toLocaleString()}${newline}${newline}` +
      `ACCOUNTS${newline}` +
      toCsv(acctHeaders, acctRows) + newline + newline +
      `INCOME${newline}` +
      toCsv(incHeaders, incRows);

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `budget-${monthKey}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("Exported as CSV");
  }, [
    allAccts,
    askConfirm,
    boaPayPeriods,
    eagleviewPayPeriods,
    founderAccount,
    income,
    monthKey,
    openBillingPage,
    selMonth,
    selYear,
    showToast,
    subscription,
    user,
  ]);

  const handleUpload = useCallback(async (upload) => {
    if (!user) return;
    const MAX_UPLOAD_ROWS = 500;
    const payload = {
      fileName: String(upload.fileName || "").slice(0, 200),
      type: String(upload.type || "unknown").slice(0, 40),
      rows: Array.isArray(upload.rows) ? upload.rows.slice(0, MAX_UPLOAD_ROWS) : [],
      parsed: upload.parsed || null,
      uploader: user.email || user.uid,
    };
    if (user.isLocal || isLocalUser) {
      localData.saveUpload(user.uid, monthKey, payload);
      showToast("Upload saved locally");
      return;
    }
    try {
      await saveUpload(user.uid, monthKey, payload, workspaceScope);
      showToast("Upload saved");
    } catch (error) {
      console.error("saveUpload error", error);
      showToast("Upload save failed", "error");
    }
  }, [isLocalUser, localData, monthKey, showToast, user, workspaceScope]);

  return {
    exportAllData,
    handleUpload,
  };
}
