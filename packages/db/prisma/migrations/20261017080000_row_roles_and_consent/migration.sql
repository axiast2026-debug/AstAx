-- Phase 3, before the auctions: row rules that until now only the API enforced
-- (debts of phase 2 in docs/stato.md).
--   1. The database knows the role of the active membership (`app.role`):
--      parameters, lists, holidays and legal texts are written only by the
--      administrator (and system jobs), not by the whole back office.
--   2. The audit log is read by the back office roles that may read it and,
--      in an organization, by its owner (VIS-08); no longer by every member.
--   3. A consent is created only by the API after checking the code, the link
--      or the uploaded form (system step); its owner can only revoke it (LEG-04).
--   4. A user creates notifications only for themself; the notification service
--      writes the others' in a system step.

CREATE FUNCTION app_current_role() RETURNS text
  LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.role', true), '') $$;

CREATE FUNCTION app_is_admin() RETURNS boolean
  LANGUAGE sql STABLE AS
$$ SELECT app_is_system()
     OR (coalesce(current_setting('app.is_staff', true), '') = 'true' AND app_current_role() = 'ADMIN') $$;

-- 1. Global reference data
DROP POLICY setting_insert ON "Setting";
CREATE POLICY setting_insert ON "Setting" FOR INSERT WITH CHECK (app_is_admin());

DROP POLICY list_value_write ON "ListValue";
CREATE POLICY list_value_write ON "ListValue" FOR ALL
  USING (app_is_admin()) WITH CHECK (app_is_admin());

DROP POLICY holiday_write ON "Holiday";
CREATE POLICY holiday_write ON "Holiday" FOR ALL
  USING (app_is_admin()) WITH CHECK (app_is_admin());

DROP POLICY legal_document_write ON "LegalDocument";
CREATE POLICY legal_document_write ON "LegalDocument" FOR ALL
  USING (app_is_admin()) WITH CHECK (app_is_admin());

DROP POLICY legal_document_version_write ON "LegalDocumentVersion";
CREATE POLICY legal_document_version_write ON "LegalDocumentVersion" FOR ALL
  USING (app_is_admin()) WITH CHECK (app_is_admin());

-- 2. Audit log
DROP POLICY audit_log_select ON "AuditLog";
CREATE POLICY audit_log_select ON "AuditLog" FOR SELECT USING (
  app_is_system()
  OR (app_is_privileged() AND app_current_role() IN ('BO_SUPPORT', 'BO_SUPERVISOR', 'ADMIN'))
  OR ("actorOrganizationId" = app_current_org_id() AND app_current_role() = 'OWNER')
);

-- 3. Consents
DROP POLICY consent_owner ON "Consent";
CREATE POLICY consent_select ON "Consent" FOR SELECT
  USING (app_owns_row("ownerUserId", "ownerOrganizationId"));
CREATE POLICY consent_insert ON "Consent" FOR INSERT WITH CHECK (app_is_system());
CREATE POLICY consent_update ON "Consent" FOR UPDATE
  USING (app_owns_row("ownerUserId", "ownerOrganizationId"))
  WITH CHECK (app_owns_row("ownerUserId", "ownerOrganizationId"));
REVOKE DELETE, TRUNCATE ON TABLE "Consent" FROM astax_app;

CREATE FUNCTION consent_guard_update() RETURNS trigger
  LANGUAGE plpgsql AS
$$ BEGIN
  IF app_is_system() THEN RETURN NEW; END IF;
  IF OLD."revokedAt" IS NOT NULL OR NEW."revokedAt" IS NULL
     OR (to_jsonb(NEW) - 'revokedAt') IS DISTINCT FROM (to_jsonb(OLD) - 'revokedAt') THEN
    RAISE EXCEPTION 'A consent can only be revoked' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER consent_guard_update BEFORE UPDATE ON "Consent"
  FOR EACH ROW EXECUTE FUNCTION consent_guard_update();

-- 4. Notifications
DROP POLICY notification_insert ON "Notification";
CREATE POLICY notification_insert ON "Notification" FOR INSERT
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
