import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { APP_BUILD, APP_VERSION } from "../config/appMeta";
import { recordFeedbackSent } from "./founderOpsService";

export const FEEDBACK_CATEGORIES = [
  { value: "confusing", label: "Confusing" },
  { value: "bug", label: "Bug" },
  { value: "helpful", label: "Helpful" },
  { value: "idea", label: "Idea" },
  { value: "other", label: "Other" },
];

const trimText = (value, max = 1200) => String(value || "").trim().slice(0, max);

export async function submitFeedback({
  user,
  userProfile,
  page = "overview",
  category = "confusing",
  rating = null,
  message = "",
  whatConfused = "",
  whatHelped = "",
  whatShouldChange = "",
  workspaceMode = "solo",
} = {}) {
  if (!db) throw new Error("Feedback is not ready right now.");
  if (!user?.uid || user?.isLocal) throw new Error("Sign in to send feedback.");

  const body = trimText(message, 1400);
  if (!body) throw new Error("Add a short note first.");

  const feedback = {
    userId: String(user.uid),
    userEmail: String(user.email || ""),
    userLabel: String(userProfile?.displayName || user.email || "Member").slice(0, 120),
    page: String(page || "overview").slice(0, 80),
    category: FEEDBACK_CATEGORIES.some((item) => item.value === category) ? category : "other",
    rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
    message: body,
    whatConfused: trimText(whatConfused, 400),
    whatHelped: trimText(whatHelped, 400),
    whatShouldChange: trimText(whatShouldChange, 400),
    workspaceMode: workspaceMode === "household" ? "household" : "solo",
    version: APP_VERSION,
    build: APP_BUILD,
    status: "new",
    createdAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, "feedback"), feedback);
  recordFeedbackSent();
  return ref.id;
}
