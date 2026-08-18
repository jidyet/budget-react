# TrackToZero — Controlled Beta Tester Guide

Welcome to TrackToZero's first controlled beta. This is a small, closely-supported test — you were invited by email, and access only works for the exact email address you were invited on.

## 1. Getting in

1. You'll receive an invitation with a URL: `https://tracktozero-beta.web.app`.
2. Sign up with the **exact email address** the invite was sent to. A different email — even a typo, even a different address you personally own — will not work; this is an intentional security boundary, not a bug.
3. If you see **"This beta is invite-only"** after signing in, it means that email hasn't been approved yet. Don't try another email — reply to whoever invited you instead.

## 2. What this beta is

- A real, working payoff-tracking product, running on its own dedicated environment — completely separate from any other TrackToZero deployment. Nothing you do here reaches production or any other person's data.
- Not a finished product. Some rough edges are expected — that's what this phase is for.

## 3. What to test

- Add a few debts (manually or by importing a real or made-up statement).
- Set a due date on at least one debt and watch Home's **Upcoming Payments** section.
- Build a payoff plan (Snowball or Avalanche) and record a payment against it.
- If you're testing as a household: invite a second person (with their exact email) and confirm they can join.
- Try it on your phone and on a laptop/desktop.

## 4. Your data in this beta

- Treat this environment as **disposable**. It may be reset or wiped between test rounds without notice.
- **Use synthetic or low-sensitivity data where you can.** If you do enter real balances/APRs to make the test realistic, that's fine — but don't use anything you wouldn't be comfortable seeing in a shared test log.
- This beta environment is fully isolated from TrackToZero's production Firebase project (separate project, separate database, separate login). Nothing here can leak into or overwrite anyone's real production data.

## 5. Giving feedback

Send feedback directly to whoever invited you (email or the channel they set up for this cohort). To keep this safe for everyone, please **do**:

- Describe what you did, what you expected, and what happened instead.
- Include a screenshot of the *screen*, not of raw account details.
- Note the rough time it happened (so it's easier to correlate with logs).

Please **do not** send, screenshot, or paste:

- Full account numbers, routing numbers, or statement images/PDFs.
- Your invite link/token (it's single-use and tied to your email — sharing it doesn't help and could let someone else claim it).
- Another tester's data, even if you saw it by accident (see Section 7 — that's exactly the kind of thing to report instead).

## 6. If something feels seriously wrong

Stop what you're doing and contact whoever invited you **immediately** if you see:

- Another person's debts, balances, or household data on your screen.
- The app letting you into a workspace you shouldn't have access to.
- Any request for a real password, card number, or bank login *inside* TrackToZero (TrackToZero never asks for these).

This isn't about assigning blame — an early, honest report is exactly what a controlled beta is for.

## 7. Known limitations right now

- No password-reset email flow has been tested in this environment yet — if you get locked out, contact whoever invited you rather than trying to self-recover.
- The app doesn't yet distinguish "you missed a payment" from "you paid it outside the app and haven't recorded it here" — a passed due date always says **"confirm payment"**, never **"missed"** or **"overdue"**, on purpose. If a debt still shows as unconfirmed after you've recorded a payment for it, that's worth reporting.
- Feature areas outside debt payoff (budgeting, bills/subscriptions) are a separate, unrelated part of the app and are not part of this beta's focus.

Thank you for helping test this before it opens more broadly.
