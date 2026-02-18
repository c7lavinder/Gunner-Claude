import { ENV } from "./_core/env";

const BATCHDIALER_API_BASE = "https://app.batchdialer.com/api";

// ============ CONFIGURATION ============

/** Request timeout (30 seconds) */
const REQUEST_TIMEOUT_MS = 30_000;

/** Max retries per request */
const MAX_RETRIES = 3;

/** Base delay for exponential backoff (ms) */
const RETRY_BASE_DELAY_MS = 2_000;

/** Max records per page (v2 caps at 100) */
const PAGE_SIZE = 100;

// ============ TYPES ============

export interface BatchDialerCall {
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

/** V2 response uses cursor-based pagination via nextPage token */
interface BatchDialerV2Response {
  items: BatchDialerCall[];
  nextPage: string | null;
}

/** Legacy v1 response shape (kept for backward compatibility of fetchRecentCalls return type) */
interface BatchDialerResponse {
  items: BatchDialerCall[];
  page: number;
  totalPages: number;
}

// ============ RETRY LOGIC ============

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with exponential backoff retry
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  context: string,
  maxRetries = MAX_RETRIES,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isTimeout = lastError.message.includes("timed out") || 
                        lastError.message.includes("AbortError") ||
                        lastError.message.includes("SocketError") ||
                        lastError.message.includes("other side closed");
      const isServerError = lastError.message.includes("500") || 
                            lastError.message.includes("502") || 
                            lastError.message.includes("503") ||
                            lastError.message.includes("504");

      // Only retry on timeouts and server errors, not on 4xx client errors
      if (!isTimeout && !isServerError) {
        throw lastError;
      }

      if (attempt < maxRetries) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 1000;
        console.log(`[BatchDialer] ${context} - Attempt ${attempt}/${maxRetries} failed (${lastError.message}). Retrying in ${Math.round(delay / 1000)}s...`);
        await sleep(delay);
      }
    }
  }

  throw new Error(`[BatchDialer] ${context} - All ${maxRetries} attempts failed. Last error: ${lastError?.message}`);
}

// ============ V2 API FUNCTIONS ============

/**
 * Fetch a single page of calls from BatchDialer V2 API
 * Uses cursor-based pagination via next_page param
 */
async function fetchV2Page(options: {
  callDate?: string;
  callDateEnd?: string;
  direction?: "inbound" | "outbound";
  pagelength?: number;
  nextPageCursor?: string;
  apiKey?: string;
}): Promise<BatchDialerV2Response> {
  const params = new URLSearchParams();
  
  if (options.callDate) params.append("callDate", options.callDate);
  if (options.callDateEnd) params.append("callDateEnd", options.callDateEnd);
  if (options.direction) params.append("direction", options.direction);
  params.append("pagelength", (options.pagelength || PAGE_SIZE).toString());
  if (options.nextPageCursor) params.append("next_page", options.nextPageCursor);

  const url = `${BATCHDIALER_API_BASE}/v2/cdrs?${params.toString()}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-ApiKey": options.apiKey || ENV.batchDialerApiKey,
        "Accept": "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`BatchDialer V2 API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`BatchDialer V2 API request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`);
    }
    throw error;
  }
}

/**
 * Fetch a single page of calls - public API (backward compatible)
 * Now uses V2 endpoint internally. The returned page/totalPages are synthetic
 * since V2 uses cursor-based pagination.
 */
export async function fetchRecentCalls(options: {
  callDate?: string;
  callDateEnd?: string;
  direction?: "inbound" | "outbound";
  disposition?: string;
  page?: number;
  pagelength?: number;
  apiKey?: string;
}): Promise<BatchDialerResponse> {
  const v2Response = await fetchV2Page({
    callDate: options.callDate,
    callDateEnd: options.callDateEnd,
    direction: options.direction,
    pagelength: options.pagelength || PAGE_SIZE,
    apiKey: options.apiKey,
  });

  // Return a compatible response shape
  return {
    items: v2Response.items,
    page: 1,
    totalPages: v2Response.nextPage ? 2 : 1, // Signal "there's more" if nextPage exists
  };
}

/**
 * Fetch all calls for a date range using V2 cursor-based pagination
 */
async function fetchAllCallsV2(options: {
  callDate?: string;
  callDateEnd?: string;
  direction?: "inbound" | "outbound";
  apiKey?: string;
  maxPages?: number;
}): Promise<BatchDialerCall[]> {
  const allCalls: BatchDialerCall[] = [];
  let cursor: string | null = null;
  let pageNum = 0;
  const maxPages = options.maxPages || 50; // Safety limit

  while (pageNum < maxPages) {
    pageNum++;

    const response = await withRetry(
      () => fetchV2Page({
        callDate: options.callDate,
        callDateEnd: options.callDateEnd,
        direction: options.direction,
        pagelength: PAGE_SIZE,
        nextPageCursor: cursor || undefined,
        apiKey: options.apiKey,
      }),
      `V2 page ${pageNum}`,
    );

    allCalls.push(...response.items);
    console.log(`[BatchDialer] V2 page ${pageNum}: ${response.items.length} calls (total so far: ${allCalls.length})`);

    cursor = response.nextPage;

    // Stop if no more pages or empty response
    if (!cursor || response.items.length === 0) {
      break;
    }

    // Small delay between pages to be respectful of rate limits
    await sleep(300);
  }

  return allCalls;
}

/**
 * Get calls since a specific date using V2 API with cursor-based pagination
 * 
 * The V2 endpoint is significantly faster than V1 (sub-second vs 60s+ timeouts).
 * Uses cursor-based pagination via next_page tokens instead of page numbers.
 * Still uses time-windowed approach for very large date ranges (>7 days) to
 * keep individual requests fast and avoid hitting any server-side limits.
 */
export async function getCallsSince(since: Date, apiKey?: string): Promise<BatchDialerCall[]> {
  const now = new Date();
  const rangeMs = now.getTime() - since.getTime();
  const rangeDays = rangeMs / (24 * 60 * 60 * 1000);

  console.log(`[BatchDialer] Fetching calls from ${since.toISOString()} to ${now.toISOString()} (${rangeDays.toFixed(1)} days)`);

  // For ranges <= 7 days, fetch directly with cursor pagination (V2 handles this well)
  if (rangeDays <= 7) {
    const calls = await fetchAllCallsV2({
      callDate: since.toISOString(),
      callDateEnd: now.toISOString(),
      apiKey,
    });
    console.log(`[BatchDialer] Total calls fetched: ${calls.length}`);
    return calls;
  }

  // For larger ranges, break into daily windows to keep requests manageable
  const allCalls: BatchDialerCall[] = [];
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  let windowStart = new Date(since.getTime());
  let windowIndex = 0;
  const totalWindows = Math.ceil(rangeMs / ONE_DAY_MS);

  console.log(`[BatchDialer] Breaking into ${totalWindows} daily windows`);

  while (windowStart.getTime() < now.getTime()) {
    const windowEnd = new Date(Math.min(windowStart.getTime() + ONE_DAY_MS, now.getTime()));
    windowIndex++;

    try {
      const windowCalls = await fetchAllCallsV2({
        callDate: windowStart.toISOString(),
        callDateEnd: windowEnd.toISOString(),
        apiKey,
      });
      allCalls.push(...windowCalls);

      if (windowCalls.length > 0) {
        console.log(`[BatchDialer] Window ${windowIndex}/${totalWindows} (${windowStart.toISOString().slice(0, 10)}): ${windowCalls.length} calls`);
      }
    } catch (error) {
      // Log the error but continue with the next window
      console.error(`[BatchDialer] Window ${windowIndex}/${totalWindows} failed after retries:`, error);
      console.log(`[BatchDialer] Continuing with next window...`);
    }

    windowStart = windowEnd;

    // Small delay between windows
    if (windowStart.getTime() < now.getTime()) {
      await sleep(500);
    }
  }

  console.log(`[BatchDialer] Total calls fetched: ${allCalls.length} across ${windowIndex} windows`);
  return allCalls;
}

/**
 * Download call recording from BatchDialer with retry logic
 */
export async function fetchCallRecording(callId: number, apiKey?: string): Promise<Buffer> {
  return withRetry(async () => {
    const url = `${BATCHDIALER_API_BASE}/callrecording/${callId}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000); // 60s timeout for recordings (larger files)

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "X-ApiKey": apiKey || ENV.batchDialerApiKey,
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`BatchDialer recording error: ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`BatchDialer recording download timed out for call ${callId}`);
      }
      throw error;
    }
  }, `Recording download for call ${callId}`);
}
