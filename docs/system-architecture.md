# System Architecture

**Status:** authoritative. Treat as hard constraint for all development and AI-assisted work.

---

## 1. System Overview

Cricchetto is a **multi-tenant mechanic workshop management system** built on Next.js App Router (server-side only logic), Supabase PostgreSQL, and n8n automation workflows.

### Core Features

- **Work order management** — lifecycle from intake through closure and vehicle pickup, across dashboard and inbound messaging channels
- **Inbound command processing** — text commands received via WhatsApp (Twilio/Meta) and Telegram are parsed, validated, and dispatched on the server, never in the browser
- **Guided intake** — multi-step vehicle intake session with deterministic atomic completion via Supabase RPC
- **Attachment handling** — photos and documents received via messaging channels are stored in Supabase Storage and linked to work orders or intake sessions
- **Document generation** — PDF documents (intake acceptance, estimate, final summary) are generated asynchronously by a backend worker triggered by n8n
- **Reminder system** — pickup reminders and revision reminders are scheduled as database rows and dispatched by n8n on a timed interval
- **Revision tracking** — vehicle MOT/revision due dates tracked with reminder cycle management
- **Dashboard** — authenticated browser UI for workshop staff to manage all of the above
- **Subscription/trial enforcement** — per-workshop 7-day free trial; access blocked server-side on expiry if payment not confirmed
- **Platform admin** — platform-owner UI for provisioning and managing workshops

### Main Domains

| Domain | Core table(s) | Entry points |
|---|---|---|
| Work Orders | `work_orders`, `work_order_items`, `work_order_notes`, `work_order_audit_events` | Inbound commands, Dashboard API |
| Intake | `intake_sessions` | NUOVA command, Dashboard create |
| Attachments | `attachments` | Inbound media, Dashboard upload |
| Documents | `documents` | Work order close, estimate generation, n8n worker |
| Reminders | `reminders` | CHIUDI/RITIRATA/REVISIONE commands, n8n scheduler |
| Messaging | `message_logs`, `workshop_channels` | n8n WF-01, webhooks |
| Vehicles | `vehicles`, `vehicle_revision_events` | Intake, revision commands |
| Customers | `customers` | Intake |
| Workshops | `workshops`, `workshop_users`, `workshop_settings` | Platform admin, session auth |

---

## 2. System Does NOT Do

The following are **outside scope** and must not be implemented inside this codebase:

- **Billing or payment processing** — `payment_confirmed` is a boolean flag set manually or by a future external integration. No Stripe, no webhook handler for payment events lives here.
- **Email delivery** — no email sending infrastructure. All customer communication is via WhatsApp/Telegram through the n8n outbound pipeline.
- **SMS (non-WhatsApp)** — only WhatsApp (Meta Cloud API) and Telegram are supported messaging providers.
- **Mobile app or native client** — UI is browser-only dashboard. No React Native, no Expo.
- **Real-time push to the dashboard** — no WebSockets, no Supabase Realtime subscriptions. Dashboard polls via standard HTTP.
- **Free-form or AI-powered command parsing** — the parser is strict and keyword-based. No NLP, no LLM-assisted message parsing.
- **Provider-side webhook logic** — n8n owns all provider ingress and egress. The backend does not call WhatsApp or Telegram APIs directly from command handlers.
- **Client-side security enforcement** — subscription status, access control, and state validation are server-only. Never trust the client.
- **Multi-region or distributed lock management** — Supabase unique constraints and the atomic intake RPC are the sole concurrency control mechanism.

---

## 3. Core Architecture Rules

These rules are **non-negotiable**. Violations break testability, predictability, and correctness.

### 3.1 Effect-Based Command System

**Command handlers must be pure.** They fetch read-only context, compute a result, and return it. They must not write to the database, call external services, or produce side effects.

All side effects are declared as entries in `CommandExecutionResult.effects` and executed by `executeCommandEffects` in `lib/messages/effect-executor.ts`. The executor is the **only permitted write path** for command-dispatched mutations.

```
Handler:  fetch context → compute → return { replies, effects[], attachmentContext }
Executor: for each effect → switch(type) → DB write
```

Permitted effect types (defined in `CommandEffectType` in `lib/types.ts`):
- `insert_note`
- `insert_work_order_item`
- `update_work_order_status`
- `enqueue_document`
- `schedule_reminder`
- `schedule_pickup_notification`
- `cancel_reminders`
- `write_audit`

**Rule:** adding a new mutation to the command dispatch path requires adding a new `CommandEffectType` and a new `case` in the executor. Putting DB writes directly in a handler is forbidden.

**Scope note:** `generateEstimateDocument` and `completeIntakeAtomically` are dashboard/intake operations, not command handlers. They write directly and are outside this rule's scope.

---

### 3.2 attachmentContext Is the Source of Truth for Attachment Linking

Every command handler that resolves a work order or intake session **must** populate `attachmentContext` in its `CommandExecutionResult`:

```typescript
attachmentContext: { kind: "work_order" | "intake", id: string }
```

`finalizeInboundAttachments` uses only `attachmentContext` to link saved attachments to their entity. It performs no DB re-query, no fallback, and no `command.kind` branching. If `attachmentContext` is absent, attachment linking is silently skipped.

**Rule:** when adding or modifying a command handler that operates on a work order or intake session, `attachmentContext` must be returned. Missing it causes attachments to be saved but not linked — silent data loss.

---

### 3.3 Work Order State Must Follow ALLOWED_TRANSITIONS

All work order status transitions must pass through `assertTransitionAllowed(from, to, plate)` defined in `lib/work-orders/index.ts`.

```typescript
const ALLOWED_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  accepted:    ["ready", "archived"],
  in_progress: ["ready", "archived"],
  ready:       ["collected"],
  collected:   [],
  archived:    [],
};
```

`closeWorkOrder` (`accepted/in_progress → ready`) and `markCollected` (`ready → collected`) both call `assertTransitionAllowed` before producing status-change effects.

**Rule:** no code may write a `status` update to `work_orders` without first calling `assertTransitionAllowed`. Scattered `if (workOrder.status === ...)` transition guards are forbidden.

---

### 3.4 Dashboard Query Deduplication Uses mergeByKey

Search functions that fan out across multiple parallel queries and need deduplication must use `mergeByKey` from `lib/dashboard/query-utils.ts`:

```typescript
export async function mergeByKey<K, T>(
  queries: Array<() => Promise<T[]>>,
  keyFn: (item: T) => K,
): Promise<Map<K, T>>
```

Manual `new Map()` + `for...of` dedup patterns in `lib/dashboard/read.ts` are replaced.

---

### 3.5 Subscription Enforcement Is Server-Only

Trial expiry and access blocking are computed and persisted by `checkAndUpdateSubscriptionStatus(workshopId)` in `lib/subscription.ts`, called exclusively from `requireDashboardSession` in `lib/dashboard/session.ts`.

**Rule:** no subscription logic in the browser, in middleware, or in API route handlers. The session gate is the single enforcement point.

---

## 4. Limitations

These are known, intentional design boundaries — not bugs.

### 4.1 Document Generation Is Asynchronous

Calling `requestDocument(workshopId, input)` enqueues a document row and attempts a best-effort eager process. n8n is the authoritative worker. A document's final status (`ready` vs `failed`) is not guaranteed at the time the triggering command returns. The dashboard polls document status.

**Do not** make command handlers wait for document generation to complete.

### 4.2 Reminder Dispatch Is Eventually Consistent

Reminders are written as `scheduled` rows. n8n dispatches them on a timer. Dispatch confirmation updates `provider_status` on `message_logs` and reminder status on `reminders`. There is no synchronous confirmation path.

### 4.3 Intake Completion Is Atomic; Subsequent Steps Are Not

`completeIntakeAtomically` wraps customer/vehicle/work-order creation in a single Supabase RPC transaction. The intake acceptance document enqueue and attachment link that follow are not part of that transaction — they can fail independently without rolling back the work order.

### 4.4 Outbound Delivery Is Not Guaranteed

WhatsApp and Telegram delivery tracking stops at `accepted` (provider accepted the message). `delivered` status requires provider-callback infrastructure not currently wired. WF-08 retries stale `sending` rows but does not guarantee eventual delivery.

### 4.5 Attachment Finalization Is Best-Effort for Commands Without Entity Context

Commands that do not resolve a specific work order or intake session (`REVISIONE`, `REVISIONIINSCADENZA`, `CERCA` multi-result, `COMANDO`) do not populate `attachmentContext`. Attachments sent alongside these commands are saved to storage but not linked to any entity. This is intentional — there is no unambiguous entity to link to.

---

## 5. Development Rules

These rules apply to all development work in this codebase.

### Never bypass the effect system
Command handlers must not call `supabaseServer.from(...).insert/update/delete()` directly. Use an effect type.

### Never write implicit state transitions
Work order status changes without `assertTransitionAllowed` are forbidden. If a new transition is needed, add it to `ALLOWED_TRANSITIONS` explicitly.

### Never re-query resolved entities when context is available
If a command handler already holds `workOrder.id` or `intakeSessionId`, pass it through `attachmentContext`. Do not design a function that re-queries the same row to get the same ID.

### Never put security logic client-side
Subscription status, session validity, workshop status, and access control are server-side only. Never compute access decisions in the browser.

### Never add a new `CommandEffectType` without a corresponding executor case
The `default: never` exhaustiveness check in `effect-executor.ts` will cause a TypeScript error. Handle it — do not suppress it.

### Prefer incremental, reviewable changes
Breaking a refactor into small commits with a single conceptual change per commit is required. A commit that changes both the effect type and the handler and the executor simultaneously is hard to review and hard to revert.

---

## 6. Key File Map

| File | Purpose |
|---|---|
| `lib/types.ts` | Shared types including `CommandExecutionResult`, `CommandEffect`, `CommandEffectType` |
| `lib/messages/index.ts` | Inbound message orchestrator — `processNormalizedInbound`, `executeParsedCommand`, `dispatchCommand` |
| `lib/messages/effect-executor.ts` | Sole write path for all command-dispatched mutations |
| `lib/work-orders/index.ts` | Work order command handlers + `ALLOWED_TRANSITIONS` + `assertTransitionAllowed` |
| `lib/intake/index.ts` | Intake session management, `startIntake`, `continueIntake`, `completeIntakeAtomically` |
| `lib/documents/index.ts` | Document lifecycle, `requestDocument`, `enqueueDocumentGeneration`, `processPendingDocuments` |
| `lib/reminders/index.ts` | Reminder scheduling, cancellation, dispatch |
| `lib/dashboard/read.ts` | All dashboard read queries |
| `lib/dashboard/query-utils.ts` | `mergeByKey` dedup utility |
| `lib/dashboard/session.ts` | `requireDashboardSession` — single enforcement point for page access and subscription gating |
| `lib/subscription.ts` | Trial/subscription state machine |
| `supabase/migrations/` | Authoritative schema history |
| `n8n/` | Workflow definitions — provider ingress, outbound dispatch, schedulers |
| `docs/backend-vs-n8n-boundaries.md` | Detailed n8n vs backend responsibility split |
| `docs/backend-flow-summary.md` | Normalized inbound flow, parser semantics, intake completion |
| `docs/internal-api-contracts.md` | Internal API route contracts for n8n integration |
