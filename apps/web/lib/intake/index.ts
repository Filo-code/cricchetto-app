import { linkIntakeAttachmentsToWorkOrder } from "../attachments";
import { enqueueDocumentGeneration, processPendingDocuments } from "../documents";
import { AppError } from "../errors";
import { CUSTOMER_PHONE_VALIDATION_MESSAGE, normalizeCustomerPhone } from "../phones";
import { supabaseServer } from "../supabase-server";
import type { Channel, CommandExecutionResult, IntakeStep } from "../types";

const INTAKE_STEPS: IntakeStep[] = ["vehicle_model", "reported_issue", "kilometers", "customer_name", "customer_phone"];
const STEP_PROMPTS: Record<IntakeStep, string> = {
  vehicle_model: "Modello auto?",
  reported_issue: "Problema segnalato?",
  kilometers: "Km?",
  customer_name: "Nome cliente?",
  customer_phone: "Telefono cliente?",
};

export interface IntakeCompletionInput {
  workshopId: string;
  intakeSessionId: string;
  actorRef: string;
}

export interface IntakeMessageContext {
  channel?: Channel;
  provider?: string;
  providerMessageId?: string;
  senderIdentifier?: string;
  recipientIdentifier?: string;
  currentStep?: string;
}

export interface IntakeCompletionAtomicInput extends IntakeCompletionInput {
  data?: any;
  plate?: string;
  messageContext?: IntakeMessageContext;
}

export interface IntakeCompletionRpcRow {
  work_order_id: string;
  public_code: string;
  plate_normalized: string;
}

export async function deactivateExpiredIntake(workshopId: string, channel: Channel, senderIdentifier: string): Promise<void> {
  const { data, error } = await supabaseServer
    .from("intake_sessions")
    .select("id,expires_at")
    .eq("workshop_id", workshopId)
    .eq("channel", channel)
    .eq("sender_identifier", senderIdentifier)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read intake session: ${error.message}`);
  }
  if (data && new Date(data.expires_at).getTime() <= Date.now()) {
    const { error: updateError } = await supabaseServer
      .from("intake_sessions")
      .update({ is_active: false })
      .eq("workshop_id", workshopId)
      .eq("id", data.id);

    if (updateError) {
      throw new Error(`Failed to deactivate expired intake session: ${updateError.message}`);
    }
  }
}

export async function cleanupExpiredIntakes(): Promise<number> {
  const { data, error } = await supabaseServer
    .from("intake_sessions")
    .update({ is_active: false })
    .eq("is_active", true)
    .lte("expires_at", new Date().toISOString())
    .select("id");

  if (error) {
    throw new Error(`Failed to cleanup expired intakes: ${error.message}`);
  }

  return data?.length ?? 0;
}

export async function getActiveIntake(workshopId: string, channel: Channel, senderIdentifier: string): Promise<any | null> {
  const { data, error } = await supabaseServer
    .from("intake_sessions")
    .select("*")
    .eq("workshop_id", workshopId)
    .eq("channel", channel)
    .eq("sender_identifier", senderIdentifier)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to get active intake: ${error.message}`);
  }

  return data;
}

export async function startIntake(input: {
  workshopId: string;
  channel: Channel;
  senderIdentifier: string;
  plate: string;
}): Promise<CommandExecutionResult> {
  const { error } = await supabaseServer.from("intake_sessions").insert({
    workshop_id: input.workshopId,
    channel: input.channel,
    sender_identifier: input.senderIdentifier,
    plate_normalized: input.plate,
    current_step: "vehicle_model",
    data: {},
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });

  if (error) {
    if (error.code === "23505") {
      return {
        parseStatus: "conflict",
        replies: [{ recipientIdentifier: "", text: "Hai gia una nuova scheda in corso.\nRispondi alla domanda precedente.", idempotencyKey: "" }],
      };
    }
    throw new Error(`Failed to start intake: ${error.message}`);
  }

  return {
    parseStatus: "processed",
    replies: [{ recipientIdentifier: "", text: `Nuova scheda per ${input.plate}.\n${STEP_PROMPTS.vehicle_model}`, idempotencyKey: "" }],
  };
}

export async function continueIntake(input: {
  workshopId: string;
  intake: any;
  answer: string;
  actorRef: string;
  messageContext?: IntakeMessageContext;
}): Promise<CommandExecutionResult> {
  const step = input.intake.current_step as IntakeStep;
  const data = { ...(input.intake.data ?? {}), [step]: normalizeIntakeAnswer(step, input.answer) };
  const currentIndex = INTAKE_STEPS.indexOf(step);
  const nextStep = INTAKE_STEPS[currentIndex + 1];

  if (nextStep) {
    const { error } = await supabaseServer
      .from("intake_sessions")
      .update({ data, current_step: nextStep })
      .eq("workshop_id", input.workshopId)
      .eq("id", input.intake.id);

    if (error) {
      throw new Error(`Failed to update intake: ${error.message}`);
    }

    return { parseStatus: "continued_intake", replies: [{ recipientIdentifier: "", text: STEP_PROMPTS[nextStep], idempotencyKey: "" }] };
  }

  return completeIntakeForCurrentRuntime({
    workshopId: input.workshopId,
    intakeSessionId: input.intake.id,
    actorRef: input.actorRef,
    data,
    plate: input.intake.plate_normalized,
    messageContext: {
      ...input.messageContext,
      currentStep: step,
    },
  });
}

export async function completeIntakeForCurrentRuntime(input: IntakeCompletionAtomicInput): Promise<CommandExecutionResult> {
  return completeIntakeAtomically(input);
}

export async function completeIntakeAtomically(input: IntakeCompletionAtomicInput): Promise<CommandExecutionResult> {
  return completeIntakeViaRpc(input);
}

async function completeIntakeViaRpc(input: IntakeCompletionAtomicInput): Promise<CommandExecutionResult> {
  try {
    const rpcData = prepareIntakeDataForRpc(input.data);
    const { data, error } = await supabaseServer
      .rpc("complete_intake_work_order", {
        p_workshop_id: input.workshopId,
        p_intake_session_id: input.intakeSessionId,
        p_actor_ref: input.actorRef,
        p_intake_data: rpcData,
        p_plate_normalized: input.plate ?? null,
      })
      .single();

    if (error) {
      throw error;
    }

    const row = data as IntakeCompletionRpcRow;
    await safeLinkIntakeAttachmentsToWorkOrder({
      workshopId: input.workshopId,
      intakeSessionId: input.intakeSessionId,
      workOrderId: row.work_order_id,
      actorRef: input.actorRef,
    });
    await safeEnqueueAndProcessIntakeDocument({
      workshopId: input.workshopId,
      workOrderId: row.work_order_id,
      actorRef: input.actorRef,
    });
    return {
      parseStatus: "processed",
      relatedWorkOrderId: row.work_order_id,
      replies: [
        {
          recipientIdentifier: "",
          text: `Scheda creata: ${row.plate_normalized}\nCodice: ${row.public_code}\nStato: accettata\nDocumento in preparazione.`,
          idempotencyKey: "",
        },
      ],
    };
  } catch (error) {
    const mappedError = mapIntakeCompletionError(error, input);
    logIntakeCompletionFailure(input, mappedError, error);
    throw mappedError;
  }
}

function isMissingIntakeRpcError(error: { code?: string; text?: string }): boolean {
  return error.code === "PGRST202"
    || error.code === "42883"
    || /complete_intake_work_order/i.test(error.text ?? "") && /not found|does not exist|schema cache/i.test(error.text ?? "");
}

function normalizeIntakeAnswer(step: IntakeStep, answer: string): string | number {
  const trimmed = answer.trim();
  if (!trimmed) {
    throw new AppError("Missing intake answer", { parseStatus: "validation_failed", publicMessage: `Mi manca questo dato.\nRispondi con il valore richiesto.` });
  }
  if (step === "kilometers") {
    const digits = trimmed.replace(/[^\d]/g, "");
    const value = digits ? Number(digits) : Number.NaN;
    if (!Number.isFinite(value) || value < 0 || value > 999999) {
      throw new AppError("Invalid kilometers", { parseStatus: "validation_failed", publicMessage: "Km non validi. Inserisci un numero compreso tra 0 e 999999." });
    }
    return value;
  }
  if (step === "customer_phone") {
    return normalizeCustomerPhoneOrThrow(trimmed);
  }
  return trimmed;
}

function prepareIntakeDataForRpc(data: IntakeCompletionAtomicInput["data"]): Record<string, unknown> | null {
  if (data == null) {
    return null;
  }
  if (typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid intake completion payload");
  }

  const payload = { ...(data as Record<string, unknown>) };
  if (typeof payload.customer_phone !== "string") {
    throw invalidCustomerPhoneError();
  }

  payload.customer_phone = normalizeCustomerPhoneOrThrow(payload.customer_phone);
  return payload;
}

function normalizeCustomerPhoneOrThrow(answer: string): string {
  const normalized = normalizeCustomerPhone(answer);
  if (!normalized) {
    throw invalidCustomerPhoneError();
  }
  return normalized;
}

function invalidCustomerPhoneError(): AppError {
  return new AppError("Invalid customer phone", {
    statusCode: 400,
    parseStatus: "validation_failed",
    publicMessage: CUSTOMER_PHONE_VALIDATION_MESSAGE,
  });
}

async function safeLinkIntakeAttachmentsToWorkOrder(input: {
  workshopId: string;
  intakeSessionId: string;
  workOrderId: string;
  actorRef: string;
}): Promise<void> {
  try {
    await linkIntakeAttachmentsToWorkOrder({
      workshopId: input.workshopId,
      intakeSessionId: input.intakeSessionId,
      workOrderId: input.workOrderId,
      actorType: "mechanic",
      actorRef: input.actorRef,
    });
  } catch (error) {
    if (isLegacyAttachmentLinkSchemaDriftError(error)) {
      console.warn("[intake.completeIntakeViaRpc] attachment_link_skipped", {
        workshopId: input.workshopId,
        intakeSessionId: input.intakeSessionId,
        workOrderId: input.workOrderId,
        errorMessage: getErrorText(error) || String(error),
      });
      return;
    }
    throw error;
  }
}

async function safeEnqueueAndProcessIntakeDocument(input: { workshopId: string; workOrderId: string; actorRef: string }): Promise<void> {
  try {
    await enqueueDocumentGeneration({
      workshopId: input.workshopId,
      workOrderId: input.workOrderId,
      documentType: "intake_acceptance",
      createdBy: input.actorRef,
    });
    await processPendingDocuments(1);
  } catch (error) {
    console.warn("[intake.completeIntakeViaRpc] intake_document_generation_failed", {
      workshopId: input.workshopId,
      workOrderId: input.workOrderId,
      errorMessage: getErrorText(error) || String(error),
    });
  }
}

function mapIntakeCompletionError(error: unknown, input: IntakeCompletionAtomicInput): Error {
  if (error instanceof AppError) {
    return error;
  }

  const errorCode = getErrorField(error, "code");
  const errorText = getErrorText(error) || String(error);
  const errorShape = { code: errorCode, text: errorText };

  if (isMissingIntakeRpcError(errorShape)) {
    return new AppError("Missing complete_intake_work_order RPC", {
      statusCode: 500,
      parseStatus: "error",
      publicMessage: "Servizio intake non disponibile.\nRiprova tra poco.",
    });
  }
  if (isIntakeConstraintSchemaDriftError(errorShape)) {
    return new AppError("Intake RPC schema drift", {
      statusCode: 500,
      parseStatus: "error",
      publicMessage: "Servizio intake non disponibile.\nRiprova tra poco.",
    });
  }
  if (isActiveIntakeSessionNotFoundError(errorShape)) {
    return new AppError("Active intake session not found", {
      statusCode: 409,
      parseStatus: "not_found",
      publicMessage: input.plate
        ? `Sessione intake scaduta per ${input.plate}.\nInvia di nuovo NUOVA ${input.plate}.`
        : "Sessione intake scaduta.\nInvia di nuovo NUOVA <TARGA>.",
    });
  }
  if (isCustomerPhoneRequiredError(errorShape)) {
    return invalidCustomerPhoneError();
  }
  if (isKilometersValidationError(errorShape)) {
    return new AppError("Invalid kilometers", {
      statusCode: 400,
      parseStatus: "validation_failed",
      publicMessage: "Km non validi. Inserisci un numero compreso tra 0 e 999999.",
    });
  }
  if (isMissingRequiredIntakeFieldError(errorShape)) {
    return new AppError("Missing intake data", {
      statusCode: 400,
      parseStatus: "validation_failed",
      publicMessage: "Mi manca un dato della scheda.\nRiparti con NUOVA <TARGA>.",
    });
  }
  if (isActiveWorkOrderConstraintError(errorShape)) {
    return new AppError("Active work order already exists", {
      statusCode: 409,
      parseStatus: "conflict",
      publicMessage: input.plate
        ? `Esiste già una scheda attiva per ${input.plate}.`
        : "Esiste già una scheda attiva per questa targa.",
    });
  }

  return new AppError("Intake completion failed", {
    statusCode: 500,
    parseStatus: "error",
    publicMessage: input.plate
      ? `Errore nel completamento della scheda per ${input.plate}.\nRiprova con NUOVA ${input.plate}.`
      : "Errore nel completamento della scheda.\nRiprova con NUOVA <TARGA>.",
  });
}

function logIntakeCompletionFailure(input: IntakeCompletionAtomicInput, mappedError: Error, originalError: unknown): void {
  const customerPhone = getCustomerPhoneForLogging(input.data);
  console.error("[intake.completeIntakeViaRpc] completion_failed", {
    workshopId: input.workshopId,
    channel: input.messageContext?.channel,
    provider: input.messageContext?.provider,
    providerMessageId: input.messageContext?.providerMessageId,
    senderIdentifier: input.messageContext?.senderIdentifier,
    recipientIdentifier: input.messageContext?.recipientIdentifier,
    intakeSessionId: input.intakeSessionId,
    current_step: input.messageContext?.currentStep ?? "customer_phone",
    plate_normalized: input.plate ?? undefined,
    hasCustomerPhone: customerPhone !== null,
    customerPhoneDigits: customerPhone?.replace(/\D/g, "").length ?? 0,
    parseStatus: mappedError instanceof AppError ? mappedError.parseStatus : "error",
    errorMessage: mappedError.message,
    errorStack: mappedError.stack,
    originalErrorMessage: getErrorField(originalError, "message") ?? String(originalError),
    originalErrorStack: originalError instanceof Error ? originalError.stack : undefined,
    originalErrorCode: getErrorField(originalError, "code"),
    originalErrorDetails: getErrorField(originalError, "details"),
    originalErrorHint: getErrorField(originalError, "hint"),
  });
}

function isCustomerPhoneRequiredError(error: { text?: string }): boolean {
  return /customer_phone\b/i.test(error.text ?? "") && /(required|invalid|null|empty)/i.test(error.text ?? "");
}

function isKilometersValidationError(error: { text?: string }): boolean {
  const text = error.text ?? "";
  return /kilometers must be a non-negative integer/i.test(text)
    || /out of range for type (integer|int|int4)/i.test(text);
}

function isMissingRequiredIntakeFieldError(error: { text?: string }): boolean {
  return /(plate_normalized|vehicle_model|reported_issue|customer_name) is required/i.test(error.text ?? "");
}

function isActiveIntakeSessionNotFoundError(error: { text?: string }): boolean {
  return /active intake session not found/i.test(error.text ?? "");
}

function isIntakeConstraintSchemaDriftError(error: { code?: string; text?: string }): boolean {
  return error.code === "42P10"
    && /no unique or exclusion constraint matching the ON CONFLICT specification/i.test(error.text ?? "");
}

function isLegacyAttachmentLinkSchemaDriftError(error: unknown): boolean {
  const text = getErrorText(error) || String(error);
  return /(attachments|attachment)/i.test(text)
    && /(intake_session_id|schema cache|column)/i.test(text)
    && /(does not exist|not exist|not found|schema cache)/i.test(text);
}

function isActiveWorkOrderConstraintError(error: { text?: string }): boolean {
  return /uq_work_orders_one_active_per_plate|duplicate key value/i.test(error.text ?? "");
}

function getCustomerPhoneForLogging(data: IntakeCompletionAtomicInput["data"]): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }

  const phone = (data as Record<string, unknown>).customer_phone;
  return typeof phone === "string" && phone ? phone : null;
}

function getErrorText(error: unknown): string {
  return [
    getErrorField(error, "message"),
    getErrorField(error, "details"),
    getErrorField(error, "hint"),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" | ");
}

function getErrorField(error: unknown, key: "code" | "details" | "hint" | "message"): string | undefined {
  if (error instanceof Error && key === "message") {
    return error.message;
  }
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" && value ? value : undefined;
}
