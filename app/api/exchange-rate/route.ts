import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'

export async function GET() {
  try {
    // Fetch the forex rates page from Republic Bank
    const response = await fetch('https://republictt.com/personal/forex-rates', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
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
    
    // Try to find the rates table
    // Republic Bank typically displays rates in a table format
    $('table').each((_, table) => {
      $(table).find('tr').each((_, row) => {
        const cells = $(row).find('td, th')
        const rowText = $(row).text()
        
        // Look for USD row
        if (rowText.toUpperCase().includes('USD') || rowText.toUpperCase().includes('US DOLLAR')) {
          cells.each((index, cell) => {
            const text = $(cell).text().trim()
            const number = parseFloat(text)
            
            // If we find a valid number between 6 and 8 (typical TTD/USD range)
            if (!isNaN(number) && number > 6 && number < 8) {
              // Usually buying rate comes first, then selling
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
    
    // Also try to find rates in divs or spans
    if (!sellingRate || !buyingRate) {
      const bodyText = $('body').text()
      
      // Look for patterns like "6.75" or "6.80" near USD mentions
      const usdMatches = bodyText.match(/USD[\s\S]{0,200}?(\d+\.\d{2})/gi)
      if (usdMatches && usdMatches.length >= 2) {
        const numbers = usdMatches.map(match => {
          const num = match.match(/(\d+\.\d{2})/)
          return num ? parseFloat(num[1]) : null
        }).filter(n => n !== null && n > 6 && n < 8) as number[]
        
        if (numbers.length >= 2) {
          buyingRate = buyingRate || numbers[0]
          sellingRate = sellingRate || numbers[1]
        }
      }
    }

    // If we still couldn't parse, return default rates with a note
    if (!sellingRate || !buyingRate) {
      return NextResponse.json({
        selling: 6.80,
        buying: 6.75,
        source: 'Republic Bank TT',
        timestamp: new Date().toISOString(),
        note: 'Unable to fetch live rates from website. Showing approximate values. Please check https://republictt.com/personal/forex-rates for current rates.',
        url: 'https://republictt.com/personal/forex-rates',
      })
    }

    return NextResponse.json({
      selling: sellingRate,
      buying: buyingRate,
      source: 'Republic Bank TT',
      timestamp: new Date().toISOString(),
      url: 'https://republictt.com/personal/forex-rates',
    })
  } catch (error) {
    console.error('Error fetching exchange rates:', error)
    
    // Return approximate fallback rates
    return NextResponse.json({
      selling: 6.80,
      buying: 6.75,
      source: 'Republic Bank TT',
      timestamp: new Date().toISOString(),
      note: 'Unable to fetch live rates. Showing approximate values. Please check https://republictt.com/personal/forex-rates for current rates.',
      url: 'https://republictt.com/personal/forex-rates',
    })
  }
}
