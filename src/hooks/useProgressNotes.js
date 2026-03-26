import { useMemo } from "react";
import { buildProgressNotes } from "../services/progressNoteService";

export default function useProgressNotes(input) {
  return useMemo(() => buildProgressNotes(input), [input]);
}

