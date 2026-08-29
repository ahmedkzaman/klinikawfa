-- Revoke anon execute on SECURITY DEFINER functions and move pg_trgm to extensions schema.
-- Applied to production via Supabase MCP on 2026-08-29 (name: revoke_anon_security_definer_and_move_trgm).
-- Result: anon-executable SECURITY DEFINER functions 57 -> 24; pg_trgm moved out of public schema.
-- The remaining 24 anon-executable functions are either public-by-design
-- (record_appointment_submission for the public booking form) or return-only helpers.

BEGIN;

-- Tier 1: No internal auth check
REVOKE EXECUTE ON FUNCTION public._resolve_inventory_item_id(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_appointment_submission_log() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.safe_reset_queue_number_seq() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_inventory_batches() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_diagnosis_correlation() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cap_panel_claim_to_patient_balance() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_import_mapping_batch_source() FROM anon, authenticated;

-- Tier 2: Has internal auth check, still revoke anon
REVOKE EXECUTE ON FUNCTION public.admin_assign_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.intake_appointment_to_queue(uuid, uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.promote_appointment_to_clinic(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public._promote_appointment_to_clinic_internal(uuid, text) FROM anon;

-- Tier 3: Data-exposing read functions
REVOKE EXECUTE ON FUNCTION public.get_next_queue_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_video_room_signaling(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_doctors_on_duty(date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_clinic_permission_matrix() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_clinic_user_permission_details(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_doctor_id_for_user(uuid) FROM anon;

-- Tier 4: Inventory/finance operations
REVOKE EXECUTE ON FUNCTION public.add_inventory_batch(uuid, text, date, integer, numeric, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.adjust_inventory_batch(uuid, integer, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.available_quantity(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.commit_inventory(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.commit_inventory_fefo(uuid, integer, uuid, uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.release_inventory(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reserve_inventory(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fulfill_owe_slip(uuid, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_po_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.recalc_client_invoice_total(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.recalc_po_total(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.receive_purchase_order(uuid) FROM anon;

-- Tier 5: Role/permission helpers (used in RLS policies, keep authenticated)
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_clinical(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_finance_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_internal_staff(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_ops_or_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_special_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_staff_or_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_staff_or_clinical(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_strict_role(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_clinic_permission(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_clinic_permissions(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_imports(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_inventory(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_view_inventory_costs(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_edit_dispensary_prices(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_read_cross_doctor_consultation(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_read_operational_consultations(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_clinic_permission(app_role, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_clinic_user_permission_override(uuid, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reset_clinic_user_permission_override(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_roster_zone_assignments(integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_roster_zone_assignments(uuid) FROM anon;

-- Tier 6: Website publishing functions
REVOKE EXECUTE ON FUNCTION public.publish_website_navigation(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.publish_website_resource(text, uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.restore_website_navigation_version(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.restore_website_resource_version(text, uuid, uuid) FROM anon;

-- record_appointment_submission intentionally stays anon-callable:
-- it is the public appointment booking form, already rate-limited internally.

-- Move pg_trgm out of the public schema (Supabase lint 0013 extension_in_public).
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

COMMIT;
