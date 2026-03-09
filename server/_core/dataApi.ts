/**
 * Quick example (matches curl usage):
 *   await callDataApi("Youtube/search", {
 *     query: { gl: "US", hl: "en", q: "manus" },
 *   })
 */
import { ENV } from "./env";

export type DataApiCallOptions = {
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  pathParams?: Record<string, unknown>;
  formData?: Record<string, unknown>;
};

// TODO: Replace Manus Forge API with direct API calls per use case
// The Forge API called Manus's internal BUILT_IN_FORGE_API_URL (e.g., YouTube search).
// Stubbed to return null so the app doesn't crash when Forge vars are missing.
export async function callDataApi(
  apiId: string,
  options: DataApiCallOptions = {}
): Promise<unknown> {
  console.warn(`[DataAPI] Forge API call stubbed: ${apiId} — TODO: Replace with direct API call`);
  return null;
}
