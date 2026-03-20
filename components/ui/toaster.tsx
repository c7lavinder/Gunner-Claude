'use client'
// components/ui/toaster.tsx
import { useState, useCallback, createContext, useContext } from 'react'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

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
    success: <CheckCircle size={14} className="text-green-400 shrink-0" />,
    error: <AlertCircle size={14} className="text-red-400 shrink-0" />,
    info: <Info size={14} className="text-blue-400 shrink-0" />,
  }

  const borders = {
    success: 'border-green-500/30',
    error: 'border-red-500/30',
    info: 'border-blue-500/30',
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-3 bg-[#1a1d27] border ${borders[t.type]} rounded-xl px-4 py-3 shadow-xl animate-in slide-in-from-right`}
          >
            {icons[t.type]}
            <p className="text-sm text-white flex-1">{t.message}</p>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="text-gray-500 hover:text-white transition-colors"
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
