'use client'
// components/ui/toaster.tsx
import { useState, useCallback, createContext, useContext } from 'react'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  message: string
  type: ToastType
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }, [])

  const icons = {
    success: <CheckCircle size={14} className="text-semantic-green shrink-0" />,
    error: <AlertCircle size={14} className="text-semantic-red shrink-0" />,
    warning: <AlertTriangle size={14} className="text-semantic-amber shrink-0" />,
    info: <Info size={14} className="text-semantic-blue shrink-0" />,
  }

  const borderColors = {
    success: 'border-semantic-green/20',
    error: 'border-semantic-red/20',
    warning: 'border-semantic-amber/20',
    info: 'border-semantic-blue/20',
  }

  const leftBorders = {
    success: 'border-l-semantic-green',
    error: 'border-l-semantic-red',
    warning: 'border-l-semantic-amber',
    info: 'border-l-semantic-blue',
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-3 bg-surface-primary border ${borderColors[t.type]} border-l-2 ${leftBorders[t.type]} rounded-[14px] px-4 py-3 shadow-ds-float animate-in slide-in-from-right`}
          >
            {icons[t.type]}
            <p className="text-ds-body text-txt-primary flex-1">{t.message}</p>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="text-txt-muted hover:text-txt-primary transition-colors"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// Keep backward-compat export
export function Toaster() {
  return null // Rendering now handled by ToastProvider
}
