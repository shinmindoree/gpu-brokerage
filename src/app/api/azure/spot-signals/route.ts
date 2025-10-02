// Azure Spot 신호 수집 API
import { NextRequest, NextResponse } from 'next/server';
import { azureSpotService } from '@/lib/azure-spot';
import { z } from 'zod';

// 요청 스키마
const SpotSignalSchema = z.object({
  region: z.string().min(1, '리전은 필수입니다'),
  vmSize: z.string().min(1, 'VM 크기는 필수입니다'),
  force: z.boolean().optional()
});

const BatchSpotSignalSchema = z.object({
  regions: z.array(z.string()).min(1, '최소 1개 리전이 필요합니다'),
  vmSizes: z.array(z.string()).min(1, '최소 1개 VM크기가 필요합니다'),
  force: z.boolean().optional()
});

/**
 * POST /api/azure/spot-signals
 * Azure Spot 신호 수집 (단일 또는 배치)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // 배치 요청인지 단일 요청인지 판단
    if (body.regions && body.vmSizes) {
      return await handleBatchSpotCollection(body);
    } else {
      return await handleSingleSpotCollection(body);
    }
  } catch (error) {
    console.error('Azure Spot 신호 수집 API 오류:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Azure Spot 신호 수집에 실패했습니다.'
    }, { status: 500 });
  }
}

/**
 * 단일 리전/VM크기 Spot 신호 수집
 */
async function handleSingleSpotCollection(body: any) {
  const validation = SpotSignalSchema.safeParse(body);
  
  if (!validation.success) {
    return NextResponse.json({
      success: false,
      error: '잘못된 요청 형식',
      details: validation.error.errors,
      message: '요청 파라미터를 확인해주세요.'
    }, { status: 400 });
  }

  const { region, vmSize, force } = validation.data;

  try {
    console.log(`📊 Azure Spot 신호 수집 시작: ${region}/${vmSize}`);
    
    // Spot 신호 수집
    const signal = await azureSpotService.collectSpotPrice(region, vmSize);
    
    // 신호 저장
    await azureSpotService.saveSpotSignal(signal);
    
    return NextResponse.json({
      success: true,
      data: {
        signal,
        analysis: {
          priceStatus: signal.priceRatio > 0.8 ? 'expensive' : 
                      signal.priceRatio > 0.5 ? 'moderate' : 'cheap',
          marketCondition: signal.marketStress > 0.7 ? 'high_stress' :
                          signal.marketStress > 0.4 ? 'moderate_stress' : 'low_stress',
          evictionRisk: signal.evictionRate > 0.3 ? 'high' :
                       signal.evictionRate > 0.1 ? 'medium' : 'low'
        },
        message: `Spot 신호 수집 완료. 가격비율: ${(signal.priceRatio * 100).toFixed(1)}%`
      }
    });

  } catch (error) {
    console.error(`Azure Spot 신호 수집 실패: ${region}/${vmSize}`, error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: `${region}/${vmSize} Spot 신호 수집에 실패했습니다.`
    }, { status: 500 });
  }
}

/**
 * 배치 Spot 신호 수집
 */
async function handleBatchSpotCollection(body: any) {
  const validation = BatchSpotSignalSchema.safeParse(body);
  
  if (!validation.success) {
    return NextResponse.json({
      success: false,
      error: '잘못된 배치 요청 형식',
      details: validation.error.errors,
      message: '배치 요청 파라미터를 확인해주세요.'
    }, { status: 400 });
  }

  const { regions, vmSizes, force } = validation.data;
  
  // 총 조합 수 제한
  const totalCombinations = regions.length * vmSizes.length;
  if (totalCombinations > 20) {
    return NextResponse.json({
      success: false,
      error: '배치 요청 크기 초과',
      message: `한 번에 최대 20개 조합까지 가능합니다. (현재: ${totalCombinations}개)`
    }, { status: 400 });
  }

  try {
    console.log(`📊 Azure 배치 Spot 신호 수집 시작: ${totalCombinations}개 조합`);
    
    const signals: any[] = [];
    
    for (const region of regions) {
      for (const vmSize of vmSizes) {
        try {
          const signal = await azureSpotService.collectSpotPrice(region, vmSize);
          await azureSpotService.saveSpotSignal(signal);
          
          signals.push({
            ...signal,
            analysis: {
              priceStatus: signal.priceRatio > 0.8 ? 'expensive' : 
                          signal.priceRatio > 0.5 ? 'moderate' : 'cheap',
              marketCondition: signal.marketStress > 0.7 ? 'high_stress' :
                              signal.marketStress > 0.4 ? 'moderate_stress' : 'low_stress',
              evictionRisk: signal.evictionRate > 0.3 ? 'high' :
                           signal.evictionRate > 0.1 ? 'medium' : 'low'
            }
          });
          
          // 배치 간 간격
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          console.error(`배치 Spot 수집 중 오류: ${region}/${vmSize}`, error);
          
          signals.push({
            region,
            vmSize,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date()
          });
        }
      }
    }

    // 통계 계산
    const validSignals = signals.filter(s => !s.error);
    const stats = {
      total: signals.length,
      successful: validSignals.length,
      failed: signals.length - validSignals.length,
      avgPriceRatio: validSignals.length > 0 ? 
        validSignals.reduce((sum, s) => sum + s.priceRatio, 0) / validSignals.length : 0,
      avgMarketStress: validSignals.length > 0 ?
        validSignals.reduce((sum, s) => sum + s.marketStress, 0) / validSignals.length : 0
    };

    return NextResponse.json({
      success: true,
      data: {
        signals,
        stats,
        marketSummary: {
          overallCondition: stats.avgMarketStress > 0.6 ? 'stressed' :
                           stats.avgMarketStress > 0.4 ? 'moderate' : 'calm',
          avgDiscount: `${((1 - stats.avgPriceRatio) * 100).toFixed(1)}%`,
          collectionTime: new Date().toISOString()
        },
        message: `배치 Spot 신호 수집 완료 (${stats.successful}/${stats.total})`
      }
    });

  } catch (error) {
    console.error('Azure 배치 Spot 신호 수집 실패:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: '배치 Spot 신호 수집에 실패했습니다.'
    }, { status: 500 });
  }
}

/**
 * GET /api/azure/spot-signals
 * 최근 Spot 신호 조회 및 시장 요약
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const region = searchParams.get('region');
    const vmSize = searchParams.get('vmSize');
    const hours = parseInt(searchParams.get('hours') || '24');
    const summary = searchParams.get('summary') === 'true';

    if (hours > 168) { // 1주일 제한
      return NextResponse.json({
        success: false,
        error: '조회 기간은 최대 168시간(1주일)까지 가능합니다.',
      }, { status: 400 });
    }

    if (summary) {
      // 시장 요약만 조회
      const marketSummary = await azureSpotService.getMarketSummary();
      
      return NextResponse.json({
        success: true,
        data: {
          marketSummary: {
            ...marketSummary,
            condition: marketSummary.avgMarketStress > 0.6 ? 'high_stress' :
                      marketSummary.avgMarketStress > 0.4 ? 'moderate_stress' : 'low_stress',
            avgDiscount: `${((1 - marketSummary.avgPriceRatio) * 100).toFixed(1)}%`,
            lastUpdated: new Date().toISOString()
          },
          message: '시장 요약 정보'
        }
      });
    }

    // 상세 신호 조회
    const signals = await azureSpotService.getRecentSpotSignals(
      region || undefined,
      vmSize || undefined,
      hours
    );

    // 기본 통계 생성
    const stats = {
      total: signals.length,
      uniqueRegions: new Set(signals.map(s => s.region)).size,
      uniqueVmSizes: new Set(signals.map(s => s.vmSize)).size,
      avgPriceRatio: signals.length > 0 ? 
        signals.reduce((sum, s) => sum + s.priceRatio, 0) / signals.length : 0,
      avgMarketStress: signals.length > 0 ?
        signals.reduce((sum, s) => sum + s.marketStress, 0) / signals.length : 0,
      priceRanges: {
        cheap: signals.filter(s => s.priceRatio <= 0.5).length,
        moderate: signals.filter(s => s.priceRatio > 0.5 && s.priceRatio <= 0.8).length,
        expensive: signals.filter(s => s.priceRatio > 0.8).length
      }
    };

    return NextResponse.json({
      success: true,
      data: {
        signals,
        stats,
        filters: {
          region: region || null,
          vmSize: vmSize || null,
          hours
        },
        message: `최근 ${hours}시간 Spot 신호 조회`
      }
    });

  } catch (error) {
    console.error('Azure Spot 신호 조회 실패:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Spot 신호 조회에 실패했습니다.'
    }, { status: 500 });
  }
}
