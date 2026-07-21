// Admin-only edge function to silently create a clinic user (Locum, employee,
// or Website Editor role) without disrupting the calling staff member's session.
// Uses the service-role key to bypass standard auth and assigns the
// requested role on creation. For employee roles (resident_doctor,
// staff, operations) it also seeds a blank staff_onboarding row so HR
// gates work on first login.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { z } from 'https://esm.sh/zod@3.23.8';
import {
  CREATABLE_USER_ROLES,
  requiresStaffOnboarding,
  resolveCreatableRole,
} from './role-policy.ts';
import type { CreatableUserRole } from './role-policy.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BodySchema = z.object({
  email: z.string().email().max(255),
  fullName: z.string().min(1).max(255),
  phone: z.string().max(40).optional().nullable(),
  password: z.string().min(8).max(72),
  role: z.enum(CREATABLE_USER_ROLES).default('locum'),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // 1. Manual JWT verification using anon client + getClaims
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const token = authHeader.slice('Bearer '.length);

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: claimsData, error: claimsErr } = await anon.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) {
    return json({ error: 'Invalid token' }, 401);
  }
  const callerId = claimsData.claims.sub as string;

  // 2. Service-role client for privileged ops
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 3. Authorize caller — must be staff/admin tier
  const { data: roleRow, error: roleErr } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', callerId)
    .maybeSingle();

  if (roleErr) return json({ error: 'Role lookup failed' }, 500);

  const callerRole = roleRow?.role as string | undefined;
  if (!callerRole) {
    return json({ error: 'Forbidden — staff or admin only' }, 403);
  }

  // 4. Validate body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.flatten().fieldErrors }, 400);
  }
  const { email, fullName, phone, password } = parsed.data;
  // The shared policy keeps operations callers at locum and rejects all
  // callers outside the authorized administrator and operations tiers.
  let role: CreatableUserRole;
  try {
    role = resolveCreatableRole(callerRole, parsed.data.role);
  } catch {
    return json({ error: 'Forbidden' }, 403);
  }

  // 5. Create the user. `email_confirm: true` is REQUIRED — locums and staff
  // created here must be able to log in immediately at the front desk. The
  // caller must provide a unique temporary password; never fall back to a
  // shared default password.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      phone: phone ?? null,
      requested_role: role,
      created_by_admin: callerId,
    },
  });

  if (createErr) {
    const msg = createErr.message || 'Create user failed';
    if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('registered')) {
      return json({ error: 'A user with this email already exists.' }, 409);
    }
    return json({ error: msg }, 400);
  }

  const newUserId = created.user?.id;
  if (!newUserId) return json({ error: 'No user returned' }, 500);

  // 6. Upsert the requested role
  const { error: roleInsertErr } = await admin
    .from('user_roles')
    .upsert({ user_id: newUserId, role }, { onConflict: 'user_id' });

  if (roleInsertErr) {
    return json({ error: `User created but role assignment failed: ${roleInsertErr.message}` }, 500);
  }

  // 7. For employee roles, seed an HR onboarding row so the wizard
  // has a backing record on first login. Locums skip this entirely.
  if (requiresStaffOnboarding(role)) {
    const { error: onboardErr } = await admin
      .from('staff_onboarding')
      .upsert(
        {
          user_id: newUserId,
          onboarding_data: {},
          job_description_acknowledged: false,
          job_scope_acknowledged: false,
          company_policy_acknowledged: false,
          is_completed: false,
        },
        { onConflict: 'user_id' },
      );
    if (onboardErr) {
      // Non-fatal: log and continue. Backfill migration can recover.
      console.error('staff_onboarding seed failed:', onboardErr.message);
    }
  }

  return json({ success: true, user_id: newUserId });
});
