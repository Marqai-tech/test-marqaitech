'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Redirect to the Attendance Policy Rules page (Task 84).
 * Policy rule configuration is now its own page, separate from
 * approval workflows and policy documents.
 */
export default function PolicyConfigRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/attendance/policy-rules')
  }, [router])
  return null
}
