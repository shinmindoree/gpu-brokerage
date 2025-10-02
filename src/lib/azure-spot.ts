// Azure Spot VM 가격 신호 수집 서비스
import { ComputeManagementClient } from '@azure/arm-compute';
import { DefaultAzureCredential } from '@azure/identity';
import { prisma } from './prisma';

export interface AzureSpotPriceData {
  region: string;
  vmSize: string;
  spotPrice: number;
  onDemandPrice: number;
  priceRatio: number; // spot/ondemand 비율
  timestamp: Date;
}

export interface AzureSpotSignalResult {
  region: string;
  vmSize: string;
  spotPrice: number;
  onDemandPrice: number;
  priceRatio: number;
  volatility: number; // 가격 변동성 (0-1)
  evictionRate: number; // 중단율 (0-1)
  marketStress: number; // 시장 혼잡도 (0-1)
  timestamp: Date;
}

export interface AzureSpotConfig {
  subscriptionId: string;
  resourceGroupName?: string;
  monitorRegions: string[];
  monitorVmSizes: string[];
  collectionIntervalMinutes: number;
  enableRealSpotApi: boolean; // false면 모킹
}

export class AzureSpotService {
  private computeClient: ComputeManagementClient | null = null;
  private config: AzureSpotConfig;
  private isInitialized = false;

  // 온디맨드 가격 캐시 (시간당 가격, USD)
  private onDemandPriceCache: Map<string, number> = new Map();

  // 과거 가격 데이터 캐시 (변동성 계산용)
  private priceHistory: Map<string, number[]> = new Map();

  constructor(config: AzureSpotConfig) {
    this.config = config;
    this.initializeOnDemandPrices();
  }

  async initialize(): Promise<void> {
    try {
      if (this.config.enableRealSpotApi) {
        // 실제 Azure 연결
        const credential = new DefaultAzureCredential();
        this.computeClient = new ComputeManagementClient(
          credential, 
          this.config.subscriptionId
        );
        
        console.log('✅ Azure Spot Service 실제 API 모드로 초기화');
      } else {
        console.log('🔄 Azure Spot Service 모킹 모드로 초기화');
      }
      
      this.isInitialized = true;
    } catch (error) {
      console.error('❌ Azure Spot Service 초기화 실패:', error);
      this.isInitialized = false;
      throw error;
    }
  }

  /**
   * 온디맨드 가격 초기화 (실제 값 기반)
   */
  private initializeOnDemandPrices(): void {
    // Azure GPU VM 온디맨드 시간당 가격 (USD, 2024년 기준)
    const prices = {
      'Standard_NC4as_T4_v3': 0.526,
      'Standard_NC8as_T4_v3': 1.052,
      'Standard_NC16as_T4_v3': 2.104,
      'Standard_NC64as_T4_v3': 8.416,
      'Standard_NC6s_v3': 3.168,
      'Standard_NC12s_v3': 6.336,
      'Standard_NC24s_v3': 12.672,
      'Standard_NC24ads_A100_v4': 3.673,
      'Standard_NC48ads_A100_v4': 7.346,
      'Standard_NC96ads_A100_v4': 14.692,
      'Standard_ND96amsr_A100_v4': 27.20,
      'Standard_ND96asr_v4': 27.20,
      'Standard_ND96isr_H100_v5': 40.00,
      'Standard_ND48isr_H100_v5': 20.00
    };

    for (const [vmSize, price] of Object.entries(prices)) {
      // 리전별 가격 차이 반영 (간단한 배율)
      const regionMultipliers = {
        'koreacentral': 1.0,
        'eastus': 0.95,
        'westus2': 0.98,
        'japaneast': 1.05,
        'westeurope': 1.02,
        'northeurope': 0.96
      };

      for (const [region, multiplier] of Object.entries(regionMultipliers)) {
        const key = `${region}:${vmSize}`;
        this.onDemandPriceCache.set(key, price * multiplier);
      }
    }

    console.log(`💰 온디맨드 가격 캐시 초기화 완료: ${this.onDemandPriceCache.size}개`);
  }

  /**
   * 특정 리전/VM크기의 Spot 가격 수집
   */
  async collectSpotPrice(region: string, vmSize: string): Promise<AzureSpotSignalResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      let spotPriceData: AzureSpotPriceData;

      if (this.config.enableRealSpotApi && this.computeClient) {
        spotPriceData = await this.fetchRealSpotPrice(region, vmSize);
      } else {
        spotPriceData = await this.generateMockSpotPrice(region, vmSize);
      }

      // 시장 신호 분석
      const signals = await this.analyzeMarketSignals(spotPriceData);
      
      return signals;

    } catch (error) {
      console.error(`Spot 가격 수집 실패: ${region}/${vmSize}`, error);
      
      // 오류 시 기본값 반환
      const onDemandPrice = this.getOnDemandPrice(region, vmSize);
      return {
        region,
        vmSize,
        spotPrice: onDemandPrice * 0.7, // 기본적으로 30% 할인
        onDemandPrice,
        priceRatio: 0.7,
        volatility: 0.5,
        evictionRate: 0.1,
        marketStress: 0.5,
        timestamp: new Date()
      };
    }
  }

  /**
   * 실제 Azure Spot 가격 API 호출
   */
  private async fetchRealSpotPrice(region: string, vmSize: string): Promise<AzureSpotPriceData> {
    // 실제 Azure Spot Pricing API는 복잡하므로 현재는 모킹으로 대체
    // 향후 Azure Retail Prices API의 Spot 가격 부분을 파싱하여 구현
    console.log(`🔍 실제 Spot 가격 조회: ${region}/${vmSize}`);
    
    // TODO: 실제 Azure Spot Pricing API 연동
    return this.generateMockSpotPrice(region, vmSize);
  }

  /**
   * 모킹된 Spot 가격 생성 (현실적인 시뮬레이션)
   */
  private async generateMockSpotPrice(region: string, vmSize: string): Promise<AzureSpotPriceData> {
    const onDemandPrice = this.getOnDemandPrice(region, vmSize);
    
    // 시간대별 시장 상황 시뮬레이션
    const hour = new Date().getHours();
    const isBusinessHours = hour >= 9 && hour <= 18;
    const isHighDemandGpu = vmSize.includes('A100') || vmSize.includes('H100');
    const isPopularRegion = region === 'koreacentral' || region === 'eastus';

    // 기본 할인율 (Spot은 보통 30-70% 할인)
    let baseDiscount = 0.6; // 40% 할인

    // 시장 상황에 따른 가격 조정
    if (isBusinessHours) baseDiscount -= 0.1; // 업무시간 = 할인 감소
    if (isHighDemandGpu) baseDiscount -= 0.15; // 고급 GPU = 할인 감소
    if (isPopularRegion) baseDiscount -= 0.1; // 인기 리전 = 할인 감소

    // 무작위 변동 추가 (±20%)
    const randomVariation = (Math.random() - 0.5) * 0.4;
    const finalDiscount = Math.max(0.2, Math.min(0.8, baseDiscount + randomVariation));

    const spotPrice = onDemandPrice * (1 - finalDiscount);
    const priceRatio = spotPrice / onDemandPrice;

    return {
      region,
      vmSize,
      spotPrice,
      onDemandPrice,
      priceRatio,
      timestamp: new Date()
    };
  }

  /**
   * 온디맨드 가격 조회
   */
  private getOnDemandPrice(region: string, vmSize: string): number {
    const key = `${region}:${vmSize}`;
    return this.onDemandPriceCache.get(key) || 1.0; // 기본값 $1/hour
  }

  /**
   * 시장 신호 분석
   */
  private async analyzeMarketSignals(priceData: AzureSpotPriceData): Promise<AzureSpotSignalResult> {
    const key = `${priceData.region}:${priceData.vmSize}`;
    
    // 과거 가격 히스토리 업데이트
    if (!this.priceHistory.has(key)) {
      this.priceHistory.set(key, []);
    }
    const history = this.priceHistory.get(key)!;
    history.push(priceData.spotPrice);
    
    // 최근 24개 데이터포인트만 유지 (24시간 가정)
    if (history.length > 24) {
      history.shift();
    }

    // 가격 변동성 계산 (표준편차 기반)
    const volatility = this.calculateVolatility(history);

    // 중단율 추정 (가격이 높을수록 중단율 낮음)
    const evictionRate = this.estimateEvictionRate(priceData.priceRatio);

    // 시장 스트레스 계산 (종합 지표)
    const marketStress = this.calculateMarketStress(
      priceData.priceRatio,
      volatility,
      evictionRate
    );

    return {
      region: priceData.region,
      vmSize: priceData.vmSize,
      spotPrice: priceData.spotPrice,
      onDemandPrice: priceData.onDemandPrice,
      priceRatio: priceData.priceRatio,
      volatility,
      evictionRate,
      marketStress,
      timestamp: priceData.timestamp
    };
  }

  /**
   * 가격 변동성 계산 (0-1 스케일)
   */
  private calculateVolatility(prices: number[]): number {
    if (prices.length < 2) return 0;

    const mean = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    const variance = prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / prices.length;
    const stdDev = Math.sqrt(variance);
    
    // 평균 대비 표준편차 비율을 0-1로 정규화
    const coefficientOfVariation = stdDev / mean;
    return Math.min(1, coefficientOfVariation * 2); // 50% 변동성을 1.0으로 스케일링
  }

  /**
   * 중단율 추정 (가격 비율 기반)
   */
  private estimateEvictionRate(priceRatio: number): number {
    // 가격이 온디맨드에 가까울수록 중단율 낮음
    // priceRatio가 0.9 (90%)이면 중단율 0.05 (5%)
    // priceRatio가 0.3 (30%)이면 중단율 0.4 (40%)
    return Math.max(0, Math.min(0.5, (1 - priceRatio) * 0.6));
  }

  /**
   * 시장 스트레스 계산 (종합 지표, 0-1)
   */
  private calculateMarketStress(priceRatio: number, volatility: number, evictionRate: number): number {
    // 가중 평균으로 시장 스트레스 계산
    const priceStress = 1 - priceRatio; // 가격이 높을수록 스트레스 높음
    const volatilityStress = volatility; // 변동성이 클수록 스트레스 높음
    const evictionStress = evictionRate * 2; // 중단율이 높을수록 스트레스 높음

    const marketStress = (priceStress * 0.4 + volatilityStress * 0.3 + evictionStress * 0.3);
    return Math.max(0, Math.min(1, marketStress));
  }

  /**
   * 배치 Spot 신호 수집
   */
  async batchCollectSpotSignals(): Promise<AzureSpotSignalResult[]> {
    const results: AzureSpotSignalResult[] = [];

    for (const region of this.config.monitorRegions) {
      for (const vmSize of this.config.monitorVmSizes) {
        try {
          console.log(`📊 Spot 신호 수집: ${region}/${vmSize}`);
          
          const signal = await this.collectSpotPrice(region, vmSize);
          results.push(signal);

          // Spot 신호 저장
          await this.saveSpotSignal(signal);

          // 수집 간격
          await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (error) {
          console.error(`Spot 신호 수집 실패: ${region}/${vmSize}`, error);
        }
      }
    }

    return results;
  }

  /**
   * Spot 신호 저장
   */
  async saveSpotSignal(signal: AzureSpotSignalResult): Promise<void> {
    try {
      // TODO: Prisma 클라이언트 업데이트 후 활성화
      console.log(`💾 Spot 신호 저장 (모킹): ${signal.region}/${signal.vmSize} - 가격비율: ${(signal.priceRatio * 100).toFixed(1)}%, 스트레스: ${(signal.marketStress * 100).toFixed(1)}%`);
      
      // await prisma.azureSpotSignal.create({
      //   data: {
      //     region: signal.region,
      //     vmSize: signal.vmSize,
      //     spotPrice: signal.spotPrice,
      //     onDemandPrice: signal.onDemandPrice,
      //     priceRatio: signal.priceRatio,
      //     volatility: signal.volatility,
      //     evictionRate: signal.evictionRate,
      //     marketStress: signal.marketStress,
      //     timestamp: signal.timestamp
      //   }
      // });
    } catch (error) {
      console.error('Spot 신호 저장 실패:', error);
    }
  }

  /**
   * 최근 Spot 신호 조회
   */
  async getRecentSpotSignals(
    region?: string,
    vmSize?: string,
    hours: number = 24
  ): Promise<any[]> {
    // TODO: Prisma 클라이언트 업데이트 후 활성화
    console.log(`📊 최근 Spot 신호 조회 (모킹): ${region || 'all'}/${vmSize || 'all'}, ${hours}시간`);
    
    // 임시 목업 데이터 반환
    return [
      {
        region: 'koreacentral',
        vmSize: 'Standard_NC24ads_A100_v4',
        spotPrice: 2.57,
        onDemandPrice: 3.673,
        priceRatio: 0.70,
        volatility: 0.15,
        evictionRate: 0.08,
        marketStress: 0.35,
        timestamp: new Date()
      },
      {
        region: 'eastus',
        vmSize: 'Standard_NC4as_T4_v3',
        spotPrice: 0.21,
        onDemandPrice: 0.526,
        priceRatio: 0.40,
        volatility: 0.25,
        evictionRate: 0.25,
        marketStress: 0.65,
        timestamp: new Date(Date.now() - 30 * 60 * 1000)
      }
    ];
  }

  /**
   * 시장 상황 요약
   */
  async getMarketSummary(): Promise<any> {
    const signals = await this.getRecentSpotSignals(undefined, undefined, 4); // 최근 4시간
    
    if (signals.length === 0) {
      return {
        avgPriceRatio: 0.6,
        avgVolatility: 0.2,
        avgEvictionRate: 0.15,
        avgMarketStress: 0.4,
        totalSignals: 0
      };
    }

    return {
      avgPriceRatio: signals.reduce((sum, s) => sum + s.priceRatio, 0) / signals.length,
      avgVolatility: signals.reduce((sum, s) => sum + s.volatility, 0) / signals.length,
      avgEvictionRate: signals.reduce((sum, s) => sum + s.evictionRate, 0) / signals.length,
      avgMarketStress: signals.reduce((sum, s) => sum + s.marketStress, 0) / signals.length,
      totalSignals: signals.length
    };
  }
}

// 기본 설정으로 초기화된 인스턴스
export const azureSpotService = new AzureSpotService({
  subscriptionId: process.env.AZURE_SUBSCRIPTION_ID || 'demo-subscription',
  resourceGroupName: process.env.AZURE_RESOURCE_GROUP || 'gpu-brokerage-test',
  monitorRegions: ['koreacentral', 'eastus', 'japaneast', 'westeurope'],
  monitorVmSizes: [
    'Standard_NC4as_T4_v3',
    'Standard_NC8as_T4_v3',
    'Standard_NC24ads_A100_v4',
    'Standard_NC48ads_A100_v4'
  ],
  collectionIntervalMinutes: 15,
  enableRealSpotApi: false // 현재는 모킹 모드
});
