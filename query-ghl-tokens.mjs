import mysql from "mysql2/promise";

const conn = await mysql.createConnection({
  host: "gateway03.us-east-1.prod.aws.tidbcloud.com",
  port: 4000,
  user: "2bTLYzeacnuAd6z.root",
  database: "nusXfQu5XBTMz3NUCR6brb",
  ssl: { rejectUnauthorized: true },
});

console.log("\n=== ghl_oauth_tokens ===");
const [tokens] = await conn.query(`
  SELECT 
    id,
    tenant_id,
    location_id,
    LEFT(access_token, 20) AS access_token_preview,
    LEFT(refresh_token, 20) AS refresh_token_preview,
    expires_at,
    last_refreshed_at,
    is_active,
    last_error
  FROM ghl_oauth_tokens
  ORDER BY tenant_id
`);
console.table(tokens);

console.log("\n=== tenants with crm_config ===");
const [tenants] = await conn.query(`
  SELECT id, name, crm_config, last_ghl_sync
  FROM tenants
  ORDER BY id
`);

for (const t of tenants) {
  console.log(`\nTenant ${t.id}: ${t.name}`);
  console.log(`  last_ghl_sync: ${t.last_ghl_sync}`);
  if (t.crm_config) {
    let cfg;
    try { cfg = JSON.parse(t.crm_config); } catch { cfg = t.crm_config; }
    if (cfg.ghlApiKey) cfg.ghlApiKey = cfg.ghlApiKey.substring(0, 20) + "...";
    console.log("  crm_config:", JSON.stringify(cfg, null, 4));
  } else {
    console.log("  crm_config: NULL");
  }
}

await conn.end();
