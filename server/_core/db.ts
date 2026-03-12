import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../../drizzle/schema";
import { ENV } from "./env";

const pool = new pg.Pool({
  connectionString: ENV.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Set a 30-second statement timeout so no query can hang indefinitely
pool.on("connect", (client) => {
  client.query("SET statement_timeout = 30000").catch(() => {});
});

pool.on("error", (err) => {
  console.error("[db] Pool background error (non-fatal):", err.message);
});

export const db = drizzle(pool, { schema });
export type Database = typeof db;
