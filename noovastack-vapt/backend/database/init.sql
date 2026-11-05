-- NoovaStack VAPT Platform Database Initialization
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- Tables and seed data are managed by the application

-- Audit-log filters use these indexes for recent, monthly, and yearly ranges.
DO $$
BEGIN
    IF to_regclass('public.audit_logs') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS ix_audit_logs_created_at ON audit_logs (created_at);
        CREATE INDEX IF NOT EXISTS ix_audit_logs_event_type_created_at ON audit_logs (event_type, created_at);
    END IF;
END $$;
