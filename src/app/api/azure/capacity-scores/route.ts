// Azure 용량 스코어링 API
import { NextRequest, NextResponse } from 'next/server';
import { azureCapacityScoringEngine } from '@/lib/azure-scoring';
import { z } from 'zod';

// 요청 스키마
const ScoreCalculationSchema = z.object({
  region: z.string().min(1, '리전은 필수입니다'),
  vmSize: z.string().min(1, 'VM 크기는 필수입니다'),
  windowHours: z.number().min(1).max(168).optional(), // 1시간 ~ 1주일
  weights: z.object({
    successRate: z.number().min(0).max(1).optional(),
    provisionSpeed: z.number().min(0).max(1).optional(),
    capacityStability: z.number().min(0).max(1).optional(),
    spotMarketHealth: z.number().min(0).max(1).optional()
  }).optional()
});

const BatchScoreCalculationSchema = z.object({
  combinations: z.array(z.object({
    region: z.string(),
    vmSize: z.string()
  })).min(1).max(20),
  windowHours: z.number().min(1).max(168).optional(),
  weights: z.object({
    successRate: z.number().min(0).max(1).optional(),
    provisionSpeed: z.number().min(0).max(1).optional(),
    capacityStability: z.number().min(0).max(1).optional(),
    spotMarketHealth: z.number().min(0).max(1).optional()
  }).optional()
});

/**
 * POST /api/azure/capacity-scores
 * Azure 용량 스코어 계산 (단일 또는 배치)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // 배치 요청인지 단일 요청인지 판단
    if (body.combinations) {
      return await handleBatchScoreCalculation(body);
    } else {
      return await handleSingleScoreCalculation(body);
    }
  } catch (error) {
    console.error('Azure 용량 스코어 계산 API 오류:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Azure 용량 스코어 계산에 실패했습니다.'
    }, { status: 500 });
  }
}

/**
 * 단일 리전/VM크기 스코어 계산
 */
async function handleSingleScoreCalculation(body: any) {
  const validation = ScoreCalculationSchema.safeParse(body);
  
  if (!validation.success) {
    return NextResponse.json({
      success: false,
      error: '잘못된 요청 형식',
      details: validation.error.errors,
      message: '요청 파라미터를 확인해주세요.'
    }, { status: 400 });
  }

  const { region, vmSize, windowHours = 24, weights } = validation.data;

  try {
    console.log(`📊 용량 스코어 계산 시작: ${region}/${vmSize} (${windowHours}시간)`);
    
    // 용량 스코어 계산
    const scoreResult = await azureCapacityScoringEngine.calculateCapacityScore(
      region, 
      vmSize, 
      windowHours,
      weights
    );
    
    // 스코어 저장
    await azureCapacityScoringEngine.saveCapacityScore(scoreResult);
    
    // 등급별 상세 분석
    const analysis = generateScoreAnalysis(scoreResult);
    
    return NextResponse.json({
      success: true,
      data: {
        score: scoreResult,
        analysis,
        insights: {
          primary: getPrimaryInsight(scoreResult),
          secondary: getSecondaryInsights(scoreResult),
          actionItems: getActionItems(scoreResult)
        },
        message: `용량 스코어 계산 완료: ${scoreResult.score}점 (${scoreResult.label})`
      }
    });

  } catch (error) {
    console.error(`Azure 용량 스코어 계산 실패: ${region}/${vmSize}`, error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: `${region}/${vmSize} 용량 스코어 계산에 실패했습니다.`
    }, { status: 500 });
  }
}

/**
 * 배치 스코어 계산
 */
async function handleBatchScoreCalculation(body: any) {
  const validation = BatchScoreCalculationSchema.safeParse(body);
  
  if (!validation.success) {
    return NextResponse.json({
      success: false,
      error: '잘못된 배치 요청 형식',
      details: validation.error.errors,
      message: '배치 요청 파라미터를 확인해주세요.'
    }, { status: 400 });
  }

  const { combinations, windowHours = 24, weights } = validation.data;

  try {
    console.log(`📊 배치 용량 스코어 계산 시작: ${combinations.length}개 조합`);
    
    const scores: any[] = [];
    
    for (const combo of combinations) {
      try {
        const scoreResult = await azureCapacityScoringEngine.calculateCapacityScore(
          combo.region,
          combo.vmSize,
          windowHours,
          weights
        );
        
        await azureCapacityScoringEngine.saveCapacityScore(scoreResult);
        
        scores.push({
          ...scoreResult,
          analysis: generateScoreAnalysis(scoreResult)
        });
        
        // 배치 간 간격
        await new Promise(resolve => setTimeout(resolve, 1500));
        
      } catch (error) {
        console.error(`배치 스코어 계산 중 오류: ${combo.region}/${combo.vmSize}`, error);
        
        scores.push({
          region: combo.region,
          vmSize: combo.vmSize,
          error: error instanceof Error ? error.message : 'Unknown error',
          calculatedAt: new Date()
        });
      }
    }

    // 성공한 스코어들만 필터링
    const validScores = scores.filter(s => !s.error);
    
    // 배치 통계 생성
    const batchStats = generateBatchStatistics(validScores);
    
    // 최고/최저 점수 조합
    const rankings = generateRankings(validScores);

    return NextResponse.json({
      success: true,
      data: {
        scores,
        statistics: batchStats,
        rankings,
        summary: {
          total: scores.length,
          successful: validScores.length,
          failed: scores.length - validScores.length,
          avgScore: batchStats.avgScore,
          windowHours
        },
        message: `배치 스코어 계산 완료 (${validScores.length}/${scores.length})`
      }
    });

  } catch (error) {
    console.error('Azure 배치 스코어 계산 실패:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: '배치 스코어 계산에 실패했습니다.'
    }, { status: 500 });
  }
}

/**
 * GET /api/azure/capacity-scores
 * 저장된 용량 스코어 조회
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const region = searchParams.get('region');
    const vmSize = searchParams.get('vmSize');
    const minScore = parseInt(searchParams.get('minScore') || '0');
    const label = searchParams.get('label'); // AVAILABLE, LIMITED, UNAVAILABLE
    const limit = parseInt(searchParams.get('limit') || '50');

    // TODO: 실제 DB 쿼리로 교체
    // 현재는 모킹 데이터 반환
    console.log(`📊 용량 스코어 조회: region=${region}, vmSize=${vmSize}, minScore=${minScore}`);
    
    const mockScores = generateMockScores(region, vmSize, minScore, label, limit);
    
    return NextResponse.json({
      success: true,
      data: {
        scores: mockScores,
        filters: {
          region: region || null,
          vmSize: vmSize || null,
          minScore,
          label: label || null,
          limit
        },
        summary: {
          total: mockScores.length,
          byLabel: {
            AVAILABLE: mockScores.filter(s => s.label === 'AVAILABLE').length,
            LIMITED: mockScores.filter(s => s.label === 'LIMITED').length,
            UNAVAILABLE: mockScores.filter(s => s.label === 'UNAVAILABLE').length
          },
          avgScore: mockScores.reduce((sum, s) => sum + s.score, 0) / mockScores.length || 0
        },
        message: '저장된 용량 스코어 조회 완료'
      }
    });

  } catch (error) {
    console.error('Azure 용량 스코어 조회 실패:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: '용량 스코어 조회에 실패했습니다.'
    }, { status: 500 });
  }
}

/**
 * 스코어 분석 생성
 */
function generateScoreAnalysis(scoreResult: any) {
  const { score, successRate, avgProvisionMs, capacityErrorRate, spotStress, confidence } = scoreResult;
  
  return {
    scoreBreakdown: {
      successRate: `${(successRate * 100).toFixed(1)}%`,
      provisionSpeed: `${(avgProvisionMs / 1000).toFixed(1)}초`,
      errorRate: `${(capacityErrorRate * 100).toFixed(1)}%`,
      spotStress: `${(spotStress * 100).toFixed(1)}%`
    },
    strengths: getStrengths(scoreResult),
    weaknesses: getWeaknesses(scoreResult),
    reliability: {
      confidence: `${(confidence * 100).toFixed(1)}%`,
      dataQuality: confidence > 0.7 ? 'high' : confidence > 0.4 ? 'medium' : 'low'
    }
  };
}

/**
 * 강점 분석
 */
function getStrengths(scoreResult: any): string[] {
  const strengths = [];
  
  if (scoreResult.successRate > 0.8) {
    strengths.push('높은 성공률');
  }
  if (scoreResult.avgProvisionMs < 4000) {
    strengths.push('빠른 프로비저닝');
  }
  if (scoreResult.capacityErrorRate < 0.1) {
    strengths.push('안정적인 용량');
  }
  if (scoreResult.spotStress < 0.3) {
    strengths.push('안정적인 Spot 시장');
  }
  
  return strengths;
}

/**
 * 약점 분석
 */
function getWeaknesses(scoreResult: any): string[] {
  const weaknesses = [];
  
  if (scoreResult.successRate < 0.5) {
    weaknesses.push('낮은 성공률');
  }
  if (scoreResult.avgProvisionMs > 7000) {
    weaknesses.push('느린 프로비저닝');
  }
  if (scoreResult.capacityErrorRate > 0.3) {
    weaknesses.push('불안정한 용량');
  }
  if (scoreResult.spotStress > 0.7) {
    weaknesses.push('혼잡한 Spot 시장');
  }
  
  return weaknesses;
}

/**
 * 주요 인사이트
 */
function getPrimaryInsight(scoreResult: any): string {
  if (scoreResult.score >= 80) {
    return '🟢 최적의 상태입니다. 지금 바로 사용하세요!';
  } else if (scoreResult.score >= 60) {
    return '🟡 사용 가능하지만 약간의 지연이 예상됩니다.';
  } else if (scoreResult.score >= 40) {
    return '🟠 제한적으로 사용 가능. 대안을 고려해보세요.';
  } else {
    return '🔴 현재 사용하기 어려운 상태입니다.';
  }
}

/**
 * 보조 인사이트
 */
function getSecondaryInsights(scoreResult: any): string[] {
  const insights = [];
  
  if (scoreResult.confidence < 0.5) {
    insights.push('⚠️ 데이터가 부족하여 신뢰도가 낮습니다');
  }
  if (scoreResult.spotStress > 0.6) {
    insights.push('📈 Spot 시장이 혼잡합니다');
  }
  if (scoreResult.avgProvisionMs > 6000) {
    insights.push('⏱️ 프로비저닝에 시간이 오래 걸릴 수 있습니다');
  }
  
  return insights;
}

/**
 * 액션 아이템
 */
function getActionItems(scoreResult: any): string[] {
  const actions = [];
  
  if (scoreResult.score < 60) {
    actions.push('다른 리전이나 VM 크기를 고려해보세요');
  }
  if (scoreResult.confidence < 0.5) {
    actions.push('더 많은 데이터 수집을 위해 잠시 기다려보세요');
  }
  if (scoreResult.spotStress > 0.7) {
    actions.push('온디맨드 인스턴스를 고려해보세요');
  }
  
  return actions;
}

/**
 * 배치 통계 생성
 */
function generateBatchStatistics(scores: any[]) {
  if (scores.length === 0) {
    return { avgScore: 0, byLabel: {}, topRegions: [], topVmSizes: [] };
  }
  
  const avgScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
  
  const byLabel = {
    AVAILABLE: scores.filter(s => s.label === 'AVAILABLE').length,
    LIMITED: scores.filter(s => s.label === 'LIMITED').length,
    UNAVAILABLE: scores.filter(s => s.label === 'UNAVAILABLE').length
  };
  
  // 리전별 평균 점수
  const regionScores = new Map();
  scores.forEach(s => {
    if (!regionScores.has(s.region)) {
      regionScores.set(s.region, []);
    }
    regionScores.get(s.region).push(s.score);
  });
  
  const topRegions = Array.from(regionScores.entries())
    .map(([region, scoreList]) => ({
      region,
      avgScore: scoreList.reduce((a: number, b: number) => a + b, 0) / scoreList.length
    }))
    .sort((a, b) => b.avgScore - a.avgScore);
  
  return { avgScore, byLabel, topRegions };
}

/**
 * 랭킹 생성
 */
function generateRankings(scores: any[]) {
  return {
    best: scores.sort((a, b) => b.score - a.score).slice(0, 3),
    worst: scores.sort((a, b) => a.score - b.score).slice(0, 3)
  };
}

/**
 * 모킹 스코어 생성
 */
function generateMockScores(region?: string | null, vmSize?: string | null, minScore = 0, label?: string | null, limit = 50) {
  // 실제 instances API에서 사용되는 Azure 리전들
  const regions = [
    'australiacentral2',
    'westus3', 
    'eastus2',
    'mexicocentral',
    'koreacentral',
    'eastus',
    'japaneast',
    'westeurope',
    'northeurope',
    'southcentralus'
  ];
  
  // 실제 instances API에서 사용되는 Azure VM 크기들
  const vmSizes = [
    'Standard_NC16asT4',
    'Standard_NV16as_v4',
    'Standard_NV32as_v4',
    'Standard_NC4as_T4_v3',
    'Standard_NC8as_T4_v3',
    'Standard_NC24ads_A100_v4',
    'Standard_NC48ads_A100_v4',
    'Standard_ND96asr_v4'
  ];
  
  const mockScores = [];
  
  for (const r of (region ? [region] : regions)) {
    for (const vm of (vmSize ? [vmSize] : vmSizes)) {
      // VM 크기별 기본 점수 (더 현실적으로 조정)
      let baseScore = 60;
      
      // GPU 모델별 점수 조정
      if (vm.includes('A100')) baseScore = 45;
      else if (vm.includes('V100')) baseScore = 40;
      else if (vm.includes('T4') || vm.includes('asT4')) baseScore = 70;
      else if (vm.includes('NV') && vm.includes('v4')) baseScore = 65;
      else if (vm.includes('ND')) baseScore = 35; // 고성능 GPU
      
      // 리전별 조정 (한국 리전은 상대적으로 낮음)
      if (r === 'koreacentral') baseScore -= 15;
      else if (r === 'eastus' || r === 'eastus2') baseScore += 5;
      else if (r === 'westus3') baseScore += 3;
      else if (r.includes('australia') || r.includes('mexico')) baseScore -= 8;
      
      // VM 크기별 조정 (큰 인스턴스일수록 용량 부족)
      if (vm.includes('48') || vm.includes('64') || vm.includes('96')) baseScore -= 10;
      else if (vm.includes('32')) baseScore -= 5;
      else if (vm.includes('16')) baseScore -= 2;
      
      // 랜덤 변동 (현실적인 범위)
      const randomVariation = (Math.random() - 0.5) * 25;
      const finalScore = Math.max(10, Math.min(95, baseScore + randomVariation));
      
      if (finalScore >= minScore) {
        const scoreLabel = finalScore >= 75 ? 'AVAILABLE' : finalScore >= 40 ? 'LIMITED' : 'UNAVAILABLE';
        
        if (!label || label === scoreLabel) {
          mockScores.push({
            region: r,
            vmSize: vm,
            score: Math.round(finalScore),
            label: scoreLabel,
            confidence: Math.max(0.5, Math.min(0.95, 0.6 + Math.random() * 0.3)),
            calculatedAt: new Date(Date.now() - Math.random() * 4 * 60 * 60 * 1000) // 최근 4시간 내
          });
        }
      }
    }
  }
  
  return mockScores.slice(0, limit);
}
