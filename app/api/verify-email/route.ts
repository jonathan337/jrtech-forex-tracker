import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { isTokenExpired } from '@/lib/auth-helper'
import { sendWelcomeEmail } from '@/lib/email-service'

export const runtime = 'nodejs'

const verifySchema = z.object({
  token: z.string().min(1),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { token } = verifySchema.parse(body)

    // Find user by verification token
    const user = await prisma.user.findFirst({
      where: {
        emailVerificationToken: token,
      },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid verification token' },
        { status: 400 }
      )
    }

    // Check if token is expired
    if (user.emailVerificationExpires && isTokenExpired(user.emailVerificationExpires)) {
      return NextResponse.json(
        { error: 'Verification token has expired. Please request a new one.' },
        { status: 400 }
      )
    }

    // Check if already verified
    if (user.emailVerified) {
      return NextResponse.json(
        { error: 'Email already verified' },
        { status: 400 }
      )
    }

    // Update user to mark email as verified
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
      select: {
        id: true,
        email: true,
        businessName: true,
        emailVerified: true,
      },
    })

    // Send welcome email
    try {
      await sendWelcomeEmail({
        email: user.email,
        businessName: user.businessName,
      })
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError)
      // Don't fail verification if welcome email fails
    }

    return NextResponse.json(
      { 
        message: 'Email verified successfully! Welcome to FX Payment Tracker.',
        user: updatedUser
      },
      { status: 200 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      )
    }
    console.error('Error verifying email:', error)
    return NextResponse.json(
      { error: 'Failed to verify email' },
      { status: 500 }
    )
  }
}

// Handle GET request for direct link verification
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json(
        { error: 'Verification token is required' },
        { status: 400 }
      )
    }

    // Find user by verification token
    const user = await prisma.user.findFirst({
      where: {
        emailVerificationToken: token,
      },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid verification token' },
        { status: 400 }
      )
    }

    // Check if token is expired
    if (user.emailVerificationExpires && isTokenExpired(user.emailVerificationExpires)) {
      return NextResponse.json(
        { error: 'Verification token has expired. Please request a new one.' },
        { status: 400 }
      )
    }

    // Check if already verified
    if (user.emailVerified) {
      return NextResponse.json(
        { error: 'Email already verified' },
        { status: 400 }
      )
    }

    // Update user to mark email as verified
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
      select: {
        id: true,
        email: true,
        businessName: true,
        emailVerified: true,
      },
    })

    // Send welcome email
    try {
      await sendWelcomeEmail({
        email: user.email,
        businessName: user.businessName,
      })
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError)
      // Don't fail verification if welcome email fails
    }

    return NextResponse.json(
      { 
        message: 'Email verified successfully! Welcome to FX Payment Tracker.',
        user: updatedUser
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error verifying email:', error)
    return NextResponse.json(
      { error: 'Failed to verify email' },
      { status: 500 }
    )
  }
}
