import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type ToastAction = { label: string; onClick: () => void }
type Toast = { id: number; message: string; action?: ToastAction }

const ToastContext = createContext<(message: string, action?: ToastAction) => void>(() => {})

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const push = useCallback(
    (message: string, action?: ToastAction) => {
      const id = nextId++
      setToasts((t) => [...t, { id, message, action }])
      setTimeout(() => dismiss(id), action ? 5000 : 3200)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={push}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="flex animate-rise items-center gap-3 border border-ink bg-surface px-4 py-2 font-display text-sm font-medium text-ink shadow-[3px_3px_0_color-mix(in_oklab,var(--ink)_55%,transparent)]"
            >
              {t.message}
              {t.action && (
                <button
                  type="button"
                  className="pointer-events-auto border-b border-ink px-0.5 font-display text-sm italic hover:border-b-2"
                  onClick={() => {
                    t.action!.onClick()
                    dismiss(t.id)
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => useContext(ToastContext)
