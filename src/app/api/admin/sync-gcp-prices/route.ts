import { NextRequest, NextResponse } from 'next/server'
import { GCPPricingService } from '@/lib/gcp-pricing'
import { z } from 'zod'

const gcpSyncSchema = z.object({
  regions: z.array(z.string()).optional(),
  dryRun: z.boolean().optional().default(false),
})

const gcpPricingService = new GCPPricingService()

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { regions, dryRun } = gcpSyncSchema.parse(body)

    const result = await gcpPricingService.fetchGPUVMPrices(regions)

    if (!result.success) {
      return NextResponse.json({ success: false, message: result.message || result.error }, { status: 500 })
    }

    if (!dryRun) {
      // 실제 가격 업데이트 로직 (현재는 in-memory store에 저장)
      // TODO: DB 연동 시 여기에 DB 업데이트 로직 추가
      // currentPricesStore.updatePrices(result.data.instances.map(i => ({
      //   instanceId: `gcp-${i.machineType.toLowerCase()}-${i.region.toLowerCase()}`,
      //   newPrice: i.pricePerHour,
      //   currency: i.currency,
      //   lastUpdated: i.effectiveDate
      // })))
    }

    return NextResponse.json({
      success: true,
      message: `GCP 가격 동기화 완료: ${result.data.totalCount}개 인스턴스 업데이트됨`,
      data: {
        updated: result.data.totalCount,
        instances: result.data.instances,
        availablePrices: result.data.totalCount,
        regions: result.data.regions,
        gpuModels: result.data.gpuModels,
        dryRun
      }
    })
  } catch (error) {
    console.error('Error syncing GCP prices:', error)
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'GCP 가격 동기화 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const queryParams = Object.fromEntries(searchParams.entries())
    
    // Query parameter는 문자열이므로 적절히 변환
    const processedParams = {
      ...queryParams,
      dryRun: queryParams.dryRun === 'true',
      regions: queryParams.regions ? queryParams.regions.split(',') : undefined
    }
    
    const validatedParams = gcpSyncSchema.parse(processedParams)

    const result = await gcpPricingService.fetchGPUVMPrices(validatedParams.regions)

    if (!result.success) {
      return NextResponse.json({ success: false, message: result.message || result.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'GCP 가격 데이터 조회 성공',
      data: {
        instances: result.data.instances,
        availablePrices: result.data.totalCount,
        regions: result.data.regions,
        gpuModels: result.data.gpuModels,
        dryRun: true // GET 요청은 항상 dryRun으로 간주
      }
    })
  } catch (error) {
    console.error('Error fetching GCP prices:', error)
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'GCP 가격 조회 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
