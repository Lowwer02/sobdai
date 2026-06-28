'use client'

import { useEffect } from 'react'

export function useUnsavedChanges(isDirty: boolean) {
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty) return
      
      // Standard browser confirmation for unload
      e.preventDefault()
      e.returnValue = ''
    }

    const handleAnchorClick = (e: MouseEvent) => {
      if (!isDirty) return
      
      const target = (e.target as HTMLElement).closest('a')
      if (!target) return
      
      // Allow external links or target="_blank"
      if (target.target === '_blank' || target.hasAttribute('download')) return
      
      const href = target.getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
      
      // Check if it's an internal route that would trigger navigation
      // For Next.js, an anchor click usually navigates if not prevented
      if (window.confirm('คุณยังไม่ได้บันทึกข้อมูล\n\nออกจากหน้านี้หรือไม่?')) {
        // User confirmed to leave, allow navigation to proceed
      } else {
        // User cancelled, prevent navigation
        e.preventDefault()
        e.stopPropagation()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    // Use capture phase to intercept clicks before Next.js Link handles them
    document.addEventListener('click', handleAnchorClick, { capture: true })

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('click', handleAnchorClick, { capture: true })
    }
  }, [isDirty])
}
