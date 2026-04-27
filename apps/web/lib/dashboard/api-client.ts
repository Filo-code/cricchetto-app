import "server-only";

import { headers, cookies } from "next/headers";
import { COOKIE_NAME } from "./session-core";
import { dashboardServerHeaders } from "./auth";

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

interface DashboardGetOptions {
  notFound?: "return-null";
}

interface DashboardBaseUrlResolution {
  baseUrl: string;
  source: "request-host" | "configured-env" | "local-fallback";
}

interface HeaderBag {
  get(name: string): string | null;
}

export class DashboardApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path: string,
  ) {
    super(message);
    this.name = "DashboardApiError";
  }
}

export async function dashboardGet<T>(path: string): Promise<T>;
export async function dashboardGet<T>(path: string, options: { notFound: "return-null" }): Promise<T | null>;
export async function dashboardGet<T>(path: string, options?: DashboardGetOptions): Promise<T | null> {
  const { baseUrl, source } = await getRequestBaseUrl();
  const url = `${baseUrl}${path}`;
  logDashboardFetchDebug({
    method: "GET",
    phase: "request",
    path,
    baseUrl,
    source,
    responseUrl: url,
  });

  const response = await fetch(url, {
    cache: "no-store",
    headers: await buildFetchHeaders(),
  });
  const payload = await readApiEnvelope<T>({ response, method: "GET", path });

  if (response.status === 404 && options?.notFound === "return-null") {
    return null;
  }

  if (!response.ok || !payload.ok || payload.data === undefined) {
    logDashboardContractFailure({
      method: "GET",
      path,
      baseUrl,
      source,
      response,
      payload,
    });
    throw new DashboardApiError(payload.error ?? `Richiesta non riuscita: ${path}`, response.status, path);
  }

  return payload.data;
}

export async function dashboardPost<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
  const { baseUrl, source } = await getRequestBaseUrl();
  const url = `${baseUrl}${path}`;
  logDashboardFetchDebug({
    method,
    phase: "request",
    path,
    baseUrl,
    source,
    responseUrl: url,
  });

  const response = await fetch(url, {
    method,
    cache: "no-store",
    headers: await buildFetchHeaders({ "content-type": "application/json" }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await readApiEnvelope<T>({ response, method, path });

  if (!response.ok || !payload.ok || payload.data === undefined) {
    logDashboardContractFailure({
      method,
      path,
      baseUrl,
      source,
      response,
      payload,
    });
    throw new DashboardApiError(payload.error ?? `Richiesta non riuscita: ${path}`, response.status, path);
  }

  return payload.data;
}

async function buildFetchHeaders(extra?: Record<string, string>): Promise<HeadersInit> {
  const base = dashboardServerHeaders() as Record<string, string>;
  const result: Record<string, string> = extra ? { ...base, ...extra } : { ...base };

  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(COOKIE_NAME);
    if (sessionCookie) {
      result["Cookie"] = `${sessionCookie.name}=${sessionCookie.value}`;
    }
  } catch {
    // Outside request context (background tasks) — no cookie to forward
  }

  return result;
}

async function getRequestBaseUrl(): Promise<DashboardBaseUrlResolution> {
  const requestHeaders = await getRequestHeaders();
  const requestBaseUrl = getRequestBaseUrlFromHeaders(requestHeaders);
  if (requestBaseUrl) {
    return {
      baseUrl: requestBaseUrl,
      source: "request-host",
    };
  }

  const configured = process.env.Criccheto_BACKEND_BASE_URL?.replace(/\/$/, "");
  if (configured) {
    return {
      baseUrl: configured,
      source: "configured-env",
    };
  }

  const port = process.env.PORT ?? "3000";
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    source: "local-fallback",
  };
}

async function getRequestHeaders(): Promise<HeaderBag | null> {
  try {
    return await headers();
  } catch {
    return null;
  }
}

function getRequestBaseUrlFromHeaders(requestHeaders: HeaderBag | null): string | null {
  if (!requestHeaders) {
    return null;
  }

  const forwardedHost = firstHeaderValue(requestHeaders.get("x-forwarded-host"));
  const host = forwardedHost ?? firstHeaderValue(requestHeaders.get("host"));
  if (!host) {
    return null;
  }

  const protocol = getRequestProtocol(requestHeaders, host);
  return `${protocol}://${host}`;
}

function getRequestProtocol(requestHeaders: HeaderBag, host: string): "http" | "https" {
  const forwardedProto = firstHeaderValue(requestHeaders.get("x-forwarded-proto"));
  if (forwardedProto === "https") {
    return "https";
  }

  if (forwardedProto === "http") {
    return "http";
  }

  if (isLocalHost(host)) {
    return "http";
  }

  return process.env.NODE_ENV === "production" ? "https" : "http";
}

function firstHeaderValue(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .split(",")
    .map((entry) => entry.trim())
    .find(Boolean);

  return normalized ?? null;
}

function isLocalHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  if (normalized === "::1") {
    return true;
  }

  if (normalized.startsWith("[")) {
    const closingBracketIndex = normalized.indexOf("]");
    const hostName = closingBracketIndex >= 0 ? normalized.slice(0, closingBracketIndex + 1) : normalized;
    return hostName === "[::1]";
  }

  const hostName = normalized.split(":")[0];
  return hostName === "localhost" || hostName === "127.0.0.1";
}

function logDashboardFetchDebug(payload: {
  method: string;
  phase: "request" | "response";
  path: string;
  baseUrl?: string;
  source?: DashboardBaseUrlResolution["source"];
  status?: number;
  contentType?: string | null;
  contentTypeKind?: "json" | "html" | "other" | "missing";
  responseUrl?: string;
}): void {
  console.info("[dashboard-fetch]", payload);
}

async function readApiEnvelope<T>(input: {
  response: Response;
  method: string;
  path: string;
}): Promise<ApiEnvelope<T> & { __rawBody?: string }> {
  const { response, method, path } = input;
  const contentType = response.headers.get("content-type");
  const rawBody = await response.text();
  const payload = parseApiEnvelope<T>(rawBody);

  logDashboardFetchDebug({
    method,
    phase: "response",
    path,
    status: response.status,
    contentType,
    contentTypeKind: getContentTypeKind(contentType),
    responseUrl: response.url,
  });

  if (payload) {
    return {
      ...payload,
      __rawBody: rawBody,
    };
  }

  return { ok: false, __rawBody: rawBody };
}

function parseApiEnvelope<T>(rawBody: string): ApiEnvelope<T> | null {
  if (!rawBody) {
    return null;
  }

  try {
    return JSON.parse(rawBody) as ApiEnvelope<T>;
  } catch {
    return null;
  }
}

function getContentTypeKind(contentType: string | null): "json" | "html" | "other" | "missing" {
  if (!contentType) {
    return "missing";
  }

  const normalized = contentType.toLowerCase();
  if (normalized.includes("application/json")) {
    return "json";
  }

  if (normalized.includes("text/html")) {
    return "html";
  }

  return "other";
}

function logDashboardContractFailure(payload: {
  method: string;
  path: string;
  baseUrl: string;
  source: DashboardBaseUrlResolution["source"];
  response: Response;
  payload: ApiEnvelope<unknown> & { __rawBody?: string };
}): void {
  const contentType = payload.response.headers.get("content-type");
  const contractFailed = !payload.payload.ok || payload.payload.data === undefined;
  const shouldLogRawBody = payload.response.status === 200 && contractFailed;

  console.error("[dashboard-fetch-contract-failure]", {
    method: payload.method,
    path: payload.path,
    baseUrl: payload.baseUrl,
    source: payload.source,
    status: payload.response.status,
    responseUrl: payload.response.url,
    contentType,
    contentTypeKind: getContentTypeKind(contentType),
    rawBody: shouldLogRawBody ? payload.payload.__rawBody ?? "" : undefined,
    payloadOk: payload.payload.ok,
    hasData: payload.payload.data !== undefined,
    payloadError: payload.payload.error,
  });
}
