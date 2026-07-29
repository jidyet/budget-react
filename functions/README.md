# Stripe webhook

`exports.stripeWebhook` in [index.js](index.js) is the server-authoritative
entitlement writer. It verifies the Stripe signature on incoming events and,
for `customer.subscription.created` / `.updated` / `.deleted`, writes
`users/{uid}.subscription` in Firestore via the Admin SDK (which bypasses
security rules). `firestore.rules` blocks clients from writing that field
directly, so this function is the only path that can grant premium.

Before this can go live:

- set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` on the deployed
  function's environment (Firebase Functions config/secrets — not committed
  to this repo)
- deploy the function (`firebase deploy --only functions:stripeWebhook`)
- register the deployed function's URL as a webhook endpoint in the Stripe
  Dashboard, subscribed to `customer.subscription.created/updated/deleted`
- test subscription create, update, cancel, and renewal flows against a
  Stripe test-mode account before enabling live keys
