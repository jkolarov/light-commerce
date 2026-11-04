import type { InputHTMLAttributes, ReactNode, Ref } from 'react'

import { cx, focusRing } from '@/theme'

// One field of the checkout form: its label above, an optional hint, the input, and the problem
// in words under it (never colour alone). The border and the error colour are the checkout's
// (`--lc-checkout-border`, `--lc-checkout-danger`, set by the checkout view), the same as in
// Stripe's card fields, so the whole form reads as one.

export const inputClass = cx(
  'block min-h-12 w-full rounded-[3px] border border-[var(--lc-checkout-border)] bg-background px-3.5 py-2.5',
  'text-[1.0625rem] leading-snug text-text placeholder:text-muted',
  'aria-[invalid=true]:border-[var(--lc-checkout-danger)] aria-[invalid=true]:shadow-[0_0_0_1px_var(--lc-checkout-danger)]',
  focusRing,
)

type Props = {
  id: string
  label: string
  /** "(optional)" after the label. */
  optionalLabel?: string
  hint?: string
  /** The problem, already in words; `null` when the field is fine. */
  error: string | null
  className?: string
  /** The control itself; an `<input>` by default. */
  children?: (describedBy: string | undefined) => ReactNode
  inputRef?: Ref<HTMLInputElement>
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className' | 'children'>

export function CheckoutField({ id, label, optionalLabel, hint, error, className, children, inputRef, ...input }: Props) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-[0.9375rem] font-semibold text-text">
        {label}
        {optionalLabel && <span className="font-normal text-muted"> ({optionalLabel})</span>}
      </label>
      {hint && (
        <p id={hintId} className="text-[0.9375rem] leading-snug text-muted">
          {hint}
        </p>
      )}
      <div className="mt-1.5">
        {children ? (
          children(describedBy)
        ) : (
          <input ref={inputRef} id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={inputClass} {...input} />
        )}
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 text-[0.9375rem] leading-snug text-[var(--lc-checkout-danger)]">
          {error}
        </p>
      )}
    </div>
  )
}
