import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Proxy (Next.js 16 name for middleware) — runs before a request completes.
 *
 * Per Next.js guidance, proxy is for OPTIMISTIC checks only and should NOT be
 * used for slow data fetching or full authorization. We therefore:
 *   - Only match `/admin/*` (public pages are not proxied at all → no auth
 *     round-trip on the homepage or any public route).
 *   - Do a cheap, cookie-based session presence check (no network call). The
 *     authoritative auth + role check still happens server-side in
 *     `app/admin/layout.tsx` via `getAdminSession()`.
 *
 * This keeps TTFB on public pages fast while still redirecting unauthenticated
 * users away from `/admin` before the page starts rendering.
 */
export async function proxy(request: NextRequest) {
  // Short-circuit when Supabase isn't configured (e.g. local placeholder env).
  if (process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://dummy.supabase.co') {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Optimistic check only: refresh the session cookies if needed, but do NOT
  // await getUser() (a network round-trip) on every request. getSession() reads
  // the local JWT from cookies and is sufficient for an optimistic redirect.
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  return supabaseResponse
}

export const config = {
  // Only run proxy on admin routes. Public pages bypass proxy entirely.
  matcher: ['/admin/:path*'],
}
