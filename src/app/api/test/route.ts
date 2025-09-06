import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // 데이터베이스 연결 테스트
    const stats = await prisma.$transaction([
      prisma.provider.count(),
      prisma.region.count(),
      prisma.gpuModel.count(),
      prisma.instanceType.count(),
      prisma.priceHistory.count()
    ])

    // 최신 가격 데이터 5개 조회
    const latestPrices = await prisma.priceHistory.findMany({
      take: 5,
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        instanceType: {
          include: {
            provider: true,
            region: true,
            family: {
              include: {
                gpuModel: true
              }
            }
          }
        }
      }
    })

    return NextResponse.json({
      success: true,
      message: 'API 및 데이터베이스 연결이 정상적으로 작동합니다',
      data: {
        stats: {
          providers: stats[0],
          regions: stats[1],
          gpuModels: stats[2],
          instanceTypes: stats[3],
          prices: stats[4]
        },
        latestPrices: latestPrices.map(price => ({
          instanceName: price.instanceType.instanceName,
          provider: price.instanceType.provider.name,
          region: price.instanceType.region.name,
          gpuModel: price.instanceType.family.gpuModel.model,
          gpuCount: price.instanceType.gpuCount,
          pricePerHour: price.priceAmount,
          pricePerGpu: (price.priceAmount / price.instanceType.gpuCount).toFixed(2),
          currency: price.currency
        }))
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('API Test Error:', error)
    return NextResponse.json(
      {
        success: false,
        message: 'API 테스트 중 오류가 발생했습니다',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
