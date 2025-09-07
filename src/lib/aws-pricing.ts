import { PricingClient, GetProductsCommand, Filter } from '@aws-sdk/client-pricing'

// AWS Price List API 클라이언트 (Pricing API는 us-east-1에서만 작동)
const pricingClient = new PricingClient({ 
  region: 'us-east-1',
  // 실제 프로덕션에서는 환경변수로 설정
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'demo',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'demo'
  }
})

// 리전 코드를 AWS 위치 이름으로 매핑
const AWS_REGION_MAPPING: Record<string, string> = {
  'us-east-1': 'US East (N. Virginia)',
  'us-west-2': 'US West (Oregon)',
  'ap-northeast-1': 'Asia Pacific (Tokyo)',
  'ap-northeast-2': 'Asia Pacific (Seoul)',
  'eu-west-1': 'Europe (Ireland)',
  'ap-southeast-1': 'Asia Pacific (Singapore)'
}

// GPU 인스턴스 패밀리 정의
const GPU_INSTANCE_FAMILIES = ['p3', 'p4', 'p5', 'g4', 'g5', 'g6']

interface AWSPriceData {
  instanceType: string
  region: string
  pricePerHour: number
  currency: string
  operatingSystem: string
  tenancy: string
  lastUpdated: string
}

interface AWSPricingResponse {
  PriceList: Array<{
    product: {
      attributes: {
        instanceType: string
        location: string
        operatingSystem: string
        tenancy: string
        capacitystatus: string
      }
    }
    terms: {
      OnDemand?: Record<string, {
        priceDimensions: Record<string, {
          pricePerUnit: {
            USD: string
          }
          unit: string
        }>
      }>
    }
  }>
  NextToken?: string
}

export class AWSPricingService {
  /**
   * Seoul 리전의 GPU 인스턴스 가격 조회
   */
  async fetchSeoulGPUPrices(): Promise<AWSPriceData[]> {
    try {
      const location = AWS_REGION_MAPPING['ap-northeast-2']
      const results: AWSPriceData[] = []

      // GPU 인스턴스 패밀리별로 가격 조회
      for (const family of GPU_INSTANCE_FAMILIES) {
        console.log(`Fetching AWS prices for ${family} family in Seoul...`)
        
        const filters: Filter[] = [
          {
            Type: 'TERM_MATCH',
            Field: 'ServiceCode',
            Value: 'AmazonEC2'
          },
          {
            Type: 'TERM_MATCH',
            Field: 'location',
            Value: location
          },
          {
            Type: 'TERM_MATCH',
            Field: 'instanceFamily',
            Value: family
          },
          {
            Type: 'TERM_MATCH',
            Field: 'operatingSystem',
            Value: 'Linux'
          },
          {
            Type: 'TERM_MATCH',
            Field: 'tenancy',
            Value: 'Shared'
          },
          {
            Type: 'TERM_MATCH',
            Field: 'capacitystatus',
            Value: 'Used'
          }
        ]

        const familyPrices = await this.fetchPricesWithFilters(filters)
        results.push(...familyPrices)
        
        // Rate limiting: AWS API 호출 간격 조절
        await this.delay(100)
      }

      console.log(`Successfully fetched ${results.length} AWS GPU instance prices`)
      return results

    } catch (error) {
      console.error('Error fetching AWS prices:', error)
      
      // AWS API 사용 불가 시 더미 데이터 반환
      return this.getDummyAWSPrices()
    }
  }

  /**
   * 필터를 사용하여 가격 데이터 조회
   */
  private async fetchPricesWithFilters(filters: Filter[]): Promise<AWSPriceData[]> {
    const results: AWSPriceData[] = []
    let nextToken: string | undefined

    do {
      const command = new GetProductsCommand({
        ServiceCode: 'AmazonEC2',
        Filters: filters,
        MaxResults: 100,
        NextToken: nextToken
      })

      try {
        const response = await pricingClient.send(command)
        const data = response as AWSPricingResponse

        for (const item of data.PriceList || []) {
          const priceData = this.parseAWSPriceItem(item)
          if (priceData) {
            results.push(priceData)
          }
        }

        nextToken = data.NextToken
      } catch (error) {
        console.error('AWS API call failed:', error)
        break
      }
    } while (nextToken)

    return results
  }

  /**
   * AWS API 응답에서 가격 정보 파싱
   */
  private parseAWSPriceItem(item: any): AWSPriceData | null {
    try {
      const attributes = item.product?.attributes
      if (!attributes) return null

      const instanceType = attributes.instanceType
      const location = attributes.location
      const operatingSystem = attributes.operatingSystem
      const tenancy = attributes.tenancy

      // GPU 인스턴스만 필터링
      if (!this.isGPUInstance(instanceType)) {
        return null
      }

      // On-Demand 가격 추출
      const onDemandTerms = item.terms?.OnDemand
      if (!onDemandTerms) return null

      const termKey = Object.keys(onDemandTerms)[0]
      const priceDimensions = onDemandTerms[termKey]?.priceDimensions
      if (!priceDimensions) return null

      const dimensionKey = Object.keys(priceDimensions)[0]
      const priceInfo = priceDimensions[dimensionKey]
      
      const pricePerHour = parseFloat(priceInfo.pricePerUnit?.USD || '0')
      if (pricePerHour === 0) return null

      return {
        instanceType,
        region: this.locationToRegion(location),
        pricePerHour,
        currency: 'USD',
        operatingSystem,
        tenancy,
        lastUpdated: new Date().toISOString()
      }
    } catch (error) {
      console.error('Error parsing AWS price item:', error)
      return null
    }
  }

  /**
   * 인스턴스 타입이 GPU 인스턴스인지 확인
   */
  private isGPUInstance(instanceType: string): boolean {
    const gpuFamilies = ['p3', 'p4', 'p5', 'g4', 'g5', 'g6']
    return gpuFamilies.some(family => instanceType.startsWith(family))
  }

  /**
   * AWS 위치 이름을 리전 코드로 변환
   */
  private locationToRegion(location: string): string {
    const mapping: Record<string, string> = {
      'US East (N. Virginia)': 'us-east-1',
      'US West (Oregon)': 'us-west-2',
      'Asia Pacific (Tokyo)': 'ap-northeast-1',
      'Asia Pacific (Seoul)': 'ap-northeast-2',
      'Europe (Ireland)': 'eu-west-1',
      'Asia Pacific (Singapore)': 'ap-southeast-1'
    }
    return mapping[location] || 'unknown'
  }

  /**
   * API 호출 간격 조절을 위한 지연
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * AWS API 사용 불가 시 더미 데이터 (현재 하드코딩된 가격 기반)
   */
  private getDummyAWSPrices(): AWSPriceData[] {
    return [
      {
        instanceType: 'p5.48xlarge',
        region: 'ap-northeast-2',
        pricePerHour: 98.32,
        currency: 'USD',
        operatingSystem: 'Linux',
        tenancy: 'Shared',
        lastUpdated: new Date().toISOString()
      },
      {
        instanceType: 'p4d.24xlarge',
        region: 'ap-northeast-2',
        pricePerHour: 32.77,
        currency: 'USD',
        operatingSystem: 'Linux',
        tenancy: 'Shared',
        lastUpdated: new Date().toISOString()
      },
      {
        instanceType: 'g5.xlarge',
        region: 'ap-northeast-2',
        pricePerHour: 1.006,
        currency: 'USD',
        operatingSystem: 'Linux',
        tenancy: 'Shared',
        lastUpdated: new Date().toISOString()
      },
      {
        instanceType: 'g5.2xlarge',
        region: 'ap-northeast-2',
        pricePerHour: 1.89,
        currency: 'USD',
        operatingSystem: 'Linux',
        tenancy: 'Shared',
        lastUpdated: new Date().toISOString()
      }
    ]
  }

  /**
   * 가격 데이터를 내부 포맷으로 변환
   */
  mapToInternalFormat(awsPrices: AWSPriceData[]): Record<string, { pricePerHour: number; currency: string; lastUpdated: string }> {
    const result: Record<string, { pricePerHour: number; currency: string; lastUpdated: string }> = {}

    for (const price of awsPrices) {
      // p5.48xlarge -> p5d.24xlarge 매핑 (실제 인스턴스 스펙과 맞춤)
      let mappedInstanceType = price.instanceType
      if (price.instanceType === 'p5.48xlarge') {
        mappedInstanceType = 'p5d.24xlarge'
      }

      const instanceId = `aws-${mappedInstanceType}`
      result[instanceId] = {
        pricePerHour: price.pricePerHour,
        currency: price.currency,
        lastUpdated: price.lastUpdated
      }
    }

    return result
  }
}

// 싱글톤 인스턴스
export const awsPricingService = new AWSPricingService()
