export default function OverviewPage({ showDueSoon, dueNextSectionRef, renderDashboard, renderDueNext }) {
  return (
    <>
      {renderDashboard()}
      {showDueSoon && <div ref={dueNextSectionRef}>{renderDueNext()}</div>}
    </>
  );
}
