import { useState } from 'react'
import { LockKeyhole } from 'lucide-react'
import { Button, Dialog, inputClass } from './primitives'

export type PasswordRequest = { id: number; fileName: string; wrongGuess: boolean; resolve: (password: string | null) => void }

export function PasswordDialog({ request, onAnswer }: { request: PasswordRequest; onAnswer: (password: string | null) => void }) {
  const [value, setValue] = useState('')
  return (
    <Dialog
      title="This PDF is locked"
      onClose={() => onAnswer(null)}
      footer={
        <>
          <Button variant="ghost" onClick={() => onAnswer(null)}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="pdf-password" disabled={!value}>
            Unlock
          </Button>
        </>
      }
    >
      <form
        id="pdf-password"
        onSubmit={(e) => {
          e.preventDefault()
          if (value) onAnswer(value)
        }}
      >
        <p className="mb-3 flex items-start gap-2 text-sm text-muted">
          <LockKeyhole className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-semibold text-ink">{request.fileName}</span> is password-protected. Library remembers the password on this
            computer, so you'll only be asked once.
          </span>
        </p>
        <input autoFocus type="password" className={inputClass} placeholder="Password" value={value} onChange={(e) => setValue(e.target.value)} />
        {request.wrongGuess && <p className="mt-2 text-xs font-semibold text-[color-mix(in_oklab,#b2412e_80%,var(--ink))]">That password didn't work. Try again.</p>}
      </form>
    </Dialog>
  )
}
