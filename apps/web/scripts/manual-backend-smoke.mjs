#!/usr/bin/env node

const baseUrl = requiredEnv("Criccheto_BACKEND_BASE_URL").replace(/\/$/, "");
const internalSecret = requiredEnv("Criccheto_INTERNAL_API_SECRET");
const telegramRecipient = normalizeTelegramBotIdentifier(process.env.Criccheto_TELEGRAM_BOT_IDENTIFIER || "Cricchetto_bot");
const sender = process.env.Criccheto_TEST_TELEGRAM_CHAT_ID || `manual-smoke-${Date.now()}`;
const realProviderMessageId = process.env.Criccheto_TEST_REAL_PROVIDER_MESSAGE_ID;
const plate = process.env.Criccheto_TEST_PLATE || randomPlate();

const reminderTypes = [
  "ready_pickup",
  "ready_not_collected",
  "revision_due_35d",
  "revision_due_30d",
  "revision_due_7d",
  "revision_due_1d",
];

console.log(`Manual backend smoke: plate=${plate} sender=${sender}`);

const malformed = await inbound("RICAMBIO BAD", "malformed", `${sender}-malformed`);
assert(malformed.ok === true, "malformed command response must be ok");
assert(malformed.parseStatus === "malformed", "malformed command must return parseStatus=malformed");

const duplicateMessageId = `manual-smoke:${Date.now()}:duplicate-fixed`;
const duplicateFirst = await inbound("STATO AA999ZZ", "duplicate", `${sender}-duplicate`, duplicateMessageId);
assert(duplicateFirst.ok === true, "first duplicate probe must be ok");
const duplicateSecond = await inbound("STATO AA999ZZ", "duplicate", `${sender}-duplicate`, duplicateMessageId);
assert(duplicateSecond.ok === true && duplicateSecond.duplicate === true, "second duplicate probe must be duplicate-safe");

const outboundForResult = malformed.outboundMessages?.[0];
if (outboundForResult?.messageLogId) {
  await post("/api/internal/messages/send-outbound-result", {
    messageLogId: outboundForResult.messageLogId,
    providerStatus: "sending",
  });
  await post("/api/internal/messages/send-outbound-result", {
    messageLogId: outboundForResult.messageLogId,
    providerStatus: "failed",
    errorMessage: "manual smoke validation failure",
  });
  if (realProviderMessageId) {
    const acceptedProbe = await inbound("STATO AA999ZZ", "accepted-probe", `${sender}-accepted`);
    const acceptedOutbound = acceptedProbe.outboundMessages?.[0];
    assert(acceptedOutbound?.messageLogId, "accepted provider result needs a queued outbound message");
    await post("/api/internal/messages/send-outbound-result", {
      messageLogId: acceptedOutbound.messageLogId,
      providerStatus: "accepted",
      providerMessageId: realProviderMessageId,
    });
  }
}

await inbound(`NUOVA ${plate}`, "intake-start");
await inbound("Fiat Panda", "intake-model");
await inbound("Rumore avantreno", "intake-problem");
await inbound("120000", "intake-km");
await inbound("Mario Rossi", "intake-customer");
const intakeDone = await inbound("333 123 4567", "intake-phone");
assert(intakeDone.relatedWorkOrderId, "intake completion must return relatedWorkOrderId");

await inbound(`STATO ${plate}`, "status");
await inbound(`NOTA ${plate} controllo fumo manuale`, "note");
await inbound(`RICAMBIO ${plate} filtro olio 1 12,50`, "part");
await inbound(`MANODOPERA ${plate} 1,5`, "labor");
await inbound(`REVISIONE ${plate}`, "revision-lookup");
await inbound(`REVISIONE ${plate} 2026-11-20`, "revision-update");
await inbound("REVISIONIINSCADENZA", "revision-due-list");
await inbound(`CHIUDI ${plate}`, "close");

const documentResult = await post("/api/internal/documents/run", { limit: 10 });
assert(Number.isInteger(documentResult.claimed), "document worker must return claimed count");
assert(Number.isInteger(documentResult.processed), "document worker must return processed count");
assert(Number.isInteger(documentResult.failed), "document worker must return failed count");
assert(Array.isArray(documentResult.documents), "document worker must return documents array");

const reminderResult = await post("/api/internal/reminders/run", { limit: 20, reminderTypes });
assert(Array.isArray(reminderResult.queued), "reminder runner must return queued array");

await inbound(`RITIRATA ${plate}`, "collect");

const recoveryResult = await post("/api/internal/outbound/recover-stuck", { limit: 20 });
assert(Array.isArray(recoveryResult.queued), "outbound recovery must return queued array");

const cleanupResult = await post("/api/internal/intake/expire-cleanup", {});
assert(Number.isInteger(cleanupResult.expired), "cleanup must return expired count");

console.log("Manual backend smoke: OK");

async function inbound(text, messageKey, senderIdentifier = sender, providerMessageId) {
  return post("/api/internal/messages/process-inbound", {
    channel: "telegram_test",
    provider: "telegram_bot_api",
    providerMessageId: providerMessageId || `manual-smoke:${Date.now()}:${messageKey}`,
    senderIdentifier,
    recipientIdentifier: telegramRecipient,
    text,
    rawPayload: {
      update_id: Date.now(),
      smoke: true,
      messageKey,
    },
  });
}

async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-secret": internalSecret,
    },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.ok !== true) {
    throw new Error(`${path} failed: HTTP ${response.status} ${JSON.stringify(json)}`);
  }
  return json;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function randomPlate() {
  const number = String(100 + Math.floor(Math.random() * 900));
  const suffix = String(Date.now()).slice(-2).replace(/\d/g, (digit) => String.fromCharCode(65 + Number(digit)));
  return `SM${number}${suffix}`;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
function normalizeTelegramBotIdentifier(value) {
  return value === "Crichetto_bot" ? "Cricchetto_bot" : value;
}
