/**
 * Analytics hook stub.
 *
 * Wire up a real analytics provider here (e.g. PostHog, Mixpanel, or Firebase Analytics)
 * without changing call-sites in the app. All functions are no-ops until implemented.
 */

export default function useAnalytics({ page } = {}) {
  // TODO: initialize analytics provider on mount

  /**
   * Track a named event with optional properties.
   * @param {string} event
   * @param {object} [props]
   */
  const track = (event, props) => {
    // TODO: analyticsClient.track(event, { userId: user?.uid, page, ...props });
    if (import.meta.env.DEV) {
      console.debug("[analytics]", event, props ?? {});
    }
  };

  /**
   * Identify the current user.
   * Called once after sign-in to associate subsequent events.
   */
  const identify = () => {
    // TODO: analyticsClient.identify(currentUserId, { email: currentUserEmail });
  };

  /**
   * Track a page view.
   * @param {string} [pageName]
   */
  const trackPage = (pageName) => {
    track("page_view", { page: pageName ?? page });
  };

  return { track, identify, trackPage };
}
