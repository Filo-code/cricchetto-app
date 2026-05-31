import { supabaseServer } from "../supabase-server";
import { peekDashboardSession, getEffectiveWorkshopId } from "./session-core";

export interface WorkshopFullSettings {
  id: string;
  name: string;
  displayName: string | null;
  timezone: string;
  logoUrl: string | null;
  hourlyRate: number;
  ragioneSociale: string | null;
  partitaIva: string | null;
  codiceFiscale: string | null;
  indirizzo: string | null;
  citta: string | null;
  cap: string | null;
  provincia: string | null;
  telefono: string | null;
  email: string | null;
  pec: string | null;
  sdi: string | null;
  condizioniAccettazione: string | null;
  condizioniPreventivo: string | null;
  footerDocumenti: string | null;
}

export async function getWorkshopSettings(): Promise<WorkshopFullSettings> {
  const session = await peekDashboardSession();
  const configuredWorkshopId = process.env.Cricchetto_DASHBOARD_WORKSHOP_ID ?? process.env.Cricchetto_WORKSHOP_ID;
  const workshopId = session ? getEffectiveWorkshopId(session) : configuredWorkshopId;

  if (!workshopId) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("No workshop resolved from session or configuration — refusing first-by-date fallback in production");
    }
  }

  let workshopQuery = supabaseServer.from("workshops").select("id,name,display_name,logo_url,timezone").order("created_at", { ascending: true }).limit(1);
  if (workshopId) {
    workshopQuery = supabaseServer.from("workshops").select("id,name,display_name,logo_url,timezone").eq("id", workshopId).limit(1);
  }
  const { data, error } = await workshopQuery.maybeSingle();
  if (error) throw new Error(`Failed to read workshop: ${error.message}`);
  if (!data) throw new Error("No workshop configured for dashboard");

  const [profileResult, wsSettingsResult] = await Promise.all([
    (supabaseServer as any)
      .from("workshop_profiles")
      .select("ragione_sociale,partita_iva,codice_fiscale,indirizzo,citta,cap,provincia,telefono,email,pec,sdi,condizioni_accettazione,condizioni_preventivo,footer_documenti")
      .eq("workshop_id", data.id)
      .maybeSingle(),
    supabaseServer
      .from("workshop_settings")
      .select("hourly_rate")
      .eq("workshop_id", data.id)
      .maybeSingle(),
  ]);
  const profile = (profileResult as any)?.data;
  const wsSettings = (wsSettingsResult as any)?.data;
  const p = profile ?? {};

  return {
    id: data.id,
    name: data.name,
    displayName: (data as any).display_name ?? null,
    timezone: data.timezone,
    logoUrl: (data as any).logo_url ?? null,
    hourlyRate: Number(wsSettings?.hourly_rate ?? 0),
    ragioneSociale: p.ragione_sociale ?? null,
    partitaIva: p.partita_iva ?? null,
    codiceFiscale: p.codice_fiscale ?? null,
    indirizzo: p.indirizzo ?? null,
    citta: p.citta ?? null,
    cap: p.cap ?? null,
    provincia: p.provincia ?? null,
    telefono: p.telefono ?? null,
    email: p.email ?? null,
    pec: p.pec ?? null,
    sdi: p.sdi ?? null,
    condizioniAccettazione: p.condizioni_accettazione ?? null,
    condizioniPreventivo: p.condizioni_preventivo ?? null,
    footerDocumenti: p.footer_documenti ?? null,
  };
}

const ALLOWED_LOGO_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024;

export async function uploadWorkshopLogo(workshopId: string, file: File): Promise<string> {
  if (!ALLOWED_LOGO_MIME.has(file.type)) {
    throw new Error("Tipo file non supportato. Usa JPG, PNG, WebP o GIF.");
  }
  if (file.size > MAX_LOGO_SIZE_BYTES) {
    throw new Error("Logo troppo grande (max 5 MB).");
  }

  const { Buffer } = await import("node:buffer");
  const BUCKET = process.env.Cricchetto_BRANDING_BUCKET || "workshop-branding";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const storagePath = `${workshopId}/logo/logo-${Date.now()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabaseServer.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: file.type, upsert: true });

  if (uploadError) throw new Error(`Upload logo fallito: ${uploadError.message}`);

  const { data: { publicUrl } } = supabaseServer.storage.from(BUCKET).getPublicUrl(storagePath);

  const { error: updateError } = await supabaseServer
    .from("workshops")
    .update({ logo_url: publicUrl } as Record<string, unknown>)
    .eq("id", workshopId);

  if (updateError) throw new Error(`Salvataggio logo_url fallito: ${updateError.message}`);

  return publicUrl;
}

export async function readWorkshopChannelStatus(workshopId: string): Promise<{ hasWhatsapp: boolean }> {
  const { data } = await supabaseServer
    .from("workshop_channels")
    .select("channel")
    .eq("workshop_id", workshopId)
    .eq("channel", "whatsapp")
    .eq("is_active", true)
    .limit(1);

  return { hasWhatsapp: (data ?? []).length > 0 };
}
