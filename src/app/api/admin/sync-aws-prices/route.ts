import { NextRequest, NextResponse } from 'next/server'
import { awsPricingService } from '@/lib/aws-pricing'

interface SyncResult {
  success: boolean
  message: string
  data?: {
    totalFetched: number
    updated: number
    errors: number
    updatedInstances: string[]
  }
  error?: string
}

export async function POST(request: NextRequest): Promise<NextResponse<SyncResult>> {
  try {
    console.log('Starting AWS price synchronization...')
    
    // AWS에서 Seoul 리전 GPU 인스턴스 가격 가져오기
    const awsPrices = await awsPricingService.fetchSeoulGPUPrices()
    
    if (awsPrices.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No AWS prices fetched. Using existing prices.',
        data: {
          totalFetched: 0,
          updated: 0,
          errors: 0,
          updatedInstances: []
        }
      })
    }

    // 내부 포맷으로 변환
    const internalPrices = awsPricingService.mapToInternalFormat(awsPrices)
    
    // 가격 업데이트 API 호출
    const updates = Object.entries(internalPrices).map(([instanceId, priceData]) => ({
      instanceId,
      newPrice: priceData.pricePerHour,
      currency: priceData.currency
    }))

    // 내부 가격 업데이트 API 호출
    const updateResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/admin/prices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ updates })
    })

    const updateResult = await updateResponse.json()

    if (!updateResponse.ok || !updateResult.success) {
      throw new Error(updateResult.message || 'Failed to update prices')
    }

    const successfulUpdates = updateResult.results?.filter((r: any) => r.success) || []
    
    console.log(`AWS price sync completed. Updated ${successfulUpdates.length} instances.`)

    return NextResponse.json({
      success: true,
      message: `Successfully synchronized ${successfulUpdates.length} AWS GPU instance prices from Seoul region`,
      data: {
        totalFetched: awsPrices.length,
        updated: successfulUpdates.length,
        errors: updates.length - successfulUpdates.length,
        updatedInstances: successfulUpdates.map((r: any) => r.instanceId)
      }
    })

  } catch (error) {
    console.error('AWS price sync error:', error)
    
    return NextResponse.json({
      success: false,
      message: 'Failed to synchronize AWS prices',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// 동기화 상태 조회
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const dryRun = searchParams.get('dryRun') === 'true'

    if (dryRun) {
      // 실제 동기화 없이 가져올 수 있는 데이터만 확인
      const awsPrices = await awsPricingService.fetchSeoulGPUPrices()
      const internalPrices = awsPricingService.mapToInternalFormat(awsPrices)

      return NextResponse.json({
        success: true,
        message: 'Dry run completed',
        data: {
          availablePrices: Object.keys(internalPrices).length,
          instances: Object.keys(internalPrices),
          samplePrices: Object.entries(internalPrices).slice(0, 3).reduce((acc, [key, value]) => {
            acc[key] = value
            return acc
          }, {} as Record<string, any>)
        }
      })
    }

    return NextResponse.json({
      success: true,
      message: 'AWS price sync endpoint is ready',
      data: {
        endpoint: '/api/admin/sync-aws-prices',
        methods: ['GET (dry run)', 'POST (sync)'],
        lastSync: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('AWS price sync status error:', error)
    
    return NextResponse.json({
      success: false,
      message: 'Failed to get sync status',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
