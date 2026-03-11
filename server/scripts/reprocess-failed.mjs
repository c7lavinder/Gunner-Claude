/**
 * Script to reprocess calls that failed due to billing/transcription issues
 * Run with: node scripts/reprocess-failed.mjs
 */

import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

async function main() {
  console.log('Connecting to database...');
  
  // Parse connection URL
  const url = new URL(DATABASE_URL);
  const connection = await mysql.createConnection({
    host: url.hostname,
    port: parseInt(url.port) || 3306,
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    ssl: {
      rejectUnauthorized: true
    }
  });

  try {
    // Find calls that are stuck in processing states
    console.log('\nFinding stuck/failed calls...');
    const [stuckCalls] = await connection.execute(`
      SELECT id, contactName, contactPhone, status, classification, duration, createdAt, recordingUrl
      FROM calls 
      WHERE status IN ('pending', 'transcribing', 'classifying', 'grading', 'failed')
      ORDER BY createdAt DESC
    `);

    console.log(`\nFound ${stuckCalls.length} calls to reprocess:`);
    for (const call of stuckCalls) {
      console.log(`  - ID ${call.id}: ${call.contactName || call.contactPhone || 'Unknown'} (status: ${call.status}, duration: ${call.duration}s)`);
    }

    if (stuckCalls.length === 0) {
      console.log('\nNo calls need reprocessing!');
      return;
    }

    // Reset status to pending for reprocessing
    const callIds = stuckCalls.map(c => c.id);
    console.log(`\nResetting ${callIds.length} calls to pending status...`);
    
    await connection.execute(`
      UPDATE calls 
      SET status = 'pending', classification = 'pending'
      WHERE id IN (${callIds.join(',')})
    `);

    console.log('\n✓ Calls reset to pending. They will be reprocessed by the next polling cycle.');
    console.log('  The GHL polling service runs every 30 seconds and will pick up these calls.');

  } finally {
    await connection.end();
  }
}

main().catch(console.error);
