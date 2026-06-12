import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const matrixPath = resolve(process.cwd(), "docs/security/rls-test-matrix.json");
const matrix = JSON.parse(readFileSync(matrixPath, "utf8"));

type CanonicalGroup =
  | "special_admin"
  | "admin"
  | "doctor"
  | "ops"
  | "locum"
  | "guest";

type MatrixCapability = {
  id: string;
  expected: Record<CanonicalGroup, string>;
};

const canonicalGroups = matrix.canonicalGroups as Record<CanonicalGroup, string[]>;
const capabilities = matrix.capabilities as MatrixCapability[];

function capability(id: string): MatrixCapability {
  const found = capabilities.find((item) => item.id === id);
  if (!found) {
    throw new Error(`Missing RLS matrix capability: ${id}`);
  }
  return found;
}

describe("RLS role matrix scaffolding", () => {
  it("documents this PR as a non-connecting safe foundation", () => {
    expect(matrix.status).toBe("safe-foundation-only");
    expect(matrix.databaseConnectionRequired).toBe(false);
  });

  it("groups DocM3d clinical and operations roles exactly as approved", () => {
    expect(canonicalGroups.special_admin).toEqual(["special_admin"]);
    expect(canonicalGroups.admin).toEqual(["admin"]);
    expect(canonicalGroups.doctor).toEqual([
      "doctor_admin",
      "resident_doctor",
    ]);
    expect(canonicalGroups.ops).toEqual([
      "ops_staff",
      "operations",
      "staff",
    ]);
    expect(canonicalGroups.locum).toEqual(["locum"]);
  });

  it("keeps only special_admin allowed for top-admin sensitive actions", () => {
    for (const capabilityId of [
      "assign_roles",
      "view_secrets",
      "destructive_admin_actions",
    ]) {
      const expected = capability(capabilityId).expected;

      expect(expected.special_admin).toBe("allow");
      expect(expected.admin).toBe("deny");
      expect(expected.doctor).toBe("deny");
      expect(expected.ops).toBe("deny");
      expect(expected.locum).toBe("deny");
      expect(expected.guest).toBe("deny");
    }
  });

  it("documents admin staff portal access for special_admin and admin only", () => {
    const expected = capability("admin_staff_portal_access").expected;

    expect(expected.special_admin).toBe("allow");
    expect(expected.admin).toBe("allow");
    expect(expected.doctor).toBe("deny");
    expect(expected.ops).toBe("deny");
    expect(expected.locum).toBe("deny");
    expect(expected.guest).toBe("deny");
  });

  it("documents PHI access and locum assigned-patient-only history", () => {
    for (const capabilityId of [
      "read_all_patients",
      "search_export_patient_records",
      "historical_consultations_vitals",
    ]) {
      const expected = capability(capabilityId).expected;

      expect(expected.special_admin).toBe("allow");
      expect(expected.admin).toBe("allow");
      expect(expected.doctor).toBe("allow");
      expect(expected.ops).toBe("allow");
    }

    expect(capability("read_all_patients").expected.locum).toBe(
      "deny_assigned_patient_only",
    );
    expect(capability("historical_consultations_vitals").expected.locum).toBe(
      "scoped_assigned_patient_only",
    );
  });

  it("documents locum item rules without allowing price visibility", () => {
    expect(capability("key_in_items").expected.locum).toBe(
      "allow_assigned_patient_only",
    );
    expect(capability("view_stock_quantity").expected.locum).toBe("allow");
    expect(capability("view_item_prices").expected.locum).toBe("deny");
  });

  it("documents billing, package, and video decisions from DocM3d", () => {
    expect(capability("create_update_delete_payments").expected.doctor).toBe(
      "allow",
    );
    expect(capability("view_panel_claims").expected.ops).toBe("allow");
    expect(capability("view_einvoices_tax_billing").expected.doctor).toBe(
      "deny",
    );
    expect(
      capability("void_refund_delete_financial_records").expected.doctor,
    ).toBe("deny");
    expect(
      capability("update_package_pricing_vendor_invoices").expected.ops,
    ).toBe("deny");
    expect(capability("video_room_lookup").expected.guest).toBe("deny");
    expect(capability("video_lookup_returns_patient_name").expected.doctor).toBe(
      "allow",
    );
    expect(capability("anonymous_public_review_insert").expected.guest).toBe(
      "deny",
    );
  });

  it("documents guest as denied for protected clinical/admin capabilities", () => {
    for (const item of capabilities) {
      expect(item.expected.guest, item.id).toBe("deny");
    }
  });
});
