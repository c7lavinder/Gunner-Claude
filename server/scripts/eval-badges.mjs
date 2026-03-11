// Simple script to trigger badge evaluation via HTTP
// This calls the server endpoint directly

const baseUrl = 'http://localhost:3000';

async function runBadgeEval() {
  console.log("Calling batch badge evaluation endpoint...");
  
  try {
    // First, we need to get a valid session - use the super admin impersonation
    const response = await fetch(`${baseUrl}/api/trpc/gamification.batchEvaluateBadges`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Use a special header to bypass auth for internal scripts
        'X-Internal-Script': 'true'
      },
      body: JSON.stringify({})
    });
    
    const data = await response.json();
    console.log("Response:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error:", error.message);
  }
}

runBadgeEval();
