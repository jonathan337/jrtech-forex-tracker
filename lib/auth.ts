import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  basePath: "/api/auth",
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          const parsedCredentials = z
            .object({ email: z.string().email(), password: z.string().min(6) })
            .safeParse(credentials)

          if (!parsedCredentials.success) {
            console.error('Invalid credentials format:', parsedCredentials.error)
            return null
          }

          const { email, password } = parsedCredentials.data

          const user = await prisma.user.findUnique({
            where: { email },
            select: {
              id: true,
              email: true,
              password: true,
              businessName: true,
              emailVerified: true,
            },
          })

          if (!user) {
            console.error('User not found:', email)
            return null
          }

          const passwordsMatch = await bcrypt.compare(password, user.password)

          if (!passwordsMatch) {
            console.error('Password mismatch for user:', email)
            return null
          }

          // Check if email is verified
          if (!user.emailVerified) {
            console.error('Email not verified for user:', email)
            throw new Error('EMAIL_NOT_VERIFIED')
          }

          return {
            id: user.id,
            email: user.email,
            name: user.businessName,
          }
        } catch (error) {
          console.error('Authorization error:', error)
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
})

