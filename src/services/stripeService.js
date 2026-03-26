const env = typeof import.meta !== "undefined" ? (import.meta.env || {}) : {};

const STRIPE_CONFIG = {
  publishableKey: env.VITE_STRIPE_PUBLISHABLE_KEY || "",
  apiUrl: env.VITE_STRIPE_BILLING_API_URL || "",
  checkoutUrl: env.VITE_STRIPE_CHECKOUT_URL || "",
  monthlyCheckoutUrl: env.VITE_STRIPE_CHECKOUT_URL_MONTHLY || "",
  yearlyCheckoutUrl: env.VITE_STRIPE_CHECKOUT_URL_YEARLY || "",
  portalUrl: env.VITE_STRIPE_PORTAL_URL || "",
  monthlyPriceId: env.VITE_STRIPE_PRICE_PREMIUM_MONTHLY || "",
  yearlyPriceId: env.VITE_STRIPE_PRICE_PREMIUM_YEARLY || "",
};

export const getStripeConfig = () => ({ ...STRIPE_CONFIG });

export const isStripeReady = () => Boolean(
  (STRIPE_CONFIG.apiUrl && STRIPE_CONFIG.monthlyPriceId && STRIPE_CONFIG.yearlyPriceId) ||
  STRIPE_CONFIG.checkoutUrl ||
  (STRIPE_CONFIG.monthlyCheckoutUrl && STRIPE_CONFIG.yearlyCheckoutUrl)
);

const redirectTo = (url) => {
  if (!url || typeof window === "undefined") return false;
  window.location.assign(url);
  return true;
};

export const startStripeCheckout = async ({
  uid,
  email,
  interval = "monthly",
  returnUrl,
}) => {
  if (STRIPE_CONFIG.apiUrl) {
    const response = await fetch(`${STRIPE_CONFIG.apiUrl.replace(/\/$/, "")}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid,
        email,
        interval,
        returnUrl,
        priceId: interval === "yearly" ? STRIPE_CONFIG.yearlyPriceId : STRIPE_CONFIG.monthlyPriceId,
      }),
    });
    if (!response.ok) throw new Error("Could not start checkout");
    const data = await response.json();
    if (!redirectTo(data.url)) throw new Error("Missing checkout url");
    return true;
  }

  if (STRIPE_CONFIG.checkoutUrl) {
    const url = new URL(STRIPE_CONFIG.checkoutUrl);
    url.searchParams.set("interval", interval);
    if (uid) url.searchParams.set("uid", uid);
    if (email) url.searchParams.set("email", email);
    if (returnUrl) url.searchParams.set("returnUrl", returnUrl);
    return redirectTo(url.toString());
  }

  const directUrl = interval === "yearly"
    ? STRIPE_CONFIG.yearlyCheckoutUrl
    : STRIPE_CONFIG.monthlyCheckoutUrl;

  if (directUrl) {
    return redirectTo(directUrl);
  }

  throw new Error("Stripe checkout is not configured");
};

export const openBillingPortal = async ({ uid, email, returnUrl }) => {
  if (STRIPE_CONFIG.apiUrl) {
    const response = await fetch(`${STRIPE_CONFIG.apiUrl.replace(/\/$/, "")}/portal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, email, returnUrl }),
    });
    if (!response.ok) throw new Error("Could not open billing");
    const data = await response.json();
    if (!redirectTo(data.url)) throw new Error("Missing portal url");
    return true;
  }

  if (STRIPE_CONFIG.portalUrl) {
    return redirectTo(STRIPE_CONFIG.portalUrl);
  }

  throw new Error("Billing portal is not configured");
};
