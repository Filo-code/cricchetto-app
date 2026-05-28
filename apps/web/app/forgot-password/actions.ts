"use server";

import { findWorkshopUserByEmail, generatePasswordResetToken } from "../../lib/dashboard/users";

export interface ForgotPasswordActionState {
  ok: boolean;
  submitted: boolean;
}

const GENERIC_RESPONSE: ForgotPasswordActionState = { ok: true, submitted: true };

export async function forgotPasswordAction(
  _state: ForgotPasswordActionState,
  formData: FormData,
): Promise<ForgotPasswordActionState> {
  const email = typeof formData.get("email") === "string"
    ? (formData.get("email") as string).trim().toLowerCase()
    : "";

  if (!email) {
    return GENERIC_RESPONSE;
  }

  try {
    const user = await findWorkshopUserByEmail(email).catch(() => null);

    if (user && user.isActive) {
      const { token, expiresAt } = await generatePasswordResetToken(user.id);

      const baseUrl = process.env.Cricchetto_BACKEND_BASE_URL ?? "";
      const resetLink = `${baseUrl}/set-password?token=${token}`;

      if (process.env.NODE_ENV !== "production") {
        // Dev convenience only — never expose the link in the browser or logs in prod.
        console.info("[forgot-password] reset_link_dev", { email, resetLink, expiresAt });
      }

      // P1 MISSING: Email delivery requires SMTP configuration.
      // Add Cricchetto_SMTP_HOST / SMTP_USER / SMTP_PASS / MAIL_FROM to .env
      // and integrate a mail library (e.g. nodemailer) to send the reset link.
      // Until then, the token is only logged to the server console in development.
      console.warn("[forgot-password] email_delivery_not_configured — reset link not sent to user");
    }
  } catch (err) {
    console.error("[forgot-password] action_error", {
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }

  // Always return generic response — never reveal email existence.
  return GENERIC_RESPONSE;
}
