# Security Test Checklist

Use this checklist before launch changes go live.

## Auth

- Signed-out user cannot read protected app data.
- Signed-out user cannot create or update any `users/{uid}` data.
- Signed-out user cannot search or join households.

## Personal Data

- User A cannot read User B profile data.
- User A cannot write User B `meta/app` settings.
- User A cannot write User B monthly records, uploads, or payoff plans.

## Household Access

- Non-member cannot read `households/{householdId}`.
- Non-member cannot read household members, uploads, dashboard, or payoff plans.
- Non-member cannot update `householdDirectory/{householdId}` metadata.

## Open Join

- Signed-in user can join an open household once.
- Open join only increments `memberCount` by one.
- Open join cannot change owner, join code, household name, or join mode.

## Approval Join

- Signed-in user can create only their own pending join request.
- User cannot approve or reject their own request unless they are an admin of that household.
- Admin can approve or reject pending requests.
- Approval does not allow role escalation.

## Member Safety

- Member cannot change their own `role`.
- Member cannot change their own `status`.
- Member can update only their display name, avatar color, and photo link.
- Non-admin cannot create arbitrary member docs.

## Owner/Admin Actions

- Only owner/admin can update household-level settings.
- Only owner/admin can delete member docs.
- Only owner/admin can approve or reject join requests.

## Invalid Write Protection

- Invalid `joinMode` is rejected.
- Invalid `role` is rejected.
- Invalid `status` is rejected.
- Missing required household fields are rejected on create.
- Household owner fields cannot be changed after create.

## Billing And Subscription

- Client build contains only publishable Stripe values.
- No Stripe secret key is present in frontend code or committed env examples.
- Webhook updates are handled server-side only.
