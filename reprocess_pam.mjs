import { drizzle } from "drizzle-orm/mysql2/promise";
import mysql from "mysql2/promise";
import { calls } from "./drizzle/schema.js";
import { eq } from "drizzle-orm";

const connection = await mysql.createConnection({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
});

const db = drizzle(connection);

// Find Pam Daly call
const pamCalls = await db
  .select()
  .from(calls)
  .where(sql`contactName LIKE '%Pam%'`);

console.log("Found calls:", pamCalls);

if (pamCalls.length > 0) {
  const call = pamCalls[0];
  console.log(`Found Pam Daly call: ID=${call.id}, Status=${call.status}, Duration=${call.duration}s`);
  
  // Reset status to pending
  await db.update(calls).set({ status: "pending" }).where(eq(calls.id, call.id));
  console.log(`Reset call ${call.id} to pending status`);
}

await connection.end();
