import { useCallback } from "react";
import { submitFeedback } from "../services/feedbackService";

export default function useAppFeedback({
  user,
  isLocalUser,
  firebaseStatus,
  page,
  showToast,
  setFeedbackError,
  setFeedbackValues,
  setFeedbackOpen,
  feedbackSending,
  setFeedbackSending,
  feedbackValues,
  userProfile,
  workspaceMode,
  setFounderOpsTick,
  confirmState,
  setConfirmState,
  undoTimerRef,
  setUndoStack,
}) {
  const showUndoToast = useCallback((label, restoreFn) => {
    clearTimeout(undoTimerRef.current);
    setUndoStack({ label, restore: restoreFn });
    undoTimerRef.current = setTimeout(() => setUndoStack(null), 5000);
  }, [setUndoStack, undoTimerRef]);

  const closeConfirm = useCallback((confirmed) => {
    if (confirmState?.resolve) confirmState.resolve(confirmed);
    setConfirmState(null);
  }, [confirmState, setConfirmState]);

  const openFeedback = useCallback((pageName = page) => {
    if (!user || user.isLocal || isLocalUser) {
      showToast("Sign in to send feedback", "error");
      return;
    }
    if (!firebaseStatus.configured) {
      showToast("Feedback is coming soon in this build");
      return;
    }
    setFeedbackError("");
    setFeedbackValues({
      page: String(pageName || page || "overview"),
      category: "confusing",
      rating: null,
      message: "",
      whatConfused: "",
      whatHelped: "",
      whatShouldChange: "",
    });
    setFeedbackOpen(true);
  }, [firebaseStatus.configured, isLocalUser, page, setFeedbackError, setFeedbackOpen, setFeedbackValues, showToast, user]);

  const closeFeedback = useCallback(() => {
    if (feedbackSending) return;
    setFeedbackOpen(false);
    setFeedbackError("");
  }, [feedbackSending, setFeedbackError, setFeedbackOpen]);

  const patchFeedback = useCallback((field, value) => {
    setFeedbackValues((current) => ({ ...current, [field]: value }));
  }, [setFeedbackValues]);

  const sendFeedback = useCallback(async () => {
    if (feedbackSending) return;
    setFeedbackError("");
    setFeedbackSending(true);
    try {
      await submitFeedback({
        user,
        userProfile,
        page: feedbackValues.page,
        category: feedbackValues.category,
        rating: feedbackValues.rating,
        message: feedbackValues.message,
        whatConfused: feedbackValues.whatConfused,
        whatHelped: feedbackValues.whatHelped,
        whatShouldChange: feedbackValues.whatShouldChange,
        workspaceMode,
      });
      setFeedbackOpen(false);
      setFounderOpsTick((value) => value + 1);
      showToast("Thanks. Feedback sent.");
    } catch (error) {
      console.error("sendFeedback error", error);
      setFeedbackError(error?.message || "Could not send feedback right now.");
    } finally {
      setFeedbackSending(false);
    }
  }, [
    feedbackSending,
    feedbackValues,
    setFeedbackError,
    setFeedbackOpen,
    setFeedbackSending,
    setFounderOpsTick,
    showToast,
    user,
    userProfile,
    workspaceMode,
  ]);

  const copyToClipboard = useCallback(async (value, successLabel = "Copied") => {
    const text = String(value || "").trim();
    if (!text) {
      showToast("Nothing to copy", "error");
      return false;
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const input = document.createElement("textarea");
        input.value = text;
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.focus();
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      showToast(successLabel);
      return true;
    } catch (error) {
      console.error("copyToClipboard error", error);
      showToast("Could not copy right now", "error");
      return false;
    }
  }, [showToast]);

  return {
    showUndoToast,
    closeConfirm,
    openFeedback,
    closeFeedback,
    patchFeedback,
    sendFeedback,
    copyToClipboard,
  };
}
