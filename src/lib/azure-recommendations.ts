// Azure GPU VM 추천 엔진
interface VMSpec {
  vmSize: string;
  gpuModel: string;
  gpuCount: number;
  gpuMemoryGB: number;
  vcpu: number;
  ramGB: number;
  pricePerHour?: number;
  pricePerGpu?: number;
}

interface CapacityScore {
  region: string;
  vmSize: string;
  score: number;
  label: 'AVAILABLE' | 'LIMITED' | 'UNAVAILABLE';
  confidence: number;
}

interface RegionRecommendation {
  region: string;
  displayName: string;
  vmSize: string;
  score: number;
  label: string;
  confidence: number;
  pricePerHour?: number;
  pricePerGpu?: number;
  distance: number; // 원래 리전으로부터의 거리 (지연시간 기준)
  reason: string;
}

interface SKURecommendation {
  region: string;
  vmSize: string;
  score: number;
  label: string;
  confidence: number;
  pricePerHour?: number;
  pricePerGpu?: number;
  gpuModel: string;
  gpuCount: number;
  gpuMemoryGB: number;
  performanceRatio: number; // 원래 VM 대비 성능 비율
  priceRatio: number; // 원래 VM 대비 가격 비율
  reason: string;
  compatibility: 'exact' | 'upgrade' | 'similar' | 'downgrade';
}

interface RecommendationRequest {
  originalRegion: string;
  originalVMSize: string;
  maxAlternatives?: number;
  includeHigherTier?: boolean;
  includeLowerTier?: boolean;
  maxPriceIncrease?: number; // 허용 가격 증가율 (예: 1.5 = 50% 증가까지)
  minAvailabilityScore?: number; // 최소 가용성 점수
}

interface RecommendationResponse {
  originalRequest: {
    region: string;
    vmSize: string;
    currentScore?: number;
    currentLabel?: string;
  };
  regionAlternatives: RegionRecommendation[];
  skuAlternatives: SKURecommendation[];
  summary: {
    totalAlternatives: number;
    bestRegionAlternative?: RegionRecommendation;
    bestSKUAlternative?: SKURecommendation;
    recommendationStrength: 'strong' | 'moderate' | 'weak';
  };
}

export class AzureRecommendationEngine {
  private regionDistances: Record<string, Record<string, number>> = {
    'koreacentral': {
      'japaneast': 1,
      'eastus': 3,
      'eastus2': 3,
      'westus3': 4,
      'westeurope': 4,
      'australiacentral2': 2,
      'mexicocentral': 5
    },
    'eastus': {
      'eastus2': 1,
      'westus3': 2,
      'koreacentral': 3,
      'westeurope': 2,
      'japaneast': 4,
      'australiacentral2': 5,
      'mexicocentral': 2
    },
    'eastus2': {
      'eastus': 1,
      'westus3': 2,
      'koreacentral': 3,
      'westeurope': 2,
      'japaneast': 4,
      'australiacentral2': 5,
      'mexicocentral': 2
    },
    'westus3': {
      'eastus': 2,
      'eastus2': 2,
      'koreacentral': 4,
      'westeurope': 3,
      'japaneast': 4,
      'australiacentral2': 4,
      'mexicocentral': 1
    },
    'japaneast': {
      'koreacentral': 1,
      'eastus': 4,
      'eastus2': 4,
      'westus3': 4,
      'westeurope': 4,
      'australiacentral2': 2,
      'mexicocentral': 5
    },
    'westeurope': {
      'eastus': 2,
      'eastus2': 2,
      'westus3': 3,
      'koreacentral': 4,
      'japaneast': 4,
      'australiacentral2': 5,
      'mexicocentral': 3
    },
    'australiacentral2': {
      'koreacentral': 2,
      'japaneast': 2,
      'eastus': 5,
      'eastus2': 5,
      'westus3': 4,
      'westeurope': 5,
      'mexicocentral': 5
    },
    'mexicocentral': {
      'westus3': 1,
      'eastus': 2,
      'eastus2': 2,
      'westeurope': 3,
      'koreacentral': 5,
      'japaneast': 5,
      'australiacentral2': 5
    }
  };

  private regionDisplayNames: Record<string, string> = {
    'eastus': 'East US',
    'eastus2': 'East US 2',
    'westus': 'West US',
    'westus2': 'West US 2',
    'westus3': 'West US 3',
    'koreacentral': 'Korea Central',
    'japaneast': 'Japan East',
    'westeurope': 'West Europe',
    'northeurope': 'North Europe',
    'australiacentral2': 'Australia Central 2',
    'mexicocentral': 'Mexico Central',
    'southcentralus': 'South Central US'
  };

  private vmSpecs: Record<string, VMSpec> = {
    'Standard_NC4as_T4_v3': {
      vmSize: 'Standard_NC4as_T4_v3',
      gpuModel: 'Tesla T4',
      gpuCount: 1,
      gpuMemoryGB: 16,
      vcpu: 4,
      ramGB: 28
    },
    'Standard_NC8as_T4_v3': {
      vmSize: 'Standard_NC8as_T4_v3',
      gpuModel: 'Tesla T4',
      gpuCount: 1,
      gpuMemoryGB: 16,
      vcpu: 8,
      ramGB: 56
    },
    'Standard_NC16asT4': {
      vmSize: 'Standard_NC16asT4',
      gpuModel: 'Tesla T4',
      gpuCount: 1,
      gpuMemoryGB: 16,
      vcpu: 16,
      ramGB: 110
    },
    'Standard_NC24ads_A100_v4': {
      vmSize: 'Standard_NC24ads_A100_v4',
      gpuModel: 'A100',
      gpuCount: 1,
      gpuMemoryGB: 80,
      vcpu: 24,
      ramGB: 220
    },
    'Standard_NC48ads_A100_v4': {
      vmSize: 'Standard_NC48ads_A100_v4',
      gpuModel: 'A100',
      gpuCount: 2,
      gpuMemoryGB: 160,
      vcpu: 48,
      ramGB: 440
    },
    'Standard_ND96asr_v4': {
      vmSize: 'Standard_ND96asr_v4',
      gpuModel: 'A100',
      gpuCount: 8,
      gpuMemoryGB: 640,
      vcpu: 96,
      ramGB: 900
    },
    'Standard_NV16as_v4': {
      vmSize: 'Standard_NV16as_v4',
      gpuModel: 'AMD Radeon Instinct MI25',
      gpuCount: 1,
      gpuMemoryGB: 16,
      vcpu: 16,
      ramGB: 56
    },
    'Standard_NV32as_v4': {
      vmSize: 'Standard_NV32as_v4',
      gpuModel: 'AMD Radeon Instinct MI25',
      gpuCount: 1,
      gpuMemoryGB: 16,
      vcpu: 32,
      ramGB: 112
    }
  };

  /**
   * 추천 결과 생성
   */
  async generateRecommendations(
    request: RecommendationRequest,
    capacityScores: CapacityScore[],
    instancePrices?: any[]
  ): Promise<RecommendationResponse> {
    const {
      originalRegion,
      originalVMSize,
      maxAlternatives = 5,
      includeHigherTier = true,
      includeLowerTier = false,
      maxPriceIncrease = 2.0,
      minAvailabilityScore = 40
    } = request;

    // 원래 VM의 현재 상태 확인
    const originalScore = capacityScores.find(
      s => s.region === originalRegion && s.vmSize === originalVMSize
    );

    // 대체 리전 추천 (같은 VM)
    const regionAlternatives = this.findRegionAlternatives(
      originalRegion,
      originalVMSize,
      capacityScores,
      instancePrices,
      maxAlternatives,
      minAvailabilityScore
    );

    // 대체 SKU 추천 (다른 VM)
    const skuAlternatives = this.findSKUAlternatives(
      originalRegion,
      originalVMSize,
      capacityScores,
      instancePrices,
      maxAlternatives,
      includeHigherTier,
      includeLowerTier,
      maxPriceIncrease,
      minAvailabilityScore
    );

    // 최고 추천 선택
    const bestRegionAlternative = regionAlternatives[0];
    const bestSKUAlternative = skuAlternatives[0];

    // 추천 강도 계산
    const recommendationStrength = this.calculateRecommendationStrength(
      regionAlternatives,
      skuAlternatives
    );

    return {
      originalRequest: {
        region: originalRegion,
        vmSize: originalVMSize,
        currentScore: originalScore?.score,
        currentLabel: originalScore?.label
      },
      regionAlternatives,
      skuAlternatives,
      summary: {
        totalAlternatives: regionAlternatives.length + skuAlternatives.length,
        bestRegionAlternative,
        bestSKUAlternative,
        recommendationStrength
      }
    };
  }

  /**
   * 대체 리전 찾기 (같은 VM)
   */
  private findRegionAlternatives(
    originalRegion: string,
    vmSize: string,
    capacityScores: CapacityScore[],
    instancePrices: any[] = [],
    maxAlternatives: number,
    minAvailabilityScore: number
  ): RegionRecommendation[] {
    const alternatives: RegionRecommendation[] = [];

    // 같은 VM의 다른 리전 스코어들 찾기
    const sameVMScores = capacityScores.filter(
      s => s.vmSize === vmSize && s.region !== originalRegion && s.score >= minAvailabilityScore
    );

    sameVMScores.forEach(score => {
      const distance = this.getRegionDistance(originalRegion, score.region);
      const price = this.findInstancePrice(instancePrices, score.region, vmSize);
      
      let reason = '';
      if (score.score >= 75) {
        reason = '높은 가용성과 안정적인 성능';
      } else if (score.score >= 50) {
        reason = '적절한 가용성 확보';
      } else {
        reason = '제한적이지만 사용 가능';
      }

      if (distance <= 2) {
        reason += ', 낮은 지연시간';
      }

      alternatives.push({
        region: score.region,
        displayName: this.regionDisplayNames[score.region] || score.region,
        vmSize: score.vmSize,
        score: score.score,
        label: score.label,
        confidence: score.confidence,
        pricePerHour: price?.pricePerHour,
        pricePerGpu: price?.pricePerGpu,
        distance,
        reason
      });
    });

    // 정렬: 스코어 높은 순 → 거리 가까운 순
    alternatives.sort((a, b) => {
      if (Math.abs(a.score - b.score) > 10) {
        return b.score - a.score; // 스코어 차이가 크면 스코어 우선
      }
      return a.distance - b.distance; // 스코어가 비슷하면 거리 우선
    });

    return alternatives.slice(0, maxAlternatives);
  }

  /**
   * 대체 SKU 찾기 (다른 VM)
   */
  private findSKUAlternatives(
    originalRegion: string,
    originalVMSize: string,
    capacityScores: CapacityScore[],
    instancePrices: any[] = [],
    maxAlternatives: number,
    includeHigherTier: boolean,
    includeLowerTier: boolean,
    maxPriceIncrease: number,
    minAvailabilityScore: number
  ): SKURecommendation[] {
    const alternatives: SKURecommendation[] = [];
    const originalSpec = this.vmSpecs[originalVMSize];
    
    if (!originalSpec) return alternatives;

    // 원래 리전의 다른 VM 스코어들 찾기
    const sameRegionScores = capacityScores.filter(
      s => s.region === originalRegion && s.vmSize !== originalVMSize && s.score >= minAvailabilityScore
    );

    sameRegionScores.forEach(score => {
      const spec = this.vmSpecs[score.vmSize];
      if (!spec) return;

      const compatibility = this.getVMCompatibility(originalSpec, spec);
      
      // 티어 필터링
      if (!includeHigherTier && compatibility === 'upgrade') return;
      if (!includeLowerTier && compatibility === 'downgrade') return;

      const price = this.findInstancePrice(instancePrices, score.region, score.vmSize);
      const originalPrice = this.findInstancePrice(instancePrices, originalRegion, originalVMSize);
      
      let priceRatio = 1;
      if (price?.pricePerHour && originalPrice?.pricePerHour) {
        priceRatio = price.pricePerHour / originalPrice.pricePerHour;
        if (priceRatio > maxPriceIncrease) return; // 가격 증가 한도 초과
      }

      const performanceRatio = this.calculatePerformanceRatio(originalSpec, spec);
      const reason = this.generateSKURecommendationReason(compatibility, performanceRatio, priceRatio, score.score);

      alternatives.push({
        region: score.region,
        vmSize: score.vmSize,
        score: score.score,
        label: score.label,
        confidence: score.confidence,
        pricePerHour: price?.pricePerHour,
        pricePerGpu: price?.pricePerGpu,
        gpuModel: spec.gpuModel,
        gpuCount: spec.gpuCount,
        gpuMemoryGB: spec.gpuMemoryGB,
        performanceRatio,
        priceRatio,
        reason,
        compatibility
      });
    });

    // 정렬: 호환성 → 성능비 → 스코어 순
    alternatives.sort((a, b) => {
      const compatibilityOrder = { 'exact': 0, 'similar': 1, 'upgrade': 2, 'downgrade': 3 };
      
      if (a.compatibility !== b.compatibility) {
        return compatibilityOrder[a.compatibility] - compatibilityOrder[b.compatibility];
      }
      
      if (Math.abs(a.performanceRatio - 1) !== Math.abs(b.performanceRatio - 1)) {
        return Math.abs(a.performanceRatio - 1) - Math.abs(b.performanceRatio - 1);
      }
      
      return b.score - a.score;
    });

    return alternatives.slice(0, maxAlternatives);
  }

  /**
   * VM 호환성 판단
   */
  private getVMCompatibility(original: VMSpec, alternative: VMSpec): 'exact' | 'upgrade' | 'similar' | 'downgrade' {
    const originalPerf = original.gpuCount * original.gpuMemoryGB;
    const alternativePerf = alternative.gpuCount * alternative.gpuMemoryGB;
    
    if (original.gpuModel === alternative.gpuModel && original.gpuCount === alternative.gpuCount) {
      return 'exact';
    }
    
    if (alternativePerf > originalPerf * 1.5) {
      return 'upgrade';
    }
    
    if (alternativePerf < originalPerf * 0.7) {
      return 'downgrade';
    }
    
    return 'similar';
  }

  /**
   * 성능 비율 계산
   */
  private calculatePerformanceRatio(original: VMSpec, alternative: VMSpec): number {
    // GPU 메모리 * GPU 개수를 기준으로 성능 비율 계산
    const originalPerf = original.gpuCount * original.gpuMemoryGB;
    const alternativePerf = alternative.gpuCount * alternative.gpuMemoryGB;
    
    return alternativePerf / originalPerf;
  }

  /**
   * 리전 간 거리 계산
   */
  private getRegionDistance(from: string, to: string): number {
    return this.regionDistances[from]?.[to] || 5; // 기본값: 5 (가장 먼 거리)
  }

  /**
   * 인스턴스 가격 찾기
   */
  private findInstancePrice(instancePrices: any[], region: string, vmSize: string) {
    return instancePrices.find(
      p => p.region === region && p.instanceName === vmSize
    );
  }

  /**
   * SKU 추천 이유 생성
   */
  private generateSKURecommendationReason(
    compatibility: string,
    performanceRatio: number,
    priceRatio: number,
    score: number
  ): string {
    const reasons = [];
    
    if (compatibility === 'exact') {
      reasons.push('동일한 GPU 구성');
    } else if (compatibility === 'upgrade') {
      reasons.push(`${(performanceRatio * 100).toFixed(0)}% 더 높은 성능`);
    } else if (compatibility === 'similar') {
      reasons.push('유사한 성능');
    } else {
      reasons.push('더 경제적인 옵션');
    }
    
    if (priceRatio < 0.8) {
      reasons.push(`${((1 - priceRatio) * 100).toFixed(0)}% 저렴`);
    } else if (priceRatio > 1.2) {
      reasons.push(`${((priceRatio - 1) * 100).toFixed(0)}% 비쌈`);
    }
    
    if (score >= 75) {
      reasons.push('높은 가용성');
    } else if (score >= 50) {
      reasons.push('적절한 가용성');
    }
    
    return reasons.join(', ');
  }

  /**
   * 추천 강도 계산
   */
  private calculateRecommendationStrength(
    regionAlternatives: RegionRecommendation[],
    skuAlternatives: SKURecommendation[]
  ): 'strong' | 'moderate' | 'weak' {
    const totalAlternatives = regionAlternatives.length + skuAlternatives.length;
    const highQualityAlternatives = [
      ...regionAlternatives.filter(r => r.score >= 70),
      ...skuAlternatives.filter(s => s.score >= 70)
    ].length;

    if (totalAlternatives >= 3 && highQualityAlternatives >= 2) {
      return 'strong';
    } else if (totalAlternatives >= 2 && highQualityAlternatives >= 1) {
      return 'moderate';
    } else {
      return 'weak';
    }
  }
}

export const azureRecommendationEngine = new AzureRecommendationEngine();


