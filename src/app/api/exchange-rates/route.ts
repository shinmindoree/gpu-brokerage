import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { exchangeRateService } from '@/lib/exchange-rates'

// 환율 조회 요청 스키마
const exchangeRateQuerySchema = z.object({
  from: z.enum(['USD']).default('USD'),
  to: z.enum(['KRW']).default('KRW'),
  amount: z.coerce.number().min(0).optional()
})

// 환율 변환 요청 스키마
const convertRequestSchema = z.object({
  from: z.enum(['USD', 'KRW']),
  to: z.enum(['USD', 'KRW']),
  amount: z.number().min(0)
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const queryParams = {
      from: searchParams.get('from') || 'USD',
      to: searchParams.get('to') || 'KRW',
      amount: searchParams.get('amount') || undefined
    }

    const { from, to, amount } = exchangeRateQuerySchema.parse(queryParams)

    // 현재 환율 조회
    const rate = await exchangeRateService.getUSDToKRW()
    const cachedInfo = exchangeRateService.getCachedRateInfo()

    const response: any = {
      success: true,
      from,
      to,
      rate,
      lastUpdated: cachedInfo?.lastUpdated || new Date().toISOString(),
      source: cachedInfo?.source || 'api'
    }

    // 금액이 제공된 경우 변환 결과도 포함
    if (amount !== undefined) {
      if (from === 'USD' && to === 'KRW') {
        response.convertedAmount = await exchangeRateService.convertUSDToKRW(amount)
      } else if (from === 'KRW' && to === 'USD') {
        response.convertedAmount = await exchangeRateService.convertKRWToUSD(amount)
      }
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('Exchange rate API error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Invalid query parameters', 
          details: error.errors 
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch exchange rate',
        message: '환율 정보를 가져오는데 실패했습니다.'
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { from, to, amount } = convertRequestSchema.parse(body)

    let convertedAmount: number

    if (from === 'USD' && to === 'KRW') {
      convertedAmount = await exchangeRateService.convertUSDToKRW(amount)
    } else if (from === 'KRW' && to === 'USD') {
      convertedAmount = await exchangeRateService.convertKRWToUSD(amount)
    } else {
      return NextResponse.json(
        { 
          success: false,
          error: 'Unsupported currency conversion',
          message: '지원하지 않는 통화 변환입니다.'
        },
        { status: 400 }
      )
    }

    const rate = await exchangeRateService.getUSDToKRW()
    const cachedInfo = exchangeRateService.getCachedRateInfo()

    return NextResponse.json({
      success: true,
      from,
      to,
      originalAmount: amount,
      convertedAmount,
      rate,
      lastUpdated: cachedInfo?.lastUpdated || new Date().toISOString(),
      source: cachedInfo?.source || 'api'
    })

  } catch (error) {
    console.error('Currency conversion API error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Invalid request body', 
          details: error.errors 
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to convert currency',
        message: '통화 변환에 실패했습니다.'
      },
      { status: 500 }
    )
  }
}