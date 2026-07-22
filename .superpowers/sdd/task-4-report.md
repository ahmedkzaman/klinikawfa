# Task 4 Report - Isolated Staging Pre-Write Boundary

## Decision

- Production traffic cutover: **NO-GO**.
- Frontend, DNS, GitHub environment, and public Supabase configuration changes: **NOT AUTHORIZED**.
- Isolated target staging build: **conditionally ready only through the guarded runner**, and only while a newly generated `Verify` artifact is still fresh.
- Persistent target phases executed in this task: **none**. `Push`, `PostMigration`, `Import`, and `Rollback` were not run.

The public website remains on Lovable Cloud project `ncysmppzfjtiekfnomdv`. The unused target project `nhjbqdiyptjqherdfbqk` remains at its approved pre-write baseline. The staging-isolation artifact is deliberately short-lived and cannot be treated as durable authorization.

## Live and target isolation

The final `Verify` phase uses GET-only HTTPS requests with redirects disabled, recursively observes the same-origin JavaScript graph twice, and observes the target twice with read-only SQL. It then writes and immediately revalidates a self-hashed artifact under the protected cutover directory.

Final evidence values will be inserted after the last full-suite run and final `Verify`:

- isolation evidence file SHA-256: `128FAD5CEE5C250BAB4750AF570864B67C6DBF4D04A5580D597F11C88D17BDEB`
- isolation evidence payload SHA-256: `C89E4E5BEDAEC5BF2E470BA1BCC6352925B596F376FD27DC6ADD18ABC063AD0D`
- observed / expires UTC: `2026-07-22T01:54:21.0487841Z` / `2026-07-22T02:09:21.0487841Z`
- normalized isolation runner SHA-256: `813042B3776C9A25C8AB5ABC246FE7BB156098E85DD753AEFD4D2FD2D09E9578`
- live frontend snapshot SHA-256: `3FF05590B59D312CE9B71782761CA1A216A02C2CFBB0E586AFBDC90FCFA12DE7`
- live source / target reference occurrences: 16 / 0 across two JavaScript assets
- target pre-write snapshot SHA-256: `ED13010AFE41D17611381D0772F9B0161B35EC6DB6F003A9DC0D8157B57BD66C`

The exact target baseline required by `Verify` is:

- public tables: 93
- Auth users / identities / sessions / refresh tokens / one-time tokens: 0 / 0 / 0 / 0 / 0
- migration rows: 153
- ordered migration identity SHA-256: `5EE4FF324B59CA8775A18D9F4674F6A72AA64CDC782DF640ECC67B3BAE59F9DB`
- schema SHA-256: `A01DD4E5B0EB41B6DC67B5F43D9A6548EFFC20C8A94DF511CA66E8D53E7DAAC1`
- extended schema SHA-256: `1B4E08D71B3FAE4824A90F0A361826638B2F2EE2EFABEA360BF157BDEB931393`
- Storage buckets / objects: 6 / 0
- Storage bucket configuration SHA-256: `7CC19FC8A7567582D947EDA8CA6BAB6FC1D8961713AEE85099F639347B2540D5`
- Storage migration rows / SHA-256: 61 / `3090C773F9B3823737BA83A66D5B5D3DA75A5BC62CE56EA891CCF5E5489792DD`
- standalone sequences: `client_invoice_seq` 1/uncalled, `patient_reg_no_seq` 9/called, `queue_number_seq` 1012/called

## Local rehearsal

The final-byte disposable PostgreSQL rehearsal passed locally:

- rehearsal report SHA-256: `21E5D4E0C4FB5568186ABBAB717E22DC8B28F0E4E1CE9FF2621E1EC0E265D7B7`
- rehearsal binding SHA-256: `5E41F794866DDE27D1F0588B27BE76FF63F9E916B35133975199350E996C59DB`
- normalized runner SHA-256: `813042B3776C9A25C8AB5ABC246FE7BB156098E85DD753AEFD4D2FD2D09E9578`
- source public tables / source-only table: 94 / `public.staff_messages`
- portable Auth users / identities: 11 / 11
- imported sessions / refresh tokens: 0 / 0
- target write connections / production target used: 0 / false
- imported sequence checks: `client_invoice_seq` 2/called, `patient_reg_no_seq` 117/called, `queue_number_seq` 1148/called

The local PostgreSQL distribution required a temporary local-only `pg_jsonschema` compatibility shim to exercise the disposable schema path. It was not production evidence, never touched the managed target, and was deleted after the rehearsal. Managed-target extension capability remains covered by the separately pinned protected validation evidence.

## Exact migration transition

The guarded runner binds exactly these eight chronological migrations:

1. `20260720111916_add_website_editor_role.sql` - `87F0EEA795BC99CE1CBA8BB799B6E25D7C3A313A54E309425FC47165B5125618`
2. `20260720115031_create_website_cms_foundation.sql` - `A86DA7A8824CCF5BEF9033D9DC525C37D50AE6281AF0C060ED031995459E5D30`
3. `20260720225347_harden_website_cms_integration.sql` - `E4987CFCBD91251FE6EE10881D7F67858265C735DD7FDFCE31E49FBF63ECB8EC`
4. `20260721035032_add_website_page_publishing.sql` - `88BE2091198AECA44A556DF3A0C76C6AB6018FBA8149A0EE13F79C4AC92D4C39`
5. `20260721100403_switch_tracking_to_google.sql` - `EB84C03BD376D0B9E5AE2A7E1A14B7E41F9AA04B54D663793DCC79EF987E37A1`
6. `20260721162256_restore_staff_messages.sql` - `4E0C335C855C1338EDAB28429B7377DAC7768D796666B3FF315FF1B4A55C9FB0`
7. `20260721170000_create_general_website_page_rpc.sql` - `4762C9B6791AB4C5E95FBFCC1F05F6BB703911D2D2DCE9DDDFD89456D2B922A4`
8. `20260721174422_preserve_source_cutover_fields.sql` - `ECEBAE8DFB0CED17B2C0A1332E627846844C439DB945A5C705C95B53E3611217`

The migration history summary is pinned to `6612F6D16FECB390A6EC3BE870AC82C04866CFACF2788C1619878B39657BA2F0`, and the exact temporary Push workdir inventory is pinned to `55C3967A81AA832509B923E1062CDAE34C55E38D076006E3E8156FDE3C91149D`.

## Fail-closed persistent-phase behavior

The runner now enforces all of the following:

- fresh live-source-present / target-absent evidence before `Push`;
- exact target database, Auth workflow, Storage, migration, schema, and standalone-sequence baseline before the first write;
- an atomically created protected quarantine marker immediately before a persistent phase;
- exact post-Push migration, schema, Storage, sequence, live frontend, and evidence checks before quarantine can clear;
- independently pinned, strict-UTF-8 Push evidence read once into one immutable buffer for both hash verification and parsing;
- exact current target state equality with the pinned Push result before `Import`;
- portable Auth import with explicit destination columns, neutralized token/change fields, and in-transaction Auth-zero locking;
- exact post-import table, Auth, Storage, sequence, foreign-key, profile, and service-configuration reconciliation;
- no eager deletion of completed Push, transition, or Import evidence and no repeated persistent phase after completed evidence exists.

If a persistent phase fails or is interrupted, the quarantine marker remains. The runner blocks retry and requires reviewed recovery.

## Rollback boundary

Database rollback is **unavailable**. `-Phase Rollback` refuses unconditionally before protected artifact creation, environment loading, tool checks, target access, or restore actions. No matching-Supabase database-plus-Storage restore has been proven, so no report or package may claim otherwise.

If `Push`, `Import`, or any post-write gate fails, quarantine the target, do not retry, do not use this runner to restore, and do not change the live frontend. Recovery or rebuild requires a separate reviewed procedure.

## Protected evidence bindings

- approved source archive SHA-256: `16C5C80FB3695FF5E0E21D36AA2D8AAA5AA7CB32E8939DA6046E32A154C57863`
- protected target backup SHA-256: `9080050ADC9D98FAF2E3B381F77717393DBBCDA9C0A7E68BBED83DDAFE4DF13E`
- protected backup manifest SHA-256: `37885917F0239FAEBB9E86538562E6F6D5329DA06F3F505492D5C946F8C3A92C`
- target baseline binding SHA-256: `E8A0768E01CE84522BB0CADAB78B6AC01F9BD65FAB3360C992FB8EBAA67262B2`
- protected validation evidence SHA-256: `29E6CD5499FBF52E46D68DDFAA456514587FDE32690A7879197AED4F11D669A3`
- protected real-TLS dry-run evidence SHA-256: `39EA9CEBCD521D6AA178DC10716FCE06CDF4269EE06D2A6BE9AB8A3D5C6BD619`
- current main loader SHA-256: `ED21364AE11ED1EEC873DA28AF3AE7649FA475D357BA3362D81EB87C41133670`
- current held `staff_messages` loader SHA-256: `53B85750660953FF5DCECDC5134CDAEA1140C0F9CB1555BCF7494857CDF9476A`
- current portable Auth loader SHA-256: `59C49ADFA6F58A9F86D3561BC121E8AB2EDE5051607D43981FC7328E7DAE4D5D`

## Verification

- focused PowerShell Task 4 contract: passed;
- isolation/quarantine focused PowerShell contract: passed;
- PowerShell AST parse and `git diff --check`: passed;
- independent isolation review: SPEC PASS / QUALITY APPROVED, no Critical or Important findings;
- focused Task 4 Vitest: 2 / 2 files and 35 / 35 tests passed in 153.34 seconds;
- full Vitest: 39 / 39 files and 483 / 483 tests passed in 441.72 seconds;
- final live read-only `Verify`: passed in 86.5 seconds and produced the exact short-lived evidence above.

## Operator boundary

1. Treat production cutover as NO-GO. Do not change frontend, DNS, GitHub environment, or public Supabase values.
2. If a separately reviewed operator chooses to build the isolated target staging database, rerun `-Phase Verify` immediately before `Push` and require unexpired exact isolation evidence.
3. Run `Push` at most once. If it succeeds, independently review and pin the Push evidence and producer runner before `PostMigration` or `Import`.
4. Run `PostMigration` only against the exact pinned post-Push state. Run `Import` only after all independent pins and transition evidence pass.
5. On any failure or interruption, retain quarantine and stop. Do not retry and do not invoke rollback.
6. Frontend cutover stays blocked until the isolated target passes every database, Auth, Storage-byte, Edge Function, RLS, advisor, application, CI, and quarantine-absence gate under a separate authorization.
