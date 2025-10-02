// Azure Spot 신호 수집 백그라운드 워커 API
import { NextRequest, NextResponse } from 'next/server';
import { azureSpotService } from '@/lib/azure-spot';

// Spot 워커 실행 설정
const SPOT_WORKER_CONFIG = {
  maxRunTimeMinutes: 20,    // 최대 20분 실행
  batchSizeLimit: 12,       // 한 번에 최대 12개 조합
  cooldownMinutes: 15,      // 연속 실행 방지 쿨다운
};

/**
 * POST /api/azure/spot-worker
 * Azure Spot 신호 수집 백그라운드 워커 실행
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    const { 
      force = false,           // 쿨다운 무시하고 강제 실행
      dryRun = false,          // 실제 수집 없이 계획만 확인
      maxCombinations = 12     // 이번 실행에서 최대 수집할 조합 수
    } = body;

    console.log(`🤖 Azure Spot 워커 시작 (force: ${force}, dryRun: ${dryRun})`);

    // 쿨다운 체크 (강제 실행이 아닌 경우)
    if (!force) {
      const lastRun = await getLastSpotWorkerRun();
      if (lastRun && isInCooldown(lastRun, SPOT_WORKER_CONFIG.cooldownMinutes)) {
        return NextResponse.json({
          success: false,
          message: `Spot 워커가 쿨다운 중입니다. ${SPOT_WORKER_CONFIG.cooldownMinutes}분 후 다시 시도해주세요.`,
          data: {
            lastRun: lastRun.toISOString(),
            cooldownEndsAt: new Date(lastRun.getTime() + SPOT_WORKER_CONFIG.cooldownMinutes * 60 * 1000).toISOString()
          }
        }, { status: 429 });
      }
    }

    // 수집 계획 수립
    const plan = await createSpotCollectionPlan(maxCombinations);
    
    if (plan.combinations.length === 0) {
      return NextResponse.json({
        success: true,
        message: '수집할 조합이 없습니다. 모든 조합이 최근에 수집되었습니다.',
        data: {
          plan,
          executionTimeMs: Date.now() - startTime
        }
      });
    }

    // Dry run인 경우 계획만 반환
    if (dryRun) {
      return NextResponse.json({
        success: true,
        message: `Dry run 완료. ${plan.combinations.length}개 조합을 수집할 예정입니다.`,
        data: {
          plan,
          executionTimeMs: Date.now() - startTime
        }
      });
    }

    // 실제 수집 실행
    const results = await executeSpotCollectionPlan(plan, startTime);
    
    // 워커 실행 기록 저장
    await logSpotWorkerRun(results);

    return NextResponse.json({
      success: true,
      message: `Spot 워커 실행 완료. ${results.completed}개 조합 수집됨.`,
      data: {
        plan,
        results,
        marketInsights: await generateMarketInsights(results),
        executionTimeMs: Date.now() - startTime
      }
    });

  } catch (error) {
    console.error('Azure Spot 워커 실패:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Spot 워커 실행에 실패했습니다.',
      data: {
        executionTimeMs: Date.now() - startTime
      }
    }, { status: 500 });
  }
}

/**
 * GET /api/azure/spot-worker
 * Spot 워커 상태 및 마지막 실행 결과 조회
 */
export async function GET(request: NextRequest) {
  try {
    const lastRun = await getLastSpotWorkerRun();
    const isCurrentlyInCooldown = lastRun ? isInCooldown(lastRun, SPOT_WORKER_CONFIG.cooldownMinutes) : false;
    
    // 시장 요약 정보
    const marketSummary = await azureSpotService.getMarketSummary();
    
    // 현재 수집 계획 미리보기
    const plan = await createSpotCollectionPlan(12);
    
    return NextResponse.json({
      success: true,
      data: {
        workerStatus: {
          lastRun: lastRun?.toISOString(),
          inCooldown: isCurrentlyInCooldown,
          cooldownEndsAt: lastRun ? 
            new Date(lastRun.getTime() + SPOT_WORKER_CONFIG.cooldownMinutes * 60 * 1000).toISOString() : 
            null,
          config: SPOT_WORKER_CONFIG
        },
        marketSummary: {
          ...marketSummary,
          condition: marketSummary.avgMarketStress > 0.6 ? 'stressed' :
                    marketSummary.avgMarketStress > 0.4 ? 'moderate' : 'calm',
          avgDiscount: `${((1 - marketSummary.avgPriceRatio) * 100).toFixed(1)}%`
        },
        nextPlan: plan,
        recommendations: generateWorkerRecommendations(marketSummary, isCurrentlyInCooldown),
        message: isCurrentlyInCooldown ? 
          'Spot 워커가 쿨다운 중입니다.' : 
          'Spot 워커 실행 가능 상태입니다.'
      }
    });

  } catch (error) {
    console.error('Spot 워커 상태 조회 실패:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Spot 워커 상태 조회에 실패했습니다.'
    }, { status: 500 });
  }
}

/**
 * 마지막 Spot 워커 실행 시간 조회
 */
async function getLastSpotWorkerRun(): Promise<Date | null> {
  // TODO: Prisma 클라이언트 업데이트 후 활성화
  // 임시로 현재 시간에서 20분 전으로 설정
  return new Date(Date.now() - 20 * 60 * 1000);
}

/**
 * 쿨다운 중인지 확인
 */
function isInCooldown(lastRun: Date, cooldownMinutes: number): boolean {
  const cooldownEnds = new Date(lastRun.getTime() + cooldownMinutes * 60 * 1000);
  return new Date() < cooldownEnds;
}

/**
 * Spot 수집 계획 수립
 */
async function createSpotCollectionPlan(maxCombinations: number) {
  const regions = ['koreacentral', 'eastus', 'japaneast', 'westeurope'];
  const vmSizes = [
    'Standard_NC4as_T4_v3',
    'Standard_NC8as_T4_v3',
    'Standard_NC24ads_A100_v4',
    'Standard_NC48ads_A100_v4'
  ];

  const allCombinations = regions.flatMap(region => 
    vmSizes.map(vmSize => ({ region, vmSize }))
  );

  // 최근 30분 이내에 수집된 조합 제외 (실제로는 DB 조회)
  const recentlyCollected: any[] = []; // TODO: DB에서 조회
  
  const recentlyCollectedSet = new Set(
    recentlyCollected.map(r => `${r.region}:${r.vmSize}`)
  );

  // 우선순위 기반 필터링 (Spot은 용량 체크보다 더 자주 수집)
  const pendingCombinations = allCombinations
    .filter(combo => !recentlyCollectedSet.has(`${combo.region}:${combo.vmSize}`))
    .map(combo => ({
      ...combo,
      priority: calculateSpotPriority(combo.region, combo.vmSize)
    }))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, maxCombinations);

  return {
    totalCombinations: allCombinations.length,
    recentlyCollected: recentlyCollected.length,
    pending: pendingCombinations.length,
    combinations: pendingCombinations,
    estimatedDurationMinutes: Math.ceil(pendingCombinations.length * 0.25) // 조합당 15초 가정
  };
}

/**
 * Spot 수집 우선순위 계산
 */
function calculateSpotPriority(region: string, vmSize: string): number {
  let priority = 100;
  
  // 인기 리전 우선순위 높임
  if (region === 'koreacentral') priority += 25;
  if (region === 'eastus') priority += 20;
  if (region === 'japaneast') priority += 15;
  
  // 고급 GPU는 Spot 시장 변동이 크므로 우선순위 높임
  if (vmSize.includes('A100')) priority += 20;
  if (vmSize.includes('H100')) priority += 25;
  if (vmSize.includes('T4')) priority += 5;
  
  // Spot 특화 가중치
  priority += 10; // Spot은 기본적으로 중요도 높음
  
  return priority;
}

/**
 * Spot 수집 계획 실행
 */
async function executeSpotCollectionPlan(plan: any, startTime: number) {
  const results = {
    planned: plan.combinations.length,
    completed: 0,
    successful: 0,
    failed: 0,
    signals: [] as any[],
    errors: [] as string[]
  };

  for (const combo of plan.combinations) {
    try {
      // 실행 시간 제한 체크
      const elapsedMinutes = (Date.now() - startTime) / (1000 * 60);
      if (elapsedMinutes > SPOT_WORKER_CONFIG.maxRunTimeMinutes) {
        console.log(`⏱️ Spot 워커 최대 실행 시간 초과: ${elapsedMinutes}분`);
        break;
      }

      console.log(`📊 Spot 워커 수집: ${combo.region}/${combo.vmSize}`);
      
      const signal = await azureSpotService.collectSpotPrice(combo.region, combo.vmSize);
      await azureSpotService.saveSpotSignal(signal);
      
      results.completed++;
      results.successful++;
      results.signals.push(signal);
      
      // 수집 간격
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } catch (error) {
      console.error(`Spot 워커 수집 실패: ${combo.region}/${combo.vmSize}`, error);
      results.completed++;
      results.failed++;
      results.errors.push(`${combo.region}/${combo.vmSize}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return results;
}

/**
 * 시장 인사이트 생성
 */
async function generateMarketInsights(results: any) {
  if (results.signals.length === 0) {
    return {
      summary: '수집된 신호가 없습니다.',
      trends: [],
      alerts: []
    };
  }

  const signals = results.signals;
  const avgMarketStress = signals.reduce((sum: number, s: any) => sum + s.marketStress, 0) / signals.length;
  const avgPriceRatio = signals.reduce((sum: number, s: any) => sum + s.priceRatio, 0) / signals.length;

  const insights = {
    summary: `${signals.length}개 신호 수집. 평균 할인율: ${((1-avgPriceRatio)*100).toFixed(1)}%`,
    marketCondition: avgMarketStress > 0.6 ? 'high_stress' : avgMarketStress > 0.4 ? 'moderate' : 'calm',
    bestDeals: signals
      .filter((s: any) => s.priceRatio < 0.4) // 60% 이상 할인
      .sort((a: any, b: any) => a.priceRatio - b.priceRatio)
      .slice(0, 3),
    alerts: [] as string[]
  };

  // 알림 생성
  if (avgMarketStress > 0.7) {
    insights.alerts.push('🔴 전반적인 시장 스트레스가 높습니다');
  }
  if (avgPriceRatio > 0.8) {
    insights.alerts.push('💰 Spot 가격이 평소보다 높습니다');
  }
  if (insights.bestDeals.length > 0) {
    insights.alerts.push(`💡 ${insights.bestDeals.length}개의 저렴한 Spot 기회 발견`);
  }

  return insights;
}

/**
 * 워커 추천사항 생성
 */
function generateWorkerRecommendations(marketSummary: any, inCooldown: boolean) {
  const recommendations = [];

  if (inCooldown) {
    recommendations.push('⏳ 쿨다운 중입니다. 잠시 후 다시 실행하세요.');
  } else {
    recommendations.push('🚀 지금 실행 가능합니다.');
  }

  if (marketSummary.avgMarketStress > 0.6) {
    recommendations.push('📊 시장 변동성이 높으니 자주 모니터링하세요.');
  }

  if (marketSummary.avgPriceRatio < 0.5) {
    recommendations.push('💡 현재 Spot 할인율이 좋습니다!');
  }

  return recommendations;
}

/**
 * Spot 워커 실행 기록 저장
 */
async function logSpotWorkerRun(results: any) {
  try {
    // TODO: Prisma 클라이언트 업데이트 후 활성화
    console.log('📝 Spot 워커 실행 기록 (모킹):', {
      completed: results.completed,
      successful: results.successful,
      failed: results.failed,
      errors: results.errors.length
    });
  } catch (error) {
    console.error('Spot 워커 실행 기록 저장 실패:', error);
  }
}
