import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import {
  generateVerificationToken,
  getAppUrl,
  getVerificationExpiry,
} from '@/lib/auth-helper'
import { sendVerificationEmail } from '@/lib/email-service'

export const runtime = 'nodejs'

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  businessName: z.string().min(1),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const validatedData = registerSchema.parse(body)

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.email },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'User already exists' },
        { status: 400 }
      )
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(validatedData.password, 10)

    // Generate verification token
    const verificationToken = generateVerificationToken()
    const verificationExpiry = getVerificationExpiry()

    // Create user with verification data using raw query
    const user = await prisma.user.create({
      data: {
        email: validatedData.email,
        password: hashedPassword,
        businessName: validatedData.businessName,
        emailVerificationToken: verificationToken,
        emailVerificationExpires: verificationExpiry,
      },
      select: {
        id: true,
        email: true,
        businessName: true,
      },
    })

    // Send verification email
    const verificationUrl = `${getAppUrl()}/verify-email?token=${verificationToken}`
    
    try {
      await sendVerificationEmail({
        email: validatedData.email,
        businessName: validatedData.businessName,
        verificationUrl,
      })
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError)
      // Don't fail registration if email sending fails
    }

    return NextResponse.json(
      { 
        ...user, 
        message: 'Account created successfully. Please check your email to verify your account.' 
      }, 
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }
    console.error('Error creating user:', error)
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    )
  }
}

