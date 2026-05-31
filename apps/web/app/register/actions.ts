"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { selfRegisterWorkshop } from "../../lib/registration/self-register";
import { checkRegistrationRateLimit } from "../../lib/registration/rate-limit";
import { createSessionForUser } from "../../lib/dashboard/session";

export interface RegisterActionState {
  ok: boolean;
  message: string;
  stamp?: number;
}

export async function registerWorkshopAction(
  _state: RegisterActionState,
  formData: FormData,
): Promise<RegisterActionState> {
  const headerStore = await headers();
  const xff = headerStore.get("x-forwarded-for");
  const rawIp = xff ? xff.split(",")[0].trim() : (headerStore.get("x-real-ip") ?? "unknown");

  try {
    await checkRegistrationRateLimit(rawIp);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Troppi tentativi.", stamp: Date.now() };
  }

  const workshopName = str(formData, "workshopName");
  const ownerName = str(formData, "ownerName");
  const email = str(formData, "email").toLowerCase();
  const password = str(formData, "password");
  const confirmPassword = str(formData, "confirmPassword");
  const phone = str(formData, "phone") || undefined;
  const vatNumber = str(formData, "vatNumber") || undefined;

  if (!workshopName || workshopName.length > 100) {
    return { ok: false, message: "Nome officina obbligatorio (max 100 caratteri).", stamp: Date.now() };
  }
  if (!ownerName || ownerName.length > 100) {
    return { ok: false, message: "Nome titolare obbligatorio (max 100 caratteri).", stamp: Date.now() };
  }
  if (!email || !email.includes("@") || !email.includes(".")) {
    return { ok: false, message: "Email non valida.", stamp: Date.now() };
  }
  if (!password || password.length < 8) {
    return { ok: false, message: "La password deve contenere almeno 8 caratteri.", stamp: Date.now() };
  }
  if (password !== confirmPassword) {
    return { ok: false, message: "Le password non coincidono.", stamp: Date.now() };
  }

  let user;
  try {
    const result = await selfRegisterWorkshop({ workshopName, ownerName, email, password, phone, vatNumber });
    user = result.user;
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Errore durante la registrazione. Riprova.",
      stamp: Date.now(),
    };
  }

  await createSessionForUser(user);
  redirect("/dashboard");
}

function str(formData: FormData, key: string): string {
  const val = formData.get(key);
  return typeof val === "string" ? val.trim() : "";
}
