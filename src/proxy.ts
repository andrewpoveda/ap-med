import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase-middleware'

// Next 16 request interceptor (the renamed "middleware" convention). Refreshes
// the Supabase auth session cookie for the gated mentor and admin areas.
export function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  // Only the authenticated areas need session refresh. Keeping the matcher
  // tight avoids adding cookie/auth work to the public site or the
  // service-role /api routes.
  matcher: ['/dashboard', '/dashboard/:path*', '/admin', '/admin/:path*'],
}
