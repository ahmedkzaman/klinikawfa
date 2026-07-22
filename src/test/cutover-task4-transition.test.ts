import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const runnerPath = "scripts/cutover/database-reconcile.ps1";
const runner = readFileSync(runnerPath, "utf8");
const lowerRunner = runner.toLowerCase();

const task4Migrations = [
  ["20260720111916", "20260720111916_add_website_editor_role.sql", "87F0EEA795BC99CE1CBA8BB799B6E25D7C3A313A54E309425FC47165B5125618"],
  ["20260720115031", "20260720115031_create_website_cms_foundation.sql", "A86DA7A8824CCF5BEF9033D9DC525C37D50AE6281AF0C060ED031995459E5D30"],
  ["20260720225347", "20260720225347_harden_website_cms_integration.sql", "E4987CFCBD91251FE6EE10881D7F67858265C735DD7FDFCE31E49FBF63ECB8EC"],
  ["20260721035032", "20260721035032_add_website_page_publishing.sql", "88BE2091198AECA44A556DF3A0C76C6AB6018FBA8149A0EE13F79C4AC92D4C39"],
  ["20260721100403", "20260721100403_switch_tracking_to_google.sql", "EB84C03BD376D0B9E5AE2A7E1A14B7E41F9AA04B54D663793DCC79EF987E37A1"],
  ["20260721162256", "20260721162256_restore_staff_messages.sql", "4E0C335C855C1338EDAB28429B7377DAC7768D796666B3FF315FF1B4A55C9FB0"],
  ["20260721170000", "20260721170000_create_general_website_page_rpc.sql", "4762C9B6791AB4C5E95FBFCC1F05F6BB703911D2D2DCE9DDDFD89456D2B922A4"],
  ["20260721174422", "20260721174422_preserve_source_cutover_fields.sql", "ECEBAE8DFB0CED17B2C0A1332E627846844C439DB945A5C705C95B53E3611217"],
] as const;

function functionBlock(name: string, nextName: string) {
  const start = lowerRunner.indexOf(`function ${name.toLowerCase()}`);
  const end = lowerRunner.indexOf(`function ${nextName.toLowerCase()}`, start + 1);
  expect(start, `${name} is missing`).toBeGreaterThan(-1);
  expect(end, `${nextName} is missing after ${name}`).toBeGreaterThan(start);
  return lowerRunner.slice(start, end);
}

function expectInOrder(text: string, markers: string[]) {
  let previous = -1;
  for (const marker of markers) {
    const index = text.indexOf(marker.toLowerCase());
    expect(index, `missing or reordered marker: ${marker}`).toBeGreaterThan(previous);
    previous = index;
  }
}

describe("Task 4 cutover transition safeguards", () => {
  it("executes the focused runtime contract, including self-consistent tamper rejection", async () => {
    const result = await execFileAsync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", "scripts/cutover/test-database-reconcile-task4.ps1"],
      { cwd: process.cwd(), encoding: "utf8", timeout: 180_000, windowsHide: true },
    );
    expect(`${result.stdout}\n${result.stderr}`).toContain("Task 4 runner focused contract passed");
  }, 190_000);

  it("binds exactly eight chronological migration identities to current file digests", () => {
    const specificationBlock = runner.match(/\$Task4MigrationSpecifications\s*=\s*@\(([\s\S]*?)\r?\n\)/)?.[1];
    expect(specificationBlock).toBeDefined();
    const entries = Array.from(
      specificationBlock!.matchAll(/version='(\d{14})';\s*file='([^']+)';\s*sha256='([A-F0-9]{64})'/g),
      (match) => [match[1], match[2], match[3]],
    );
    expect(entries).toEqual(task4Migrations.map((entry) => [...entry]));

    for (const [, file, expectedSha256] of task4Migrations) {
      const actualSha256 = createHash("sha256")
        .update(readFileSync(`supabase/migrations/${file}`))
        .digest("hex")
        .toUpperCase();
      expect(actualSha256, file).toBe(expectedSha256);
    }
  });

  it("restores disjoint TOC stages, proves the baseline, then applies all migrations once", () => {
    const block = functionBlock("invoke-rehearsephase", "assert-rehearsalreport");
    expectInOrder(block, [
      "assert-uniquetocselections",
      "restore target rehearsal storage schema prerequisite",
      "restore target rehearsal schema",
      "restore target rehearsal selected data",
      "restore target rehearsal storage bucket prerequisite data",
      "target scratch pre-constraint baseline counts",
      "restore target rehearsal constraints before task 4 migrations",
      "assert-task4scratchprerequisites",
      "invoke-task4scratchmigrations",
      "assert-task4localschemaanddependencies",
      "task 4 exact post-migration inventory",
      "rehearse selective application and portable auth loader",
    ]);
    expect(block).toContain("$task4postinventory.publictables -ne 102");
    expect(block).toContain("$task4postinventory.authusers -ne 0");
    expect(block).toContain("$task4postinventory.authidentities -ne 0");
    expect(block).toContain("$task4postinventory.migrationrows -ne 161");
  });

  it("authorizes Import only after evidence, completed transition, exact state, and schema gates", () => {
    const block = functionBlock("invoke-importphase", "invoke-rollbackphase");
    expectInOrder(block, [
      "assert-approvedarchive",
      "assert-verifiedbackup",
      "get-task4migrationbindings",
      "assert-task4validationevidence",
      "assert-rehearsalreport",
      "post-migration transition manifest is required",
      "assert-postmigrationtransitionmanifest",
      "get-targetinventory -includetask4contract",
      "assert-postmigrationtargetstate",
      "assert-task4schemaanddependencies",
      "assert-portableauthboundary",
      "new-boundloadersnapshot",
      "new-intransactionauthzeroloader",
      "invoke-targetfile",
      "post-import whole-target foreign-key audit",
      "assert-task4postimportresult",
      "write-protectedjson",
    ]);
    expect(block).not.toContain("invoke-verifyphase");
  });

  it("creates the completed transition only in protected artifacts after read-only post-migration gates", () => {
    const block = functionBlock("invoke-postmigrationphase", "invoke-importphase");
    expectInOrder(block, [
      "assert-approvedarchive",
      "assert-verifiedbackup",
      "assert-task4validationevidence",
      "assert-rehearsalreport",
      "get-targetinventory -includetask4contract",
      "assert-postmigrationtargetstate",
      "assert-task4schemaanddependencies",
      "write-protectedjson",
      "assert-postmigrationtransitionmanifest",
    ]);
    expect(block).not.toContain("invoke-targetfile");
    expect(lowerRunner).not.toContain(
      "invalidate-evidencefile -path (join-path $artifactroot $task4transitionmanifestname)",
    );
    expect(lowerRunner).toContain(
      "if ($phase -eq 'postmigration' -and (test-path -literalpath (join-path $artifactroot $importreportname))) { throw 'completed import evidence already exists; refusing to replace its transition dependency.' }",
    );
  });

  it("requires exact compatibility, dependency, private-schema, and FK contracts", () => {
    const contract = functionBlock("get-task4postcontractsql", "assert-task4postcontractresult");
    for (const marker of [
      "pg_jsonschema",
      "0.3.3",
      "clinic_services",
      "is_staff_or_admin",
      "is_clinical",
      "is_staff_or_clinical",
      "supabase_realtime",
      "has_schema_privilege",
      "information_schema.columns",
      "pg_get_constraintdef",
      "appointments_service_slug_fkey",
      "queue_entries_cancelled_by_fkey",
      "storage.buckets",
      "storage.foldername",
      "allowed_mime_types",
      "daily-reports",
      "google_tag",
      "private",
    ]) {
      expect(contract, marker).toContain(marker);
    }
  });

  it("accepts only a single trigger-disabled loader transaction with a final FK audit", () => {
    const boundary = functionBlock("assert-portableauthboundary", "new-intransactionauthzeroloader");
    expectInOrder(boundary, [
      "session_replication_role = replica",
      "session_replication_role = origin",
      "$foreign_key_audit$",
      "$commitindex = $loadertext.lastindexof('commit;'",
    ]);
    expect(boundary).toContain("$begincount -ne 1");
    expect(boundary).toContain("$commitcount -ne 1");
    expect(boundary).toContain("auth.sessions");
    expect(boundary).toContain("auth.refresh_tokens");
    expect(boundary).toContain("auth users and identities together");
  });

  it("locks and proves Auth zero inside the main transaction, then reconciles the committed import", () => {
    const guard = functionBlock("new-intransactionauthzeroloader", "new-boundloadersnapshot");
    const guardTemplate = guard.slice(guard.indexOf('$guard = @"'));
    expectInOrder(guardTemplate, [
      "lock table auth.users, auth.identities in access exclusive mode",
      "auth_zero_guard",
      "exists(select 1 from auth.users)",
      "exists(select 1 from auth.identities)",
      "$publiclocksql",
    ]);
    expect(guard).toContain("$lockedpublictables = @($publictables | sort-object)");
    expect(guard).toContain("owned_sequence_reconcile");
    expect(guard).toContain("sequence_reconcile");
    const guardAssertion = functionBlock("assert-intransactionauthzeroguard", "get-currentrehearsalbinding");
    expect(guardAssertion).toContain("$lockedtables.count -ne 93");
    for (const binding of [
      ["public.client_invoice_seq", "2", "true"],
      ["public.patient_reg_no_seq", "117", "true"],
      ["public.queue_number_seq", "1148", "true"],
    ]) {
      expect(guard).toContain(`pg_catalog.setval('${binding[0]}'::regclass,${binding[1]},${binding[2]})`);
    }
    const importBlock = functionBlock("invoke-importphase", "invoke-rollbackphase");
    for (const marker of [
      "post-import whole-target foreign-key audit",
      "authusers -ne 11",
      "authidentities -ne 11",
      "profilesmapped -ne 11",
      "refreshTokens",
      "approvedservicestrings",
      "task4-import-integrity-report.json",
    ]) {
      expect(lowerRunner, marker).toContain(marker.toLowerCase());
    }
    expect(importBlock).toContain("new-boundloadersnapshot");
    expect(importBlock).toContain("mainloadersha256 = (get-filehash -literalpath $mainsnapshot");
    expect(lowerRunner).toContain("if ($phase -eq 'rollback') {");
    expect(lowerRunner).not.toContain(
      "invalidate-evidencefile -path (join-path $artifactroot $importreportname)",
    );
    expect(lowerRunner).toContain(
      "if ($phase -eq 'import' -and (test-path -literalpath (join-path $artifactroot $importreportname))) { throw 'completed import evidence already exists; refusing a repeated persistent phase.' }",
    );
  });

  it("pins all accepted composite evidence digests", () => {
    expect(runner).toContain("29E6CD5499FBF52E46D68DDFAA456514587FDE32690A7879197AED4F11D669A3");
    expect(runner).toContain("39EA9CEBCD521D6AA178DC10716FCE06CDF4269EE06D2A6BE9AB8A3D5C6BD619");
    expect(runner).toContain("9AE7693B8B06E1CECDD6AABEA91A4D399E204184175028C3BF6EBBFCE59297CC");
  });
});
