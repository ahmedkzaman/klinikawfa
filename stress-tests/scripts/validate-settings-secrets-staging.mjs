import { readFile, writeFile } from 'node:fs/promises';
import postgres from 'postgres';

const required = [
  'STAGING_PROJECT_REF',
  'PRODUCTION_PROJECT_REF',
  'STAGING_API_URL',
  'STAGING_DB_URL',
  'SETTINGS_BOUNDARY_BACKUP_PATH',
];

for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing required variable: ${name}`);
}

if (process.env.APPLY_PROPOSED !== '1') {
  throw new Error('APPLY_PROPOSED=1 is required to apply the staging proposal');
}

const stagingRef = process.env.STAGING_PROJECT_REF;
const productionRef = process.env.PRODUCTION_PROJECT_REF;
const apiUrl = process.env.STAGING_API_URL;
const dbUrl = process.env.STAGING_DB_URL;

if (!/^[a-z0-9]{20}$/.test(stagingRef)) {
  throw new Error('STAGING_PROJECT_REF is not a valid project reference');
}
if (stagingRef === productionRef) {
  throw new Error('Refusing to use the production project as staging');
}
if (apiUrl !== `https://${stagingRef}.supabase.co`) {
  throw new Error('STAGING_API_URL does not match STAGING_PROJECT_REF');
}

const localSanitized = process.env.LOCAL_SANITIZED_VALIDATION === '1';
const parsedDbUrl = new URL(dbUrl);
const username = decodeURIComponent(parsedDbUrl.username);
const directHost = parsedDbUrl.hostname === `db.${stagingRef}.supabase.co`;
const poolerHost = parsedDbUrl.hostname.endsWith('.pooler.supabase.com');
const poolerIdentity = username === `postgres.${stagingRef}`;
if (!['postgres:', 'postgresql:'].includes(parsedDbUrl.protocol)) {
  throw new Error('STAGING_DB_URL must use PostgreSQL');
}
if (localSanitized) {
  const loopback = ['127.0.0.1', 'localhost'].includes(parsedDbUrl.hostname);
  const expectedDatabase = parsedDbUrl.pathname === '/klinikawfa_sanitized';
  if (!loopback || parsedDbUrl.port !== '55432' || !expectedDatabase) {
    throw new Error('Local sanitized validation is restricted to the isolated local database');
  }
} else if (!(directHost || (poolerHost && poolerIdentity))) {
  throw new Error('STAGING_DB_URL is not bound to STAGING_PROJECT_REF');
}

const sql = postgres(dbUrl, {
  max: 1,
  connect_timeout: 20,
  idle_timeout: 5,
  prepare: false,
  ssl: localSanitized ? false : 'require',
});

const financeFields = [
  'bank_name',
  'bank_account_no',
  'bank_account_holder',
  'sst_number',
];

const roleCases = [
  ['locum', 'RLS_LOCUM_UID', false],
  ['resident_doctor', 'RLS_RESIDENT_UID', false],
  ['staff', 'RLS_STAFF_UID', false],
  ['operations', 'RLS_OPS_UID', true],
  ['ops_staff', 'RLS_OPS_STAFF_UID', true],
  ['doctor_admin', 'RLS_DOCTOR_ADMIN_UID', true],
  ['admin', 'RLS_ADMIN_UID', true],
  ['special_admin', 'RLS_SPECIAL_ADMIN_UID', true],
];

const stableJson = (value) => JSON.stringify(value);

async function asAuthenticated(userId, callback) {
  return sql.begin(async (tx) => {
    await tx.unsafe('SET LOCAL ROLE authenticated');
    await tx`SELECT set_config('request.jwt.claim.sub', ${userId}, true)`;
    await tx`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`;
    return callback(tx);
  });
}

async function expectDenied(label, callback) {
  try {
    await callback();
  } catch (error) {
    if (error?.code === '42501') {
      console.log(`OK: ${label} denied`);
      return;
    }
    throw error;
  }
  throw new Error(`${label} was unexpectedly allowed`);
}

try {
  if (localSanitized) {
    const databaseRows = await sql`SELECT current_database() AS database`;
    if (databaseRows[0]?.database !== 'klinikawfa_sanitized') {
      throw new Error('Local sanitized database identity mismatch');
    }
  } else {
    const markerRows = await sql`
      SELECT project_ref AS marker
        FROM rls_test_support.environment_marker
       WHERE singleton = true
    `;
    if (markerRows[0]?.marker !== stagingRef) {
      throw new Error('Sanitized-staging marker does not match STAGING_PROJECT_REF');
    }
  }

  const beforePolicies = await sql`
    SELECT policyname, roles::text AS roles, permissive, cmd, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'clinic_settings'
       AND cmd = 'SELECT'
     ORDER BY policyname
  `;
  const beforeFunctions = await sql`
    SELECT pg_get_functiondef(p.oid) AS definition, p.proconfig
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'get_clinic_settings'
       AND pg_get_function_identity_arguments(p.oid) = ''
  `;
  const beforeConstraints = await sql`
    SELECT c.conname, pg_get_constraintdef(c.oid) AS definition, c.convalidated
      FROM pg_constraint AS c
      JOIN pg_class AS t ON t.oid = c.conrelid
      JOIN pg_namespace AS n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public'
       AND t.relname = 'app_settings'
       AND c.conname = 'app_settings_forbid_browser_secrets'
  `;
  const forbiddenBefore = await sql`
    SELECT count(*)::int AS count
      FROM public.app_settings
     WHERE key IN ('stripe_secret_key', 'stripe_restricted_key')
  `;

  await writeFile(
    process.env.SETTINGS_BOUNDARY_BACKUP_PATH,
    JSON.stringify({
      capturedAt: new Date().toISOString(),
      stagingProjectRef: stagingRef,
      clinicSettingsSelectPolicies: beforePolicies,
      getClinicSettingsFunction: beforeFunctions,
      forbiddenKeyConstraint: beforeConstraints,
      forbiddenStripeRowCount: forbiddenBefore[0]?.count ?? null,
    }, null, 2),
    { flag: 'wx' },
  );
  console.log('External pre-state snapshot saved (no secret values copied).');

  const migration = await readFile(
    new URL('../../supabase/migrations/20260718130000_harden_settings_secrets_boundary.sql', import.meta.url),
    'utf8',
  );
  await sql.unsafe(migration);

  const baselineRows = await sql`SELECT * FROM public.clinic_settings ORDER BY id`;
  if (baselineRows.length === 0) {
    throw new Error('Sanitized staging has no clinic_settings row to validate');
  }

  const fixtureRoles = roleCases.map(([role]) => role).concat('guest');
  const fixtureRows = await sql`
    SELECT role::text AS role, min(user_id::text)::uuid AS user_id
      FROM public.user_roles
     WHERE role::text = ANY(${fixtureRoles}::text[])
     GROUP BY role::text
  `;
  const fixtureByRole = new Map(
    fixtureRows.map((row) => [row.role, row.user_id]),
  );

  for (const [role, envName, isFinance] of roleCases) {
    const userId = process.env[envName] || fixtureByRole.get(role);
    if (!userId) {
      throw new Error(`Sanitized staging has no ${role} role fixture`);
    }
    const helperRows = await asAuthenticated(userId, (tx) => tx`
      SELECT
        public.is_staff_or_clinical(auth.uid()) AS clinic_role,
        public.is_finance_admin() AS finance_role
    `);
    if (!helperRows[0]?.clinic_role || helperRows[0]?.finance_role !== isFinance) {
      throw new Error(`${role} helper-role mismatch`);
    }

    const result = await asAuthenticated(userId, async (tx) => {
      const rpcRows = await tx`SELECT * FROM public.get_clinic_settings() ORDER BY id`;
      const directRows = await tx`SELECT * FROM public.clinic_settings ORDER BY id`;
      return { rpcRows, directRows };
    });

    if (result.rpcRows.length !== baselineRows.length) {
      throw new Error(`${role} RPC row-count mismatch`);
    }
    if (isFinance) {
      if (stableJson(result.rpcRows) !== stableJson(baselineRows)) {
        throw new Error(`${role} did not receive the full clinic-settings row`);
      }
      if (stableJson(result.directRows) !== stableJson(baselineRows)) {
        throw new Error(`${role} direct-table finance boundary mismatch`);
      }
    } else {
      if (result.directRows.length !== 0) {
        throw new Error(`${role} retained direct clinic_settings access`);
      }
      for (const row of result.rpcRows) {
        if (financeFields.some((field) => row[field] !== null)) {
          throw new Error(`${role} received a non-null finance field`);
        }
      }
      const expected = baselineRows.map((row) => ({
        ...row,
        bank_name: null,
        bank_account_no: null,
        bank_account_holder: null,
        sst_number: null,
      }));
      if (stableJson(result.rpcRows) !== stableJson(expected)) {
        throw new Error(`${role} redacted RPC changed a non-finance field`);
      }
    }
    console.log(`OK: ${role} settings boundary`);
  }

  const guestUserId = process.env.RLS_GUEST_UID || fixtureByRole.get('guest');
  if (!guestUserId) {
    throw new Error('Sanitized staging has no guest role fixture');
  }
  await expectDenied('guest RPC', () =>
    asAuthenticated(guestUserId, (tx) =>
      tx`SELECT * FROM public.get_clinic_settings()`
    )
  );
  await expectDenied('anonymous RPC', () =>
    sql.begin(async (tx) => {
      await tx.unsafe('SET LOCAL ROLE anon');
      return tx`SELECT * FROM public.get_clinic_settings()`;
    })
  );

  const forbiddenAfter = await sql`
    SELECT count(*)::int AS count
      FROM public.app_settings
     WHERE key IN ('stripe_secret_key', 'stripe_restricted_key')
  `;
  if (forbiddenAfter[0]?.count !== 0) {
    throw new Error('Forbidden Stripe rows remain after migration');
  }

  try {
    await sql`
      INSERT INTO public.app_settings (key, value)
      VALUES ('stripe_secret_key', 'SANITIZED_STAGING_CONSTRAINT_PROBE')
    `;
    throw new Error('Forbidden Stripe-key insert unexpectedly succeeded');
  } catch (error) {
    if (error?.code !== '23514') throw error;
    console.log('OK: forbidden Stripe-key insert rejected');
  }

  console.log('Sanitized-staging settings/secrets matrix passed.');
} finally {
  await sql.end({ timeout: 5 });
}
