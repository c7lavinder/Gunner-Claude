// lib/ai/photo-classifier.ts
// Auto-categorize a property photo into one of seven buckets using
// Claude Haiku 4.5 vision. Called fire-and-forget after upload so the
// UI flips a "Classifying…" state to a category chip when done.
//
// Cost: ~$0.001 per photo with Haiku vision. 250 photos ≈ $0.25.

import { anthropic } from '@/config/anthropic'
import { fetchPhotoBuffer } from '@/lib/storage/property-assets'
import {
  buildPhotoClassifierSystemPrompt,
  VERSION as PHOTO_CLASSIFIER_PROMPT_VERSION,
} from '@/lib/ai/prompts/photo-classifier'

export { PHOTO_CLASSIFIER_PROMPT_VERSION }

export const PHOTO_CATEGORIES = [
  'front', 'exterior', 'kitchen', 'bathroom', 'living', 'basement', 'other',
] as const
export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number]

const SUPPORTED_VISION_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'])

export async function classifyPhoto(opts: {
  storagePath: string
  mimeType: string
}): Promise<{ category: PhotoCategory; status: 'done' | 'failed' }> {
  try {
    const mime = opts.mimeType.toLowerCase().replace('image/jpg', 'image/jpeg')
    if (!SUPPORTED_VISION_MIMES.has(mime)) {
      return { category: 'other', status: 'failed' }
    }

    const buf = await fetchPhotoBuffer(opts.storagePath)
    if (!buf) return { category: 'other', status: 'failed' }

    // Claude vision rejects images larger than ~5MB after base64 encoding.
    // For oversized photos, we'd need to resize — for now, skip classification
    // and mark as 'other' so the UI doesn't sit on "Classifying…" forever.
    if (buf.length > 4 * 1024 * 1024) {
      return { category: 'other', status: 'failed' }
    }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16,
      system: buildPhotoClassifierSystemPrompt(),
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mime as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
              data: buf.toString('base64'),
            },
          },
          { type: 'text', text: 'Categorize this photo.' },
        ],
      }],
    })

    const text = response.content[0]?.type === 'text'
      ? response.content[0].text.trim().toLowerCase()
      : ''

    const matched = PHOTO_CATEGORIES.find(c => text === c || text.startsWith(c))
    return { category: matched ?? 'other', status: 'done' }
  } catch (err) {
    console.error('[photo-classifier] failed:', err instanceof Error ? err.message : err)
    return { category: 'other', status: 'failed' }
  }
}
