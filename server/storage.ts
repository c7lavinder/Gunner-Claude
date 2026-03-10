/**
 * Storage helpers using Supabase Storage (replaces Manus Forge storage proxy)
 * Bucket: gunner-recordings
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://tvjkgumckwapybpjyrkw.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "sb_secret_E58gx6PLR6y5nxEwJt6MjQ_KOlBpMXH";
const BUCKET = "gunner-recordings";

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
  });
}

/**
 * Upload a file to Supabase Storage
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const supabase = getSupabase();
  const key = relKey.replace(/^\/+/, "");

  const buffer = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data as any);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(key, buffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(key);
  return { key, url: urlData.publicUrl };
}

/**
 * Get a public URL for a stored file
 */
export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const supabase = getSupabase();
  const key = relKey.replace(/^\/+/, "");
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(key);
  return { key, url: data.publicUrl };
}
