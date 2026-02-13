/**
 * BatchLeads Service
 * 
 * Provides property data enrichment and skip tracing via the BatchLeads API.
 * BatchLeads is a property intelligence platform — it provides:
 *   - Property details (owner, value, equity, mortgage info)
 *   - Skip tracing (phone numbers, emails for property owners)
 *   - Property lists and lead generation data
 * 
 * This is NOT a dialer — that's BatchDialer. These are two separate products.
 */

import { ENV } from "./_core/env";

const BATCHLEADS_API_BASE = "https://app.batchleads.io/api/v1";

// ============ CONFIGURATION ============

/** Request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 30_000;

/** Max retries for failed requests */
const MAX_RETRIES = 3;

/** Base delay for exponential backoff */
const RETRY_BASE_DELAY_MS = 2_000;

// ============ TYPES ============

export interface BatchLeadsProperty {
  id: number;
  address: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  owner_first_name?: string;
  owner_last_name?: string;
  owner_mailing_address?: string;
  owner_mailing_city?: string;
  owner_mailing_state?: string;
  owner_mailing_zip?: string;
  property_type?: string;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  lot_size?: number;
  year_built?: number;
  estimated_value?: number;
  estimated_equity?: number;
  mortgage_balance?: number;
  last_sale_date?: string;
  last_sale_price?: number;
  tax_amount?: number;
  owner_occupied?: boolean;
  vacant?: boolean;
  tags?: string[];
  phone_numbers?: string[];
  emails?: string[];
}

export interface BatchLeadsUsageStats {
  Properties: {
    total_properties: number;
    properties_used: number;
    properties_remaining: number;
  };
  SubUsers: {
    total_sub_users: number;
  };
  SkipTracing?: {
    total_skip_traces: number;
    skip_traces_used: number;
    skip_traces_remaining: number;
  };
}

export interface BatchLeadsSearchResult {
  status: number;
  message: string;
  data: {
    properties: BatchLeadsProperty[];
    total: number;
    page: number;
    per_page: number;
  };
}

// ============ HELPERS ============

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  context: string,
  maxRetries = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 1000;
        console.log(`[BatchLeads] ${context} - Attempt ${attempt}/${maxRetries} failed (${lastError.message}). Retrying in ${Math.round(delay / 1000)}s...`);
        await sleep(delay);
      }
    }
  }
  throw new Error(`[BatchLeads] ${context} - All ${maxRetries} attempts failed. Last error: ${lastError?.message}`);
}

// ============ API METHODS ============

/**
 * Validate a BatchLeads API key by checking usage stats
 */
export async function validateApiKey(apiKey?: string): Promise<{
  valid: boolean;
  usage?: BatchLeadsUsageStats;
  error?: string;
}> {
  const key = apiKey || ENV.batchLeadsApiKey;
  if (!key) {
    return { valid: false, error: "No API key provided" };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(`${BATCHLEADS_API_BASE}/user/check-usage`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "api-key": key,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { valid: false, error: "Invalid API key" };
      }
      return { valid: false, error: `BatchLeads API error: ${response.status} ${response.statusText}` };
    }

    const data = await response.json();
    if (data.status !== 1) {
      return { valid: false, error: data.message || "API validation failed" };
    }

    return { valid: true, usage: data.data };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { valid: false, error: "Request timed out" };
    }
    return { valid: false, error: `Connection failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Search for a property by address in BatchLeads
 */
export async function searchPropertyByAddress(
  address: string,
  apiKey?: string
): Promise<BatchLeadsProperty | null> {
  const key = apiKey || ENV.batchLeadsApiKey;
  if (!key) {
    console.error("[BatchLeads] No API key available");
    return null;
  }

  return withRetry(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${BATCHLEADS_API_BASE}/property/search`, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "api-key": key,
        },
        body: JSON.stringify({
          address: address,
          per_page: 1,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`BatchLeads API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (data.status !== 1 || !data.data?.properties?.length) {
        return null;
      }

      return data.data.properties[0] as BatchLeadsProperty;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error("BatchLeads API request timed out");
      }
      throw error;
    }
  }, `Property search: ${address}`);
}

/**
 * Skip trace a property to get owner contact information
 */
export async function skipTraceProperty(
  propertyId: number,
  apiKey?: string
): Promise<{
  phones: string[];
  emails: string[];
} | null> {
  const key = apiKey || ENV.batchLeadsApiKey;
  if (!key) {
    console.error("[BatchLeads] No API key available");
    return null;
  }

  return withRetry(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${BATCHLEADS_API_BASE}/property/${propertyId}/skip-trace`, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "api-key": key,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`BatchLeads skip trace error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return {
        phones: data.data?.phone_numbers || [],
        emails: data.data?.emails || [],
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error("BatchLeads skip trace request timed out");
      }
      throw error;
    }
  }, `Skip trace property: ${propertyId}`);
}

/**
 * Get property details by ID
 */
export async function getPropertyById(
  propertyId: number,
  apiKey?: string
): Promise<BatchLeadsProperty | null> {
  const key = apiKey || ENV.batchLeadsApiKey;
  if (!key) {
    console.error("[BatchLeads] No API key available");
    return null;
  }

  return withRetry(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${BATCHLEADS_API_BASE}/property/${propertyId}`, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "api-key": key,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`BatchLeads API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (data.status !== 1 || !data.data) {
        return null;
      }

      return data.data as BatchLeadsProperty;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error("BatchLeads API request timed out");
      }
      throw error;
    }
  }, `Get property: ${propertyId}`);
}
