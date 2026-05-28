-- Add per-workshop provider configuration for multi-provider WhatsApp support.
-- Meta (meta_whatsapp_cloud_api): provider_config is {} — uses global env vars.
-- Twilio (twilio_whatsapp): provider_config contains {"from_number": "whatsapp:+39..."}.
ALTER TABLE workshop_channels ADD COLUMN IF NOT EXISTS provider_config jsonb NOT NULL DEFAULT '{}';
