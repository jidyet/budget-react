export default function OverviewPage({ showDueSoon, dueNextSectionRef, dashboard, dueNext }) {
  return (
    <>
      {dashboard}
      {showDueSoon && <div ref={dueNextSectionRef}>{dueNext}</div>}
    </>
  );
}
