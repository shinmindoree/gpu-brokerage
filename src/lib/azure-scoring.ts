// Azure 용량 스코어링 엔진
import { azureCapacityService } from './azure-capacity';
import { azureSpotService } from './azure-spot';
import { prisma } from './prisma';

export interface CapacityScoreInput {
  region: string;
  vmSize: string;
  windowHours: number; // 집계 기간 (시간)
}

export interface CapacityScoreResult {
  region: string;
  vmSize: string;
  score: number; // 0-100 점수
  label: 'AVAILABLE' | 'LIMITED' | 'UNAVAILABLE';
  confidence: number; // 0-1 신뢰도
  
  // 세부 지표들
  successRate: number; // 용량 성공률 (0-1)
  avgProvisionMs: number; // 평균 프로비저닝 시간 (ms)
  capacityErrorRate: number; // 용량 에러 비율 (0-1)
  spotStress: number; // Spot 시장 스트레스 (0-1)
  
  // 신뢰도 관련
  sampleCount: number; // 표본 수
  dataFreshness: number; // 데이터 신선도 (0-1)
  
  // 집계 정보
  windowStart: Date;
  windowEnd: Date;
  calculatedAt: Date;
  
  // 추가 인사이트
  recommendation?: string;
  alternatives?: string[];
}

export interface ScoringWeights {
  successRate: number; // 성공률 가중치
  provisionSpeed: number; // 프로비저닝 속도 가중치
  capacityStability: number; // 용량 안정성 가중치
  spotMarketHealth: number; // Spot 시장 건강도 가중치
}

export class AzureCapacityScoringEngine {
  private defaultWeights: ScoringWeights = {
    successRate: 0.40,      // 40% - 가장 중요
    provisionSpeed: 0.25,   // 25% - 성능 지표
    capacityStability: 0.20, // 20% - 안정성
    spotMarketHealth: 0.15  // 15% - 시장 상황
  };

  private scoreThresholds = {
    available: 75,   // 75점 이상 = Available
    limited: 40      // 40점 이상 = Limited, 미만 = Unavailable
  };

  /**
   * 단일 리전/VM크기의 용량 스코어 계산
   */
  async calculateCapacityScore(
    region: string, 
    vmSize: string, 
    windowHours: number = 24,
    customWeights?: Partial<ScoringWeights>
  ): Promise<CapacityScoreResult> {
    
    const weights = { ...this.defaultWeights, ...customWeights };
    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - windowHours * 60 * 60 * 1000);

    console.log(`📊 용량 스코어 계산: ${region}/${vmSize} (${windowHours}시간 윈도우)`);

    try {
      // 1. 용량 체크 데이터 수집
      const capacityData = await this.getCapacityMetrics(region, vmSize, windowStart, windowEnd);
      
      // 2. Spot 신호 데이터 수집
      const spotData = await this.getSpotMetrics(region, vmSize, windowStart, windowEnd);
      
      // 3. 각 지표별 점수 계산
      const successScore = this.calculateSuccessScore(capacityData);
      const speedScore = this.calculateSpeedScore(capacityData);
      const stabilityScore = this.calculateStabilityScore(capacityData);
      const spotScore = this.calculateSpotScore(spotData);
      
      // 4. 가중 평균으로 최종 점수 계산
      const totalScore = (
        successScore * weights.successRate +
        speedScore * weights.provisionSpeed +
        stabilityScore * weights.capacityStability +
        spotScore * weights.spotMarketHealth
      );

      // 5. 신뢰도 계산
      const confidence = this.calculateConfidence(capacityData, spotData, windowHours);

      // 6. 등급 분류
      const label = this.classifyScore(totalScore);

      // 7. 추천사항 생성
      const recommendation = this.generateRecommendation(totalScore, capacityData, spotData);
      const alternatives = await this.suggestAlternatives(region, vmSize, totalScore);

      return {
        region,
        vmSize,
        score: Math.round(totalScore),
        label,
        confidence,
        successRate: capacityData.successRate,
        avgProvisionMs: capacityData.avgProvisionMs,
        capacityErrorRate: capacityData.errorRate,
        spotStress: spotData.avgStress,
        sampleCount: capacityData.totalProbes + spotData.totalSignals,
        dataFreshness: this.calculateDataFreshness(capacityData, spotData),
        windowStart,
        windowEnd,
        calculatedAt: new Date(),
        recommendation,
        alternatives
      };

    } catch (error) {
      console.error(`용량 스코어 계산 실패: ${region}/${vmSize}`, error);
      
      // 오류 시 기본 스코어 반환
      return this.getDefaultScore(region, vmSize, windowStart, windowEnd);
    }
  }

  /**
   * 용량 체크 메트릭 수집
   */
  private async getCapacityMetrics(region: string, vmSize: string, start: Date, end: Date) {
    // TODO: 실제 DB 쿼리로 교체
    // 현재는 모킹 데이터 반환
    
    const mockData = {
      totalProbes: 24,
      successfulProbes: 18,
      failedProbes: 6,
      successRate: 18 / 24, // 75%
      avgProvisionMs: 4500,
      errorRate: 6 / 24, // 25%
      provisionTimes: [3200, 4100, 5200, 3800, 4700, 3900], // 성공한 케이스들
      lastProbeTime: new Date(Date.now() - 30 * 60 * 1000) // 30분 전
    };

    // VM 크기별 차등 적용
    if (vmSize.includes('H100')) {
      mockData.successRate = 0.3; // H100은 성공률 낮음
      mockData.avgProvisionMs = 8000;
    } else if (vmSize.includes('A100')) {
      mockData.successRate = 0.6; // A100은 중간
      mockData.avgProvisionMs = 6000;
    }

    // 리전별 차등 적용
    if (region === 'koreacentral') {
      mockData.successRate *= 0.8; // 한국은 조금 더 어려움
    }

    return mockData;
  }

  /**
   * Spot 신호 메트릭 수집
   */
  private async getSpotMetrics(region: string, vmSize: string, start: Date, end: Date) {
    // TODO: 실제 DB 쿼리로 교체
    // 현재는 모킹 데이터 반환
    
    const mockData = {
      totalSignals: 12,
      avgPriceRatio: 0.65, // 35% 할인
      avgVolatility: 0.2,
      avgEvictionRate: 0.15,
      avgStress: 0.4,
      lastSignalTime: new Date(Date.now() - 15 * 60 * 1000) // 15분 전
    };

    // VM 크기별 차등 적용
    if (vmSize.includes('H100')) {
      mockData.avgStress = 0.8; // H100은 시장 스트레스 높음
      mockData.avgPriceRatio = 0.9; // 할인 적음
    } else if (vmSize.includes('A100')) {
      mockData.avgStress = 0.6; // A100은 중간
      mockData.avgPriceRatio = 0.7;
    }

    return mockData;
  }

  /**
   * 성공률 점수 계산 (0-100)
   */
  private calculateSuccessScore(capacityData: any): number {
    return capacityData.successRate * 100;
  }

  /**
   * 속도 점수 계산 (0-100)
   */
  private calculateSpeedScore(capacityData: any): number {
    // 프로비저닝 시간이 짧을수록 높은 점수
    // 3초 = 100점, 10초 = 0점으로 선형 스케일링
    const maxMs = 10000; // 10초
    const minMs = 3000;   // 3초
    
    const normalizedTime = Math.max(0, Math.min(1, 
      (maxMs - capacityData.avgProvisionMs) / (maxMs - minMs)
    ));
    
    return normalizedTime * 100;
  }

  /**
   * 안정성 점수 계산 (0-100)
   */
  private calculateStabilityScore(capacityData: any): number {
    // 에러율이 낮을수록 높은 점수
    return (1 - capacityData.errorRate) * 100;
  }

  /**
   * Spot 시장 점수 계산 (0-100)
   */
  private calculateSpotScore(spotData: any): number {
    // 시장 스트레스가 낮을수록 높은 점수
    return (1 - spotData.avgStress) * 100;
  }

  /**
   * 신뢰도 계산 (0-1)
   */
  private calculateConfidence(capacityData: any, spotData: any, windowHours: number): number {
    // 표본 수 기반 신뢰도
    const totalSamples = capacityData.totalProbes + spotData.totalSignals;
    const expectedSamples = windowHours * 2; // 시간당 2개 샘플 예상
    const sampleScore = Math.min(1, totalSamples / expectedSamples);
    
    // 데이터 신선도 기반 신뢰도
    const maxAgeHours = 2; // 2시간 이내가 신선
    const capacityAge = (Date.now() - capacityData.lastProbeTime.getTime()) / (1000 * 60 * 60);
    const spotAge = (Date.now() - spotData.lastSignalTime.getTime()) / (1000 * 60 * 60);
    const avgAge = (capacityAge + spotAge) / 2;
    const freshnessScore = Math.max(0, 1 - avgAge / maxAgeHours);
    
    // 가중 평균
    return (sampleScore * 0.6 + freshnessScore * 0.4);
  }

  /**
   * 데이터 신선도 계산 (0-1)
   */
  private calculateDataFreshness(capacityData: any, spotData: any): number {
    const maxAgeMinutes = 60; // 1시간 이내가 신선
    const capacityAge = (Date.now() - capacityData.lastProbeTime.getTime()) / (1000 * 60);
    const spotAge = (Date.now() - spotData.lastSignalTime.getTime()) / (1000 * 60);
    const avgAge = (capacityAge + spotAge) / 2;
    
    return Math.max(0, 1 - avgAge / maxAgeMinutes);
  }

  /**
   * 점수 기반 등급 분류
   */
  private classifyScore(score: number): 'AVAILABLE' | 'LIMITED' | 'UNAVAILABLE' {
    if (score >= this.scoreThresholds.available) {
      return 'AVAILABLE';
    } else if (score >= this.scoreThresholds.limited) {
      return 'LIMITED';
    } else {
      return 'UNAVAILABLE';
    }
  }

  /**
   * 추천사항 생성
   */
  private generateRecommendation(score: number, capacityData: any, spotData: any): string {
    if (score >= 80) {
      return '✅ 지금 바로 사용하기 좋은 상태입니다!';
    } else if (score >= 60) {
      return '⚡ 사용 가능하지만 약간의 지연이 있을 수 있습니다.';
    } else if (score >= 40) {
      return '⚠️ 제한적으로 사용 가능. 대체 옵션을 고려해보세요.';
    } else {
      return '🚫 현재 사용하기 어려운 상태입니다. 다른 리전이나 VM을 추천합니다.';
    }
  }

  /**
   * 대체 옵션 제안
   */
  private async suggestAlternatives(region: string, vmSize: string, currentScore: number): Promise<string[]> {
    const alternatives: string[] = [];

    // 현재 점수가 낮으면 대체안 제안
    if (currentScore < 60) {
      // 같은 GPU, 다른 리전
      const otherRegions = ['eastus', 'japaneast', 'westeurope'].filter(r => r !== region);
      alternatives.push(`다른 리전: ${otherRegions[0]} (같은 GPU)`);
      
      // 같은 리전, 다른 GPU
      if (vmSize.includes('A100')) {
        alternatives.push('더 작은 GPU: T4 (같은 리전)');
      } else if (vmSize.includes('T4')) {
        alternatives.push('더 큰 GPU: A100 (같은 리전)');
      }
      
      // Spot 대신 온디맨드 고려
      alternatives.push('온디맨드 인스턴스 고려');
    }

    return alternatives;
  }

  /**
   * 기본 스코어 반환 (오류 시)
   */
  private getDefaultScore(region: string, vmSize: string, start: Date, end: Date): CapacityScoreResult {
    return {
      region,
      vmSize,
      score: 50,
      label: 'LIMITED',
      confidence: 0.3,
      successRate: 0.5,
      avgProvisionMs: 5000,
      capacityErrorRate: 0.5,
      spotStress: 0.5,
      sampleCount: 0,
      dataFreshness: 0,
      windowStart: start,
      windowEnd: end,
      calculatedAt: new Date(),
      recommendation: '⚠️ 데이터 부족으로 정확한 평가가 어렵습니다.',
      alternatives: ['다른 리전이나 VM 크기를 시도해보세요.']
    };
  }

  /**
   * 배치 스코어 계산
   */
  async calculateBatchScores(
    combinations: { region: string; vmSize: string }[],
    windowHours: number = 24
  ): Promise<CapacityScoreResult[]> {
    const results: CapacityScoreResult[] = [];

    for (const combo of combinations) {
      try {
        const score = await this.calculateCapacityScore(combo.region, combo.vmSize, windowHours);
        results.push(score);
        
        // 배치 처리 간격
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`배치 스코어 계산 실패: ${combo.region}/${combo.vmSize}`, error);
      }
    }

    return results.sort((a, b) => b.score - a.score); // 높은 점수 순 정렬
  }

  /**
   * 스코어 저장
   */
  async saveCapacityScore(scoreResult: CapacityScoreResult): Promise<void> {
    try {
      // TODO: Prisma 클라이언트 업데이트 후 활성화
      console.log(`💾 용량 스코어 저장 (모킹): ${scoreResult.region}/${scoreResult.vmSize} - ${scoreResult.score}점 (${scoreResult.label})`);
      
      // await prisma.azureCapacityScore.upsert({
      //   where: {
      //     region_vmSize: {
      //       region: scoreResult.region,
      //       vmSize: scoreResult.vmSize
      //     }
      //   },
      //   update: {
      //     score: scoreResult.score,
      //     label: scoreResult.label,
      //     confidence: scoreResult.confidence,
      //     successRate: scoreResult.successRate,
      //     avgProvisionMs: scoreResult.avgProvisionMs,
      //     capacityErrorRate: scoreResult.capacityErrorRate,
      //     spotStress: scoreResult.spotStress,
      //     sampleCount: scoreResult.sampleCount,
      //     calculatedAt: scoreResult.calculatedAt,
      //     windowStart: scoreResult.windowStart,
      //     windowEnd: scoreResult.windowEnd
      //   },
      //   create: {
      //     region: scoreResult.region,
      //     vmSize: scoreResult.vmSize,
      //     score: scoreResult.score,
      //     label: scoreResult.label,
      //     confidence: scoreResult.confidence,
      //     successRate: scoreResult.successRate,
      //     avgProvisionMs: scoreResult.avgProvisionMs,
      //     capacityErrorRate: scoreResult.capacityErrorRate,
      //     spotStress: scoreResult.spotStress,
      //     sampleCount: scoreResult.sampleCount,
      //     calculatedAt: scoreResult.calculatedAt,
      //     windowStart: scoreResult.windowStart,
      //     windowEnd: scoreResult.windowEnd
      //   }
      // });
    } catch (error) {
      console.error('용량 스코어 저장 실패:', error);
    }
  }
}

// 기본 인스턴스 내보내기
export const azureCapacityScoringEngine = new AzureCapacityScoringEngine();
