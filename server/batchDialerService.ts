import { ENV } from "./_core/env";

const BATCHDIALER_API_BASE = "https://app.batchdialer.com/api";

interface BatchDialerCall {
  id: number;
  direction: "in" | "out";
  callStartTime: string;
  callEndTime: string;
  did: string;
  customerNumber: string;
  disposition: string;
  mood: string;
  duration: number;
  status: string;
  agent: string | null;
  contact: {
    id: number;
    firstname: string;
    lastname: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    status: string;
    email: string;
  };
  campaign: {
    id: number;
    name: string;
  };
  client: {
    id: number;
    name: string;
  };
  callid: string;
  voicemailid: string | null;
  recordingenabled: number;
  callRecordUrl: string;
  comments: Array<{ id: number; text: string; createdAt: string } | string>;
}

interface BatchDialerResponse {
  items: BatchDialerCall[];
  page: number;
  totalPages: number;
}

/**
 * Fetch recent calls from BatchDialer API
 */
export async function fetchRecentCalls(options: {
  callDate?: string;
  direction?: "inbound" | "outbound";
  disposition?: string;
  page?: number;
  pagelength?: number;
}): Promise<BatchDialerResponse> {
  const params = new URLSearchParams();
  
  if (options.callDate) params.append("callDate", options.callDate);
  if (options.direction) params.append("direction", options.direction);
  if (options.disposition) params.append("disposition", options.disposition);
  if (options.page) params.append("page", options.page.toString());
  if (options.pagelength) params.append("pagelength", options.pagelength.toString());

  const url = `${BATCHDIALER_API_BASE}/cdrs${params.toString() ? `?${params.toString()}` : ""}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 second timeout

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-ApiKey": ENV.batchDialerApiKey,
        "Accept": "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`BatchDialer API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('BatchDialer API request timed out after 120 seconds');
    }
    throw error;
  }
}

/**
 * Download call recording from BatchDialer
 */
export async function fetchCallRecording(callId: number): Promise<Buffer> {
  const url = `${BATCHDIALER_API_BASE}/callrecording/${callId}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-ApiKey": ENV.batchDialerApiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`BatchDialer recording error: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Get calls since a specific date (for polling)
 */
export async function getCallsSince(since: Date): Promise<BatchDialerCall[]> {
  const allCalls: BatchDialerCall[] = [];
  let page = 1;
  let hasMore = true;

  // Format date for BatchDialer API (ISO 8601)
  const callDate = since.toISOString();

  while (hasMore) {
    const response = await fetchRecentCalls({
      callDate,
      page,
      pagelength: 100,
    });

    allCalls.push(...response.items);

    hasMore = page < response.totalPages;
    page++;
  }

  return allCalls;
}
