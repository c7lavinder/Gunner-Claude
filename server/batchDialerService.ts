import { ENV } from "./_core/env";

const BATCHDIALER_API_BASE = "https://app.batchdialer.com/api";

// ============ CONFIGURATION ============

/** Maximum time window per API request (15 minutes) - per BatchDialer support recommendation */
const MAX_TIME_WINDOW_MS = 15 * 60 * 1000;

/** Request timeout (30 seconds - shorter than the 120s server-side timeout to fail fast) */
const REQUEST_TIMEOUT_MS = 30_000;

/** Max retries per request */
const MAX_RETRIES = 3;

/** Base delay for exponential backoff (ms) */
const RETRY_BASE_DELAY_MS = 2_000;

/** Max records per page */
const PAGE_SIZE = 50;

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

// ============ API FUNCTIONS ============

/**
 * Fetch a single page of calls from BatchDialer API
 * Uses a shorter timeout (30s) to fail fast instead of waiting for the 120s server timeout
 */
export async function fetchRecentCalls(options: {
  callDate?: string;
  callDateEnd?: string;
  direction?: "inbound" | "outbound";
  disposition?: string;
  page?: number;
  pagelength?: number;
}): Promise<BatchDialerResponse> {
  const params = new URLSearchParams();
  
  if (options.callDate) params.append("callDate", options.callDate);
  if (options.callDateEnd) params.append("callDateEnd", options.callDateEnd);
  if (options.direction) params.append("direction", options.direction);
  if (options.disposition) params.append("disposition", options.disposition);
  if (options.page) params.append("page", options.page.toString());
  if (options.pagelength) params.append("pagelength", (options.pagelength || PAGE_SIZE).toString());

  const url = `${BATCHDIALER_API_BASE}/cdrs${params.toString() ? `?${params.toString()}` : ""}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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
      throw new Error(`BatchDialer API request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`);
    }
    throw error;
  }
}

/**
 * Fetch all pages for a single time window with retry logic
 */
async function fetchAllPagesForWindow(
  windowStart: Date,
  windowEnd: Date,
): Promise<BatchDialerCall[]> {
  const allCalls: BatchDialerCall[] = [];
  let page = 1;
  let hasMore = true;

  const startStr = windowStart.toISOString();
  const endStr = windowEnd.toISOString();
  const windowLabel = `${windowStart.toISOString().slice(11, 16)}-${windowEnd.toISOString().slice(11, 16)}`;

  while (hasMore) {
    const response = await withRetry(
      () => fetchRecentCalls({
        callDate: startStr,
        callDateEnd: endStr,
        page,
        pagelength: PAGE_SIZE,
      }),
      `Page ${page} for window ${windowLabel}`,
    );

    allCalls.push(...response.items);
    console.log(`[BatchDialer] Window ${windowLabel} page ${page}/${response.totalPages}: ${response.items.length} calls`);

    hasMore = page < response.totalPages;
    page++;

    // Small delay between pages to be respectful of rate limits
    if (hasMore) {
      await sleep(500);
    }
  }

  return allCalls;
}

/**
 * Get calls since a specific date, using time-windowed pagination
 * 
 * Instead of one big request for the full time range, this breaks the range
 * into 15-minute windows and paginates within each window.
 * This prevents the 120-second server-side timeout that BatchDialer support identified.
 */
export async function getCallsSince(since: Date): Promise<BatchDialerCall[]> {
  const allCalls: BatchDialerCall[] = [];
  const now = new Date();

  // Break the time range into 15-minute windows
  let windowStart = new Date(since.getTime());
  let windowIndex = 0;
  const totalWindows = Math.ceil((now.getTime() - since.getTime()) / MAX_TIME_WINDOW_MS);

  console.log(`[BatchDialer] Fetching calls from ${since.toISOString()} to ${now.toISOString()}`);
  console.log(`[BatchDialer] Breaking into ${totalWindows} windows of ${MAX_TIME_WINDOW_MS / 60000} minutes each`);

  while (windowStart.getTime() < now.getTime()) {
    const windowEnd = new Date(Math.min(windowStart.getTime() + MAX_TIME_WINDOW_MS, now.getTime()));
    windowIndex++;

    try {
      const windowCalls = await fetchAllPagesForWindow(windowStart, windowEnd);
      allCalls.push(...windowCalls);

      if (windowCalls.length > 0) {
        console.log(`[BatchDialer] Window ${windowIndex}/${totalWindows}: ${windowCalls.length} calls found`);
      }
    } catch (error) {
      // Log the error but continue with the next window
      console.error(`[BatchDialer] Window ${windowIndex}/${totalWindows} failed after retries:`, error);
      console.log(`[BatchDialer] Continuing with next window...`);
    }

    windowStart = windowEnd;

    // Small delay between windows to avoid hammering the API
    if (windowStart.getTime() < now.getTime()) {
      await sleep(1000);
    }
  }

  console.log(`[BatchDialer] Total calls fetched: ${allCalls.length} across ${windowIndex} windows`);
  return allCalls;
}

/**
 * Download call recording from BatchDialer with retry logic
 */
export async function fetchCallRecording(callId: number): Promise<Buffer> {
  return withRetry(async () => {
    const url = `${BATCHDIALER_API_BASE}/callrecording/${callId}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000); // 60s timeout for recordings (larger files)

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "X-ApiKey": ENV.batchDialerApiKey,
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
