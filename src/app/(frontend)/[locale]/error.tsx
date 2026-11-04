'use client'

import { useEffect } from 'react'

import { ErrorView } from '@/theme/pages/ErrorView'

// A page under /<locale> that failed, inside the site's frame (the layout is outside this boundary).
export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return <ErrorView retry={retry} />
}
