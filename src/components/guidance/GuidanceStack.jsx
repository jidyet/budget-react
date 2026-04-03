import ProgressScoreCard from "./ProgressScoreCard";
import HeadsUpList from "./HeadsUpList";
import NextMoveCard from "./NextMoveCard";
import ProgressNoteCard from "./ProgressNoteCard";

export default function GuidanceStack({ palette, isMobile, score, headsUps, nextMove, notes = [] }) {
  return (
    <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
      {/* Row 1: NextMove dominant + ProgressScore support */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.25fr 0.75fr", gap: 10 }}>
        <NextMoveCard palette={palette} move={nextMove} />
        <ProgressScoreCard palette={palette} score={score} />
      </div>

      {/* Row 2: HeadsUp as compact chip strip — no full card */}
      {headsUps.length > 0 && (
        <HeadsUpList palette={palette} items={headsUps} />
      )}

      {/* Row 3: One strongest progress note */}
      {notes.length > 0 && (
        <ProgressNoteCard palette={palette} note={notes[0]} />
      )}
    </div>
  );
}
