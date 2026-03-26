# Stripe webhook example

This folder holds a reference webhook for the billing layer.

Use [stripeWebhook.example.js](D:\My Projects\budget-react\functions\stripeWebhook.example.js) as a starting point for your deployed webhook or Firebase Function. It updates `users/{uid}.subscription` in Firestore so the app can switch between the free and premium plan cleanly.

Before using it in production:

- add your real Stripe secret key
- add your Stripe webhook secret
- initialize Firebase Admin with your project credentials
- wrap the Express app in your deployment target
- test subscription create, update, cancel, and renewal flows
