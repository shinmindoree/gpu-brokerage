import { NextRequest, NextResponse } from 'next/server'
import { AWSPricingService } from '@/lib/aws-pricing'
import { z } from 'zod'

const awsSyncSchema = z.object({
  regions: z.array(z.string()).optional(),
  dryRun: z.boolean().optional().default(false),
})

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
    const body = await request.json()
    const { regions, dryRun } = awsSyncSchema.parse(body)

    console.log('Starting AWS price synchronization...')
    
    const awsPricingService = new AWSPricingService()
    const result = await awsPricingService.fetchGPUPrices(regions)

    if (!result.success) {
      return NextResponse.json({
        success: false,
        message: result.message || result.error || 'No AWS prices fetched',
        data: {
          totalFetched: 0,
          updated: 0,
          errors: 1,
          updatedInstances: []
        }
      })
    }

    if (!dryRun && result.data) {
      // 가격 업데이트 API 호출
      const updates = result.data.instances.map(instance => ({
        instanceId: `aws-${instance.instanceType}`,
        newPrice: instance.pricePerHour,
        currency: instance.currency
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
        message: `Successfully synchronized ${successfulUpdates.length} AWS GPU instance prices`,
        data: {
          totalFetched: result.data.totalCount,
          updated: successfulUpdates.length,
          errors: updates.length - successfulUpdates.length,
          updatedInstances: successfulUpdates.map((r: any) => r.instanceId)
        }
      })
    }

    return NextResponse.json({
      success: true,
      message: `AWS 가격 동기화 완료: ${result.data?.totalCount || 0}개 인스턴스 (Dry Run)`,
      data: {
        totalFetched: result.data?.totalCount || 0,
        updated: dryRun ? 0 : result.data?.totalCount || 0,
        errors: 0,
        updatedInstances: dryRun ? [] : result.data?.instances.map(i => `aws-${i.instanceType}`) || []
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
      // 새로운 AWS GPU 가격 API 사용
      const awsPricingService = new AWSPricingService()
      const result = await awsPricingService.fetchGPUPrices()

      if (!result.success) {
        return NextResponse.json({ success: false, message: result.message || result.error }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: 'AWS 가격 데이터 조회 성공',
        data: {
          instances: result.data?.instances || [],
          availablePrices: result.data?.totalCount || 0,
          regions: result.data?.regions || [],
          gpuModels: result.data?.gpuModels || [],
          dryRun: true
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

