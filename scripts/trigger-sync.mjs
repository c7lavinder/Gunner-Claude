// Trigger manual BatchDialer sync via tRPC endpoint
const API_URL = "https://3000-iuckmproyov1k7g9dwzd0-21ab7468.us1.manus.computer/api/trpc/calls.syncBatchDialer";

console.log("Triggering BatchDialer sync...");

try {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  console.log("Response status:", response.status);
  
  if (response.ok) {
    const data = await response.json();
    console.log("Sync result:", JSON.stringify(data, null, 2));
  } else {
    const text = await response.text();
    console.log("Error:", text);
  }
} catch (error) {
  console.error("Failed to trigger sync:", error);
}
