export const buildScenarioComparisonRows = (currentRows = [], scenarioRows = []) => {
  const totalRows = Math.max(currentRows.length, scenarioRows.length);
  return Array.from({ length: totalRows }, (_, index) => {
    const currentRow = currentRows[index];
    const newRow = scenarioRows[index];
    return {
      month: currentRow?.month || newRow?.month || `Month ${index + 1}`,
      currentBalance: Number(currentRow?.remaining_debt || 0),
      newBalance: Number(newRow?.remaining_debt || 0),
      currentInterest: Number(currentRow?.total_interest || 0),
      newInterest: Number(newRow?.total_interest || 0),
    };
  });
};

export const sumInterest = (rows = []) =>
  rows.reduce((s, r) => s + (Number(r.total_interest) || 0), 0);

export const calculateWhatIfComparison = ({
  baselineRows = [],
  scenarioRows = [],
}) => {
  const baselineInterest = sumInterest(baselineRows);
  const scenarioInterest = sumInterest(scenarioRows);
  return {
    currentMonths: baselineRows.length,
    scenarioMonths: scenarioRows.length,
    monthsSaved: Math.max(0, baselineRows.length - scenarioRows.length),
    interestSaved: Math.max(0, baselineInterest - scenarioInterest),
    rows: buildScenarioComparisonRows(baselineRows, scenarioRows),
  };
};

