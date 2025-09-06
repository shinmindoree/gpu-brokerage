import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // 각 프로바이더별 데이터 조회
    const providersWithData = await prisma.provider.findMany({
      include: {
        regions: {
          include: {
            instanceTypes: {
              take: 2, // 각 리전당 2개씩만
              include: {
                family: {
                  include: {
                    gpuModel: true
                  }
                },
                priceHistory: {
                  where: {
                    purchaseOption: 'on_demand'
                  },
                  orderBy: {
                    effectiveDate: 'desc'
                  },
                  take: 1
                }
              }
            }
          }
        }
      }
    })

    const result = providersWithData.map(provider => ({
      code: provider.code,
      name: provider.name,
      regionCount: provider.regions.length,
      regions: provider.regions.map(region => ({
        code: region.code,
        name: region.name,
        countryCode: region.countryCode,
        instanceTypes: region.instanceTypes.map(instance => ({
          instanceName: instance.instanceName,
          gpuModel: instance.family.gpuModel.model,
          gpuCount: instance.gpuCount,
          vcpu: instance.vcpuCount,
          ram: instance.ramGb,
          price: instance.priceHistory[0]?.priceAmount || null,
          pricePerGpu: instance.priceHistory[0] 
            ? (instance.priceHistory[0].priceAmount / instance.gpuCount).toFixed(2)
            : null
        }))
      }))
    }))

    return NextResponse.json({
      success: true,
      data: result,
      summary: {
        totalProviders: providersWithData.length,
        totalRegions: providersWithData.reduce((acc, p) => acc + p.regions.length, 0),
        totalInstances: providersWithData.reduce((acc, p) => 
          acc + p.regions.reduce((acc2, r) => acc2 + r.instanceTypes.length, 0), 0
        )
      }
    })
  } catch (error) {
    console.error('Providers API Error:', error)
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to fetch providers data',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
