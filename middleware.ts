import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isAuthenticated = !!req.auth
  
  // Public routes that don't require authentication
  const publicRoutes = ['/', '/login', '/register', '/verify-email', '/api/auth', '/api/register', '/api/verify-email', '/api/resend-verification']
  const isPublicRoute = publicRoutes.some(route => pathname === route || pathname.startsWith(route))
  
  // Protected routes that require authentication
  const protectedRoutes = ['/dashboard', '/people', '/cards', '/availability', '/analytics', '/settings']
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
     * Match all request paths except for the ones starting with:
     * - api/auth (authentication routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
}

