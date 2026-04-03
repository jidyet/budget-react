import EditPanel from "../EditPanel";

/**
 * EditPanelModal — backdrop + bottom-sheet/modal wrapper for EditPanel.
 * Handles both monthly record quick-edit and bill-definition overrides
 * (category, due_day, promo APR, promo end, APR after promo).
 *
 * APR atomicity: all changes are batched into a single Firestore transaction
 * (or two synchronous localStorage writes for local users) via settingsData
 * passed to updateRecord.
 */
export default function EditPanelModal({
  c,
  isMobile,
  safeBottom,
  editId,
  allAccts,
  theme,
  updateRecord,
  buildAutoBalanceUpdates,
  accountOverrides,
  setAccountOverrides,
  customAccounts,
  userCategories,
  setUserCategories,
  allCategories,
  incomeTemplates,
  deletedAccountIds,
  showToast,
  onClose,
}) {
  if (!editId) return null;
  const acct = allAccts.find((ac) => ac.id === editId);
  if (!acct) return null;

  return (
    <>
      <div
        onClick={onClose}
        style={{ position:"fixed", inset:0, zIndex:170, background:"rgba(0,0,0,0.4)", transform:"translateZ(0)" }}
      />
      <div style={isMobile
        ? { position:"fixed", bottom:0, left:0, right:0, zIndex:171, background:c.surf, borderRadius:"18px 18px 0 0", padding:`20px 20px calc(${safeBottom} + 32px)`, maxHeight:"80vh", overflowY:"auto", transform:"translateZ(0)" }
        : { position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%) translateZ(0)", zIndex:171, background:c.surf, borderRadius:16, padding:"24px 28px", width:560, maxHeight:"88vh", overflowY:"auto", boxShadow:"0 8px 48px rgba(0,0,0,0.28)" }
      }>
        {isMobile && (
          <div style={{ width:36, height:4, borderRadius:2, background:c.border2, margin:"0 auto 16px" }}/>
        )}
        <EditPanel
          key={acct.id}
          a={acct}
          theme={theme}
          allCategories={allCategories}
          onSave={async (vals) => {
            const aprDecimal = (parseFloat(vals.apr_pct) || 0) / 100;
            const promoAprDecimal = (parseFloat(vals.promo_apr_pct) || 0) / 100;
            const aprAfterPromoDecimal = (parseFloat(vals.apr_after_promo_pct) || 0) / 100;
            const category = String(vals.category || "").trim().toUpperCase();
            const dueDay = Math.max(0, Math.min(31, parseInt(vals.due_day) || 0));

            const nextOverrides = {
              ...accountOverrides,
              [acct.id]: {
                ...(accountOverrides[acct.id] || {}),
                apr: aprDecimal,
                promo_apr: promoAprDecimal,
                promo_until: vals.promo_until || null,
                apr_after_promo: aprAfterPromoDecimal,
                ...(category ? { category } : {}),
                ...(dueDay > 0 ? { due_day: dueDay } : {}),
                ...(vals.interest_type ? { interest_type: vals.interest_type } : {}),
              },
            };

            // Add new category to userCategories if needed
            const nextUserCategories =
              category && !(allCategories || []).includes(category)
                ? [...(userCategories || []), category]
                : userCategories;
            if (nextUserCategories !== userCategories) {
              setUserCategories?.(nextUserCategories);
            }

            const settingsData = {
              customAccounts,
              userCategories: nextUserCategories,
              incomeTemplates,
              deletedAccountIds,
              accountOverrides: nextOverrides,
            };
            await updateRecord(
              acct.id,
              buildAutoBalanceUpdates(acct, {
                planned_v: parseFloat(vals.planned_v) || 0,
                paid_v: parseFloat(vals.paid_v) || 0,
                min_due_v: parseFloat(vals.min_due_v) || 0,
                cur_bal: parseFloat(vals.cur_bal) || 0,
                purch_v: parseFloat(vals.purch_v) || 0,
                interest_paid_v: parseFloat(vals.interest_paid_v) || 0,
                apr_pct: parseFloat(vals.apr_pct) || 0,
              }),
              settingsData,
            );
            setAccountOverrides(nextOverrides);
            onClose();
            showToast(`Saved: ${acct.name}`);
          }}
          onClose={onClose}
        />
      </div>
    </>
  );
}
