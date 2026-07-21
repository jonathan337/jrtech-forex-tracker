'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { Mail, Loader2, CheckCircle, XCircle, RefreshCw } from 'lucide-react'

function VerifyEmailContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  
  const [, setLoading] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'verifying' | 'success' | 'error' | 'expired'>('idle')
  const [message, setMessage] = useState('')
  const [userEmail, setUserEmail] = useState('')

  // Auto-verify if token is present in URL
  useEffect(() => {
    if (token) {
      handleVerification(token)
    }
  }, [token])

  const handleVerification = async (verificationToken: string) => {
    setLoading(true)
    setStatus('verifying')

    try {
      const response = await fetch('/api/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: verificationToken }),
      })

      const data = await response.json()

      if (response.ok) {
        setStatus('success')
        setMessage(data.message)
        setUserEmail(data.user?.email || '')
      } else {
        if (data.error.includes('expired')) {
          setStatus('expired')
        } else {
          setStatus('error')
        }
        setMessage(data.error)
      }
    } catch {
      setStatus('error')
      setMessage('Failed to verify email. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleResendVerification = async () => {
    if (!email) return

    setResendLoading(true)

    try {
      const response = await fetch('/api/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (response.ok) {
        setMessage('Verification email sent successfully! Please check your inbox.')
      } else {
        setMessage(data.error)
      }
    } catch {
      setMessage('Failed to resend verification email. Please try again.')
    } finally {
      setResendLoading(false)
    }
  }

  const getStatusIcon = () => {
    switch (status) {
      case 'verifying':
        return <Loader2 className="w-16 h-16 text-blue-600 animate-spin" />
      case 'success':
        return <CheckCircle className="w-16 h-16 text-green-600" />
      case 'error':
      case 'expired':
        return <XCircle className="w-16 h-16 text-red-600" />
      default:
        return <Mail className="w-16 h-16 text-blue-600" />
    }
  }

  const getStatusColor = () => {
    switch (status) {
      case 'success':
        return 'from-green-600 to-emerald-600'
      case 'error':
      case 'expired':
        return 'from-red-600 to-pink-600'
      default:
        return 'from-blue-600 to-indigo-600'
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br ${getStatusColor()} mb-4`}>
            {getStatusIcon()}
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Email Verification</h1>
          <p className="mt-2 text-gray-600">
            {status === 'idle' && 'Verify your email address to complete registration'}
            {status === 'verifying' && 'Verifying your email...'}
            {status === 'success' && 'Email verified successfully!'}
            {status === 'error' && 'Verification failed'}
            {status === 'expired' && 'Verification link expired'}
          </p>
        </div>

        <Card className="shadow-xl border-0">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-2xl text-center">
              {status === 'success' ? 'Welcome!' : 'Verify Email'}
            </CardTitle>
            <CardDescription className="text-center">
              {status === 'success' 
                ? 'Your account is now active and ready to use'
                : 'Complete your account setup by verifying your email address'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {message && (
              <div className={`px-4 py-3 rounded-md text-sm mb-4 ${
                status === 'success' 
                  ? 'bg-green-50 border border-green-200 text-green-700'
                  : status === 'error' || status === 'expired'
                  ? 'bg-red-50 border border-red-200 text-red-700'
                  : 'bg-blue-50 border border-blue-200 text-blue-700'
              }`}>
                {message}
              </div>
            )}

            {status === 'success' ? (
              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-gray-600 mb-4">
                    {userEmail && `Welcome, ${userEmail}!`}
                  </p>
                  <p className="text-sm text-gray-500 mb-6">
                    Your email has been verified and your account is now active. 
                    You can now access all features of FX Payment Tracker.
                  </p>
                </div>
                <Button 
                  onClick={() => router.push('/login')} 
                  className="w-full"
                >
                  Continue to Login
                </Button>
              </div>
            ) : status === 'expired' || status === 'error' ? (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email address"
                    required
                    disabled={resendLoading}
                  />
                </div>
                <Button 
                  onClick={handleResendVerification}
                  disabled={!email || resendLoading}
                  className="w-full"
                >
                  {resendLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Resend Verification Email
                    </>
                  )}
                </Button>
              </div>
            ) : status === 'idle' ? (
              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-gray-600 mb-4">
                    Check your email for a verification link. If you don&apos;t see it, check your spam folder.
                  </p>
                </div>
                <div>
                  <Label htmlFor="email">Need a new verification email?</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email address"
                    className="mb-3"
                    required
                    disabled={resendLoading}
                  />
                </div>
                <Button 
                  onClick={handleResendVerification}
                  disabled={!email || resendLoading}
                  className="w-full"
                >
                  {resendLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Resend Verification Email
                    </>
                  )}
                </Button>
              </div>
            ) : null}

            <div className="mt-6 text-center text-sm">
              <span className="text-gray-600">Remember your credentials? </span>
              <Link href="/login" className="text-blue-600 hover:text-blue-700 font-medium">
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  )
}
