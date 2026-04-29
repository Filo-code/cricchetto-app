import { normalizeCustomerPhone } from "./phones";
import { supabaseServer } from "./supabase-server";

export interface StaffMember {
  id: string;
  displayName: string;
  phone: string;
  phoneNormalized: string;
  role: "owner" | "staff";
  isActive: boolean;
  createdAt: string;
}

// WhatsApp senderIdentifier arrives as "393481234567" (no +). Prepend + for comparison.
function toE164(senderIdentifier: string): string {
  const trimmed = senderIdentifier.trim();
  return trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
}

export function normalizeStaffPhone(input: string): string | null {
  return normalizeCustomerPhone(input);
}

export async function resolveAuthorizedStaffByPhone(
  workshopId: string,
  senderIdentifier: string,
): Promise<StaffMember | null> {
  const normalized = toE164(senderIdentifier);
  const { data, error } = await supabaseServer
    .from("workshop_staff_members")
    .select("id,display_name,phone,phone_normalized,role,is_active,created_at")
    .eq("workshop_id", workshopId)
    .eq("phone_normalized", normalized)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve authorized staff: ${error.message}`);
  }

  return data ? toStaffMember(data) : null;
}

export async function listWorkshopStaff(workshopId: string): Promise<StaffMember[]> {
  const { data, error } = await supabaseServer
    .from("workshop_staff_members")
    .select("id,display_name,phone,phone_normalized,role,is_active,created_at")
    .eq("workshop_id", workshopId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to list workshop staff: ${error.message}`);
  return (data ?? []).map(toStaffMember);
}

export async function addWorkshopStaffMember(
  workshopId: string,
  input: { displayName: string; phone: string; role: "owner" | "staff" },
): Promise<StaffMember> {
  const phoneNormalized = normalizeStaffPhone(input.phone);
  if (!phoneNormalized) {
    throw new Error("Numero di telefono non valido.");
  }

  const { data, error } = await supabaseServer
    .from("workshop_staff_members")
    .insert({
      workshop_id: workshopId,
      display_name: input.displayName.trim(),
      phone: input.phone.trim(),
      phone_normalized: phoneNormalized,
      role: input.role,
    })
    .select("id,display_name,phone,phone_normalized,role,is_active,created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("Questo numero è già registrato per questa officina.");
    }
    throw new Error(`Failed to add staff member: ${error.message}`);
  }

  return toStaffMember(data);
}

export async function deactivateWorkshopStaffMember(workshopId: string, staffId: string): Promise<void> {
  const { error } = await supabaseServer
    .from("workshop_staff_members")
    .update({ is_active: false })
    .eq("workshop_id", workshopId)
    .eq("id", staffId);

  if (error) throw new Error(`Failed to deactivate staff member: ${error.message}`);
}

function toStaffMember(row: Record<string, unknown>): StaffMember {
  return {
    id: row.id as string,
    displayName: row.display_name as string,
    phone: row.phone as string,
    phoneNormalized: row.phone_normalized as string,
    role: row.role as "owner" | "staff",
    isActive: row.is_active as boolean,
    createdAt: row.created_at as string,
  };
}
