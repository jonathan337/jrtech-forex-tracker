import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import { fetchOpenErApiUsdTtd } from '@/lib/open-exchange-rate-api'

const REPUBLIC_URL = 'https://republictt.com/personal/forex-rates'

type LiveRatePayload = {
  selling: number
  buying: number
  source: string
  timestamp: string
  url?: string
  note?: string
  quoteDate?: string
  midpoint?: number
  providerDocumentation?: string
}

async function getRepublicBankPayload(): Promise<LiveRatePayload> {
  const response = await fetch(REPUBLIC_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error('Failed to fetch exchange rates')
  }

  const html = await response.text()
  const $ = cheerio.load(html)

  let sellingRate: number | null = null
  let buyingRate: number | null = null

  $('table').each((_, table) => {
    $(table)
      .find('tr')
      .each((_, row) => {
        const cells = $(row).find('td, th')
        const rowText = $(row).text()

        if (
          rowText.toUpperCase().includes('USD') ||
          rowText.toUpperCase().includes('US DOLLAR')
        ) {
          cells.each((__, cell) => {
            const text = $(cell).text().trim()
            const number = parseFloat(text)

            if (!isNaN(number) && number > 6 && number < 8) {
              if (buyingRate === null) {
                buyingRate = number
              } else if (sellingRate === null) {
                sellingRate = number
              }
            }
          })
        }
      })
  })

  if (!sellingRate || !buyingRate) {
    const bodyText = $('body').text()
    const usdMatches = bodyText.match(/USD[\s\S]{0,200}?(\d+\.\d{2})/gi)
    if (usdMatches && usdMatches.length >= 2) {
      const numbers = usdMatches
        .map((match) => {
          const m = match.match(/(\d+\.\d{2})/)
          return m ? parseFloat(m[1]) : null
        })
        .filter((n): n is number => n !== null && n > 6 && n < 8)

      if (numbers.length >= 2) {
        buyingRate = buyingRate || numbers[0]
        sellingRate = sellingRate || numbers[1]
      }
    }
  }

  if (!sellingRate || !buyingRate) {
    return {
      selling: 6.8,
      buying: 6.75,
      source: 'Republic Bank TT',
      timestamp: new Date().toISOString(),
      note: `Unable to parse live rates from ${REPUBLIC_URL}. Showing approximate values.`,
      url: REPUBLIC_URL,
    }
  }

  return {
    selling: sellingRate,
    buying: buyingRate,
    source: 'Republic Bank TT',
    timestamp: new Date().toISOString(),
    url: REPUBLIC_URL,
  }
}

export async function GET() {
  try {
    const open = await fetchOpenErApiUsdTtd()
    if (open) {
      const r = open.rate
      return NextResponse.json({
        selling: r,
        buying: r,
        midpoint: r,
        source: 'ExchangeRate-API (open)',
        timestamp: new Date().toISOString(),
        quoteDate: open.timeLastUpdateUtc,
        note:
          'Mid-market USD→TTD from exchangerate-api.com open data (updated ~daily). Bank cash or card rates may differ.',
        providerDocumentation: 'https://www.exchangerate-api.com/docs/free',
      } satisfies LiveRatePayload)
    }
  } catch (e) {
    console.error('Open ExchangeRate-API error:', e)
  }

  console.warn('Free ExchangeRate-API unavailable or missing TTD; using Republic Bank scrape.')

  try {
    return NextResponse.json(await getRepublicBankPayload())
  } catch (error) {
    console.error('Error fetching exchange rates:', error)
    return NextResponse.json({
      selling: 6.8,
      buying: 6.75,
      source: 'Fallback',
      timestamp: new Date().toISOString(),
      note: `Unable to fetch live rates. Approximate values; see ${REPUBLIC_URL}.`,
      url: REPUBLIC_URL,
    })
  }
}
