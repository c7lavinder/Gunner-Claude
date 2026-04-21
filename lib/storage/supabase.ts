// lib/storage/supabase.ts
// Server-only Supabase Storage client for uploaded call audio.
// Bucket: "call-recordings" (must be created in Supabase dashboard, private).

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'call-recordings'

let cachedClient: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (cachedClient) return cachedClient
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Supabase storage not configured: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required')
  }
  cachedClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cachedClient
}

export interface UploadResult {
  status: 'success' | 'error'
  path?: string
  error?: string
}

export async function uploadCallAudio(
  tenantId: string,
  callId: string,
  buffer: Buffer,
  mimeType: string,
): Promise<UploadResult> {
  try {
    const ext = extFromMime(mimeType)
    const path = `${tenantId}/${callId}${ext}`
    const client = getClient()
    const { error } = await client.storage.from(BUCKET).upload(path, buffer, {
      contentType: mimeType,
      upsert: false,
    })
    if (error) return { status: 'error', error: error.message }
    return { status: 'success', path }
  } catch (err: unknown) {
    return { status: 'error', error: err instanceof Error ? err.message : 'upload failed' }
  }
}

export interface SignedUrlResult {
  status: 'success' | 'error'
  url?: string
  error?: string
}

export async function getSignedAudioUrl(path: string, ttlSeconds = 3600): Promise<SignedUrlResult> {
  try {
    const client = getClient()
    const { data, error } = await client.storage.from(BUCKET).createSignedUrl(path, ttlSeconds)
    if (error || !data?.signedUrl) return { status: 'error', error: error?.message ?? 'no url returned' }
    return { status: 'success', url: data.signedUrl }
  } catch (err: unknown) {
    return { status: 'error', error: err instanceof Error ? err.message : 'signed url failed' }
  }
}

export async function deleteCallAudio(path: string): Promise<{ status: 'success' | 'error'; error?: string }> {
  try {
    const client = getClient()
    const { error } = await client.storage.from(BUCKET).remove([path])
    if (error) return { status: 'error', error: error.message }
    return { status: 'success' }
  } catch (err: unknown) {
    return { status: 'error', error: err instanceof Error ? err.message : 'delete failed' }
  }
}

function extFromMime(mime: string): string {
  const m = mime.toLowerCase()
  if (m.includes('mpeg') || m.includes('mp3')) return '.mp3'
  if (m.includes('mp4')) return '.mp4'
  if (m.includes('m4a') || m.includes('x-m4a')) return '.m4a'
  if (m.includes('wav')) return '.wav'
  if (m.includes('webm')) return '.webm'
  if (m.includes('ogg')) return '.ogg'
  return '.bin'
}
