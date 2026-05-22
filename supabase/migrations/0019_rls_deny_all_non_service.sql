-- Defense-in-depth: explicitly deny all access from anon and authenticated roles.
-- The backend uses the service_role key which bypasses RLS entirely (correct).
-- These policies ensure that if anyone uses the anon key or a Supabase Auth JWT
-- (e.g. a leaked key, a misconfigured client, or a dev mistake), they see nothing.
--
-- ALTER TABLE ... ENABLE ROW LEVEL SECURITY is idempotent — safe to repeat.
-- All policies use USING (false) WITH CHECK (false) = deny everything.

-- Helper: create both deny policies for a table in one shot.
-- We create named policies so they appear clearly in the Supabase dashboard.

-- workshops
alter table workshops enable row level security;
drop policy if exists "deny_anon_workshops" on workshops;
drop policy if exists "deny_authenticated_workshops" on workshops;
create policy "deny_anon_workshops" on workshops for all to anon using (false) with check (false);
create policy "deny_authenticated_workshops" on workshops for all to authenticated using (false) with check (false);

-- workshop_settings
alter table workshop_settings enable row level security;
drop policy if exists "deny_anon_workshop_settings" on workshop_settings;
drop policy if exists "deny_authenticated_workshop_settings" on workshop_settings;
create policy "deny_anon_workshop_settings" on workshop_settings for all to anon using (false) with check (false);
create policy "deny_authenticated_workshop_settings" on workshop_settings for all to authenticated using (false) with check (false);

-- workshop_channels
alter table workshop_channels enable row level security;
drop policy if exists "deny_anon_workshop_channels" on workshop_channels;
drop policy if exists "deny_authenticated_workshop_channels" on workshop_channels;
create policy "deny_anon_workshop_channels" on workshop_channels for all to anon using (false) with check (false);
create policy "deny_authenticated_workshop_channels" on workshop_channels for all to authenticated using (false) with check (false);

-- customers
alter table customers enable row level security;
drop policy if exists "deny_anon_customers" on customers;
drop policy if exists "deny_authenticated_customers" on customers;
create policy "deny_anon_customers" on customers for all to anon using (false) with check (false);
create policy "deny_authenticated_customers" on customers for all to authenticated using (false) with check (false);

-- vehicles
alter table vehicles enable row level security;
drop policy if exists "deny_anon_vehicles" on vehicles;
drop policy if exists "deny_authenticated_vehicles" on vehicles;
create policy "deny_anon_vehicles" on vehicles for all to anon using (false) with check (false);
create policy "deny_authenticated_vehicles" on vehicles for all to authenticated using (false) with check (false);

-- vehicle_revision_events
alter table vehicle_revision_events enable row level security;
drop policy if exists "deny_anon_vehicle_revision_events" on vehicle_revision_events;
drop policy if exists "deny_authenticated_vehicle_revision_events" on vehicle_revision_events;
create policy "deny_anon_vehicle_revision_events" on vehicle_revision_events for all to anon using (false) with check (false);
create policy "deny_authenticated_vehicle_revision_events" on vehicle_revision_events for all to authenticated using (false) with check (false);

-- work_order_number_sequences
alter table work_order_number_sequences enable row level security;
drop policy if exists "deny_anon_work_order_number_sequences" on work_order_number_sequences;
drop policy if exists "deny_authenticated_work_order_number_sequences" on work_order_number_sequences;
create policy "deny_anon_work_order_number_sequences" on work_order_number_sequences for all to anon using (false) with check (false);
create policy "deny_authenticated_work_order_number_sequences" on work_order_number_sequences for all to authenticated using (false) with check (false);

-- work_orders
alter table work_orders enable row level security;
drop policy if exists "deny_anon_work_orders" on work_orders;
drop policy if exists "deny_authenticated_work_orders" on work_orders;
create policy "deny_anon_work_orders" on work_orders for all to anon using (false) with check (false);
create policy "deny_authenticated_work_orders" on work_orders for all to authenticated using (false) with check (false);

-- work_order_items
alter table work_order_items enable row level security;
drop policy if exists "deny_anon_work_order_items" on work_order_items;
drop policy if exists "deny_authenticated_work_order_items" on work_order_items;
create policy "deny_anon_work_order_items" on work_order_items for all to anon using (false) with check (false);
create policy "deny_authenticated_work_order_items" on work_order_items for all to authenticated using (false) with check (false);

-- work_order_notes
alter table work_order_notes enable row level security;
drop policy if exists "deny_anon_work_order_notes" on work_order_notes;
drop policy if exists "deny_authenticated_work_order_notes" on work_order_notes;
create policy "deny_anon_work_order_notes" on work_order_notes for all to anon using (false) with check (false);
create policy "deny_authenticated_work_order_notes" on work_order_notes for all to authenticated using (false) with check (false);

-- work_order_audit_events
alter table work_order_audit_events enable row level security;
drop policy if exists "deny_anon_work_order_audit_events" on work_order_audit_events;
drop policy if exists "deny_authenticated_work_order_audit_events" on work_order_audit_events;
create policy "deny_anon_work_order_audit_events" on work_order_audit_events for all to anon using (false) with check (false);
create policy "deny_authenticated_work_order_audit_events" on work_order_audit_events for all to authenticated using (false) with check (false);

-- documents
alter table documents enable row level security;
drop policy if exists "deny_anon_documents" on documents;
drop policy if exists "deny_authenticated_documents" on documents;
create policy "deny_anon_documents" on documents for all to anon using (false) with check (false);
create policy "deny_authenticated_documents" on documents for all to authenticated using (false) with check (false);

-- intake_sessions
alter table intake_sessions enable row level security;
drop policy if exists "deny_anon_intake_sessions" on intake_sessions;
drop policy if exists "deny_authenticated_intake_sessions" on intake_sessions;
create policy "deny_anon_intake_sessions" on intake_sessions for all to anon using (false) with check (false);
create policy "deny_authenticated_intake_sessions" on intake_sessions for all to authenticated using (false) with check (false);

-- reminders
alter table reminders enable row level security;
drop policy if exists "deny_anon_reminders" on reminders;
drop policy if exists "deny_authenticated_reminders" on reminders;
create policy "deny_anon_reminders" on reminders for all to anon using (false) with check (false);
create policy "deny_authenticated_reminders" on reminders for all to authenticated using (false) with check (false);

-- message_logs
alter table message_logs enable row level security;
drop policy if exists "deny_anon_message_logs" on message_logs;
drop policy if exists "deny_authenticated_message_logs" on message_logs;
create policy "deny_anon_message_logs" on message_logs for all to anon using (false) with check (false);
create policy "deny_authenticated_message_logs" on message_logs for all to authenticated using (false) with check (false);

-- attachments
alter table attachments enable row level security;
drop policy if exists "deny_anon_attachments" on attachments;
drop policy if exists "deny_authenticated_attachments" on attachments;
create policy "deny_anon_attachments" on attachments for all to anon using (false) with check (false);
create policy "deny_authenticated_attachments" on attachments for all to authenticated using (false) with check (false);

-- workshop_users (added in 0008)
alter table workshop_users enable row level security;
drop policy if exists "deny_anon_workshop_users" on workshop_users;
drop policy if exists "deny_authenticated_workshop_users" on workshop_users;
create policy "deny_anon_workshop_users" on workshop_users for all to anon using (false) with check (false);
create policy "deny_authenticated_workshop_users" on workshop_users for all to authenticated using (false) with check (false);

-- password_reset_tokens (added in 0008)
alter table password_reset_tokens enable row level security;
drop policy if exists "deny_anon_password_reset_tokens" on password_reset_tokens;
drop policy if exists "deny_authenticated_password_reset_tokens" on password_reset_tokens;
create policy "deny_anon_password_reset_tokens" on password_reset_tokens for all to anon using (false) with check (false);
create policy "deny_authenticated_password_reset_tokens" on password_reset_tokens for all to authenticated using (false) with check (false);

-- workshop_profiles (added in 0011)
alter table workshop_profiles enable row level security;
drop policy if exists "deny_anon_workshop_profiles" on workshop_profiles;
drop policy if exists "deny_authenticated_workshop_profiles" on workshop_profiles;
create policy "deny_anon_workshop_profiles" on workshop_profiles for all to anon using (false) with check (false);
create policy "deny_authenticated_workshop_profiles" on workshop_profiles for all to authenticated using (false) with check (false);

-- workshop_document_templates (added in 0012)
alter table workshop_document_templates enable row level security;
drop policy if exists "deny_anon_workshop_document_templates" on workshop_document_templates;
drop policy if exists "deny_authenticated_workshop_document_templates" on workshop_document_templates;
create policy "deny_anon_workshop_document_templates" on workshop_document_templates for all to anon using (false) with check (false);
create policy "deny_authenticated_workshop_document_templates" on workshop_document_templates for all to authenticated using (false) with check (false);

-- workshop_staff_members (added in 0017)
alter table workshop_staff_members enable row level security;
drop policy if exists "deny_anon_workshop_staff_members" on workshop_staff_members;
drop policy if exists "deny_authenticated_workshop_staff_members" on workshop_staff_members;
create policy "deny_anon_workshop_staff_members" on workshop_staff_members for all to anon using (false) with check (false);
create policy "deny_authenticated_workshop_staff_members" on workshop_staff_members for all to authenticated using (false) with check (false);
