'use client'
// components/inventory/property-photos-panel.tsx
// Drag-and-drop photo upload + auto-categorized grid.
//
// - Drop or click to add JPEG / PNG / WEBP / HEIC. Server converts HEIC to
//   JPEG via heic-convert (libheif/wasm) so the browser stays simple.
// - 25MB / file. Each photo classifies into Front / Exterior / Kitchen /
//   Bathroom / Living / Basement / Other via Claude vision.
// - Users can drag any tile onto another section header to manually
//   reclassify (overrides Claude vision). All canonical sections render
//   while dragging so empty sections are valid drop targets.
// - Starred ("cover") photo always renders first in the grid AND as a big
//   hero image above the sections. One star per property; starring a new
//   one auto-unstars the previous.
// - Sections are collapsed by default. "Expand all" / "Collapse all"
//   toggles every section in one click.
// - Tiny thumbnails — click any to open a fullscreen lightbox with arrow-
//   key + on-screen nav. Body scroll locks while the lightbox is open.
// - Per-section delete + star buttons, "Download all" zips everything,
//   header carries an editable external photos link.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Upload, Loader2, Trash2, X, ChevronLeft, ChevronRight, ChevronDown,
  Download, Link as LinkIcon, ExternalLink, Pencil, Check, Star,
  ChevronsUpDown, ChevronsDownUp,
} from 'lucide-react'
import {
  DndContext, PointerSensor, TouchSensor, useSensor, useSensors,
  useDraggable, useDroppable, DragOverlay,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'

interface Photo {
  id: string
  filename: string
  mimeType: string
  size: number
  category: string | null
  classificationStatus: string | null
  isStarred: boolean
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
// Categories the API accepts for manual reclassification — `uncategorized`
// is a pre-classification state, not a writable target.
const WRITABLE_CATEGORIES = ['front', 'exterior', 'kitchen', 'bathroom', 'living', 'basement', 'other']

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
  // Track explicitly-expanded sections (set membership). Default: empty =
  // every section collapsed. Persists per property so the user's view
  // survives page reloads.
  const storageKey = `photos:expanded:${propertyId}`
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [downloading, setDownloading] = useState(false)
  const [photosLink, setPhotosLink] = useState<string | null>(initialPhotosLink ?? null)
  const [editingLink, setEditingLink] = useState(false)
  const [linkDraft, setLinkDraft] = useState(initialPhotosLink ?? '')
  const [savingLink, setSavingLink] = useState(false)
  // Drag-and-drop reclassification state. `draggingPhotoId` is set while a
  // tile is being dragged so we can render every canonical section as a
  // drop target (even empty ones) and dim the source tile. Per-section
  // hover highlighting comes from `useDroppable().isOver` locally — we
  // deliberately do NOT track a global "active drop target" key because
  // setting state on every pointermove is what made the panel lag.
  const [draggingPhotoId, setDraggingPhotoId] = useState<string | null>(null)
  // Bulk selection. When `selectMode` is on, tile taps toggle membership in
  // `selectedIds` instead of opening the lightbox. Dragging any selected
  // tile moves the whole set together.
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const fileInput = useRef<HTMLInputElement>(null)

  // Hydrate expanded state from localStorage on mount (client-only).
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null
      if (raw) setExpanded(new Set(JSON.parse(raw) as string[]))
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  function persistExpanded(next: Set<string>) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(Array.from(next)))
    } catch {}
  }

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

  // Lock body scroll while the lightbox is open. Restored on close + unmount.
  useEffect(() => {
    if (lightboxIndex == null) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = original }
  }, [lightboxIndex])

  async function handleFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList)
    if (incoming.length === 0) return

    setErrors([])
    setUploading(true)
    setUploadProgress({ done: 0, total: incoming.length })

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

  async function toggleStar(id: string, current: boolean) {
    // Optimistic update — flip locally so the UI snaps even if the server is
    // a beat behind. Server reconciles the "only one starred" invariant.
    setPhotos(prev => prev.map(p => {
      if (p.id === id) return { ...p, isStarred: !current }
      if (!current && p.isStarred) return { ...p, isStarred: false }
      return p
    }))
    const res = await fetch(`/api/properties/${propertyId}/photos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isStarred: !current }),
    })
    if (!res.ok) {
      // Revert on failure by reloading from server.
      load()
    }
  }

  async function reclassifyMany(ids: string[], nextCategory: string) {
    if (ids.length === 0) return
    // Skip photos already in the target category — saves needless PATCHes.
    const toMove = photos.filter(p => {
      if (!ids.includes(p.id)) return false
      const currentCat = p.classificationStatus === 'pending' ? 'uncategorized' : (p.category ?? 'uncategorized')
      return currentCat !== nextCategory
    })
    if (toMove.length === 0) return
    const movingIds = new Set(toMove.map(p => p.id))
    // Optimistic — flip category locally for all in the set.
    setPhotos(prev => prev.map(p => movingIds.has(p.id)
      ? { ...p, category: nextCategory, classificationStatus: 'done' }
      : p,
    ))
    // Auto-expand the destination so the user sees where they landed.
    setExpanded(prev => {
      if (prev.has(nextCategory)) return prev
      const next = new Set(prev)
      next.add(nextCategory)
      persistExpanded(next)
      return next
    })
    // Fire PATCHes in parallel. If any fail, reload from server to reconcile.
    const results = await Promise.all(
      toMove.map(p => fetch(`/api/properties/${propertyId}/photos/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: nextCategory }),
      }).catch(() => null)),
    )
    if (results.some(r => !r || !r.ok)) load()
  }

  async function downloadAll() {
    if (photos.length === 0 || downloading) return
    setDownloading(true)
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
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

  // Group photos by category in the canonical order. Starred photos sort
  // first within their category (server already orders them that way).
  // While dragging, every writable section renders even if empty so users
  // can drop onto a section that doesn't have any photos yet.
  const grouped = useMemo(() => CATEGORY_ORDER
    .map(cat => ({
      key: cat,
      label: CATEGORY_LABEL[cat],
      photos: photos.filter(p => {
        const c = p.classificationStatus === 'pending' ? 'uncategorized' : (p.category ?? 'uncategorized')
        return c === cat
      }),
    }))
    .filter(g => g.photos.length > 0 || (draggingPhotoId !== null && WRITABLE_CATEGORIES.includes(g.key))),
    [photos, draggingPhotoId])

  const starredPhoto = useMemo(() => photos.find(p => p.isStarred) ?? null, [photos])
  const draggingPhoto = useMemo(
    () => (draggingPhotoId ? photos.find(p => p.id === draggingPhotoId) ?? null : null),
    [draggingPhotoId, photos],
  )
  // The set of photo ids being moved by the current drag. If the user
  // started dragging a *selected* tile, the whole selection moves
  // together. Otherwise just the one tile.
  const dragSet = useMemo<Set<string>>(() => {
    if (!draggingPhotoId) return new Set()
    if (selectedIds.has(draggingPhotoId) && selectedIds.size > 1) return selectedIds
    return new Set([draggingPhotoId])
  }, [draggingPhotoId, selectedIds])

  // Pointer for mouse/trackpad (5px before drag starts so a click still
  // opens the lightbox). Touch sensor uses a short hold so tap-to-open
  // and drag-to-move don't collide on phones / iPads.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  // Refs to the latest state so tile callbacks can be stable across
  // renders. Stable callbacks are what let DraggableTile use React.memo
  // and skip re-rendering when unrelated state changes.
  const stateRef = useRef({ photos, selectMode, selectedIds })
  useEffect(() => {
    stateRef.current = { photos, selectMode, selectedIds }
  })

  const handleTileTap = useCallback((id: string) => {
    const { selectMode, photos } = stateRef.current
    if (selectMode) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    } else {
      const idx = photos.findIndex(p => p.id === id)
      if (idx >= 0) setLightboxIndex(idx)
    }
  }, [])

  const handleTileStar = useCallback((id: string) => {
    const { photos } = stateRef.current
    const p = photos.find(x => x.id === id)
    if (p) toggleStar(p.id, p.isStarred)
    // toggleStar/deletePhoto are closures over component scope — fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleTileDelete = useCallback((id: string) => {
    deletePhoto(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleDragStart(e: DragStartEvent) {
    setDraggingPhotoId(String(e.active.id))
  }

  function handleDragEnd(e: DragEndEvent) {
    const draggedId = String(e.active.id)
    const targetKey = e.over ? String(e.over.id) : null
    // Snapshot the set BEFORE we clear drag state — clearing nukes selectedIds.
    const ids = selectedIds.has(draggedId) && selectedIds.size > 1
      ? Array.from(selectedIds)
      : [draggedId]
    setDraggingPhotoId(null)
    if (!targetKey || !WRITABLE_CATEGORIES.includes(targetKey)) return
    reclassifyMany(ids, targetKey)
    // Exit select mode + clear selection after a successful bulk move.
    if (ids.length > 1) {
      setSelectMode(false)
      setSelectedIds(new Set())
    }
  }

  function toggleSelectMode() {
    setSelectMode(prev => {
      if (prev) setSelectedIds(new Set())
      return !prev
    })
  }

  function toggleSection(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      persistExpanded(next)
      return next
    })
  }

  function expandAll() {
    const next = new Set(grouped.map(g => g.key))
    setExpanded(next)
    persistExpanded(next)
  }

  function collapseAll() {
    const next = new Set<string>()
    setExpanded(next)
    persistExpanded(next)
  }

  const allExpanded = grouped.length > 0 && grouped.every(g => expanded.has(g.key))

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
              onClick={toggleSelectMode}
              className={`text-[10px] font-semibold px-2 py-1 rounded-[6px] flex items-center gap-1 transition-colors border-[0.5px] ${
                selectMode
                  ? 'bg-gunner-red text-white border-gunner-red'
                  : 'text-txt-secondary hover:text-gunner-red border-[rgba(0,0,0,0.12)] hover:border-gunner-red'
              }`}
              title={selectMode ? 'Exit select mode' : 'Select multiple photos to drag together'}
            >
              {selectMode
                ? `${selectedIds.size} selected · Done`
                : 'Select'}
            </button>
          )}
          {grouped.length > 0 && (
            <button
              onClick={allExpanded ? collapseAll : expandAll}
              className="text-[10px] font-semibold text-txt-secondary hover:text-gunner-red px-2 py-1 rounded-[6px] flex items-center gap-1 transition-colors border-[0.5px] border-[rgba(0,0,0,0.12)] hover:border-gunner-red"
              title={allExpanded ? 'Collapse all sections' : 'Expand all sections'}
            >
              {allExpanded ? <ChevronsDownUp size={10} /> : <ChevronsUpDown size={10} />}
              {allExpanded ? 'Collapse all' : 'Expand all'}
            </button>
          )}
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

      {/* Cover photo hero — large display of the starred photo above the
          grid. Click opens the lightbox at that photo. Hidden if no photo
          is starred or while uploading from the empty state. */}
      {!loading && starredPhoto && starredPhoto.url && (
        <div className="px-3 pt-3">
          <div
            className="relative w-full aspect-[16/9] rounded-[10px] overflow-hidden bg-surface-secondary cursor-pointer group"
            onClick={() => {
              const idx = photos.findIndex(p => p.id === starredPhoto.id)
              if (idx >= 0) setLightboxIndex(idx)
            }}
          >
            <img
              src={starredPhoto.url}
              alt={starredPhoto.filename}
              className="w-full h-full object-cover"
            />
            <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full bg-amber-400/95 text-white text-[10px] font-bold uppercase tracking-wider shadow-sm pointer-events-none">
              <Star size={10} fill="currentColor" /> Cover
            </div>
            <button
              onClick={e => { e.stopPropagation(); toggleStar(starredPhoto.id, true) }}
              className="absolute top-2 right-2 px-2 py-1 rounded-full bg-black/60 hover:bg-black/80 text-white text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity"
              title="Remove as cover photo"
            >
              Unstar
            </button>
          </div>
        </div>
      )}

      {/* Categorized grid — sections stay in whatever open/closed state the
          user set, even during drag. The whole section card is a droppable
          (via useDroppable), so a user can drop on a collapsed section
          header just fine — nothing expands, nothing reflows. Empty
          writable sections appear as small header-only drop zones only
          while a drag is in flight. */}
      {!loading && photos.length > 0 && (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDraggingPhotoId(null)}
        >
          <div className="p-3 space-y-2">
            {grouped.map(group => {
              const isOpen = expanded.has(group.key)
              const isEmptyDuringDrag = group.photos.length === 0 && draggingPhotoId !== null
              return (
                <DroppableSection
                  key={group.key}
                  groupKey={group.key}
                  label={group.label}
                  count={group.photos.length}
                  isOpen={isOpen}
                  isActiveDrag={draggingPhotoId !== null}
                  onToggle={() => toggleSection(group.key)}
                >
                  {isOpen && group.photos.length > 0 && (
                    <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-1 p-1.5">
                      {group.photos.map(p => (
                        <DraggableTile
                          key={p.id}
                          photo={p}
                          selectMode={selectMode}
                          isSelected={selectedIds.has(p.id)}
                          isInDragSet={dragSet.has(p.id)}
                          onTap={handleTileTap}
                          onStar={handleTileStar}
                          onDelete={handleTileDelete}
                        />
                      ))}
                    </div>
                  )}
                  {isEmptyDuringDrag && (
                    <div className="px-2.5 py-1.5 text-[10px] text-txt-muted italic">
                      Drop here to move into {group.label}
                    </div>
                  )}
                </DroppableSection>
              )
            })}
          </div>
          <DragOverlay dropAnimation={null}>
            {draggingPhoto && draggingPhoto.url ? (
              <div className="relative w-20 h-20 rounded-[6px] overflow-hidden shadow-2xl ring-2 ring-gunner-red bg-white">
                <img src={draggingPhoto.url} alt="" className="w-full h-full object-cover" />
                {dragSet.size > 1 && (
                  <div className="absolute -top-2 -right-2 min-w-[22px] h-[22px] px-1 rounded-full bg-gunner-red text-white text-[11px] font-bold flex items-center justify-center shadow-md ring-2 ring-white">
                    {dragSet.size}
                  </div>
                )}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
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
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-[11px] flex items-center gap-2">
            {lightboxPhoto.isStarred && <Star size={11} fill="currentColor" className="text-amber-400" />}
            {lightboxIndex! + 1} / {photos.length} · {lightboxPhoto.filename}
          </div>
        </div>
      )}
    </div>
  )
}

// Single photo tile. Wires @dnd-kit's useDraggable so it works for both
// mouse + touch. We suppress the click handler if the user actually
// dragged (dnd-kit gives us isDragging) so a tap still opens the lightbox
// but a drag doesn't accidentally open it on drop.
//
// Memoized with custom equality so re-renders only fire when this tile's
// own data or selection state changes. Stable callbacks from the parent
// (via useRef + useCallback) are what make the memo effective.
function DraggableTileImpl({
  photo,
  selectMode,
  isSelected,
  isInDragSet,
  onTap,
  onStar,
  onDelete,
}: {
  photo: Photo
  selectMode: boolean
  isSelected: boolean
  isInDragSet: boolean
  onTap: (id: string) => void
  onStar: (id: string) => void
  onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: photo.id })
  const classifying = photo.classificationStatus === 'pending'
  const dimmed = isDragging || isInDragSet
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ touchAction: 'none' }}
      className={`aspect-square relative group rounded-[4px] overflow-hidden bg-surface-secondary cursor-grab active:cursor-grabbing ${
        isSelected ? 'ring-2 ring-blue-500' : photo.isStarred ? 'ring-2 ring-amber-400' : ''
      } ${dimmed ? 'opacity-30' : ''}`}
      onClick={e => {
        if (isDragging) { e.preventDefault(); return }
        onTap(photo.id)
      }}
      title={selectMode ? 'Tap to select · drag any selected photo to move them together' : 'Drag to move to another section · click to open'}
    >
      {photo.url ? (
        <img src={photo.url} alt={photo.filename} className="w-full h-full object-cover pointer-events-none" loading="lazy" draggable={false} />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[8px] text-txt-muted">—</div>
      )}
      {classifying && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center pointer-events-none">
          <Loader2 size={10} className="text-white animate-spin" />
        </div>
      )}
      {/* Selection checkmark — replaces the star/hover actions while in
          select mode so there's no overlap. */}
      {selectMode && (
        <div className={`absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center pointer-events-none ${
          isSelected ? 'bg-blue-500 text-white' : 'bg-white/80 border border-black/20'
        }`}>
          {isSelected && <Check size={9} strokeWidth={3} />}
        </div>
      )}
      {!selectMode && photo.isStarred && (
        <div className="absolute top-0.5 left-0.5 p-0.5 rounded-full bg-amber-400 text-white pointer-events-none">
          <Star size={9} fill="currentColor" />
        </div>
      )}
      {/* Hover actions (hidden in select mode). onPointerDown stop is
          critical — without it the dnd-kit listener swallows the press
          and the click never fires. */}
      {!selectMode && (
        <>
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onStar(photo.id) }}
            className={`absolute top-0.5 left-0.5 p-0.5 rounded-full ${photo.isStarred ? 'opacity-0' : 'bg-black/60 text-white opacity-0 group-hover:opacity-100'} transition-opacity`}
            title={photo.isStarred ? 'Unstar' : 'Star (set as cover photo)'}
          >
            <Star size={9} />
          </button>
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onDelete(photo.id) }}
            className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
            title="Delete"
          >
            <Trash2 size={9} />
          </button>
        </>
      )}
    </div>
  )
}

const DraggableTile = memo(DraggableTileImpl, (prev, next) => {
  // Re-render only when the tile's own data or selection state changes.
  // The parent's `photos` array changes whenever any tile is added /
  // removed / starred / recategorized, so without this gate every tile
  // would re-render on every state change — that's the lag the user felt.
  return (
    prev.photo.id === next.photo.id
    && prev.photo.url === next.photo.url
    && prev.photo.isStarred === next.photo.isStarred
    && prev.photo.category === next.photo.category
    && prev.photo.classificationStatus === next.photo.classificationStatus
    && prev.selectMode === next.selectMode
    && prev.isSelected === next.isSelected
    && prev.isInDragSet === next.isInDragSet
    && prev.onTap === next.onTap
    && prev.onStar === next.onStar
    && prev.onDelete === next.onDelete
  )
})

// Section card that acts as a drop target via useDroppable. Header toggles
// expand/collapse with a normal click. The whole card is the drop zone so
// dropping on a collapsed header works — no need to expand the section
// (and no layout reflow / scroll-jump while dragging).
function DroppableSection({
  groupKey,
  label,
  count,
  isOpen,
  isActiveDrag,
  onToggle,
  children,
}: {
  groupKey: string
  label: string
  count: number
  isOpen: boolean
  isActiveDrag: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  const writable = WRITABLE_CATEGORIES.includes(groupKey)
  const { setNodeRef, isOver } = useDroppable({
    id: groupKey,
    disabled: !writable,
  })
  const showDropHint = isActiveDrag && writable
  return (
    <div
      ref={setNodeRef}
      className={`border-[0.5px] rounded-[8px] overflow-hidden ${
        isOver ? 'border-gunner-red bg-gunner-red/5' : 'border-[rgba(0,0,0,0.06)]'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left ${
          isOver ? 'bg-gunner-red/10' : 'bg-surface-secondary hover:bg-surface-tertiary'
        }`}
      >
        <ChevronDown
          size={11}
          className={`text-txt-muted ${isOpen ? '' : '-rotate-90'}`}
        />
        <span className="text-[10px] font-bold text-txt-primary uppercase tracking-[0.08em]">{label}</span>
        <span className="text-[10px] text-txt-muted">({count})</span>
        {showDropHint && (
          <span className="ml-auto text-[9px] font-semibold text-gunner-red uppercase tracking-wider">
            Drop to move
          </span>
        )}
      </button>
      {children}
    </div>
  )
}
