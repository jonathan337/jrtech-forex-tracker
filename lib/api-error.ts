import { NextResponse } from 'next/server'

/** 500 JSON with optional `detail` in development so local debugging is easier. */
export function serverErrorResponse(label: string, error: unknown) {
  const detail =
    error instanceof Error ? error.message : typeof error === 'string' ? error : undefined
  const dev = process.env.NODE_ENV === 'development'
  return NextResponse.json(
    {
      error: label,
      ...(dev && detail ? { detail } : {}),
    },
    { status: 500 }
  )
}
