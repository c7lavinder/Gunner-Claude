/**
 * Script to trigger reprocessing of specific calls via HTTP
 * This calls the app's reprocess endpoint directly
 */

const BASE_URL = 'http://localhost:3000';

async function reprocessCall(callId) {
  console.log(`Triggering reprocess for call ${callId}...`);
  
  try {
    const response = await fetch(`${BASE_URL}/api/trpc/calls.reprocess`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        json: { callId }
      })
    });
    
    const result = await response.json();
    console.log(`  Call ${callId}: ${response.ok ? '✓ Queued' : '✗ Failed'}`);
    if (!response.ok) {
      console.log(`    Error: ${JSON.stringify(result)}`);
    }
    return response.ok;
  } catch (error) {
    console.log(`  Call ${callId}: ✗ Error - ${error.message}`);
    return false;
  }
}

async function main() {
  // Call IDs that failed due to billing issue
  const failedCallIds = [90001, 90002, 90005, 60003];
  
  console.log(`\nReprocessing ${failedCallIds.length} failed calls...\n`);
  
  for (const callId of failedCallIds) {
    await reprocessCall(callId);
    // Small delay between calls
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log('\n✓ All calls queued for reprocessing');
  console.log('  Check the server logs to monitor progress.');
}

main().catch(console.error);
