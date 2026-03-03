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

// Test 1: Minimal body (just completed: false for pending tasks)
console.log('--- Test 1: completed=false ---');
const res1 = await fetch(`https://services.leadconnectorhq.com/locations/${locationId}/tasks/search`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ completed: false }),
});
console.log('Status:', res1.status);
const data1 = await res1.json();
if (data1.tasks) {
  console.log('Tasks:', data1.tasks.length, 'Total:', data1.total);
  if (data1.tasks[0]) {
    console.log('Sample task keys:', Object.keys(data1.tasks[0]));
    console.log('Sample task:', JSON.stringify(data1.tasks[0], null, 2));
  }
} else {
  console.log('Response:', JSON.stringify(data1, null, 2));
}

// Test 2: Empty body
console.log('\n--- Test 2: empty body ---');
const res2 = await fetch(`https://services.leadconnectorhq.com/locations/${locationId}/tasks/search`, {
  method: 'POST',
  headers,
  body: JSON.stringify({}),
});
console.log('Status:', res2.status);
const data2 = await res2.json();
if (data2.tasks) {
  console.log('Tasks:', data2.tasks.length, 'Total:', data2.total);
} else {
  console.log('Response:', JSON.stringify(data2, null, 2));
}

// Test 3: With limit
console.log('\n--- Test 3: limit=100 ---');
const res3 = await fetch(`https://services.leadconnectorhq.com/locations/${locationId}/tasks/search`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ completed: false, limit: 100 }),
});
console.log('Status:', res3.status);
const data3 = await res3.json();
if (data3.tasks) {
  console.log('Tasks:', data3.tasks.length, 'Total:', data3.total);
} else {
  console.log('Response:', JSON.stringify(data3, null, 2));
}

await conn.end();
