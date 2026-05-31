import { Type, type FunctionDeclaration } from '@google/genai'

export const ASSISTANT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

/** Write tools never execute directly — they produce a pending action the user confirms. */
export const WRITE_TOOLS = new Set([
  'log_usage',
  'apply_owner_payment',
  'log_payment',
])

export type PendingAction =
  | {
      type: 'log_usage'
      summary: string
      params: {
        cardId: string
        cardLabel: string
        amountUSD?: number
        amountTTD?: number
        paidToOwnerTTD?: number
        year: number
        month: number
        notes?: string
      }
    }
  | {
      type: 'apply_owner_payment'
      summary: string
      params: {
        personId: string
        personName: string
        amountTTD: number
      }
    }
  | {
      type: 'log_payment'
      summary: string
      params: {
        amountTTD: number
        personId?: string | null
        personName?: string | null
        paidAt?: string
        notes?: string | null
      }
    }

export function systemPrompt(): string {
  const now = new Date()
  return [
    'You are the in-app assistant for a foreign-currency (USD/TTD) card tracking app.',
    `Today is ${now.toISOString().slice(0, 10)} (year ${now.getFullYear()}, month ${now.getMonth() + 1}).`,
    'You help the user check balances and record usage and payments by calling tools.',
    '',
    'Key concepts:',
    '- "USD left" / availability = USD loaded onto cards for a month minus USD already used.',
    '- "Owed to owner" (TTD) = money still owed back to a card owner for usage you put on their card.',
    '- Usage is logged per card for a specific month/year. If the user does not specify a month, use the current month.',
    '- A payment can be applied to a specific person (pays down what they are owed, oldest usage first) or logged as a standalone payment.',
    '',
    'Rules:',
    '- For read questions, call the read tools and answer concisely with concrete numbers (include the currency).',
    '- When the user asks you to log usage or apply/log a payment, call the matching write tool. Write tools DO NOT execute immediately — they prepare an action the user must confirm with a button, so do not claim the action is done.',
    '- When you call a write tool, identify the card or person by the user\'s words; the tool resolves it. If a tool returns an error about an ambiguous or missing match, ask the user a brief clarifying question (or call a list tool to show options).',
    '- If the user asks for several actions at once (e.g. log usage on two different cards, or log usage and a payment together), call the matching write tool ONCE PER ACTION in the same turn — do not collapse them into one or drop any.',
    '- Prefer specifying amounts in the currency the user used. Usage can take USD or TTD; payments are in TTD.',
    '- Never invent card names, people, or balances — always use tool results.',
    '',
    'Formatting (this is a narrow chat panel, ~380px wide):',
    '- Do NOT use Markdown tables — they render unreadably here.',
    '- Keep answers short. Lead with the key number/answer in one sentence.',
    '- For lists, use one bullet per line starting with "- ", e.g. "- Kiran Balraj — $4,000 USD".',
    '- Format money as "$4,000 USD" or "1,250 TTD" (thousands separators, no more than 2 decimals).',
    '- Use **bold** only for a short label or the headline number, sparingly.',
    '- If a list is long (more than ~8 items), give the total and the top few, and offer to show more.',
  ].join('\n')
}

export const TOOLS: FunctionDeclaration[] = [
  {
    name: 'get_month_summary',
    description:
      'Get USD/TTD availability, usage, balance ("USD left"), and total owed to owners for a month. Defaults to the current month.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        year: { type: Type.INTEGER, description: 'e.g. 2026. Optional.' },
        month: {
          type: Type.INTEGER,
          description: '1-12. Optional; defaults to current month.',
        },
      },
    },
  },
  {
    name: 'get_card_balances',
    description:
      'USD available, used, and left (remaining) broken down per card and per owner for a month. Use this when the user wants per-card or per-person USD availability, not just the total. Optionally filter by owner name. Defaults to the current month.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        year: { type: Type.INTEGER, description: 'Optional; defaults to current year.' },
        month: {
          type: Type.INTEGER,
          description: '1-12. Optional; defaults to current month.',
        },
        personName: {
          type: Type.STRING,
          description: 'Optional owner name to filter the breakdown to one person.',
        },
      },
    },
  },
  {
    name: 'list_people',
    description:
      'List all people (card owners) with how much TTD/USD is still owed to each, plus the total owed.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'get_person_balance',
    description: 'Get how much (TTD and USD) is owed to a specific person.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        personName: { type: Type.STRING, description: "The person's name." },
      },
      required: ['personName'],
    },
  },
  {
    name: 'list_cards',
    description:
      'List cards, optionally filtered by owner name. Use to disambiguate which card the user means.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        personName: {
          type: Type.STRING,
          description: 'Optional owner name to filter by.',
        },
      },
    },
  },
  {
    name: 'log_usage',
    description:
      'Prepare a usage entry on a card (requires user confirmation). Provide either amountUSD or amountTTD.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        cardQuery: {
          type: Type.STRING,
          description:
            'Card identifier from the user: nickname, last 4 digits, or owner name.',
        },
        amountUSD: {
          type: Type.NUMBER,
          description: 'USD amount used. Provide this OR amountTTD.',
        },
        amountTTD: {
          type: Type.NUMBER,
          description: 'TTD amount used. Provide this OR amountUSD.',
        },
        paidToOwnerTTD: {
          type: Type.NUMBER,
          description: 'Optional TTD already paid back to the owner for this usage.',
        },
        year: { type: Type.INTEGER, description: 'Optional; defaults to current year.' },
        month: {
          type: Type.INTEGER,
          description: 'Optional 1-12; defaults to current month.',
        },
        notes: { type: Type.STRING, description: 'Optional note.' },
      },
      required: ['cardQuery'],
    },
  },
  {
    name: 'apply_owner_payment',
    description:
      'Prepare a payment applied to a person, paying down what they are owed oldest-first (requires user confirmation).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        personName: { type: Type.STRING, description: 'The person being paid.' },
        amountTTD: { type: Type.NUMBER, description: 'TTD amount to apply.' },
      },
      required: ['personName', 'amountTTD'],
    },
  },
  {
    name: 'log_payment',
    description:
      'Prepare a standalone payment log in TTD (requires user confirmation). Optionally tie it to a person for context (does not auto-reduce what they are owed).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        amountTTD: { type: Type.NUMBER, description: 'TTD amount paid.' },
        personName: { type: Type.STRING, description: 'Optional person to associate.' },
        date: {
          type: Type.STRING,
          description: 'Optional YYYY-MM-DD; defaults to today.',
        },
        notes: { type: Type.STRING, description: 'Optional note.' },
      },
      required: ['amountTTD'],
    },
  },
]
