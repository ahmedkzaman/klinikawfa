# Task 4 Report: Patient Explorer

- Status: Complete
- Commit: `Task 4: build Patient Explorer`
- Tests: `npm.cmd test -- src/test/patient-explorer-domain.test.ts src/test/patient-explorer-hook.test.tsx src/test/patient-explorer-ui.test.tsx --run` (25 passed); scoped ESLint passed for all Task 4 source and test files.
- Concerns: The Export control is intentionally disabled as the Task 5 wiring point. The focused UI test emits existing React Router future-flag warnings; no test failures result.

## Fix Round 1

- Status: Complete
- Scope: Corrected Today, Last 7 days, and Last 30 days preset boundaries to use `Asia/Kuala_Lumpur` calendar dates instead of UTC serialization. Custom date inputs, all-time mode, draft/applied gating, and page-reset behavior remain unchanged.
- Tests: Added a UI regression at `00:30 MYT` covering all three presets. `npm.cmd test -- src/test/patient-explorer-domain.test.ts src/test/patient-explorer-hook.test.tsx src/test/patient-explorer-ui.test.tsx --run` (28 passed); scoped ESLint passed for the changed source and Patient Explorer test files.
- Coverage: Existing hook coverage verifies durable page reset when applied filters change. The Patient Explorer route remains protected by the existing `/clinic` `ClinicProtectedRoute requiredRole="any_staff"` parent gate; no route configuration change was needed.
- Concerns: The focused UI test continues to emit existing React Router future-flag warnings only.
