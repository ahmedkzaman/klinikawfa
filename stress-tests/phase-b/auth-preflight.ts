const apiUrl = process.env.STAGING_API_URL;
const anonKey = process.env.STAGING_ANON_KEY;
const authToken = process.env.STAGING_AUTH_TOKEN;

if (!apiUrl || !anonKey || !authToken) {
  throw new Error('Phase B requires STAGING_API_URL, STAGING_ANON_KEY, and STAGING_AUTH_TOKEN');
}

const headers = {
  apikey: anonKey,
  Authorization: `Bearer ${authToken}`,
  'Content-Type': 'application/json',
};

const userResponse = await fetch(`${apiUrl}/auth/v1/user`, { headers });
if (!userResponse.ok) {
  throw new Error(`STAGING_AUTH_TOKEN is not a valid current user JWT (HTTP ${userResponse.status})`);
}
const user = await userResponse.json() as { id?: string };
if (!user.id) throw new Error('STAGING_AUTH_TOKEN user response did not contain an id');

const staffResponse = await fetch(`${apiUrl}/rest/v1/rpc/is_staff_or_admin`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ _user_id: user.id }),
});
if (!staffResponse.ok) {
  throw new Error(`Could not verify the staging staff role (HTTP ${staffResponse.status})`);
}
const isStaff = await staffResponse.json() as boolean;
if (isStaff !== true) {
  throw new Error('STAGING_AUTH_TOKEN must belong to a staging staff/admin user');
}

console.log('OK: Phase B authenticated staff JWT preflight passed');
