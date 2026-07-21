# Task 4 Report — Database Cutover Transition Safeguards

## Outcome

Task 4 is ready at the pre-persistent-write boundary. No migration push, import, rollback, or other persistent target write was performed while implementing or validating this task.

The final live `Verify` phase passed read-only on 2026-07-22. The target remains at the exact approved pre-cutover baseline:

- public tables: 93
- Auth users / identities: 0 / 0
- migration rows: 153
- ordered migration identity SHA-256: `5EE4FF324B59CA8775A18D9F4674F6A72AA64CDC782DF640ECC67B3BAE59F9DB`
- schema SHA-256: `A01DD4E5B0EB41B6DC67B5F43D9A6548EFFC20C8A94DF511CA66E8D53E7DAAC1`
- extended schema SHA-256: `1B4E08D71B3FAE4824A90F0A361826638B2F2EE2EFABEA360BF157BDEB931393`

The post-migration transition manifest and import-integrity report are intentionally absent. `Import` therefore remains fail-closed until the exact migrations have been persistently applied and `PostMigration` has written and immediately revalidated the protected transition manifest.

## Exact migration transition

The runtime binds, hashes, orders, applies, and audits exactly these eight migrations:

1. `20260720111916_add_website_editor_role.sql` — `87F0EEA795BC99CE1CBA8BB799B6E25D7C3A313A54E309425FC47165B5125618`
2. `20260720115031_create_website_cms_foundation.sql` — `A86DA7A8824CCF5BEF9033D9DC525C37D50AE6281AF0C060ED031995459E5D30`
3. `20260720225347_harden_website_cms_integration.sql` — `E4987CFCBD91251FE6EE10881D7F67858265C735DD7FDFCE31E49FBF63ECB8EC`
4. `20260721035032_add_website_page_publishing.sql` — `88BE2091198AECA44A556DF3A0C76C6AB6018FBA8149A0EE13F79C4AC92D4C39`
5. `20260721100403_switch_tracking_to_google.sql` — `EB84C03BD376D0B9E5AE2A7E1A14B7E41F9AA04B54D663793DCC79EF987E37A1`
6. `20260721162256_restore_staff_messages.sql` — `4E0C335C855C1338EDAB28429B7377DAC7768D796666B3FF315FF1B4A55C9FB0`
7. `20260721170000_create_general_website_page_rpc.sql` — `4762C9B6791AB4C5E95FBFCC1F05F6BB703911D2D2DCE9DDDFD89456D2B922A4`
8. `20260721174422_preserve_source_cutover_fields.sql` — `ECEBAE8DFB0CED17B2C0A1332E627846844C439DB945A5C705C95B53E3611217`

The exact authorized post-migration state is 102 public tables, Auth 0 / 0, and 161 ordered migration rows, with:

- ordered migration identity SHA-256: `CABCDA8EDC9EB465D59E684C4DCCDE39E20678F4C637C114DB37E8360A28878A`
- schema SHA-256: `5E70E082CDB430CFF8751E79229E06EE89611F6B3309B2DBD7B898213E69FFAC`
- extended schema SHA-256: `89447EF06C2151EFF91D379291C9028E966FA9F45864FC6B5198B7C2623CD946`
- `pg_jsonschema` version: `0.3.3`

## Import safety and integrity

The cutover runner now enforces:

- self-hashed, independently pinned validation, dry-run, rehearsal, backup, loader, and migration evidence;
- disjoint restore TOC selections and exact restore/application order;
- exact compatibility columns, named foreign keys, extension, storage, publication, policy, helper, private-schema, and configuration gates;
- immutable execution snapshots and immediate pre-execution re-hashing for both loaders;
- one in-transaction Auth-zero lock/proof before portable Auth insertion, without truncating managed Auth tables;
- deterministic `ACCESS EXCLUSIVE` locks on the exact 93 source-owned public tables before replica mode and deletion, preventing concurrent API writes from interleaving with the import;
- trigger-disabled loaders with origin restoration and a catalog-driven all-foreign-key audit before each commit, followed by another whole-target foreign-key audit;
- exact reconciliation and pre-commit/post-commit checks for the three standalone source sequences: `client_invoice_seq` = 2/called, `patient_reg_no_seq` = 117/called, and `queue_number_seq` = 1148/called;
- generic positive/negative-increment owned-sequence reconciliation, including start-value/uncalled handling for empty tables;
- exact post-import 11 / 11 Auth, zero session/token rows, profile mapping, all 94 source table counts, service configuration, schema, migration, sequence, and foreign-key gates;
- a protected, self-hashed import-integrity report bound to the loader snapshot that actually executed;
- fail-closed rollback behavior that invalidates stale transition/import success artifacts before any fallible preflight.

The main and `staff_messages` loaders remain separate transactions. If the staff transaction or any post-import gate fails after the main transaction commits, the operator must run the verified rollback and stop; retrying `Import` is blocked by the Auth-zero gate.

## Evidence

- approved source archive SHA-256: `16C5C80FB3695FF5E0E21D36AA2D8AAA5AA7CB32E8939DA6046E32A154C57863`
- protected target backup SHA-256: `9080050ADC9D98FAF2E3B381F77717393DBBCDA9C0A7E68BBED83DDAFE4DF13E`
- protected backup manifest SHA-256: `37885917F0239FAEBB9E86538562E6F6D5329DA06F3F505492D5C946F8C3A92C`
- target baseline binding SHA-256: `E8A0768E01CE84522BB0CADAB78B6AC01F9BD65FAB3360C992FB8EBAA67262B2`
- protected rollback validation evidence SHA-256: `29E6CD5499FBF52E46D68DDFAA456514587FDE32690A7879197AED4F11D669A3`
- protected real-TLS dry-run evidence SHA-256: `39EA9CEBCD521D6AA178DC10716FCE06CDF4269EE06D2A6BE9AB8A3D5C6BD619`
- pinned rehearsal report SHA-256: `9AE7693B8B06E1CECDD6AABEA91A4D399E204184175028C3BF6EBBFCE59297CC`
- approved main loader SHA-256: `62F420333AFDBBC4F0649BF4AB53AE537C09820E114D05C1239FF3A5D202EBCB`
- approved staff loader SHA-256: `CFE0A26D251D28E0574255FB02DA1ACF0A558EF873909BDFB9F577F0C6FFA5B7`
- approved portable Auth loader SHA-256: `7A45326312E47F8832F743778C2E5725797AA1244EA755D0D1B709D87F695E30`

The exact migration set was also validated against the managed target in one explicit rollback-only transaction. The transient 102 / 0 / 0 / 161 post-state and its schema/configuration contract passed, the transaction ended with explicit `ROLLBACK`, and the target returned to the exact baseline with `pg_jsonschema` uninstalled. A fully faithful local migration rehearsal is not possible because the local PostgreSQL bundle lacks the managed `pg_jsonschema` control file; the rollback-only managed-target evidence is the accepted proof for that capability gap.

## Verification

- focused PowerShell runtime contract: passed, including disposable-PostgreSQL sequence and lock regressions;
- focused Vitest: 2 files, 35 / 35 tests passed;
- full Vitest suite: 39 files, 483 / 483 tests passed in 361.75 seconds;
- final live `Verify`: passed read-only in 15.3 seconds;
- independent adversarial review: GO, with no remaining Critical or Important findings;
- PowerShell AST parse and `git diff --check`: passed.

## Authorized operator order

1. Run `-Phase Verify`; require the exact 93 / 0 / 0 / 153 baseline.
2. During the approved write window, run the protected exact-history CLI dry-run and then apply only the bound eight migrations.
3. Run `-Phase PostMigration`; it performs read-only target checks and writes the protected completed transition manifest only if the target is exactly 102 / 0 / 0 / 161 with the bound digests and configuration.
4. Run `-Phase Import`; it requires the completed manifest and executes the guarded loaders and post-import integrity chain.
5. If any persistent-write step or post-write gate fails, run `-Phase Rollback` and stop. Do not retry the import without a clean verified baseline and a newly authorized transition.
