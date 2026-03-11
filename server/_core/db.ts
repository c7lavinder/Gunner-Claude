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

// #region agent log
pool.on("error", (err) => {
  console.error("[db] Pool background error (non-fatal):", err.message);
});
// #endregion

export const db = drizzle(pool, { schema });
export type Database = typeof db;
