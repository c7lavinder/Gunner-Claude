import { createClient } from "@supabase/supabase-js";
import { ENV } from "./env";

function getClient() {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceKey) {
    throw new Error("Supabase credentials not configured");
  }
  return createClient(ENV.supabaseUrl, ENV.supabaseServiceKey);
}

export async function uploadFile(
  bucket: string,
  path: string,
  data: Buffer,
  contentType: string
): Promise<string> {
  const supabase = getClient();
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, data, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
  return urlData.publicUrl;
}

export async function downloadFile(bucket: string, path: string): Promise<Buffer> {
  const supabase = getClient();
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`Storage download failed: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function deleteFile(bucket: string, path: string): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw new Error(`Storage delete failed: ${error.message}`);
}
