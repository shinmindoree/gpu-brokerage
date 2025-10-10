// Azure 용량 체크 API
import { NextRequest, NextResponse } from 'next/server';
import { azureCapacityService } from '@/lib/azure-capacity';
import { z } from 'zod';

// 요청 스키마
const CapacityCheckSchema = z.object({
  region: z.string().min(1, '리전은 필수입니다'),
  vmSize: z.string().min(1, 'VM 크기는 필수입니다'),
  force: z.boolean().optional() // 강제 실행 (캐시 무시)
});

const BatchCapacityCheckSchema = z.object({
  regions: z.array(z.string()).min(1, '최소 1개 리전이 필요합니다'),
  vmSizes: z.array(z.string()).min(1, '최소 1개 VM크기가 필요합니다'),
  force: z.boolean().optional()
});

/**
 * POST /api/azure/capacity-check
 * Azure 용량 확인 (단일 또는 배치)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // 배치 요청인지 단일 요청인지 판단
    if (body.regions && body.vmSizes) {
      return await handleBatchCapacityCheck(body);
    } else {
      return await handleSingleCapacityCheck(body);
    }
  } catch (error) {
    console.error('Azure 용량 체크 API 오류:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Azure 용량 체크에 실패했습니다.'
    }, { status: 500 });
  }
}

/**
 * 단일 리전/VM크기 용량 체크
 */
async function handleSingleCapacityCheck(body: any) {
  const validation = CapacityCheckSchema.safeParse(body);
  
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
    // 최근 결과 확인 (캐시)
    if (!force) {
      const recentResults = await azureCapacityService.getRecentProbeResults(
        region, 
        vmSize, 
        1 // 1시간 이내
      );
      
      if (recentResults.length > 0) {
        const latest = recentResults[0];
        return NextResponse.json({
          success: true,
          data: {
            region,
            vmSize,
            result: {
              success: latest.success,
              errorCode: latest.errorCode,
              errorClass: latest.errorClass,
              provisionMs: latest.provisionMs,
              timestamp: latest.timestamp,
              cached: true
            },
            message: '캐시된 결과입니다 (1시간 이내)'
          }
        });
      }
    }

    console.log(`🔍 Azure 용량 체크 시작: ${region}/${vmSize}`);
    
    // 실제 용량 체크 수행
    const result = await azureCapacityService.checkCapacity(region, vmSize);
    
    // 결과 저장
    await azureCapacityService.saveProbeResult(result);
    
    return NextResponse.json({
      success: true,
      data: {
        region,
        vmSize,
        result: {
          success: result.success,
          errorCode: result.errorCode,
          errorClass: result.errorClass,
          provisionMs: result.provisionMs,
          timestamp: result.timestamp,
          cached: false
        },
        message: '용량 체크가 완료되었습니다.'
      }
    });

  } catch (error) {
    console.error(`Azure 단일 용량 체크 실패: ${region}/${vmSize}`, error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: `${region}/${vmSize} 용량 체크에 실패했습니다.`
    }, { status: 500 });
  }
}

/**
 * 배치 용량 체크
 */
async function handleBatchCapacityCheck(body: any) {
  const validation = BatchCapacityCheckSchema.safeParse(body);
  
  if (!validation.success) {
    return NextResponse.json({
      success: false,
      error: '잘못된 배치 요청 형식',
      details: validation.error.errors,
      message: '배치 요청 파라미터를 확인해주세요.'
    }, { status: 400 });
  }

  const { regions, vmSizes, force } = validation.data;
  
  // 총 조합 수 제한 (API 남용 방지)
  const totalCombinations = regions.length * vmSizes.length;
  if (totalCombinations > 20) {
    return NextResponse.json({
      success: false,
      error: '배치 요청 크기 초과',
      message: `한 번에 최대 20개 조합까지 가능합니다. (현재: ${totalCombinations}개)`
    }, { status: 400 });
  }

  try {
    console.log(`🔍 Azure 배치 용량 체크 시작: ${totalCombinations}개 조합`);
    
    const results: any[] = [];
    
    for (const region of regions) {
      for (const vmSize of vmSizes) {
        try {
          // 캐시 확인
          let result;
          if (!force) {
            const recentResults = await azureCapacityService.getRecentProbeResults(
              region, 
              vmSize, 
              1 // 1시간 이내
            );
            
            if (recentResults.length > 0) {
              const latest = recentResults[0];
              result = {
                region,
                vmSize,
                success: latest.success,
                errorCode: latest.errorCode,
                errorClass: latest.errorClass,
                provisionMs: latest.provisionMs,
                timestamp: latest.timestamp,
                cached: true
              };
            }
          }

          // 캐시에 없으면 실제 체크
          if (!result) {
            const probeResult = await azureCapacityService.checkCapacity(region, vmSize);
            await azureCapacityService.saveProbeResult(probeResult);
            
            result = {
              region,
              vmSize,
              success: probeResult.success,
              errorCode: probeResult.errorCode,
              errorClass: probeResult.errorClass,
              provisionMs: probeResult.provisionMs,
              timestamp: probeResult.timestamp,
              cached: false
            };
          }
          
          results.push(result);
          
          // 배치 간 간격 (레이트 리밋 고려)
          if (!result.cached) {
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
          
        } catch (error) {
          console.error(`배치 체크 중 오류: ${region}/${vmSize}`, error);
          
          results.push({
            region,
            vmSize,
            success: null,
            errorCode: 'BatchCheckError',
            errorClass: 'ignored',
            timestamp: new Date(),
            cached: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }

    // 성공/실패 통계
    const stats = {
      total: results.length,
      available: results.filter(r => r.success === true).length,
      unavailable: results.filter(r => r.success === false).length,
      ignored: results.filter(r => r.success === null).length,
      cached: results.filter(r => r.cached).length
    };

    return NextResponse.json({
      success: true,
      data: {
        results,
        stats,
        message: `배치 용량 체크 완료 (${stats.total}개 조합)`
      }
    });

  } catch (error) {
    console.error('Azure 배치 용량 체크 실패:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: '배치 용량 체크에 실패했습니다.'
    }, { status: 500 });
  }
}

/**
 * GET /api/azure/capacity-check
 * 최근 용량 체크 결과 조회
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const region = searchParams.get('region');
    const vmSize = searchParams.get('vmSize');
    const hours = parseInt(searchParams.get('hours') || '24');

    if (hours > 168) { // 1주일 제한
      return NextResponse.json({
        success: false,
        error: '조회 기간은 최대 168시간(1주일)까지 가능합니다.',
      }, { status: 400 });
    }

    const results = await azureCapacityService.getRecentProbeResults(
      region || undefined,
      vmSize || undefined,
      hours
    );

    // 기본 통계 생성
    const stats = {
      total: results.length,
      available: results.filter(r => r.success === true).length,
      unavailable: results.filter(r => r.success === false).length,
      ignored: results.filter(r => r.success === null).length,
      uniqueRegions: new Set(results.map(r => r.region)).size,
      uniqueVmSizes: new Set(results.map(r => r.vmSize)).size
    };

    return NextResponse.json({
      success: true,
      data: {
        results,
        stats,
        filters: {
          region: region || null,
          vmSize: vmSize || null,
          hours
        },
        message: `최근 ${hours}시간 용량 체크 결과`
      }
    });

  } catch (error) {
    console.error('Azure 용량 체크 결과 조회 실패:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: '용량 체크 결과 조회에 실패했습니다.'
    }, { status: 500 });
  }
}


