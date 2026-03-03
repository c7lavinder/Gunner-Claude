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

// Paginate through ALL pending tasks using searchAfter cursor
let allTasks = [];
let searchAfter = null;
let page = 0;
const start = Date.now();

while (true) {
  page++;
  const body = { completed: false, limit: 100 };
  if (searchAfter) body.searchAfter = searchAfter;
  
  const res = await fetch(`https://services.leadconnectorhq.com/locations/${locationId}/tasks/search`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  
  const data = await res.json();
  const tasks = data.tasks || [];
  allTasks.push(...tasks);
  
  console.log(`Page ${page}: got ${tasks.length} tasks (total so far: ${allTasks.length})`);
  
  if (tasks.length < 100) break; // No more pages
  
  // Use searchAfter from the last task for cursor-based pagination
  const lastTask = tasks[tasks.length - 1];
  if (lastTask.searchAfter) {
    searchAfter = lastTask.searchAfter;
  } else {
    break;
  }
}

const elapsed = Date.now() - start;
console.log(`\nTotal pending tasks: ${allTasks.length}`);
console.log(`Time: ${elapsed}ms`);

// Check unique assignees
const assignees = new Map();
for (const t of allTasks) {
  const name = t.assignedToUserDetails?.firstName 
    ? `${t.assignedToUserDetails.firstName} ${t.assignedToUserDetails.lastName || ''}`.trim()
    : t.assignedTo;
  assignees.set(t.assignedTo, (assignees.get(t.assignedTo) || { name, count: 0 }));
  assignees.get(t.assignedTo).count++;
}
console.log('\nTasks by assignee:');
for (const [id, info] of assignees) {
  console.log(`  ${info.name} (${id}): ${info.count} tasks`);
}

// Check contact details availability
let withContactName = 0;
for (const t of allTasks) {
  if (t.contactDetails?.firstName || t.contactDetails?.lastName) withContactName++;
}
console.log(`\nTasks with contact name: ${withContactName}/${allTasks.length}`);

// Check if address is included in contactDetails
const sampleWithContact = allTasks.find(t => t.contactDetails?.firstName);
if (sampleWithContact) {
  console.log('\nSample contactDetails keys:', Object.keys(sampleWithContact.contactDetails));
  console.log('Sample contactDetails:', JSON.stringify(sampleWithContact.contactDetails, null, 2));
}

await conn.end();
