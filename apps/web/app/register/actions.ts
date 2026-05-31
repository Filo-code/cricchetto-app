"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { selfRegisterWorkshop } from "../../lib/registration/self-register";
import { checkRegistrationRateLimit } from "../../lib/registration/rate-limit";
import { createSessionForUser } from "../../lib/dashboard/session";
import { extractClientIp } from "../../lib/ip";

export interface RegisterActionState {
  ok: boolean;
  message: string;
  stamp?: number;
}

// Matches user@domain.tld — rejects bare @, no TLD, or whitespace in local/domain parts.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function registerWorkshopAction(
  _state: RegisterActionState,
  formData: FormData,
): Promise<RegisterActionState> {
  // --- Rate limit ---
  const headerStore = await headers();
  const rawIp = extractClientIp(headerStore);

  try {
    await checkRegistrationRateLimit(rawIp);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Troppi tentativi.", stamp: Date.now() };
  }

  // --- Extract + normalize ---
  const workshopName = str(formData, "workshopName");
  const ownerName    = str(formData, "ownerName");
  const email        = str(formData, "email").toLowerCase();
  const password     = strRaw(formData, "password");
  const confirmPw    = strRaw(formData, "confirmPassword");
  const phone        = str(formData, "phone") || undefined;
  const vatNumber    = str(formData, "vatNumber") || undefined;

  // --- Validate ---
  if (!workshopName) {
    return err("Nome officina obbligatorio.");
  }
  if (workshopName.length > 100) {
    return err("Nome officina troppo lungo (max 100 caratteri).");
  }
  if (!ownerName) {
    return err("Nome titolare obbligatorio.");
  }
  if (ownerName.length > 100) {
    return err("Nome titolare troppo lungo (max 100 caratteri).");
  }
  if (!email || !EMAIL_RE.test(email)) {
    return err("Email non valida.");
  }
  if (email.length > 254) {
    return err("Email troppo lunga.");
  }
  if (!password || password.length < 8) {
    return err("La password deve contenere almeno 8 caratteri.");
  }
  if (!password.trim()) {
    return err("La password non può essere composta solo da spazi.");
  }
  if (password !== confirmPw) {
    return err("Le password non coincidono.");
  }
  if (phone && phone.length > 30) {
    return err("Numero di telefono troppo lungo.");
  }
  if (vatNumber && vatNumber.length > 30) {
    return err("Partita IVA troppo lunga.");
  }

  // --- Register ---
  let user;
  try {
    const result = await selfRegisterWorkshop({
      workshopName,
      ownerName,
      email,
      password,
      phone,
      vatNumber,
    });
    user = result.user;
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Errore durante la registrazione. Riprova.",
      stamp: Date.now(),
    };
  }

  // createSessionForUser uses the returned WorkshopUser directly — no DB re-fetch,
  // no sessionVersion race condition.
  await createSessionForUser(user);
  redirect("/dashboard");
}

// str: trim whitespace. Used for all fields except password.
function str(formData: FormData, key: string): string {
  const val = formData.get(key);
  return typeof val === "string" ? val.trim() : "";
}

// strRaw: no trim. Used for password fields (spaces may be intentional).
function strRaw(formData: FormData, key: string): string {
  const val = formData.get(key);
  return typeof val === "string" ? val : "";
}

function err(message: string): RegisterActionState {
  return { ok: false, message, stamp: Date.now() };
}
