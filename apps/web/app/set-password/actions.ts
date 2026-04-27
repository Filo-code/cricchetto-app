"use server";

import { redirect } from "next/navigation";
import { clearDashboardSession } from "../../lib/dashboard/session";
import { consumePasswordResetToken, setUserPassword } from "../../lib/dashboard/users";

export interface SetPasswordActionState {
  ok: boolean;
  message: string;
}

export async function setPasswordAction(
  _state: SetPasswordActionState,
  formData: FormData,
): Promise<SetPasswordActionState> {
  const token = typeof formData.get("token") === "string" ? (formData.get("token") as string) : "";
  const password = typeof formData.get("password") === "string" ? (formData.get("password") as string) : "";
  const confirm = typeof formData.get("confirm") === "string" ? (formData.get("confirm") as string) : "";

  if (!token) {
    return { ok: false, message: "Token mancante o non valido." };
  }
  if (password.length < 8) {
    return { ok: false, message: "La password deve essere di almeno 8 caratteri." };
  }
  if (password !== confirm) {
    return { ok: false, message: "Le password non coincidono." };
  }

  const user = await consumePasswordResetToken(token);
  if (!user) {
    return { ok: false, message: "Link non valido o scaduto. Richiedi un nuovo link all'amministratore." };
  }

  await setUserPassword(user.id, password);

  // Clear any existing session (e.g. a platform-owner session open in the same browser)
  // before redirecting. The new user must authenticate from a clean state.
  await clearDashboardSession();
  redirect("/login?setup=done");
}
