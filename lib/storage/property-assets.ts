// lib/storage/property-assets.ts
// Server-only Supabase Storage client for property photos + documents.
// Two private buckets: property-photos, property-documents. Buckets are
// auto-created on first use (idempotent) so no manual dashboard setup.
// Path layout: {tenantId}/{propertyId}/{timestamp}-{rand}.{ext}

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const PHOTOS_BUCKET = 'property-photos'
const DOCS_BUCKET = 'property-documents'

let cachedClient: SupabaseClient | null = null
const ensuredBuckets = new Set<string>()

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

async function ensureBucket(name: string) {
  if (ensuredBuckets.has(name)) return
  const client = getClient()
  const { data } = await client.storage.getBucket(name)
  if (data) {
    ensuredBuckets.add(name)
    return
  }
  const { error } = await client.storage.createBucket(name, { public: false })
  // Race-safe: another concurrent request may have created it; ignore that.
  if (error && !/already exists/i.test(error.message)) throw error
  ensuredBuckets.add(name)
}

function safeBasename(name: string) {
  return name.replace(/[^a-z0-9._-]/gi, '_').slice(0, 120)
}

function pathFor(tenantId: string, propertyId: string, filename: string) {
  const ext = (filename.split('.').pop() ?? 'bin').toLowerCase().slice(0, 8)
  const stamp = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `${tenantId}/${propertyId}/${stamp}-${rand}.${ext}`
}

export type UploadResult =
  | { status: 'success'; path: string }
  | { status: 'error'; error: string }

export async function uploadPropertyPhoto(opts: {
  tenantId: string
  propertyId: string
  filename: string
  buffer: Buffer
  mimeType: string
}): Promise<UploadResult> {
  try {
    await ensureBucket(PHOTOS_BUCKET)
    const path = pathFor(opts.tenantId, opts.propertyId, opts.filename)
    const { error } = await getClient().storage.from(PHOTOS_BUCKET).upload(path, opts.buffer, {
      contentType: opts.mimeType, upsert: false,
    })
    if (error) return { status: 'error', error: error.message }
    return { status: 'success', path }
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : 'upload failed' }
  }
}

export async function uploadPropertyDocument(opts: {
  tenantId: string
  propertyId: string
  filename: string
  buffer: Buffer
  mimeType: string
}): Promise<UploadResult> {
  try {
    await ensureBucket(DOCS_BUCKET)
    const ext = (opts.filename.split('.').pop() ?? 'bin').toLowerCase().slice(0, 8)
    const stamp = Date.now().toString(36)
    const rand = Math.random().toString(36).slice(2, 8)
    const safe = safeBasename(opts.filename.replace(/\.[^.]+$/, ''))
    const path = `${opts.tenantId}/${opts.propertyId}/${stamp}-${rand}-${safe}.${ext}`
    const { error } = await getClient().storage.from(DOCS_BUCKET).upload(path, opts.buffer, {
      contentType: opts.mimeType, upsert: false,
    })
    if (error) return { status: 'error', error: error.message }
    return { status: 'success', path }
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : 'upload failed' }
  }
}

export async function getSignedPhotoUrl(path: string, ttlSeconds = 3600): Promise<string | null> {
  return signedUrl(PHOTOS_BUCKET, path, ttlSeconds)
}

export async function getSignedDocumentUrl(path: string, ttlSeconds = 3600): Promise<string | null> {
  return signedUrl(DOCS_BUCKET, path, ttlSeconds)
}

async function signedUrl(bucket: string, path: string, ttl: number): Promise<string | null> {
  try {
    const { data, error } = await getClient().storage.from(bucket).createSignedUrl(path, ttl)
    if (error || !data?.signedUrl) return null
    return data.signedUrl
  } catch {
    return null
  }
}

export async function deletePhoto(path: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { error } = await getClient().storage.from(PHOTOS_BUCKET).remove([path])
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'delete failed' }
  }
}

export async function deleteDocument(path: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { error } = await getClient().storage.from(DOCS_BUCKET).remove([path])
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'delete failed' }
  }
}

export async function fetchPhotoBuffer(path: string): Promise<Buffer | null> {
  try {
    const { data } = await getClient().storage.from(PHOTOS_BUCKET).download(path)
    if (!data) return null
    return Buffer.from(await data.arrayBuffer())
  } catch {
    return null
  }
}
