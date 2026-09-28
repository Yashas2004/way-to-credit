-- Append-only, enforced by the database itself. Grants alone (the CLAUDE.md
-- deployment checklist) don't bind table owners or superusers, so they can't
-- be tested locally where the app connects as a superuser; these triggers
-- fire for every role, owners and superusers included.
--
-- - issue_messages: a sent message (or status event) is part of the record.
--   No UPDATE, DELETE or TRUNCATE; a correction is a new message.
-- - issues: a help request changes status but never disappears. UPDATE is
--   allowed (status, activity and read markers); DELETE and TRUNCATE are not.
-- - audit_log: CLAUDE.md invariant 15, previously enforced only by production
--   grants.
CREATE FUNCTION forbid_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER issue_messages_immutable BEFORE UPDATE OR DELETE ON issue_messages
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER issue_messages_no_truncate BEFORE TRUNCATE ON issue_messages
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER issues_never_deleted BEFORE DELETE ON issues
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER issues_no_truncate BEFORE TRUNCATE ON issues
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
