import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../firebase";

export const requestAICoachSummary = async (payload) => {
  if (!functions) {
    throw new Error("TrackToZero Guide is unavailable because Firebase is not configured.");
  }
  if (!auth?.currentUser) {
    throw new Error("Sign in to use TrackToZero Guide.");
  }
  const callable = httpsCallable(functions, "aiCoachSummary");
  const result = await callable(payload);
  const coach = result?.data?.coach;
  if (!coach) {
    throw new Error("TrackToZero Guide returned an empty response.");
  }
  return coach;
};
