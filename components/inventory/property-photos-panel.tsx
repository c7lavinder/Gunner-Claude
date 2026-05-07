'use client'
// components/inventory/property-photos-panel.tsx
// Drag-and-drop photo upload + auto-categorized grid.
//
// Behavior:
// - Drop or click to add JPEG / PNG / WEBP / HEIC files. HEIC is converted
//   to JPEG SERVER-SIDE (heic-convert) so the browser never has to deal
//   with iPhone HEIC variants — the upload just works.
// - 25MB / file limit; bigger files surface an inline error.
// - Each photo shows "Classifying…" until Claude vision lands a category,
//   then snaps into a section (Front / Exterior / Kitchen / Bathroom / Living
//   / Basement / Other).
// - Tiny thumbnails — click any photo to open a fullscreen lightbox with
//   arrow-key + on-screen nav between every photo on the property.
// - Each category section is independently collapsible.
// - "Download all" button bundles every photo into a single zip via JSZip
//   in the browser (no server load).
// - Header carries an editable external photos link (Google Drive / Dropbox).

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Upload, Loader2, Trash2, X, ChevronLeft, ChevronRight, ChevronDown,
  Download, Link as LinkIcon, ExternalLink, Pencil, Check,
} from 'lucide-react'

interface Photo {
  id: string
  filename: string
  mimeType: string
  size: number
  category: string | null
  classificationStatus: string | null
  createdAt: string
  url: string | null
}

const CATEGORY_LABEL: Record<string, string> = {
  front: 'Front',
  exterior: 'Exterior',
  kitchen: 'Kitchen',
  bathroom: 'Bathroom',
  living: 'Living',
  basement: 'Basement',
  other: 'Other',
  uncategorized: 'Uncategorized',
}

const CATEGORY_ORDER = ['front', 'exterior', 'kitchen', 'bathroom', 'living', 'basement', 'other', 'uncategorized']

const ACCEPT = 'image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif'
const MAX_BYTES = 25 * 1024 * 1024

export function PropertyPhotosPanel({
  propertyId,
  fallbackStreetViewUrl,
  initialPhotosLink,
  onCountChange,
}: {
  propertyId: string
  fallbackStreetViewUrl?: string | null
  initialPhotosLink?: string | null
  onCountChange?: (count: number) => void
}) {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [downloading, setDownloading] = useState(false)
  const [photosLink, setPhotosLink] = useState<string | null>(initialPhotosLink ?? null)
  const [editingLink, setEditingLink] = useState(false)
  const [linkDraft, setLinkDraft] = useState(initialPhotosLink ?? '')
  const [savingLink, setSavingLink] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/properties/${propertyId}/photos`)
      if (!res.ok) return
      const data = await res.json()
      const next: Photo[] = data.photos ?? []
      setPhotos(next)
      onCountChange?.(next.length)
    } finally {
      setLoading(false)
    }
  }, [propertyId, onCountChange])

  useEffect(() => { load() }, [load])

  // Poll while any photo is still classifying — refresh every 4s until none.
  useEffect(() => {
    const pending = photos.some(p => p.classificationStatus === 'pending')
    if (!pending) return
    const t = setInterval(() => { load() }, 4000)
    return () => clearInterval(t)
  }, [photos, load])

  async function handleFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList)
    if (incoming.length === 0) return

    setErrors([])
    setUploading(true)
    setUploadProgress({ done: 0, total: incoming.length })

    // 6 in parallel — server can handle the HEIC concurrency without OOM,
    // and total wall time scales with this number when most files are HEIC.
    const BATCH = 6
    const localErrors: string[] = []
    let done = 0
    for (let i = 0; i < incoming.length; i += BATCH) {
      const batch = incoming.slice(i, i + BATCH)
      await Promise.all(batch.map(async file => {
        try {
          if (file.size > MAX_BYTES) {
            localErrors.push(`${file.name}: too large (max 25MB)`)
            return
          }
          const fd = new FormData()
          fd.append('files', file)
          const res = await fetch(`/api/properties/${propertyId}/photos`, { method: 'POST', body: fd })
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            localErrors.push(`${file.name}: ${body.error ?? `upload failed (HTTP ${res.status})`}`)
            return
          }
          const body = await res.json()
          for (const r of (body.created ?? []) as Array<{ id?: string; filename: string; error?: string }>) {
            if (r.error) localErrors.push(`${r.filename}: ${r.error}`)
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'network error'
          console.error('[photos panel] upload error:', file.name, err)
          localErrors.push(`${file.name}: ${msg}`)
        } finally {
          done += 1
          setUploadProgress({ done, total: incoming.length })
        }
      }))
    }

    setErrors(localErrors)
    setUploading(false)
    setUploadProgress(null)
    await load()
  }

  async function deletePhoto(id: string) {
    if (!confirm('Delete this photo?')) return
    const res = await fetch(`/api/properties/${propertyId}/photos/${id}`, { method: 'DELETE' })
    if (res.ok) {
      const next = photos.filter(p => p.id !== id)
      setPhotos(next)
      onCountChange?.(next.length)
    }
  }

  async function downloadAll() {
    if (photos.length === 0 || downloading) return
    setDownloading(true)
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      // Fetch + add each photo. Group folders by category for easy browsing.
      const downloads = photos.map(async p => {
        if (!p.url) return
        try {
          const res = await fetch(p.url)
          if (!res.ok) return
          const blob = await res.blob()
          const folder = CATEGORY_LABEL[p.category ?? 'uncategorized'] ?? 'Other'
          zip.file(`${folder}/${p.filename}`, blob)
        } catch (err) {
          console.error('[photos] zip fetch failed', p.filename, err)
        }
      })
      await Promise.all(downloads)
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `property-photos-${propertyId.slice(0, 8)}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(`Download failed: ${err instanceof Error ? err.message : 'unknown error'}`)
    } finally {
      setDownloading(false)
    }
  }

  async function savePhotosLink() {
    if (savingLink) return
    setSavingLink(true)
    const trimmed = linkDraft.trim()
    const next = trimmed === '' ? null : trimmed
    try {
      const res = await fetch(`/api/properties/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photosLink: next }),
      })
      if (res.ok) {
        setPhotosLink(next)
        setEditingLink(false)
      }
    } finally {
      setSavingLink(false)
    }
  }

  // Group photos by category in the canonical order.
  const grouped = CATEGORY_ORDER
    .map(cat => ({
      key: cat,
      label: CATEGORY_LABEL[cat],
      photos: photos.filter(p => {
        const c = p.classificationStatus === 'pending' ? 'uncategorized' : (p.category ?? 'uncategorized')
        return c === cat
      }),
    }))
    .filter(g => g.photos.length > 0)

  const lightboxPhoto = lightboxIndex != null ? photos[lightboxIndex] : null

  // Lightbox keyboard nav
  useEffect(() => {
    if (lightboxIndex == null) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIndex(null)
      if (e.key === 'ArrowLeft') setLightboxIndex(i => i == null ? null : Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setLightboxIndex(i => i == null ? null : Math.min(photos.length - 1, i + 1))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightboxIndex, photos.length])

  // No photos uploaded yet AND a Street View URL is available → show fallback.
  const showStreetViewFallback = !loading && photos.length === 0 && !!fallbackStreetViewUrl

  return (
    <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
      <div className="px-4 py-2 bg-surface-secondary border-b border-[rgba(0,0,0,0.04)] flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider whitespace-nowrap">
          Photos {photos.length > 0 && <span className="ml-1 text-txt-secondary">({photos.length})</span>}
        </p>

        {/* External photos link */}
        <div className="flex items-center gap-1 flex-1 min-w-0">
          {editingLink ? (
            <>
              <LinkIcon size={11} className="text-txt-muted shrink-0" />
              <input
                autoFocus
                type="url"
                value={linkDraft}
                placeholder="https://drive.google.com/..."
                onChange={e => setLinkDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') savePhotosLink()
                  if (e.key === 'Escape') { setEditingLink(false); setLinkDraft(photosLink ?? '') }
                }}
                className="flex-1 min-w-0 px-2 py-0.5 text-[11px] border-[0.5px] border-[rgba(0,0,0,0.12)] rounded-[6px] focus:outline-none focus:ring-1 focus:ring-gunner-red/30"
                disabled={savingLink}
              />
              <button
                onClick={savePhotosLink}
                disabled={savingLink}
                className="p-1 text-gunner-red hover:bg-white rounded"
                title="Save"
              >
                {savingLink ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              </button>
            </>
          ) : photosLink ? (
            <>
              <a
                href={photosLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] text-gunner-red hover:underline truncate"
                title={photosLink}
              >
                <ExternalLink size={11} className="shrink-0" />
                <span className="truncate">External photos</span>
              </a>
              <button
                onClick={() => { setEditingLink(true); setLinkDraft(photosLink) }}
                className="p-1 text-txt-muted hover:text-gunner-red rounded"
                title="Edit link"
              >
                <Pencil size={10} />
              </button>
            </>
          ) : (
            <button
              onClick={() => { setEditingLink(true); setLinkDraft('') }}
              className="flex items-center gap-1 text-[11px] text-txt-muted hover:text-gunner-red"
              title="Add external photos link"
            >
              <LinkIcon size={11} /> Add external link
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {photos.length > 0 && (
            <button
              onClick={downloadAll}
              disabled={downloading}
              className="text-[10px] font-semibold text-txt-secondary hover:text-gunner-red disabled:opacity-50 px-2 py-1 rounded-[6px] flex items-center gap-1 transition-colors border-[0.5px] border-[rgba(0,0,0,0.12)] hover:border-gunner-red"
              title="Download all photos as zip"
            >
              {downloading ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />}
              {downloading ? 'Zipping…' : 'Download all'}
            </button>
          )}
          <button
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="text-[10px] font-semibold text-white bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-50 px-2.5 py-1 rounded-[6px] flex items-center gap-1 transition-colors"
          >
            {uploading ? <Loader2 size={10} className="animate-spin" /> : <Upload size={10} />}
            {uploading ? `${uploadProgress?.done ?? 0}/${uploadProgress?.total ?? 0}` : 'Add photos'}
          </button>
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={e => {
          if (e.target.files) handleFiles(e.target.files)
          if (fileInput.current) fileInput.current.value = ''
        }}
      />

      {/* Drop zone — shown when no photos OR uploading */}
      {(photos.length === 0 || uploading) && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault()
            setDragOver(false)
            if (e.dataTransfer.files) handleFiles(e.dataTransfer.files)
          }}
          className={`m-3 border-[1.5px] border-dashed rounded-[10px] p-6 text-center transition-colors ${
            dragOver ? 'border-gunner-red bg-gunner-red/5' : 'border-[rgba(0,0,0,0.12)]'
          }`}
        >
          {showStreetViewFallback ? (
            <div className="space-y-3">
              <img src={fallbackStreetViewUrl!} alt="Street view" className="w-full max-h-40 object-cover rounded-[8px]" />
              <p className="text-[11px] text-txt-muted">Street View shown until you upload photos. Drop files here or click <span className="font-semibold">Add photos</span>.</p>
            </div>
          ) : (
            <>
              <Upload size={18} className="mx-auto text-txt-muted mb-1.5" />
              <p className="text-[11px] font-medium text-txt-secondary">Drop photos here or click <span className="text-gunner-red font-semibold">Add photos</span></p>
              <p className="text-[10px] text-txt-muted mt-0.5">JPEG, PNG, WEBP, HEIC · 25MB each · up to 250 per property</p>
            </>
          )}
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="mx-3 mb-3 p-2 bg-red-50 border-[0.5px] border-red-200 rounded-[8px]">
          <p className="text-[10px] font-semibold text-red-700 mb-1">Some uploads failed:</p>
          <ul className="text-[10px] text-red-600 space-y-0.5 max-h-32 overflow-y-auto">
            {errors.map((e, i) => <li key={i}>· {e}</li>)}
          </ul>
        </div>
      )}

      {/* Categorized grid */}
      {!loading && photos.length > 0 && (
        <div className="p-3 space-y-3">
          {grouped.map(group => {
            const isCollapsed = !!collapsed[group.key]
            return (
              <div key={group.key} className="border-[0.5px] border-[rgba(0,0,0,0.06)] rounded-[8px] overflow-hidden">
                <button
                  onClick={() => setCollapsed(c => ({ ...c, [group.key]: !c[group.key] }))}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 bg-surface-secondary hover:bg-surface-tertiary transition-colors"
                >
                  <ChevronDown
                    size={11}
                    className={`text-txt-muted transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                  />
                  <span className="text-[10px] font-bold text-txt-primary uppercase tracking-[0.08em]">{group.label}</span>
                  <span className="text-[10px] text-txt-muted">({group.photos.length})</span>
                </button>
                {!isCollapsed && (
                  <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-1 p-1.5">
                    {group.photos.map(p => {
                      const idx = photos.findIndex(x => x.id === p.id)
                      const classifying = p.classificationStatus === 'pending'
                      return (
                        <div
                          key={p.id}
                          className="aspect-square relative group rounded-[4px] overflow-hidden bg-surface-secondary cursor-pointer"
                          onClick={() => setLightboxIndex(idx)}
                        >
                          {p.url ? (
                            <img src={p.url} alt={p.filename} className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[8px] text-txt-muted">—</div>
                          )}
                          {classifying && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <Loader2 size={10} className="text-white animate-spin" />
                            </div>
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); deletePhoto(p.id) }}
                            className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Delete"
                          >
                            <Trash2 size={9} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Lightbox */}
      {lightboxPhoto && lightboxPhoto.url && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white"
            onClick={e => { e.stopPropagation(); setLightboxIndex(null) }}
          >
            <X size={24} />
          </button>
          {lightboxIndex! > 0 && (
            <button
              className="absolute left-4 p-3 text-white/70 hover:text-white"
              onClick={e => { e.stopPropagation(); setLightboxIndex(i => i == null ? null : i - 1) }}
            >
              <ChevronLeft size={32} />
            </button>
          )}
          <img
            src={lightboxPhoto.url}
            alt={lightboxPhoto.filename}
            className="max-w-[90vw] max-h-[90vh] object-contain"
            onClick={e => e.stopPropagation()}
          />
          {lightboxIndex! < photos.length - 1 && (
            <button
              className="absolute right-4 p-3 text-white/70 hover:text-white"
              onClick={e => { e.stopPropagation(); setLightboxIndex(i => i == null ? null : i + 1) }}
            >
              <ChevronRight size={32} />
            </button>
          )}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-[11px]">
            {lightboxIndex! + 1} / {photos.length} · {lightboxPhoto.filename}
          </div>
        </div>
      )}
    </div>
  )
}
