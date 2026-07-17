import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';

const required = [
  'STAGING_PROJECT_REF',
  'PRODUCTION_PROJECT_REF',
  'STAGING_API_URL',
  'STAGING_SERVICE_ROLE_KEY',
  'STAGING_DB_URL',
];

for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing required variable: ${name}`);
}

const stagingRef = process.env.STAGING_PROJECT_REF;
const productionRef = process.env.PRODUCTION_PROJECT_REF;
const apiUrl = process.env.STAGING_API_URL;
const serviceRoleKey = process.env.STAGING_SERVICE_ROLE_KEY;
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

const parsedDbUrl = new URL(dbUrl);
if (!['postgres:', 'postgresql:'].includes(parsedDbUrl.protocol)) {
  throw new Error('STAGING_DB_URL must use PostgreSQL');
}
const username = decodeURIComponent(parsedDbUrl.username);
const directHost = parsedDbUrl.hostname === `db.${stagingRef}.supabase.co`;
const poolerHost = parsedDbUrl.hostname.endsWith('.pooler.supabase.com');
const poolerIdentity = username === `postgres.${stagingRef}`;
if (!(directHost || (poolerHost && poolerIdentity))) {
  throw new Error('STAGING_DB_URL is not bound to STAGING_PROJECT_REF');
}

const sql = postgres(dbUrl, {
  max: 1,
  connect_timeout: 20,
  idle_timeout: 5,
  prepare: false,
  ssl: 'require',
});

const policyRows = async () => sql`
  SELECT tablename, policyname, roles::text AS roles, qual
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('clinic_settings', 'insurance_providers', 'payment_methods')
     AND cmd = 'SELECT'
   ORDER BY tablename, policyname
`;

const expectedFinal = [
  ['clinic_settings', 'clinic_settings_clinic_roles_read', '{authenticated}', 'is_staff_or_clinical(auth.uid())'],
  ['insurance_providers', 'insurance_providers_clinic_roles_read', '{authenticated}', 'is_staff_or_clinical(auth.uid())'],
  ['payment_methods', 'payment_methods_ops_read', '{authenticated}', 'is_ops_or_admin(auth.uid())'],
];

const normalize = (value) => String(value ?? '').replace(/[\s()]/g, '').toLowerCase();
const inventory = (rows) => rows.map((row) => [
  row.tablename,
  row.policyname,
  row.roles,
  normalize(row.qual),
]);
const expectedInventory = expectedFinal.map(([table, policy, roles, qual]) => [
  table,
  policy,
  roles,
  normalize(qual),
]);

const roleFixtureSnapshots = [];
let insertedPaymentMethodId = null;
let activeRoleFixtureUserId = null;
let createdAuthFixtureId = null;

try {
  let markerTableRows = await sql`
    SELECT to_regclass('rls_test_support.environment_marker')::text AS marker_table
  `;
  if (!markerTableRows[0]?.marker_table) {
    if (process.env.BOOTSTRAP_STAGING_MARKER !== '1') {
      throw new Error('Staging database marker is not configured');
    }
    await sql.begin(async (tx) => {
      await tx.unsafe('CREATE SCHEMA IF NOT EXISTS rls_test_support');
      await tx.unsafe('REVOKE ALL ON SCHEMA rls_test_support FROM PUBLIC, anon, authenticated');
      await tx.unsafe(`
        CREATE TABLE IF NOT EXISTS rls_test_support.environment_marker (
          singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
          project_ref text NOT NULL CHECK (project_ref ~ '^[a-z0-9]{20}$')
        )
      `);
      await tx.unsafe('REVOKE ALL ON TABLE rls_test_support.environment_marker FROM PUBLIC, anon, authenticated');
      await tx`
        INSERT INTO rls_test_support.environment_marker (singleton, project_ref)
        VALUES (true, ${stagingRef})
        ON CONFLICT (singleton) DO NOTHING
      `;
    });
    markerTableRows = await sql`
      SELECT to_regclass('rls_test_support.environment_marker')::text AS marker_table
    `;
    if (!markerTableRows[0]?.marker_table) {
      throw new Error('Staging database marker bootstrap failed');
    }
  }
  const markerRows = await sql`
    SELECT project_ref AS marker
      FROM rls_test_support.environment_marker
     WHERE singleton = true
  `;
  if (!markerRows[0]?.marker) {
    throw new Error('Staging database marker is not configured');
  }
  if (markerRows[0].marker !== stagingRef) {
    throw new Error('Staging database marker does not match STAGING_PROJECT_REF');
  }

  const before = await policyRows();
  console.log('Preflight SELECT policies:', before.map((row) => row.policyname).join(', '));

  if (process.env.APPLY_PROPOSED !== '1') {
    throw new Error('APPLY_PROPOSED=1 is required to apply the staging proposal');
  }

  const migration = await readFile(
    new URL('../proposed-migrations/20260717143000_financial_configuration_read_boundaries.sql', import.meta.url),
    'utf8',
  );
  await sql.unsafe(migration);

  const after = await policyRows();
  const actualInventory = inventory(after);
  if (JSON.stringify(actualInventory) !== JSON.stringify(expectedInventory)) {
    throw new Error(`Unexpected postflight policy inventory: ${JSON.stringify(actualInventory)}`);
  }

  const baselines = await sql`
    SELECT
      (SELECT count(*)::int FROM public.clinic_settings) AS clinic_settings,
      (SELECT count(*)::int FROM public.insurance_providers) AS insurance_providers,
      (SELECT count(*)::int FROM public.payment_methods) AS payment_methods
  `;
  const baseline = baselines[0];

  if (
    baseline.payment_methods === 0 &&
    process.env.BOOTSTRAP_FINANCIAL_CONFIG_FIXTURES === '1'
  ) {
    const fixtureRows = await sql`
      INSERT INTO public.payment_methods (
        name,
        type,
        account_details,
        display_order,
        status
      )
      VALUES (
        'RLS staging validation fixture',
        'cash',
        'SANITIZED STAGING FIXTURE - NO REAL ACCOUNT DATA',
        2147483647,
        'active'
      )
      RETURNING id
    `;
    insertedPaymentMethodId = fixtureRows[0]?.id ?? null;
    if (!insertedPaymentMethodId) {
      throw new Error('Failed to create the temporary payment-method fixture');
    }
    baseline.payment_methods = 1;
  }

  const emptyTables = Object.entries(baseline)
    .filter(([, count]) => count === 0)
    .map(([table]) => table);
  if (emptyTables.length > 0) {
    console.log(`Empty sanitized staging tables (policy/helper validation only): ${emptyTables.join(', ')}`);
  }

  let roleRows = await sql`
    SELECT role::text AS role, min(user_id::text)::uuid AS user_id
      FROM public.user_roles
     WHERE role::text IN (
       'locum', 'resident_doctor', 'staff', 'operations', 'ops_staff',
       'doctor_admin', 'admin', 'special_admin', 'guest'
     )
     GROUP BY role::text
     ORDER BY role::text
  `;
  const rolesPresent = new Set(roleRows.map((row) => row.role));
  let hasClinical = rolesPresent.has('locum') || rolesPresent.has('resident_doctor');
  let hasOperations = [...rolesPresent].some((role) =>
    ['staff', 'operations', 'ops_staff', 'doctor_admin', 'admin', 'special_admin'].includes(role),
  );

  if (
    (!hasClinical || !hasOperations || !rolesPresent.has('guest')) &&
    process.env.BOOTSTRAP_FINANCIAL_CONFIG_FIXTURES === '1'
  ) {
    const fixtureUsers = await sql`
      SELECT u.id, count(ur.id)::int AS role_count
        FROM auth.users AS u
        LEFT JOIN public.user_roles AS ur ON ur.user_id = u.id
       GROUP BY u.id, u.created_at
       ORDER BY count(ur.id), u.created_at, u.id
       LIMIT 1
    `;
    if (fixtureUsers.length < 1) {
      const response = await fetch(`${apiUrl}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: `rls-fixture-${randomUUID()}@example.invalid`,
          password: `${randomUUID()}${randomUUID()}`,
          email_confirm: true,
          user_metadata: { purpose: 'temporary-sanitized-staging-rls-validation' },
        }),
      });
      if (!response.ok) {
        throw new Error(`Unable to create a synthetic staging auth fixture (HTTP ${response.status})`);
      }
      const createdUser = await response.json();
      createdAuthFixtureId = createdUser?.id ?? null;
      if (!createdAuthFixtureId) {
        throw new Error('Synthetic staging auth fixture response did not include an id');
      }
      fixtureUsers.push({ id: createdAuthFixtureId, role_count: 0 });
    }

    activeRoleFixtureUserId = fixtureUsers[0].id;
    const originalRoleRows = await sql`
      SELECT role::text AS role
        FROM public.user_roles
       WHERE user_id = ${activeRoleFixtureUserId}
       ORDER BY role::text
    `;
    roleFixtureSnapshots.push({
      userId: activeRoleFixtureUserId,
      roles: originalRoleRows.map((row) => row.role),
    });
    await sql`
      DELETE FROM public.user_roles
       WHERE user_id = ${activeRoleFixtureUserId}
    `;

    roleRows = ['locum', 'ops_staff', 'guest'].map((role) => ({
      role,
      user_id: activeRoleFixtureUserId,
    }));
    const refreshedRoles = new Set(roleRows.map((row) => row.role));
    hasClinical = true;
    hasOperations = true;
    rolesPresent.clear();
    for (const role of refreshedRoles) rolesPresent.add(role);
  }

  if (!hasClinical || !hasOperations || !rolesPresent.has('guest')) {
    throw new Error('Staging roles are insufficient to prove clinical, operations, and guest boundaries');
  }

  for (const { role, user_id: userId } of roleRows) {
    if (activeRoleFixtureUserId) {
      await sql`
        DELETE FROM public.user_roles
         WHERE user_id = ${activeRoleFixtureUserId}
      `;
      await sql`
        INSERT INTO public.user_roles (user_id, role)
        VALUES (${activeRoleFixtureUserId}, ${role}::public.app_role)
      `;
    }
    const canReadClinic = role !== 'guest';
    const canReadPanels = role !== 'guest';
    const canReadPaymentMethods = [
      'staff',
      'operations',
      'ops_staff',
      'doctor_admin',
      'admin',
      'special_admin',
    ].includes(role);
    const helperRows = await sql`
      SELECT
        public.is_staff_or_clinical(${userId}::uuid) AS clinic_role,
        public.is_ops_or_admin(${userId}::uuid) AS ops_role
    `;
    if (
      helperRows[0]?.clinic_role !== canReadClinic ||
      helperRows[0]?.ops_role !== canReadPaymentMethods
    ) {
      throw new Error(`${role} helper-role mismatch`);
    }
    const counts = await sql.begin(async (tx) => {
      await tx.unsafe('SET LOCAL ROLE authenticated');
      await tx`SELECT set_config('request.jwt.claim.sub', ${userId}, true)`;
      await tx`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`;
      const rows = await tx`
        SELECT
          (SELECT count(*)::int FROM public.clinic_settings) AS clinic_settings,
          (SELECT count(*)::int FROM public.insurance_providers) AS insurance_providers,
          (SELECT count(*)::int FROM public.payment_methods) AS payment_methods
      `;
      return rows[0];
    });

    const expected = {
      clinic_settings: canReadClinic ? baseline.clinic_settings : 0,
      insurance_providers: canReadPanels ? baseline.insurance_providers : 0,
      payment_methods: canReadPaymentMethods ? baseline.payment_methods : 0,
    };
    if (JSON.stringify(counts) !== JSON.stringify(expected)) {
      throw new Error(`${role} matrix mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(counts)}`);
    }
    console.log(`OK: ${role} read boundary`);
  }

  console.log('Postflight SELECT policies:', after.map((row) => row.policyname).join(', '));
  console.log('Staging financial-configuration matrix passed.');
} finally {
  for (const { userId, roles } of roleFixtureSnapshots.reverse()) {
    await sql`
      DELETE FROM public.user_roles
       WHERE user_id = ${userId}
    `;
    for (const role of roles) {
      await sql`
        INSERT INTO public.user_roles (user_id, role)
        VALUES (${userId}, ${role}::public.app_role)
      `;
    }
  }
  if (insertedPaymentMethodId) {
    await sql`
      DELETE FROM public.payment_methods
      WHERE id = ${insertedPaymentMethodId}
    `;
  }
  if (createdAuthFixtureId) {
    const response = await fetch(`${apiUrl}/auth/v1/admin/users/${createdAuthFixtureId}`, {
      method: 'DELETE',
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
      },
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Unable to remove the synthetic staging auth fixture (HTTP ${response.status})`);
    }
  }
  const residueRows = await sql`
    SELECT
      (SELECT count(*)::int
         FROM public.payment_methods
        WHERE name = 'RLS staging validation fixture'
          AND account_details = 'SANITIZED STAGING FIXTURE - NO REAL ACCOUNT DATA') AS payment_methods,
      (SELECT count(*)::int
         FROM auth.users
        WHERE raw_user_meta_data ->> 'purpose' = 'temporary-sanitized-staging-rls-validation') AS auth_users,
      (SELECT count(*)::int
         FROM public.profiles AS p
         JOIN auth.users AS u ON u.id = p.id
        WHERE u.raw_user_meta_data ->> 'purpose' = 'temporary-sanitized-staging-rls-validation') AS profiles,
      (SELECT count(*)::int
         FROM public.user_roles AS ur
         JOIN auth.users AS u ON u.id = ur.user_id
        WHERE u.raw_user_meta_data ->> 'purpose' = 'temporary-sanitized-staging-rls-validation') AS user_roles
  `;
  if (Object.values(residueRows[0]).some((count) => count !== 0)) {
    throw new Error('Temporary sanitized-staging fixture residue detected after cleanup');
  }
  console.log('Temporary sanitized-staging fixtures cleaned up.');
  await sql.end({ timeout: 5 });
}
