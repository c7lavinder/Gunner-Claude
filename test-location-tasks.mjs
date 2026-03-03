import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get GHL credentials for tenant 1
const [rows] = await conn.execute(
  'SELECT accessToken, locationId FROM ghl_oauth_tokens WHERE tenantId = 1 LIMIT 1'
);
if (!rows.length) { console.log('No GHL creds'); process.exit(1); }
const { accessToken: access_token, locationId: location_id } = rows[0];
console.log('Location ID:', location_id);

// Try the location-level task search API
const url = `https://services.leadconnectorhq.com/locations/${location_id}/tasks/search`;
console.log('URL:', url);

// Test 1: Get all pending tasks (no filters)
console.log('\n=== Test 1: All pending tasks ===');
const res1 = await fetch(url, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
    'Accept': 'application/json',
  },
  body: JSON.stringify({
    completed: false,
    limit: 100,
    skip: 0,
  }),
});
console.log('Status:', res1.status);
const body1 = await res1.text();
if (res1.ok) {
  const data = JSON.parse(body1);
  console.log('Total tasks:', data.tasks?.length);
  if (data.tasks?.length > 0) {
    console.log('First task:', JSON.stringify(data.tasks[0], null, 2));
    console.log('Task fields:', Object.keys(data.tasks[0]));
  }
  if (data.total !== undefined) console.log('Total count:', data.total);
} else {
  console.log('Error body:', body1);
}

// Test 2: Get tasks filtered by assignee
console.log('\n=== Test 2: Tasks for a specific assignee ===');
// Get a GHL user ID from the team_members table
const [members] = await conn.execute(
  'SELECT ghlUserId, name FROM team_members WHERE tenantId = 1 AND ghlUserId IS NOT NULL LIMIT 3'
);
console.log('Team members:', members.map(m => `${m.name}: ${m.ghlUserId}`));

if (members.length > 0) {
  const assigneeId = members[0].ghlUserId;
  console.log(`Filtering by assignee: ${members[0].name} (${assigneeId})`);
  
  const res2 = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Content-Type': 'application/json',
      'Version': '2021-07-28',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      completed: false,
      assignedTo: [assigneeId],
      limit: 100,
      skip: 0,
    }),
  });
  console.log('Status:', res2.status);
  const body2 = await res2.text();
  if (res2.ok) {
    const data = JSON.parse(body2);
    console.log('Tasks for', members[0].name, ':', data.tasks?.length);
    if (data.tasks?.length > 0) {
      // Show all task titles
      data.tasks.forEach((t, i) => {
        console.log(`  ${i+1}. ${t.title || t.body} (due: ${t.dueDate}) contact: ${t.contactId}`);
      });
    }
  } else {
    console.log('Error body:', body2);
  }
}

await conn.end();
