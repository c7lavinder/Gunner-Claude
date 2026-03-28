'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface FloatingDropdownProps {
  trigger: React.ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  width?: number
}

export function FloatingDropdown({ trigger, open, onOpenChange, children, width = 176 }: FloatingDropdownProps) {
  const triggerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0, flip: false })

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const flip = spaceBelow < 200
    setPos({
      top: flip ? rect.top - 4 : rect.bottom + 2,
      left: rect.left,
      flip,
    })
  }, [])

  useEffect(() => {
    if (!open) return
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [open, updatePosition])

  // Click outside to close
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (triggerRef.current?.contains(e.target as Node)) return
      if (dropdownRef.current?.contains(e.target as Node)) return
      onOpenChange(false)
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onOpenChange])

  return (
    <>
      <div ref={triggerRef}>{trigger}</div>
      {open && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: pos.flip ? undefined : pos.top,
            bottom: pos.flip ? window.innerHeight - pos.top : undefined,
            left: pos.left,
            width,
            zIndex: 9999,
          }}
          className="bg-white border-[0.5px] border-[rgba(0,0,0,0.12)] rounded-[8px] shadow-lg p-1.5"
        >
          {children}
        </div>,
        document.body
      )}
    </>
  )
}
