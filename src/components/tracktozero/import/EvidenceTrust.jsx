import React from "react";
import { TYPE_SCALE, ttzPalette } from "../theme.js";

// UX-6.1: surfaces DATA-2's per-field source provenance
// ({value, matchedLabel, matchedText, score} - statementTextExtraction.js's
// extractLabeled*WithProvenance) as a concise trust label - "the user should
// feel 'I can see why TrackToZero picked this number,' not 'AI guessed
// this.'" Ships for balance/minimumPayment first (every PDF/image candidate
// has these); renders nothing for a field with no provenance rather than
// fabricating one (spreadsheet-sourced candidates don't carry this shape).
export default function EvidenceTrust({ provenance }) {
  if (!provenance?.matchedLabel) return null;
  const palette = ttzPalette;
  return (
    <div style={{ ...TYPE_SCALE.caption, color: palette.tx2, marginTop: 4 }}>
      Found next to &quot;{provenance.matchedLabel}&quot;
    </div>
  );
}
