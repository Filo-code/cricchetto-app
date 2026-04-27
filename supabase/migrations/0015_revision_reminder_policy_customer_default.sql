-- 0015_revision_reminder_policy_customer_default.sql
--
-- Revision expiry reminders target the vehicle owner (customer), not the mechanic.
-- Change the DB default and update all existing workshops that still carry the old
-- mechanic_only default, so reminders are routed to the customer via WhatsApp.
--
-- Scaling invariant: backend resolves tenant/channel/recipient; n8n only dispatches.
-- No per-workshop branching belongs in n8n workflows.

alter table public.workshop_settings
  alter column revision_reminder_recipient_policy set default 'customer_only';

-- Update every workshop that still has the historical mechanic_only default.
-- Workshops that explicitly opted into customer_only or both are untouched.
update public.workshop_settings
  set revision_reminder_recipient_policy = 'customer_only'
  where revision_reminder_recipient_policy = 'mechanic_only';
