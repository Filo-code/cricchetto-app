"use server";

import { redirect } from "next/navigation";
import { authenticateDashboardUser, clearDashboardSession, peekDashboardSession } from "../../lib/dashboard/session";
import { isPlatformSession } from "../../lib/admin/platform-session";

export interface LoginActionState {
  ok: boolean;
  message: string;
}

export async function loginAction(_state: LoginActionState, formData: FormData): Promise<LoginActionState> {
  try {
    await authenticateDashboardUser({
      email: textValue(formData, "email"),
      password: textValue(formData, "password"),
    });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Accesso non riuscito.",
    };
  }

  const session = await peekDashboardSession();
  if (session && isPlatformSession(session)) {
    redirect("/admin/workshops");
  }
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await clearDashboardSession();
  redirect("/login");
}

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
