import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

// 가격 업데이트 요청 스키마
const priceUpdateSchema = z.object({
  updates: z.array(z.object({
    instanceId: z.string(),
    newPrice: z.number().min(0),
    currency: z.string().default('USD')
  }))
})

// 실제 가격 데이터 (실제로는 데이터베이스에 저장되어야 함)
let priceStorage: Record<string, { pricePerHour: number; currency: string; lastUpdated: string }> = {
  // AWS
  'aws-p5d.24xlarge': { pricePerHour: 98.32, currency: 'USD', lastUpdated: new Date().toISOString() },
  'aws-p4d.24xlarge': { pricePerHour: 32.77, currency: 'USD', lastUpdated: new Date().toISOString() },
  'aws-g5.xlarge': { pricePerHour: 1.006, currency: 'USD', lastUpdated: new Date().toISOString() },
  'aws-g5.2xlarge': { pricePerHour: 1.89, currency: 'USD', lastUpdated: new Date().toISOString() },
  
  // Azure
  'azure-Standard_ND_H100_v5': { pricePerHour: 89.76, currency: 'USD', lastUpdated: new Date().toISOString() },
  'azure-Standard_ND96amsr_A100_v4': { pricePerHour: 27.20, currency: 'USD', lastUpdated: new Date().toISOString() },
  'azure-Standard_ND40rs_v2': { pricePerHour: 19.44, currency: 'USD', lastUpdated: new Date().toISOString() },
  
  // GCP
  'gcp-a3-highgpu-8g': { pricePerHour: 91.45, currency: 'USD', lastUpdated: new Date().toISOString() },
  'gcp-a2-highgpu-8g': { pricePerHour: 29.89, currency: 'USD', lastUpdated: new Date().toISOString() },
  'gcp-g2-standard-4': { pricePerHour: 0.736, currency: 'USD', lastUpdated: new Date().toISOString() }
}

// 가격 업데이트 로그
interface PriceUpdateLog {
  id: string
  instanceId: string
  oldPrice: number
  newPrice: number
  updatedAt: string
  updatedBy: string
}

let updateLogs: PriceUpdateLog[] = []

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { updates } = priceUpdateSchema.parse(body)

    const results = []
    const timestamp = new Date().toISOString()

    for (const update of updates) {
      const { instanceId, newPrice, currency } = update
      
      if (!priceStorage[instanceId]) {
        results.push({
          instanceId,
          success: false,
          error: 'Instance not found'
        })
        continue
      }

      const oldPrice = priceStorage[instanceId].pricePerHour
      
      // 가격 업데이트
      priceStorage[instanceId] = {
        pricePerHour: newPrice,
        currency,
        lastUpdated: timestamp
      }

      // 로그 기록
      updateLogs.push({
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        instanceId,
        oldPrice,
        newPrice,
        updatedAt: timestamp,
        updatedBy: 'admin' // 실제로는 인증된 사용자 정보
      })

      results.push({
        instanceId,
        success: true,
        oldPrice,
        newPrice,
        change: newPrice - oldPrice,
        changePercent: ((newPrice - oldPrice) / oldPrice) * 100
      })
    }

    return NextResponse.json({
      success: true,
      message: `${results.filter(r => r.success).length}개 인스턴스 가격이 업데이트되었습니다.`,
      results,
      updatedAt: timestamp
    })

  } catch (error) {
    console.error('Price update error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Invalid request data', 
          details: error.errors 
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { 
        success: false,
        error: 'Internal server error',
        message: 'Failed to update prices'
      },
      { status: 500 }
    )
  }
}

// 가격 데이터 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const includeLogs = searchParams.get('logs') === 'true'

    const response: any = {
      prices: priceStorage,
      lastUpdated: new Date().toISOString()
    }

    if (includeLogs) {
      response.logs = updateLogs.slice(-50) // 최근 50개 로그만
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('Price retrieval error:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to retrieve prices'
      },
      { status: 500 }
    )
  }
}

// 현재 메모리 내 가격 데이터를 외부에서 접근할 수 있도록 export
export function getCurrentPrices() {
  return priceStorage
}

// 가격 데이터 업데이트 (다른 API에서 사용)
export function updatePrice(instanceId: string, pricePerHour: number, currency = 'USD') {
  if (priceStorage[instanceId]) {
    priceStorage[instanceId] = {
      pricePerHour,
      currency,
      lastUpdated: new Date().toISOString()
    }
    return true
  }
  return false
}

