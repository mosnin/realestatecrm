-- Remove Retell/Twilio-related schema objects
DROP TABLE IF EXISTS "RetellAgent";
DROP TABLE IF EXISTS "Lead";

DROP TYPE IF EXISTS "TelephonyType";
DROP TYPE IF EXISTS "AgentStatus";
DROP TYPE IF EXISTS "LeadScore";
DROP TYPE IF EXISTS "LeadIntent";
