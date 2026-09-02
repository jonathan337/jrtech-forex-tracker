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
  getCardUsdLeftForMonth,
  getMonthSummary,
  getPersonBalance,
  listCardBalances,
  listCards,
  listPeople,
  normalizeIssuingBank,
  resolveCard,
  resolvePerson,
  round2,
} from '@/lib/assistant/actions'
import {
  findLikelyDuplicateUsage,
  duplicateUsageDescription,
} from '@/lib/usage-duplicate'

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

/** Errors where a retry cannot help (bad key, bad request) — fail fast. */
function isNonRetryableAiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /INVALID_ARGUMENT|API key|API_KEY|PERMISSION_DENIED|not found/i.test(msg)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Gemini flash intermittently 429/500s; retry twice before giving up so a
 *  transient blip doesn't surface as "the assistant ran into a problem". */
async function generateWithRetry(
  ai: GoogleGenAI,
  request: Parameters<GoogleGenAI['models']['generateContent']>[0]
) {
  const delays = [400, 1200]
  for (let attempt = 0; ; attempt++) {
    try {
      return await ai.models.generateContent(request)
    } catch (err) {
      if (attempt >= delays.length || isNonRetryableAiError(err)) throw err
      console.warn(
        `[assistant chat] AI call failed (attempt ${attempt + 1}), retrying:`,
        err instanceof Error ? err.message : err
      )
      await sleep(delays[attempt])
    }
  }
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

    // Ambiguous card/person matches collected while tools run; returned with
    // the final reply so the chat can render them as clickable options.
    let choices: string[] | undefined

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      let response: Awaited<ReturnType<typeof generateWithRetry>>
      try {
        response = await generateWithRetry(ai, {
          model: ASSISTANT_MODEL,
          contents,
          config: {
            systemInstruction: systemPrompt(),
            tools: [{ functionDeclarations: TOOLS }],
            temperature: 0.2,
          },
        })
      } catch (err) {
        console.error('[assistant chat] AI call failed after retries:', err)
        return NextResponse.json(
          {
            error:
              'The AI service had a hiccup answering that — nothing was changed. Please send it again.',
          },
          { status: 503 }
        )
      }

      // These are getters in the SDK that can throw on a blocked/empty response;
      // never let that turn into a 500 for the user.
      let textReply = ''
      try {
        textReply = (response.text ?? '').trim()
      } catch {
        textReply = ''
      }
      let calls: NonNullable<typeof response.functionCalls> = []
      try {
        calls = response.functionCalls ?? []
      } catch {
        calls = []
      }

      if (calls.length === 0) {
        return NextResponse.json({
          reply: textReply || 'Done.',
          ...(choices?.length ? { choices } : {}),
        })
      }

      // Record the model turn (with its functionCall parts) before answering.
      const modelContent = response.candidates?.[0]?.content
      if (modelContent) contents.push(modelContent)

      const pendings: PendingAction[] = []
      const responseParts: Part[] = []

      for (const call of calls) {
        const name = call.name ?? ''
        const args = (call.args ?? {}) as Record<string, unknown>

        // ---- Write tools: resolve + build a pending (un-executed) action ----
        if (WRITE_TOOLS.has(name)) {
          // A failure to resolve the card/person must come back as a tool error
          // the model can relay ("I couldn't find that card"), never a 500 that
          // shows the user "the assistant ran into a problem".
          let result: Awaited<ReturnType<typeof buildPendingAction>>
          try {
            result = await buildPendingAction(userId, name, args)
          } catch (err) {
            console.error(`[assistant write ${name}]`, err)
            result = {
              ok: false,
              error:
                'Could not prepare that action. Ask the user to rephrase, or which card/person they mean.',
            }
          }
          if (!result.ok && result.options?.length) {
            choices = [...new Set([...(choices ?? []), ...result.options])]
          }
          responseParts.push({
            functionResponse: {
              name,
              response: result.ok
                ? { status: 'awaiting_user_confirmation' }
                : {
                    error:
                      result.error +
                      (result.options?.length
                        ? ' (The app is showing these options to the user as clickable buttons — ask briefly which one, do NOT re-list them.)'
                        : ''),
                  },
            },
          })
          if (result.ok) pendings.push(result.action)
          continue
        }

        // ---- Read tools: execute now and feed results back ----
        const data = await runReadTool(userId, name, args)
        responseParts.push({
          functionResponse: { name, response: { result: data } },
        })
      }

      if (pendings.length > 0) {
        const reply =
          textReply ||
          (pendings.length === 1
            ? pendings[0].summary
            : `Please confirm these ${pendings.length} actions:`)
        return NextResponse.json({ reply, pendingActions: pendings })
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
  | { ok: true; action: PendingAction }
  | { ok: false; error: string; options?: string[] }
> {
  const cur = currentYearMonth()

  if (name === 'log_usage') {
    const cardQuery = String(args.cardQuery ?? '').trim()
    const card = await resolveCard(userId, cardQuery)
    if (!card.ok) return card

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
    const daysInMonth = new Date(year, month, 0).getDate()
    const day =
      typeof args.day === 'number' && args.day >= 1 && args.day <= 31
        ? Math.min(Math.round(args.day), daysInMonth)
        : undefined
    const paidToOwnerTTD =
      typeof args.paidToOwnerTTD === 'number' && args.paidToOwnerTTD > 0
        ? args.paidToOwnerTTD
        : undefined
    const notes =
      typeof args.notes === 'string' && args.notes.trim()
        ? args.notes.trim()
        : undefined
    const allowDuplicate = args.allowDuplicate === true

    // Warn before even offering the confirm button when a matching entry
    // already exists (same card, amount, and day — any month). The executor
    // re-checks at confirm time, so a double-confirm is caught there too.
    if (!allowDuplicate) {
      const previewDate =
        day !== undefined ? new Date(year, month - 1, day, 12) : new Date()
      const dup = await findLikelyDuplicateUsage({
        cardId: card.cardId,
        usageDate: previewDate,
        ...(amountUSD !== undefined && { amountUSD }),
        ...(amountTTD !== undefined && { amountTTD }),
      })
      if (dup) {
        return {
          ok: false,
          error: `Possible duplicate: ${duplicateUsageDescription(
            dup
          )}. Ask the user whether they really meant to log it again; only if they clearly say yes, call log_usage again with allowDuplicate: true.`,
        }
      }
    }

    const amountText =
      amountUSD !== undefined
        ? `$${fmtNum(amountUSD)} USD`
        : `${fmtNum(amountTTD as number)} TTD`
    const dateText = day !== undefined ? `${day}/${month}/${year}` : `${month}/${year}`
    const summary = `Log usage of ${amountText} on ${card.label} for ${dateText}${
      paidToOwnerTTD ? `, with ${fmtNum(paidToOwnerTTD)} TTD paid to owner` : ''
    }${notes ? ` — note: "${notes}"` : ''}?`

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
          ...(day !== undefined && { day }),
          ...(notes !== undefined && { notes }),
          ...(allowDuplicate && { allowDuplicate: true }),
        },
      },
    }
  }

  if (name === 'set_card_remaining') {
    const cardQuery = String(args.cardQuery ?? '').trim()
    const card = await resolveCard(userId, cardQuery)
    if (!card.ok) return card

    const remainingUSD =
      typeof args.remainingUSD === 'number' && args.remainingUSD >= 0
        ? round2(args.remainingUSD)
        : undefined
    if (remainingUSD === undefined) {
      return {
        ok: false,
        error: 'Provide the USD amount that should remain on the card (0 or more).',
      }
    }

    const year =
      typeof args.year === 'number' && args.year >= 2000 && args.year <= 2100
        ? args.year
        : cur.year
    const month =
      typeof args.month === 'number' && args.month >= 1 && args.month <= 12
        ? args.month
        : cur.month

    // Preview the deduction so the confirmation shows a concrete number; the
    // executor recomputes it at confirm time so the card lands exactly on target.
    const balance = await getCardUsdLeftForMonth(userId, card.cardId, year, month)
    if (!balance) {
      return {
        ok: false,
        error: `${card.label} has no availability for ${month}/${year}, so there is nothing to deduct from.`,
      }
    }
    const deduction = round2(balance.leftUSD - remainingUSD)
    if (deduction <= 0) {
      return {
        ok: false,
        error: `${card.label} already has $${fmtNum(
          balance.leftUSD
        )} USD left for ${month}/${year} (at or below $${fmtNum(
          remainingUSD
        )}), so there is nothing to deduct. Tell the user the current balance.`,
      }
    }

    return {
      ok: true,
      action: {
        type: 'set_card_remaining',
        summary: `Log miscellaneous usage of $${fmtNum(deduction)} USD on ${
          card.label
        } so it has $${fmtNum(remainingUSD)} USD left for ${month}/${year}?`,
        params: {
          cardId: card.cardId,
          cardLabel: card.label,
          remainingUSD,
          year,
          month,
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
    if (!person.ok) return person
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
      if (!person.ok) return person
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

  if (name === 'add_card') {
    const person = await resolvePerson(userId, String(args.personName ?? ''))
    if (!person.ok) return person

    const cardNickname =
      typeof args.cardNickname === 'string' ? args.cardNickname.trim() : ''
    if (!cardNickname) {
      return { ok: false, error: 'Provide a nickname for the card.' }
    }

    const rawBank =
      typeof args.issuingBank === 'string' ? args.issuingBank.trim() : ''
    const issuingBank = normalizeIssuingBank(rawBank)
    if (rawBank && !issuingBank) {
      return {
        ok: false,
        error:
          'Unknown bank. Supported: Scotiabank, Republic Bank, First Citizens, RBC.',
      }
    }

    const lastFourDigits =
      typeof args.lastFourDigits === 'string' &&
      /^\d{4}$/.test(args.lastFourDigits.trim())
        ? args.lastFourDigits.trim()
        : undefined
    if (typeof args.lastFourDigits === 'string' && args.lastFourDigits.trim() && !lastFourDigits) {
      return { ok: false, error: 'Last four digits must be exactly 4 numbers.' }
    }

    const recurringAmountUSD =
      typeof args.recurringAmountUSD === 'number' && args.recurringAmountUSD > 0
        ? args.recurringAmountUSD
        : undefined
    const recurringExchangeRate =
      typeof args.recurringExchangeRate === 'number' &&
      args.recurringExchangeRate > 0
        ? args.recurringExchangeRate
        : undefined
    const recurringPaymentDay =
      typeof args.recurringPaymentDay === 'number' &&
      args.recurringPaymentDay >= 1 &&
      args.recurringPaymentDay <= 31
        ? Math.round(args.recurringPaymentDay)
        : undefined
    const notes =
      typeof args.notes === 'string' && args.notes.trim()
        ? args.notes.trim()
        : undefined

    const recurringText =
      recurringAmountUSD && recurringExchangeRate
        ? `, available every month with $${fmtNum(recurringAmountUSD)} USD at ${recurringExchangeRate}`
        : ''
    const summary = `Add card "${cardNickname}"${
      lastFourDigits ? ` ••${lastFourDigits}` : ''
    }${issuingBank ? ` (${rawBank})` : ''} for ${person.name}${recurringText}?`

    return {
      ok: true,
      action: {
        type: 'add_card',
        summary,
        params: {
          personId: person.personId,
          personName: person.name,
          cardNickname,
          ...(issuingBank && { issuingBank }),
          ...(lastFourDigits && { lastFourDigits }),
          ...(notes && { notes }),
          ...(recurringAmountUSD && { recurringAmountUSD }),
          ...(recurringExchangeRate && { recurringExchangeRate }),
          ...(recurringPaymentDay && { recurringPaymentDay }),
        },
      },
    }
  }

  return { ok: false, error: `Unknown action ${name}` }
}
