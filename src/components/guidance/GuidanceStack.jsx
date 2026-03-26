import ProgressScoreCard from "./ProgressScoreCard";
import HeadsUpList from "./HeadsUpList";
import NextMoveCard from "./NextMoveCard";
import ProgressNoteCard from "./ProgressNoteCard";

export default function GuidanceStack({ palette, isMobile, score, headsUps, nextMove, notes = [] }) {
  return (
    <div style={{ display:"grid", gap:12, marginBottom:16 }}>
      <div style={{ display:"grid", gridTemplateColumns:isMobile ? "1fr" : ".9fr 1.1fr", gap:12 }}>
        <ProgressScoreCard palette={palette} score={score} />
        <HeadsUpList palette={palette} items={headsUps} />
      </div>
      <div style={{ display:"grid", gridTemplateColumns:isMobile ? "1fr" : "1.05fr .95fr", gap:12 }}>
        <NextMoveCard palette={palette} move={nextMove} />
        <div style={{ display:"grid", gap:12 }}>
          {notes.map((note) => <ProgressNoteCard key={note.id} palette={palette} note={note} />)}
        </div>
      </div>
    </div>
  );
}
