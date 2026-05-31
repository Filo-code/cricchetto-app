# Platform Owner System

## Overview

The platform owner is the global authority in the system. All access control logic assumes the owner can override anything. The owner is identified via environment variables — never via a database row — to prevent privilege escalation via SQL injection or user manipulation.

---

## Identity Model

| Role | Where stored | How identified |
|------|-------------|----------------|
| Platform owner | `Cricchetto_PLATFORM_OWNER_EMAILS` env var | `session.sub === "env"` AND email in allowlist |
| Workshop owner | `workshop_users.role = "owner"` | Workshop-scoped admin |
| Workshop staff | `workshop_users.role = "staff"` | Workshop-scoped user |

Platform owner sessions have `sub = "env"`. DB `workshop_users` rows are never platform owners, even if their email matches the allowlist.

---

## Access Control — requireWorkshopAccess

Priority order enforced in `lib/subscription.ts` + `lib/dashboard/session.ts`:

1. **Platform owner** (`isPlatformSession(session)`) → bypass, no DB check
2. **`admin_free_access = true`** → `checkAndUpdateSubscriptionStatus` returns `"active"`
3. **`subscription_status = "active"`** → allow
4. **Trial valid** (`now <= trial_ends_at`) → allow as `"trial_active"`
5. **`subscription_status = "past_due"`** → allow (Stripe retrying payment)
6. **`subscription_status = "blocked"`** → deny with 402

The session guard in `lib/dashboard/session.ts` calls `requireWorkshopAccess` only when `!isPlatformSession(session)`, so the owner never hits the subscription check.

---

## Platform Owner Impersonation

### Purpose

The platform owner can view the dashboard as if they were a user of any workshop. Used for debugging, support, and QA. Never exposed to normal users.

### Session Design

Impersonation does **not** overwrite the owner's identity. Instead, two fields are added to the session payload:

```typescript
interface DashboardSessionPayload {
  // ...existing fields unchanged...
  impersonatingWorkshopId?: string; // target workshop (platform owner only)
  impersonatedBy?: string;          // platform owner email
}
```

`workshopId` stays as the owner's original workshop. `getEffectiveWorkshopId(session)` returns `impersonatingWorkshopId ?? workshopId` and is the single point of truth for all data queries.

### Data Flow

```
Platform owner → clicks "Impersona" on workshop X
  → startImpersonation(workshopId=X, actorSession)
  → writes session cookie: { ...ownerSession, impersonatingWorkshopId: X, impersonatedBy: ownerEmail }
  → redirect /dashboard
  → readDashboardWorkshop() uses getEffectiveWorkshopId() → queries workshop X
  → dashboard shows workshop X data
  → banner shown: "IMPERSONAZIONE · Workshop X · owner@example.com"
  → click "Esci impersonazione"
  → stopImpersonation(session)
  → writes session cookie: { ...ownerSession } (without impersonation fields)
  → redirect /admin/workshops
```

### Security Properties

- Owner identity preserved: `sub`, `email`, `role`, `workshopId` unchanged
- Platform session check (`isPlatformSession`) uses `sub === "env"` — not affected by impersonation
- Subscription bypass still applies: owner never blocked by workshop X's subscription
- Session is HMAC-signed — tampering invalidates it

### Audit Requirements

All impersonation events are logged to `platform_audit_events`:

| Event | When |
|-------|------|
| `workshop.impersonate` | Owner starts impersonating a workshop |
| `workshop.impersonation_end` | Owner exits impersonation |

Both include `targetWorkshopId` and `actorEmail`.

---

## Subscription Lifecycle

```
[New workshop]
      ↓
trial_active (7 days)
      ↓
  trial ends
      ↓ payment_confirmed=false       ↓ payment_confirmed=true
  blocked                           active
                                      ↓ invoice.payment_failed
                                   past_due   ← Stripe retrying
                                      ↓ invoice.paid
                                   active (recovered)
                                      ↓ subscription.updated (canceled/unpaid)
                                        subscription.deleted
                                   blocked
```

States:
- `trial_active` — within trial window, no payment needed
- `trial_expired` — trial ended (intermediate, updated to blocked/active)
- `active` — subscription confirmed
- `past_due` — payment failed, Stripe retrying; access retained
- `blocked` — subscription ended or never paid; access denied (402)

Admin overrides:
- `admin_free_access = true` → always returns `"active"` regardless of status
- Trial reset → resets to `trial_active` with new 7-day window

---

## Stripe Webhook Events

| Event | Action |
|-------|--------|
| `checkout.session.completed` | → `active` (requires `metadata.workshop_id` + `metadata.plan_type`) |
| `invoice.paid` | → `active` (payment confirmed / recovered) |
| `invoice.payment_failed` | → `past_due` (Stripe retrying) |
| `customer.subscription.updated` (status=canceled/unpaid) | → `blocked` |
| `customer.subscription.deleted` | → `blocked` |

Signature verification uses `stripe.webhooks.constructEvent` with `Cricchetto_STRIPE_WEBHOOK_SECRET`.

Workshop is resolved from `stripe_customer_id` for all events except `checkout.session.completed` (which uses `metadata.workshop_id`).

---

## Audit Log

All platform owner actions are logged to `platform_audit_events`:

| Event type | Trigger |
|-----------|---------|
| `workshop.create` | New workshop provisioned |
| `workshop.update` | Workshop metadata edited |
| `workshop.suspend` | Workshop suspended |
| `workshop.close` | Workshop closed |
| `workshop.reactivate` | Workshop reactivated |
| `workshop.free_access_enabled` | `admin_free_access` set to true |
| `workshop.free_access_disabled` | `admin_free_access` set to false |
| `workshop.impersonate` | Owner starts impersonation |
| `workshop.impersonation_end` | Owner exits impersonation |
| `workshop.trial_reset` | Trial period reset to 7 days |
| `user.reset_link` | Password reset link generated |
| `demo.reset` | Demo workshop data cleared |
| `demo.populate` | Demo workshop data populated |

Fields: `event_type`, `actor_email`, `target_workshop_id`, `target_user_id`, `details`, `created_at`.
Writes are best-effort (never throw) to avoid blocking the action they record.
