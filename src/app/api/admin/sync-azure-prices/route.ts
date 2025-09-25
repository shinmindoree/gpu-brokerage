import { NextRequest, NextResponse } from 'next/server'
import { azurePricingService } from '@/lib/azure-pricing'

// 임시 메모리 저장소 (추후 데이터베이스로 교체)
let azurePricesStore: Record<string, {
  pricePerHour: number
  currency: string
  lastUpdated: string
  vmSize: string
  location: string
  gpuModel: string
  gpuCount: number
  vcpu: number
  ram: number
}> = {}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { regions, dryRun = false } = body

    console.log('Starting Azure price synchronization...', { regions, dryRun })

    // Azure GPU VM 가격 조회
    const azureResponse = await azurePricingService.fetchGPUVMPrices(regions)

    if (!azureResponse.success || !azureResponse.data) {
      return NextResponse.json({
        success: false,
        error: azureResponse.error || 'Failed to fetch Azure prices',
        message: azureResponse.message || 'Azure 가격 정보를 가져올 수 없습니다.'
      }, { status: 500 })
    }

    const { instances, totalCount, fetchedAt } = azureResponse.data

    if (dryRun) {
      return NextResponse.json({
        success: true,
        message: 'Azure 가격 동기화 미리보기 (실제 업데이트 안함)',
        data: {
          totalInstances: totalCount,
          instances: instances.slice(0, 10), // 처음 10개만 미리보기
          regions: azureResponse.data.regions,
          gpuModels: azureResponse.data.gpuModels,
          fetchedAt,
          dryRun: true
        }
      })
    }

    // 실제 가격 업데이트
    let updatedCount = 0
    for (const instance of instances) {
      const instanceId = `azure-${instance.vmSize.toLowerCase()}-${instance.location.toLowerCase().replace(/\s+/g, '-')}`
      
      azurePricesStore[instanceId] = {
        pricePerHour: instance.pricePerHour,
        currency: instance.currency,
        lastUpdated: fetchedAt,
        vmSize: instance.vmSize,
        location: instance.location,
        gpuModel: instance.gpuModel || 'Unknown',
        gpuCount: instance.gpuCount || 1,
        vcpu: instance.vcpu || 4,
        ram: instance.ram || 28
      }
      updatedCount++
    }

    console.log(`Azure price sync completed: ${updatedCount} instances updated`)

    return NextResponse.json({
      success: true,
      message: `Azure 가격 동기화 완료: ${updatedCount}개 인스턴스 업데이트됨`,
      data: {
        updated: updatedCount,
        totalInstances: totalCount,
        regions: azureResponse.data.regions,
        gpuModels: azureResponse.data.gpuModels,
        fetchedAt,
        currency: azureResponse.data.currency
      }
    })

  } catch (error) {
    console.error('Azure price sync error:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Azure 가격 동기화 중 오류가 발생했습니다.'
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const dryRun = searchParams.get('dryRun') === 'true'

    if (dryRun) {
      // 미리보기 모드
      const azureResponse = await azurePricingService.fetchGPUVMPrices()
      
      return NextResponse.json({
        success: true,
        message: 'Azure 가격 정보 미리보기',
        data: {
          availablePrices: azureResponse.data?.totalCount || 0,
          instances: azureResponse.data?.instances || [],
          regions: azureResponse.data?.regions || [],
          gpuModels: azureResponse.data?.gpuModels || [],
          dryRun: true
        }
      })
    }

    // 현재 저장된 Azure 가격 정보 반환
    const azurePrices = Object.entries(azurePricesStore).map(([id, data]) => ({
      id,
      ...data
    }))

    return NextResponse.json({
      success: true,
      data: {
        totalStored: azurePrices.length,
        instances: azurePrices,
        lastUpdate: azurePrices.length > 0 ? 
          Math.max(...azurePrices.map(p => new Date(p.lastUpdated).getTime())) : null
      }
    })

  } catch (error) {
    console.error('Azure price fetch error:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Azure 가격 정보를 조회할 수 없습니다.'
    }, { status: 500 })
  }
}

// Azure 가격 저장소 내보내기 (다른 API에서 사용)
export { azurePricesStore }
