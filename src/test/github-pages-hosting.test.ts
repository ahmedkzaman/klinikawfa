import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "../..");
const workflowPath = resolve(repoRoot, ".github/workflows/deploy-pages.yml");
const cnamePath = resolve(repoRoot, "public/CNAME");

const readWorkflow = () => readFileSync(workflowPath, "utf8");

describe("GitHub Pages hosting", () => {
  const fixedClinicRoutes = [
    "clinic",
    "clinic/queue",
    "clinic/appointments",
    "clinic/video-calls",
    "clinic/patients",
    "clinic/consultation",
    "clinic/dispensary",
    "clinic/procurement",
    "clinic/procurement-dashboard",
    "clinic/seasonal-forecast",
    "clinic/billings",
    "clinic/panel-claims",
    "clinic/receivables",
    "clinic/inventory",
    "clinic/inventory/restock-review",
    "clinic/owe-slips",
    "clinic/insight",
    "clinic/settings",
    "clinic/settings/clinic-profile",
    "clinic/settings/preferences",
    "clinic/settings/users",
    "clinic/settings/locum-registration",
    "clinic/settings/inventory",
    "clinic/settings/diagnoses",
    "clinic/settings/panels",
    "clinic/settings/drug-label",
    "clinic/settings/documents",
    "clinic/settings/document-templates",
    "clinic/settings/charges",
    "clinic/settings/queue",
    "clinic/settings/procurement-rules",
    "clinic/voided",
    "staff",
    "admin",
  ];

  it("deploys only successful Security Gate commits from main", () => {
    const workflow = readWorkflow();
    expect(workflow).toContain('workflows: ["Security Gate"]');
    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain("types: [completed]");
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(workflow).toContain("github.event.workflow_run.head_branch == 'main'");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("security-and-type-check");
    expect(workflow).not.toContain("pull_request:");
  });

  it("uses immutable reviewed action pins and least privilege", () => {
    const workflow = readWorkflow();
    expect(workflow).toContain("actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0");
    expect(workflow).toContain("actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e");
    expect(workflow).toContain("actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d");
    expect(workflow).toContain("actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9");
    expect(workflow).toContain("actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("checks: read");
    expect(workflow).toContain("pages: write");
    expect(workflow).toContain("id-token: write");
  });

  it("builds with frontend-only Supabase variables and prepares the SPA artifact", () => {
    const workflow = readWorkflow();
    expect(workflow).toContain("VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}");
    expect(workflow).toContain("VITE_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.VITE_SUPABASE_PUBLISHABLE_KEY }}");
    expect(workflow).toContain("VITE_SUPABASE_PROJECT_ID: ${{ secrets.VITE_SUPABASE_PROJECT_ID }}");
    expect(workflow).toContain("run: npm run build");
    expect(workflow).toContain("cp dist/index.html dist/404.html");
    expect(workflow).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).toContain("find dist -type f -name '*.map'");
    expect(workflow).toContain("path: ./dist");
  });

  it("declares the approved production domain", () => {
    expect(readFileSync(cnamePath, "utf8").trim()).toBe("klinikawfa.com");
  });

  it("pre-renders every fixed clinic portal and staff routes", () => {
    const workflow = readWorkflow();

    for (const route of fixedClinicRoutes) {
      expect(workflow).toContain(`\n            ${route}\n`);
      expect(workflow).toContain(`mkdir -p "dist/${route}"`);
      expect(workflow).toContain(`cp dist/index.html "dist/${route}/index.html"`);
    }
  });
});
