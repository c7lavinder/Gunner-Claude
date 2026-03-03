import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute('SELECT refreshToken, accessToken, locationId FROM ghl_oauth_tokens WHERE tenantId = 1 LIMIT 1');
const { refreshToken, accessToken, locationId } = rows[0];

console.log('Has refresh token:', !!refreshToken);

if (!refreshToken) {
  console.log('No refresh token available');
  process.exit(1);
}

const clientId = process.env.GHL_CLIENT_ID;
const clientSecret = process.env.GHL_CLIENT_SECRET;
console.log('Client ID:', clientId ? clientId.substring(0, 10) + '...' : 'missing');
console.log('Client Secret:', clientSecret ? 'present' : 'missing');

const res = await fetch('https://services.leadconnectorhq.com/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  }),
});

console.log('Refresh status:', res.status);
const data = await res.json();

if (data.access_token) {
  console.log('New token obtained!');
  console.log('New scopes:', data.scope);

  // Update the token in the database
  await conn.execute(
    'UPDATE ghl_oauth_tokens SET accessToken = ?, refreshToken = ? WHERE tenantId = 1',
    [data.access_token, data.refresh_token || refreshToken]
  );
  console.log('Token updated in database!');

  // Test the location task search with the new token
  const taskRes = await fetch('https://services.leadconnectorhq.com/locations/' + locationId + '/tasks/search', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + data.access_token,
      'Content-Type': 'application/json',
      'Version': '2021-07-28',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ status: 'pending', limit: 5 }),
  });
  console.log('Task search status:', taskRes.status);
  const taskData = await taskRes.json();
  if (taskData.tasks) {
    console.log('SUCCESS! Tasks found:', taskData.tasks.length, 'Total:', taskData.total);
    if (taskData.tasks[0]) {
      console.log('Sample task:', JSON.stringify(taskData.tasks[0], null, 2));
    }
  } else {
    console.log('Task search response:', JSON.stringify(taskData));
  }
} else {
  console.log('Refresh failed:', JSON.stringify(data));
}

await conn.end();
