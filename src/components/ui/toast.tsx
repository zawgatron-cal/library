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
            <div key={t.id} className="flex animate-rise items-center gap-3 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-canvas shadow-lifted">
              {t.message}
              {t.action && (
                <button
                  type="button"
                  className="pointer-events-auto -my-1 -mr-2 rounded-full px-2.5 py-1 text-[color-mix(in_oklab,var(--accent)_55%,var(--canvas))] transition hover:bg-[color-mix(in_oklab,var(--canvas)_14%,transparent)]"
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
