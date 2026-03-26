/**
 * Example Stripe webhook handler.
 *
 * This is a reference file for the Budget app billing flow.
 * Replace placeholder values with your own Stripe secret, Firebase Admin init,
 * and deployment wrapper before using it in production.
 */

const express = require("express");
const Stripe = require("stripe");
const admin = require("firebase-admin");

const app = express();

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-02-24.acacia",
});

app.post(
  "/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET || ""
      );
    } catch (error) {
      console.error("stripe webhook signature error", error.message);
      return res.status(400).send(`Webhook Error: ${error.message}`);
    }

    try {
      switch (event.type) {
        case "checkout.session.completed":
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const subscription = event.data.object;
          const uid = subscription.metadata?.uid || subscription.client_reference_id;
          if (!uid) break;

          const price = subscription.items?.data?.[0]?.price;
          const interval = price?.recurring?.interval || "month";
          const status = String(subscription.status || "free").toLowerCase();
          const premium = ["active", "trialing", "past_due"].includes(status);

          await db.collection("users").doc(uid).set(
            {
              subscription: {
                planId: premium ? "premium" : "free",
                status,
                interval,
                stripeCustomerId: subscription.customer || "",
                stripeSubscriptionId: subscription.id || "",
                cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
                currentPeriodEnd: subscription.current_period_end
                  ? admin.firestore.Timestamp.fromMillis(subscription.current_period_end * 1000)
                  : null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
            },
            { merge: true }
          );
          break;
        }
        default:
          break;
      }

      return res.json({ received: true });
    } catch (error) {
      console.error("stripe webhook handler error", error);
      return res.status(500).json({ error: "Webhook handling failed" });
    }
  }
);

module.exports = app;
