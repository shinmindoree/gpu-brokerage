// Azure GPU VM 추천 API
import { NextRequest, NextResponse } from 'next/server';
import { azureRecommendationEngine } from '@/lib/azure-recommendations';
import { z } from 'zod';

// 요청 스키마
const RecommendationRequestSchema = z.object({
  originalRegion: z.string().min(1, '원본 리전은 필수입니다'),
  originalVMSize: z.string().min(1, '원본 VM 크기는 필수입니다'),
  maxAlternatives: z.number().min(1).max(20).optional(),
  includeHigherTier: z.boolean().optional(),
  includeLowerTier: z.boolean().optional(),
  maxPriceIncrease: z.number().min(1).max(5).optional(),
  minAvailabilityScore: z.number().min(0).max(100).optional()
});

/**
 * POST /api/azure/recommendations
 * Azure GPU VM 추천 생성
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = RecommendationRequestSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json({
        success: false,
        error: '잘못된 요청 형식',
        details: validation.error.errors,
        message: '요청 파라미터를 확인해주세요.'
      }, { status: 400 });
    }

    const recommendationRequest = validation.data;
    
    console.log(`🎯 추천 요청: ${recommendationRequest.originalRegion}/${recommendationRequest.originalVMSize}`);

    // Azure capacity scores 가져오기
    const scoresResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/azure/capacity-scores?limit=200`);
    let capacityScores = [];
    
    if (scoresResponse.ok) {
      const scoresData = await scoresResponse.json();
      capacityScores = scoresData.success ? scoresData.data.scores : [];
    }

    // 인스턴스 가격 데이터 가져오기 (옵션)
    let instancePrices = [];
    try {
      const pricesResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/instances?provider=AZURE&limit=200`);
      if (pricesResponse.ok) {
        const pricesData = await pricesResponse.json();
        instancePrices = pricesData.instances || [];
      }
    } catch (error) {
      console.warn('Failed to fetch instance prices for recommendations:', error);
    }

    // 추천 생성
    const recommendations = await azureRecommendationEngine.generateRecommendations(
      recommendationRequest,
      capacityScores,
      instancePrices
    );

    console.log(`✅ 추천 완료: ${recommendations.summary.totalAlternatives}개 대안 발견 (${recommendations.summary.recommendationStrength})`);

    return NextResponse.json({
      success: true,
      data: recommendations,
      message: `${recommendations.summary.totalAlternatives}개의 대안을 찾았습니다`
    });

  } catch (error) {
    console.error('Azure 추천 API 오류:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'GPU VM 추천 생성에 실패했습니다.'
    }, { status: 500 });
  }
}

/**
 * GET /api/azure/recommendations
 * 빠른 추천 (쿼리 파라미터 기반)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const originalRegion = searchParams.get('region');
    const originalVMSize = searchParams.get('vmSize');
    
    if (!originalRegion || !originalVMSize) {
      return NextResponse.json({
        success: false,
        error: '필수 파라미터 누락',
        message: 'region과 vmSize 파라미터가 필요합니다.'
      }, { status: 400 });
    }

    // 기본 설정으로 추천 요청 생성
    const recommendationRequest = {
      originalRegion,
      originalVMSize,
      maxAlternatives: parseInt(searchParams.get('maxAlternatives') || '5'),
      includeHigherTier: searchParams.get('includeHigherTier') === 'true',
      includeLowerTier: searchParams.get('includeLowerTier') === 'true',
      maxPriceIncrease: parseFloat(searchParams.get('maxPriceIncrease') || '2.0'),
      minAvailabilityScore: parseInt(searchParams.get('minAvailabilityScore') || '40')
    };

    console.log(`🎯 빠른 추천 요청: ${originalRegion}/${originalVMSize}`);

    // Azure capacity scores 가져오기
    const scoresResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/azure/capacity-scores?limit=200`);
    let capacityScores = [];
    
    if (scoresResponse.ok) {
      const scoresData = await scoresResponse.json();
      capacityScores = scoresData.success ? scoresData.data.scores : [];
    }

    // 인스턴스 가격 데이터 가져오기 (옵션)
    let instancePrices = [];
    try {
      const pricesResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/instances?provider=AZURE&limit=200`);
      if (pricesResponse.ok) {
        const pricesData = await pricesResponse.json();
        instancePrices = pricesData.instances || [];
      }
    } catch (error) {
      console.warn('Failed to fetch instance prices for recommendations:', error);
    }

    // 추천 생성
    const recommendations = await azureRecommendationEngine.generateRecommendations(
      recommendationRequest,
      capacityScores,
      instancePrices
    );

    console.log(`✅ 빠른 추천 완료: ${recommendations.summary.totalAlternatives}개 대안`);

    return NextResponse.json({
      success: true,
      data: recommendations,
      message: `${recommendations.summary.totalAlternatives}개의 대안을 찾았습니다`
    });

  } catch (error) {
    console.error('Azure 빠른 추천 API 오류:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'GPU VM 추천 생성에 실패했습니다.'
    }, { status: 500 });
  }
}


