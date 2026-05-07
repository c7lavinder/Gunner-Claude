'use client'
// components/inventory/property-documents-panel.tsx
// Flat document list with file-type icons. Drag-and-drop upload, click to
// download (signed URL), inline rename, delete on hover. 50MB / file limit.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Upload, Loader2, Trash2, Download, Pencil, Check, X,
  FileText, FileSpreadsheet, FileImage, FileArchive, File as FileIcon,
} from 'lucide-react'

interface Doc {
  id: string
  filename: string
  mimeType: string
  size: number
  createdAt: string
  uploadedByName: string | null
  url: string | null
}

const MAX_BYTES = 50 * 1024 * 1024

function iconFor(mime: string, name: string) {
  const m = mime.toLowerCase()
  const n = name.toLowerCase()
  if (m.includes('pdf') || n.endsWith('.pdf')) return { Icon: FileText, color: 'text-red-500' }
  if (m.includes('sheet') || /\.(xlsx?|csv)$/.test(n)) return { Icon: FileSpreadsheet, color: 'text-green-600' }
  if (m.includes('word') || /\.docx?$/.test(n)) return { Icon: FileText, color: 'text-blue-600' }
  if (m.startsWith('image/')) return { Icon: FileImage, color: 'text-purple-500' }
  if (m.includes('zip') || m.includes('compressed') || /\.(zip|rar|7z|tar|gz)$/.test(n)) return { Icon: FileArchive, color: 'text-amber-600' }
  return { Icon: FileIcon, color: 'text-txt-muted' }
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function PropertyDocumentsPanel({ propertyId }: { propertyId: string }) {
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [savingRename, setSavingRename] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/properties/${propertyId}/documents`)
      if (!res.ok) return
      const data = await res.json()
      setDocs(data.documents ?? [])
    } finally {
      setLoading(false)
    }
  }, [propertyId])

  useEffect(() => { load() }, [load])

  async function handleFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList)
    if (incoming.length === 0) return

    setErrors([])
    setUploading(true)
    setUploadProgress({ done: 0, total: incoming.length })

    const localErrors: string[] = []
    let done = 0
    const BATCH = 4
    for (let i = 0; i < incoming.length; i += BATCH) {
      const batch = incoming.slice(i, i + BATCH)
      await Promise.all(batch.map(async file => {
        try {
          if (file.size > MAX_BYTES) {
            localErrors.push(`${file.name}: too large (max 50MB)`)
            return
          }
          const fd = new FormData()
          fd.append('files', file)
          const res = await fetch(`/api/properties/${propertyId}/documents`, { method: 'POST', body: fd })
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            localErrors.push(`${file.name}: ${body.error ?? `upload failed (${res.status})`}`)
            return
          }
          const body = await res.json()
          for (const r of (body.created ?? []) as Array<{ filename: string; error?: string }>) {
            if (r.error) localErrors.push(`${r.filename}: ${r.error}`)
          }
        } catch (err) {
          localErrors.push(`${file.name}: ${err instanceof Error ? err.message : 'upload failed'}`)
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

  async function deleteDoc(id: string) {
    if (!confirm('Delete this document?')) return
    const res = await fetch(`/api/properties/${propertyId}/documents/${id}`, { method: 'DELETE' })
    if (res.ok) setDocs(prev => prev.filter(d => d.id !== id))
  }

  async function saveRename(id: string) {
    if (savingRename) return
    const next = renameDraft.trim()
    if (!next) { setRenamingId(null); return }
    setSavingRename(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}/documents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: next }),
      })
      if (res.ok) {
        setDocs(prev => prev.map(d => d.id === id ? { ...d, filename: next } : d))
        setRenamingId(null)
      }
    } finally {
      setSavingRename(false)
    }
  }

  return (
    <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
      <div className="px-4 py-2 bg-surface-secondary border-b border-[rgba(0,0,0,0.04)] flex items-center justify-between">
        <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">
          Documents {docs.length > 0 && <span className="ml-1 text-txt-secondary">({docs.length})</span>}
        </p>
        <button
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="text-[10px] font-semibold text-white bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-50 px-2.5 py-1 rounded-[6px] flex items-center gap-1 transition-colors"
        >
          {uploading ? <Loader2 size={10} className="animate-spin" /> : <Upload size={10} />}
          {uploading ? `Uploading ${uploadProgress?.done ?? 0}/${uploadProgress?.total ?? 0}` : 'Add files'}
        </button>
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        className="hidden"
        onChange={e => {
          if (e.target.files) handleFiles(e.target.files)
          if (fileInput.current) fileInput.current.value = ''
        }}
      />

      {/* Drop zone — shown when empty or while uploading */}
      {(docs.length === 0 || uploading) && (
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
          <Upload size={18} className="mx-auto text-txt-muted mb-2" />
          <p className="text-[12px] font-medium text-txt-secondary">Drop files here or click <span className="text-gunner-red font-semibold">Add files</span></p>
          <p className="text-[10px] text-txt-muted mt-1">Inspections, contracts, leases, agreements — any file up to 50MB</p>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="mx-3 mb-3 p-2 bg-red-50 border-[0.5px] border-red-200 rounded-[8px]">
          <p className="text-[10px] font-semibold text-red-700 mb-1">Some uploads failed:</p>
          <ul className="text-[10px] text-red-600 space-y-0.5">
            {errors.map((e, i) => <li key={i}>· {e}</li>)}
          </ul>
        </div>
      )}

      {/* List */}
      {!loading && docs.length > 0 && (
        <div className="divide-y divide-[rgba(0,0,0,0.06)]">
          {docs.map(d => {
            const { Icon, color } = iconFor(d.mimeType, d.filename)
            const renaming = renamingId === d.id
            return (
              <div key={d.id} className="flex items-center gap-3 px-4 py-2 group hover:bg-surface-secondary/50">
                <Icon size={20} className={`${color} shrink-0`} />
                <div className="flex-1 min-w-0">
                  {renaming ? (
                    <input
                      autoFocus
                      type="text"
                      value={renameDraft}
                      onChange={e => setRenameDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveRename(d.id)
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      className="w-full px-1.5 py-0.5 text-[12px] font-medium border-[0.5px] border-gunner-red/40 rounded-[4px] focus:outline-none focus:ring-1 focus:ring-gunner-red/30"
                      disabled={savingRename}
                    />
                  ) : (
                    <p className="text-[12px] font-medium text-txt-primary truncate">{d.filename}</p>
                  )}
                  <p className="text-[10px] text-txt-muted">
                    {formatSize(d.size)} · {formatDate(d.createdAt)}
                    {d.uploadedByName && <> · uploaded by {d.uploadedByName}</>}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {renaming ? (
                    <>
                      <button
                        onClick={() => saveRename(d.id)}
                        disabled={savingRename}
                        className="p-1.5 rounded-[6px] text-gunner-red hover:bg-white"
                        title="Save"
                      >
                        {savingRename ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      </button>
                      <button
                        onClick={() => setRenamingId(null)}
                        className="p-1.5 rounded-[6px] text-txt-muted hover:bg-white"
                        title="Cancel"
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => { setRenamingId(d.id); setRenameDraft(d.filename) }}
                        className="p-1.5 rounded-[6px] text-txt-muted hover:text-gunner-red hover:bg-white opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Rename"
                      >
                        <Pencil size={13} />
                      </button>
                      {d.url && (
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={d.filename}
                          className="p-1.5 rounded-[6px] text-txt-muted hover:text-gunner-red hover:bg-white"
                          title="Download"
                        >
                          <Download size={14} />
                        </a>
                      )}
                      <button
                        onClick={() => deleteDoc(d.id)}
                        className="p-1.5 rounded-[6px] text-txt-muted hover:text-semantic-red hover:bg-white opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
