"use server";

import { redirect } from "next/navigation";
import { authenticateDashboardUser, clearDashboardSession } from "../../lib/dashboard/session";

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
