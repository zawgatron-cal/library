import { useCallback, useRef, useState } from 'react'
import type { AskPassword } from '../../lib/pdf'
import { PasswordDialog, type PasswordRequest } from './PasswordDialog'

/** A promise-returning password prompt for `openPdf`, plus the dialog to render while it's asking. */
export function usePasswordPrompt(): [AskPassword, React.ReactNode] {
  const [request, setRequest] = useState<PasswordRequest | null>(null)
  const pending = useRef<PasswordRequest | null>(null)
  const asked = useRef(0)

  const ask = useCallback<AskPassword>(
    (fileName, wrongGuess) =>
      new Promise((resolve) => {
        const next = { id: ++asked.current, fileName, wrongGuess, resolve }
        pending.current = next
        setRequest(next)
      }),
    [],
  )

  const answer = (password: string | null) => {
    pending.current?.resolve(password)
    pending.current = null
    setRequest(null)
  }

  return [ask, request && <PasswordDialog key={request.id} request={request} onAnswer={answer} />]
}
