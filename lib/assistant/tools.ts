import { Type, type FunctionDeclaration } from '@google/genai'

export const ASSISTANT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

/** Write tools never execute directly — they produce a pending action the user confirms. */
export const WRITE_TOOLS = new Set([
  'log_usage',
  'set_card_remaining',
  'apply_owner_payment',
  'log_payment',
  'add_card',
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
        day?: number
        notes?: string
      }
    }
  | {
      type: 'set_card_remaining'
      summary: string
      params: {
        cardId: string
        cardLabel: string
        remainingUSD: number
        year: number
        month: number
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
  | {
      type: 'add_card'
      summary: string
      params: {
        personId: string
        personName: string
        cardNickname: string
        issuingBank?: string | null
        lastFourDigits?: string | null
        notes?: string | null
        recurringAmountUSD?: number
        recurringExchangeRate?: number
        recurringPaymentDay?: number
      }
    }

export function systemPrompt(): string {
  const now = new Date()
  return [
    'You are the in-app assistant for a foreign-currency (USD/TTD) card tracking app.',
    `Today is ${now.toISOString().slice(0, 10)} (year ${now.getFullYear()}, month ${now.getMonth() + 1}).`,
    'You help the user check balances, record usage and payments, and add cards by calling tools.',
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
    '- When you call a write tool, identify the card or person by the user\'s words; the tool resolves it. Pass the user\'s reference straight into cardQuery/personName — an owner name plus a bank or last-4 digits (e.g. "Esther fcb", "Jonathan 9689") resolves fine. The matching is fuzzy and tolerates misspellings ("ramcharitarrr" still finds Ramcharitar), so do NOT bail on a small name mismatch — just pass what the user said. Do NOT ask which card or list options first; only ask if the tool itself comes back ambiguous or not-found.',
    '- Bank shorthand you should pass through as-is: FCB = First Citizens, RBL = Republic Bank, Scotia = Scotiabank, RBC. The tools understand these.',
    '- If a write tool returns not-found or ambiguous, do not just give up — call list_cards (or list_people) for that owner and either pick the obvious match yourself or show the short list and ask which one.',
    '- When the user answers a which-card question, call the write tool AGAIN with a cardQuery that combines everything known so far — the original reference plus their answer (e.g. first "ending 2348", then they say "John" → cardQuery "John 2348"). Never pass just their one-word reply on its own, and never re-ask the same question without re-calling the tool.',
    '- If the user tells you what is LEFT on a card ("Esther\'s card has only 500 USD left", "only 500 remaining on the fcb card") rather than how much was spent, call set_card_remaining with that remaining amount. Do NOT do the subtraction yourself and do NOT use log_usage for this — the app computes the deduction and labels the entry "Miscellaneous usage".',
    '- If the user asks for several actions at once (e.g. log usage on two different cards, or log usage and a payment together), call the matching write tool ONCE PER ACTION in the same turn — do not collapse them into one or drop any.',
    '- Prefer specifying amounts in the currency the user used. Usage can take USD or TTD; payments are in TTD.',
    '- Capture everything the user tells you about the transaction. Any short description of what the usage/payment was for ("atm pull", "amazon order", "groceries") goes in notes — never drop it. If they give a specific day ("24th aug", "on the 3rd"), pass day (plus month/year when stated).',
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
        day: {
          type: Type.INTEGER,
          description:
            'Optional day of month (1-31) the usage happened, when the user gives a specific date like "24th aug". Defaults to today.',
        },
        notes: {
          type: Type.STRING,
          description:
            'Optional note. Include any description the user gives of what the usage was for, e.g. "atm pull" or "amazon order".',
        },
      },
      required: ['cardQuery'],
    },
  },
  {
    name: 'set_card_remaining',
    description:
      'Prepare a "Miscellaneous usage" entry that brings a card\'s USD left down to a stated remaining balance (requires user confirmation). Use when the user states what is LEFT on a card ("this card has only 500 USD left", "only 500 remaining") instead of an amount spent — the app computes the deduction so exactly that much USD remains for the month.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        cardQuery: {
          type: Type.STRING,
          description:
            'Card identifier from the user: nickname, last 4 digits, or owner name.',
        },
        remainingUSD: {
          type: Type.NUMBER,
          description:
            'The USD amount that should remain on the card after the entry (0 or more).',
        },
        year: { type: Type.INTEGER, description: 'Optional; defaults to current year.' },
        month: {
          type: Type.INTEGER,
          description: 'Optional 1-12; defaults to current month.',
        },
      },
      required: ['cardQuery', 'remainingUSD'],
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
    name: 'add_card',
    description:
      'Prepare adding a new card for a person (requires user confirmation). If the person mentions the card is available every month with a USD amount and rate, include the recurring fields.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        personName: {
          type: Type.STRING,
          description: 'The card owner (must be an existing person).',
        },
        cardNickname: {
          type: Type.STRING,
          description: 'Name for the card, e.g. "Visa Gold" or "Aero".',
        },
        issuingBank: {
          type: Type.STRING,
          description:
            'Optional bank: Scotiabank, Republic Bank, First Citizens, or RBC.',
        },
        lastFourDigits: {
          type: Type.STRING,
          description: 'Optional last 4 digits of the card number.',
        },
        notes: { type: Type.STRING, description: 'Optional note.' },
        recurringAmountUSD: {
          type: Type.NUMBER,
          description:
            'Optional monthly USD availability if the card is available every month.',
        },
        recurringExchangeRate: {
          type: Type.NUMBER,
          description: 'Optional TTD/USD rate for the recurring availability.',
        },
        recurringPaymentDay: {
          type: Type.INTEGER,
          description: 'Optional day of month (1-31) the owner gets paid.',
        },
      },
      required: ['personName', 'cardNickname'],
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
