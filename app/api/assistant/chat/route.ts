import { NextResponse } from 'next/server'
import { GoogleGenAI, type Content, type Part } from '@google/genai'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import {
  ASSISTANT_MODEL,
  PendingAction,
  systemPrompt,
  TOOLS,
  WRITE_TOOLS,
} from '@/lib/assistant/tools'
import {
  currentYearMonth,
  getMonthSummary,
  getPersonBalance,
  listCardBalances,
  listCards,
  listPeople,
  resolveCard,
  resolvePerson,
  round2,
} from '@/lib/assistant/actions'

export const runtime = 'nodejs'
export const maxDuration = 60

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .min(1)
    .max(50),
})

const MAX_ITERATIONS = 6

function fmtNum(n: number): string {
  return round2(n).toLocaleString('en-US', { maximumFractionDigits: 2 })
}

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = session.user.id

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'The assistant is not configured yet. Add a GEMINI_API_KEY to your environment to enable it.',
        },
        { status: 503 }
      )
    }

    const { messages } = bodySchema.parse(await request.json())

    const ai = new GoogleGenAI({ apiKey })

    const contents: Content[] = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await ai.models.generateContent({
        model: ASSISTANT_MODEL,
        contents,
        config: {
          systemInstruction: systemPrompt(),
          tools: [{ functionDeclarations: TOOLS }],
          temperature: 0.2,
        },
      })

      const textReply = (response.text ?? '').trim()
      const calls = response.functionCalls ?? []

      if (calls.length === 0) {
        return NextResponse.json({ reply: textReply || 'Done.' })
      }

      // Record the model turn (with its functionCall parts) before answering.
      const modelContent = response.candidates?.[0]?.content
      if (modelContent) contents.push(modelContent)

      let pending: PendingAction | null = null
      const responseParts: Part[] = []

      for (const call of calls) {
        const name = call.name ?? ''
        const args = (call.args ?? {}) as Record<string, unknown>

        // ---- Write tools: resolve + build a pending (un-executed) action ----
        if (WRITE_TOOLS.has(name)) {
          const result = await buildPendingAction(userId, name, args)
          responseParts.push({
            functionResponse: {
              name,
              response: result.ok
                ? { status: 'awaiting_user_confirmation' }
                : { error: result.error },
            },
          })
          if (result.ok) pending = result.action
          continue
        }

        // ---- Read tools: execute now and feed results back ----
        const data = await runReadTool(userId, name, args)
        responseParts.push({
          functionResponse: { name, response: { result: data } },
        })
      }

      if (pending) {
        return NextResponse.json({
          reply: textReply || pending.summary,
          pendingAction: pending,
        })
      }

      // Otherwise feed tool results back and loop.
      contents.push({ role: 'user', parts: responseParts })
    }

    return NextResponse.json({
      reply:
        'I could not complete that in time. Try rephrasing or breaking it into steps.',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.issues },
        { status: 400 }
      )
    }
    console.error('[assistant chat] error:', error)
    return NextResponse.json(
      { error: 'The assistant ran into a problem. Please try again.' },
      { status: 500 }
    )
  }
}

async function runReadTool(
  userId: string,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  try {
    switch (name) {
      case 'get_month_summary':
        return await getMonthSummary(
          userId,
          typeof args.year === 'number' ? args.year : undefined,
          typeof args.month === 'number' ? args.month : undefined
        )
      case 'get_card_balances':
        return await listCardBalances(
          userId,
          typeof args.year === 'number' ? args.year : undefined,
          typeof args.month === 'number' ? args.month : undefined,
          typeof args.personName === 'string' ? args.personName : undefined
        )
      case 'list_people':
        return await listPeople(userId)
      case 'get_person_balance':
        return await getPersonBalance(userId, String(args.personName ?? ''))
      case 'list_cards':
        return await listCards(
          userId,
          typeof args.personName === 'string' ? args.personName : undefined
        )
      default:
        return { error: `Unknown tool ${name}` }
    }
  } catch (err) {
    console.error(`[assistant read ${name}]`, err)
    return { error: 'Failed to read data.' }
  }
}

async function buildPendingAction(
  userId: string,
  name: string,
  args: Record<string, unknown>
): Promise<
  { ok: true; action: PendingAction } | { ok: false; error: string }
> {
  const cur = currentYearMonth()

  if (name === 'log_usage') {
    const cardQuery = String(args.cardQuery ?? '').trim()
    const card = await resolveCard(userId, cardQuery)
    if (!card.ok) return { ok: false, error: card.error }

    const amountUSD =
      typeof args.amountUSD === 'number' && args.amountUSD > 0
        ? args.amountUSD
        : undefined
    const amountTTD =
      typeof args.amountTTD === 'number' && args.amountTTD > 0
        ? args.amountTTD
        : undefined
    if (amountUSD === undefined && amountTTD === undefined) {
      return { ok: false, error: 'Provide a usage amount in USD or TTD.' }
    }

    const year =
      typeof args.year === 'number' && args.year >= 2000 && args.year <= 2100
        ? args.year
        : cur.year
    const month =
      typeof args.month === 'number' && args.month >= 1 && args.month <= 12
        ? args.month
        : cur.month
    const paidToOwnerTTD =
      typeof args.paidToOwnerTTD === 'number' && args.paidToOwnerTTD > 0
        ? args.paidToOwnerTTD
        : undefined
    const notes =
      typeof args.notes === 'string' && args.notes.trim()
        ? args.notes.trim()
        : undefined

    const amountText =
      amountUSD !== undefined
        ? `$${fmtNum(amountUSD)} USD`
        : `${fmtNum(amountTTD as number)} TTD`
    const summary = `Log usage of ${amountText} on ${card.label} for ${month}/${year}${
      paidToOwnerTTD ? `, with ${fmtNum(paidToOwnerTTD)} TTD paid to owner` : ''
    }?`

    return {
      ok: true,
      action: {
        type: 'log_usage',
        summary,
        params: {
          cardId: card.cardId,
          cardLabel: card.label,
          ...(amountUSD !== undefined && { amountUSD }),
          ...(amountTTD !== undefined && { amountTTD }),
          ...(paidToOwnerTTD !== undefined && { paidToOwnerTTD }),
          year,
          month,
          ...(notes !== undefined && { notes }),
        },
      },
    }
  }

  if (name === 'apply_owner_payment') {
    const amountTTD =
      typeof args.amountTTD === 'number' ? args.amountTTD : NaN
    if (!Number.isFinite(amountTTD) || amountTTD <= 0) {
      return { ok: false, error: 'Provide a positive TTD amount.' }
    }
    const person = await resolvePerson(userId, String(args.personName ?? ''))
    if (!person.ok) return { ok: false, error: person.error }
    return {
      ok: true,
      action: {
        type: 'apply_owner_payment',
        summary: `Apply ${fmtNum(amountTTD)} TTD to ${person.name} (pays down oldest usage first)?`,
        params: {
          personId: person.personId,
          personName: person.name,
          amountTTD,
        },
      },
    }
  }

  if (name === 'log_payment') {
    const amountTTD =
      typeof args.amountTTD === 'number' ? args.amountTTD : NaN
    if (!Number.isFinite(amountTTD) || amountTTD <= 0) {
      return { ok: false, error: 'Provide a positive TTD amount.' }
    }
    let personId: string | undefined
    let personName: string | undefined
    const rawName =
      typeof args.personName === 'string' ? args.personName.trim() : ''
    if (rawName) {
      const person = await resolvePerson(userId, rawName)
      if (!person.ok) return { ok: false, error: person.error }
      personId = person.personId
      personName = person.name
    }
    const date =
      typeof args.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.date.trim())
        ? args.date.trim()
        : undefined
    const notes =
      typeof args.notes === 'string' && args.notes.trim()
        ? args.notes.trim()
        : undefined
    return {
      ok: true,
      action: {
        type: 'log_payment',
        summary: `Log a payment of ${fmtNum(amountTTD)} TTD${
          personName ? ` for ${personName}` : ''
        }${date ? ` dated ${date}` : ''}?`,
        params: {
          amountTTD,
          ...(personId && { personId, personName }),
          ...(date && { paidAt: date }),
          ...(notes && { notes }),
        },
      },
    }
  }

  return { ok: false, error: `Unknown action ${name}` }
}
