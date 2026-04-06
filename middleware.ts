import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isAuthenticated = !!req.auth
  
  // Public routes that don't require authentication
  const publicRoutes = ['/', '/login', '/register', '/verify-email', '/api/auth', '/api/register', '/api/verify-email', '/api/resend-verification']
  const isPublicRoute = publicRoutes.some(route => pathname === route || pathname.startsWith(route))
  
  // Protected routes that require authentication
  const protectedRoutes = ['/dashboard', '/people', '/cards', '/availability', '/usage', '/analytics', '/settings']
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route))
  
  // If not authenticated and trying to access protected route, redirect to login
  if (!isAuthenticated && isProtectedRoute) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  
  // If authenticated and on landing page, redirect to dashboard
  if (isAuthenticated && pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }
  
  return NextResponse.next()
})

export const config = {
  matcher: [
    /*
     * Skip all /api/* — route handlers call auth() themselves. Only excluding
     * /api/auth caused every other API route to hit this middleware on the
     * Edge; that can interfere with JSON responses. Match page routes only.
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
}

