import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute('SELECT accessToken, locationId FROM ghl_oauth_tokens WHERE tenantId = 1 LIMIT 1');
const { accessToken, locationId } = rows[0];

const headers = {
  'Authorization': 'Bearer ' + accessToken,
  'Content-Type': 'application/json',
  'Version': '2021-07-28',
  'Accept': 'application/json',
};

// Step 1: Get 2000 contacts via paginated search
const allContacts = [];
const searchStart = Date.now();
for (let page = 1; page <= 20; page++) { // 20 pages x 100 = 2000
  const res = await fetch('https://services.leadconnectorhq.com/contacts/search', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      locationId,
      page,
      pageLimit: 100,
      sort: [{ field: 'dateUpdated', direction: 'desc' }],
    }),
  });
  const data = await res.json();
  const contacts = data.contacts || [];
  allContacts.push(...contacts);
  if (contacts.length < 100) break;
}
const searchElapsed = Date.now() - searchStart;
console.log(`Got ${allContacts.length} contacts in ${searchElapsed}ms`);

// Step 2: Fetch tasks for all contacts in parallel batches of 20
const taskStart = Date.now();
let totalTasks = 0;
let contactsWithTasks = 0;
const BATCH = 20;

for (let i = 0; i < allContacts.length; i += BATCH) {
  const batch = allContacts.slice(i, i + BATCH);
  const results = await Promise.all(batch.map(async (c) => {
    try {
      const r = await fetch('https://services.leadconnectorhq.com/contacts/' + c.id + '/tasks', {
        headers: {
          'Authorization': 'Bearer ' + accessToken,
          'Version': '2021-07-28',
          'Accept': 'application/json',
        },
      });
      const d = await r.json();
      const pending = (d.tasks || []).filter(t => !t.completed);
      return pending.length;
    } catch { return 0; }
  }));
  for (const count of results) {
    if (count > 0) contactsWithTasks++;
    totalTasks += count;
  }
  if ((i + BATCH) % 200 === 0) {
    console.log(`  Scanned ${i + BATCH} contacts... ${totalTasks} pending tasks so far`);
  }
}
const taskElapsed = Date.now() - taskStart;
console.log(`\nScanned ${allContacts.length} contacts in ${taskElapsed}ms`);
console.log(`Contacts with pending tasks: ${contactsWithTasks}`);
console.log(`Total pending tasks: ${totalTasks}`);
console.log(`Total time: ${searchElapsed + taskElapsed}ms`);

await conn.end();
