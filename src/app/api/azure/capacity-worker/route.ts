// Azure 용량 체크 백그라운드 워커 API
import { NextRequest, NextResponse } from 'next/server';
import { azureCapacityService } from '@/lib/azure-capacity';
import { prisma } from '@/lib/prisma';

// 워커 실행 설정
const WORKER_CONFIG = {
  maxRunTimeMinutes: 30, // 최대 30분 실행
  batchSizeLimit: 16,    // 한 번에 최대 16개 조합
  cooldownMinutes: 10,   // 연속 실행 방지 쿨다운
};

/**
 * POST /api/azure/capacity-worker
 * Azure 용량 체크 백그라운드 워커 실행
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    const { 
      force = false,           // 쿨다운 무시하고 강제 실행
      dryRun = false,          // 실제 체크 없이 계획만 확인
      maxCombinations = 8      // 이번 실행에서 최대 체크할 조합 수
    } = body;

    console.log(`🤖 Azure 용량 체크 워커 시작 (force: ${force}, dryRun: ${dryRun})`);

    // 쿨다운 체크 (강제 실행이 아닌 경우)
    if (!force) {
      const lastRun = await getLastWorkerRun();
      if (lastRun && isInCooldown(lastRun, WORKER_CONFIG.cooldownMinutes)) {
        return NextResponse.json({
          success: false,
          message: `워커가 쿨다운 중입니다. ${WORKER_CONFIG.cooldownMinutes}분 후 다시 시도해주세요.`,
          data: {
            lastRun: lastRun.toISOString(),
            cooldownEndsAt: new Date(lastRun.getTime() + WORKER_CONFIG.cooldownMinutes * 60 * 1000).toISOString()
          }
        }, { status: 429 });
      }
    }

    // 체크할 조합 계획 수립
    const plan = await createCheckPlan(maxCombinations);
    
    if (plan.combinations.length === 0) {
      return NextResponse.json({
        success: true,
        message: '체크할 조합이 없습니다. 모든 조합이 최근에 체크되었습니다.',
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
        message: `Dry run 완료. ${plan.combinations.length}개 조합을 체크할 예정입니다.`,
        data: {
          plan,
          executionTimeMs: Date.now() - startTime
        }
      });
    }

    // 실제 체크 실행
    const results = await executeCheckPlan(plan, startTime);
    
    // 워커 실행 기록 저장
    await logWorkerRun(results);

    return NextResponse.json({
      success: true,
      message: `워커 실행 완료. ${results.completed}개 조합 체크됨.`,
      data: {
        plan,
        results,
        executionTimeMs: Date.now() - startTime
      }
    });

  } catch (error) {
    console.error('Azure 용량 체크 워커 실패:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: '용량 체크 워커 실행에 실패했습니다.',
      data: {
        executionTimeMs: Date.now() - startTime
      }
    }, { status: 500 });
  }
}

/**
 * GET /api/azure/capacity-worker
 * 워커 상태 및 마지막 실행 결과 조회
 */
export async function GET(request: NextRequest) {
  try {
    const lastRun = await getLastWorkerRun();
    const isCurrentlyInCooldown = lastRun ? isInCooldown(lastRun, WORKER_CONFIG.cooldownMinutes) : false;
    
    // TODO: Prisma 클라이언트 업데이트 후 활성화
    // 임시 통계 데이터
    const stats = {
      capacity: 12,
      ignored: 3,
      quota: 1,
      permission: 0
    };
    
    // const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    // const recentStats = await prisma.azureCapacityProbe.groupBy({
    //   by: ['errorClass'],
    //   where: {
    //     timestamp: { gte: since24h }
    //   },
    //   _count: true
    // });
    // const stats = {
    //   capacity: recentStats.find(s => s.errorClass === 'capacity')?._count || 0,
    //   ignored: recentStats.find(s => s.errorClass === 'ignored')?._count || 0,
    //   quota: recentStats.find(s => s.errorClass === 'quota')?._count || 0,
    //   permission: recentStats.find(s => s.errorClass === 'permission')?._count || 0
    // };

    const plan = await createCheckPlan(8); // 현재 계획 미리보기
    
    return NextResponse.json({
      success: true,
      data: {
        workerStatus: {
          lastRun: lastRun?.toISOString(),
          inCooldown: isCurrentlyInCooldown,
          cooldownEndsAt: lastRun ? 
            new Date(lastRun.getTime() + WORKER_CONFIG.cooldownMinutes * 60 * 1000).toISOString() : 
            null,
          config: WORKER_CONFIG
        },
        stats: {
          ...stats,
          total: Object.values(stats).reduce((a, b) => a + b, 0)
        },
        nextPlan: plan,
        message: isCurrentlyInCooldown ? 
          '워커가 쿨다운 중입니다.' : 
          '워커 실행 가능 상태입니다.'
      }
    });

  } catch (error) {
    console.error('워커 상태 조회 실패:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: '워커 상태 조회에 실패했습니다.'
    }, { status: 500 });
  }
}

/**
 * 마지막 워커 실행 시간 조회
 */
async function getLastWorkerRun(): Promise<Date | null> {
  // TODO: Prisma 클라이언트 업데이트 후 활성화
  // 임시로 1시간 전으로 설정 (쿨다운 테스트용)
  return new Date(Date.now() - 30 * 60 * 1000); // 30분 전
  
  // const lastProbe = await prisma.azureCapacityProbe.findFirst({
  //   orderBy: { timestamp: 'desc' },
  //   select: { timestamp: true }
  // });
  // return lastProbe?.timestamp || null;
}

/**
 * 쿨다운 중인지 확인
 */
function isInCooldown(lastRun: Date, cooldownMinutes: number): boolean {
  const cooldownEnds = new Date(lastRun.getTime() + cooldownMinutes * 60 * 1000);
  return new Date() < cooldownEnds;
}

/**
 * 체크 계획 수립
 */
async function createCheckPlan(maxCombinations: number) {
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

  // TODO: Prisma 클라이언트 업데이트 후 활성화
  // 최근 1시간 이내에 체크된 조합 제외 (임시로 빈 배열)
  const recentlyChecked: any[] = [];
  
  // const recentlyChecked = await prisma.azureCapacityProbe.findMany({
  //   where: {
  //     timestamp: {
  //       gte: new Date(Date.now() - 60 * 60 * 1000) // 1시간
  //     }
  //   },
  //   select: {
  //     region: true,
  //     vmSize: true
  //   },
  //   distinct: ['region', 'vmSize']
  // });

  const recentlyCheckedSet = new Set(
    recentlyChecked.map(r => `${r.region}:${r.vmSize}`)
  );

  // 우선순위 기반 필터링
  const pendingCombinations = allCombinations
    .filter(combo => !recentlyCheckedSet.has(`${combo.region}:${combo.vmSize}`))
    .map(combo => ({
      ...combo,
      priority: calculatePriority(combo.region, combo.vmSize)
    }))
    .sort((a, b) => b.priority - a.priority) // 높은 우선순위 먼저
    .slice(0, maxCombinations);

  return {
    totalCombinations: allCombinations.length,
    recentlyChecked: recentlyChecked.length,
    pending: pendingCombinations.length,
    combinations: pendingCombinations,
    estimatedDurationMinutes: Math.ceil(pendingCombinations.length * 0.5) // 조합당 30초 가정
  };
}

/**
 * 조합의 우선순위 계산
 */
function calculatePriority(region: string, vmSize: string): number {
  let priority = 100;
  
  // 인기 리전 우선순위 높임
  if (region === 'koreacentral') priority += 20;
  if (region === 'eastus') priority += 15;
  if (region === 'japaneast') priority += 10;
  
  // 고급 GPU 우선순위 높임
  if (vmSize.includes('A100')) priority += 15;
  if (vmSize.includes('H100')) priority += 20;
  if (vmSize.includes('T4')) priority += 5;
  
  return priority;
}

/**
 * 체크 계획 실행
 */
async function executeCheckPlan(plan: any, startTime: number) {
  const results = {
    planned: plan.combinations.length,
    completed: 0,
    successful: 0,
    failed: 0,
    ignored: 0,
    errors: [] as string[]
  };

  for (const combo of plan.combinations) {
    try {
      // 실행 시간 제한 체크
      const elapsedMinutes = (Date.now() - startTime) / (1000 * 60);
      if (elapsedMinutes > WORKER_CONFIG.maxRunTimeMinutes) {
        console.log(`⏱️ 워커 최대 실행 시간 초과: ${elapsedMinutes}분`);
        break;
      }

      console.log(`🔍 워커 체크: ${combo.region}/${combo.vmSize}`);
      
      const result = await azureCapacityService.checkCapacity(combo.region, combo.vmSize);
      await azureCapacityService.saveProbeResult(result);
      
      results.completed++;
      
      if (result.success === true) results.successful++;
      else if (result.success === false) results.failed++;
      else results.ignored++;
      
      // 조합 간 간격
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } catch (error) {
      console.error(`워커 체크 실패: ${combo.region}/${combo.vmSize}`, error);
      results.errors.push(`${combo.region}/${combo.vmSize}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return results;
}

/**
 * 워커 실행 기록 저장
 */
async function logWorkerRun(results: any) {
  try {
    // TODO: Prisma 클라이언트 업데이트 후 활성화
    console.log('📝 워커 실행 기록 (모킹):', results);
    
    // await prisma.etlLog.create({
    //   data: {
    //     providerCode: 'azure',
    //     jobType: 'capacity_check',
    //     status: results.errors.length > 0 ? 'partial_success' : 'success',
    //     recordsProcessed: results.completed,
    //     errorMessage: results.errors.length > 0 ? 
    //       `${results.errors.length}개 오류: ${results.errors.slice(0, 3).join(', ')}` : 
    //       null,
    //     completedAt: new Date(),
    //     executionTimeMs: Date.now() - Date.now()
    //   }
    // });
  } catch (error) {
    console.error('워커 실행 기록 저장 실패:', error);
  }
}
