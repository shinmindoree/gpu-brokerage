// Azure Pricing API 서비스 (REST API 사용)
// Azure Retail Prices API: https://docs.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices

interface AzureGPUInstance {
  vmSize: string
  location: string
  meterName: string
  meterSubCategory: string
  unit: string
  pricePerHour: number
  currency: string
  effectiveDate: string
  gpuModel?: string
  gpuCount?: number
  vcpu?: number
  ram?: number
  diskSize?: number
}

interface AzurePricingResponse {
  success: boolean
  data?: {
    instances: AzureGPUInstance[]
    totalCount: number
    fetchedAt: string
    currency: string
    regions: string[]
    gpuModels: string[]
  }
  error?: string
  message?: string
}

// Azure GPU VM 패밀리 매핑
const AZURE_GPU_FAMILIES = {
  'NC': { // NVIDIA Tesla K80, P40, P100
    'Standard_NC6': { gpuModel: 'Tesla K80', gpuCount: 1, vcpu: 6, ram: 56 },
    'Standard_NC12': { gpuModel: 'Tesla K80', gpuCount: 2, vcpu: 12, ram: 112 },
    'Standard_NC24': { gpuModel: 'Tesla K80', gpuCount: 4, vcpu: 24, ram: 224 },
    'Standard_NC6s_v2': { gpuModel: 'Tesla P100', gpuCount: 1, vcpu: 6, ram: 112 },
    'Standard_NC12s_v2': { gpuModel: 'Tesla P100', gpuCount: 2, vcpu: 12, ram: 224 },
    'Standard_NC24s_v2': { gpuModel: 'Tesla P100', gpuCount: 4, vcpu: 24, ram: 448 },
    'Standard_NC6s_v3': { gpuModel: 'Tesla V100', gpuCount: 1, vcpu: 6, ram: 112 },
    'Standard_NC12s_v3': { gpuModel: 'Tesla V100', gpuCount: 2, vcpu: 12, ram: 224 },
    'Standard_NC24s_v3': { gpuModel: 'Tesla V100', gpuCount: 4, vcpu: 24, ram: 448 }
  },
  'ND': { // NVIDIA Tesla P40
    'Standard_ND6s': { gpuModel: 'Tesla P40', gpuCount: 1, vcpu: 6, ram: 112 },
    'Standard_ND12s': { gpuModel: 'Tesla P40', gpuCount: 2, vcpu: 12, ram: 224 },
    'Standard_ND24s': { gpuModel: 'Tesla P40', gpuCount: 4, vcpu: 24, ram: 448 }
  },
  'NV': { // NVIDIA Tesla M60
    'Standard_NV6': { gpuModel: 'Tesla M60', gpuCount: 1, vcpu: 6, ram: 56 },
    'Standard_NV12': { gpuModel: 'Tesla M60', gpuCount: 2, vcpu: 12, ram: 112 },
    'Standard_NV24': { gpuModel: 'Tesla M60', gpuCount: 4, vcpu: 24, ram: 224 }
  },
  'NCv3': { // NVIDIA Tesla V100
    'Standard_NC6s_v3': { gpuModel: 'Tesla V100', gpuCount: 1, vcpu: 6, ram: 112 },
    'Standard_NC12s_v3': { gpuModel: 'Tesla V100', gpuCount: 2, vcpu: 12, ram: 224 },
    'Standard_NC24s_v3': { gpuModel: 'Tesla V100', gpuCount: 4, vcpu: 24, ram: 448 }
  },
  'NDv2': { // NVIDIA Tesla V100
    'Standard_ND40s_v2': { gpuModel: 'Tesla V100', gpuCount: 8, vcpu: 40, ram: 672 }
  },
  'NCasT4_v3': { // NVIDIA Tesla T4
    'Standard_NC4as_T4_v3': { gpuModel: 'Tesla T4', gpuCount: 1, vcpu: 4, ram: 28 },
    'Standard_NC8as_T4_v3': { gpuModel: 'Tesla T4', gpuCount: 1, vcpu: 8, ram: 56 },
    'Standard_NC16as_T4_v3': { gpuModel: 'Tesla T4', gpuCount: 1, vcpu: 16, ram: 110 },
    'Standard_NC64as_T4_v3': { gpuModel: 'Tesla T4', gpuCount: 4, vcpu: 64, ram: 440 }
  },
  'NCads_A100_v4': { // NVIDIA A100
    'Standard_NC24ads_A100_v4': { gpuModel: 'A100', gpuCount: 1, vcpu: 24, ram: 220 },
    'Standard_NC48ads_A100_v4': { gpuModel: 'A100', gpuCount: 2, vcpu: 48, ram: 440 },
    'Standard_NC96ads_A100_v4': { gpuModel: 'A100', gpuCount: 4, vcpu: 96, ram: 880 }
  }
}

// Azure 리전 매핑
const AZURE_REGION_MAPPING: Record<string, string> = {
  'eastus': 'East US',
  'eastus2': 'East US 2',
  'westus': 'West US',
  'westus2': 'West US 2',
  'westus3': 'West US 3',
  'centralus': 'Central US',
  'northcentralus': 'North Central US',
  'southcentralus': 'South Central US',
  'westcentralus': 'West Central US',
  'canadacentral': 'Canada Central',
  'canadaeast': 'Canada East',
  'brazilsouth': 'Brazil South',
  'northeurope': 'North Europe',
  'westeurope': 'West Europe',
  'uksouth': 'UK South',
  'ukwest': 'UK West',
  'francecentral': 'France Central',
  'germanywestcentral': 'Germany West Central',
  'norwayeast': 'Norway East',
  'switzerlandnorth': 'Switzerland North',
  'eastasia': 'East Asia',
  'southeastasia': 'Southeast Asia',
  'japaneast': 'Japan East',
  'japanwest': 'Japan West',
  'australiaeast': 'Australia East',
  'australiasoutheast': 'Australia Southeast',
  'centralindia': 'Central India',
  'southindia': 'South India',
  'westindia': 'West India',
  'koreacentral': 'Korea Central',
  'koreasouth': 'Korea South'
}

export class AzurePricingService {
  private readonly BASE_URL = 'https://prices.azure.com/api/retail/prices'
  private readonly GPU_SERVICE_NAME = 'Virtual Machines'

  constructor() {
    console.log('Azure Pricing Service initialized (REST API)')
  }

  /**
   * Azure GPU VM 가격 조회 (REST API)
   */
  async fetchGPUVMPrices(regions?: string[]): Promise<AzurePricingResponse> {
    try {
      const instances: AzureGPUInstance[] = []
      const gpuModels = new Set<string>()
      const processedRegions = new Set<string>()

      // GPU VM 관련 필터 생성
      const filters = [
        `serviceName eq '${this.GPU_SERVICE_NAME}'`,
        `priceType eq 'Consumption'`,
        `(contains(productName, 'NC') or contains(productName, 'ND') or contains(productName, 'NV'))`
      ]

      // 리전 필터 (선택적)
      if (regions && regions.length > 0) {
        const regionFilter = regions.map(region => `armRegionName eq '${region}'`).join(' or ')
        filters.push(`(${regionFilter})`)
      }

      const filterString = filters.join(' and ')
      
      // Azure Retail Prices API 호출
      const url = `${this.BASE_URL}?$filter=${encodeURIComponent(filterString)}&api-version=2023-01-01-preview`
      
      console.log('Fetching Azure prices from:', url)

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'GPU-Brokerage/1.0'
        }
      })

      if (!response.ok) {
        throw new Error(`Azure API request failed: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      if (!data.Items || !Array.isArray(data.Items)) {
        throw new Error('Invalid response format from Azure Pricing API')
      }

      // GPU VM 데이터 파싱
      for (const item of data.Items) {
        const vmInfo = this.parseAzureItem(item)
        if (vmInfo) {
          instances.push(vmInfo)
          if (vmInfo.gpuModel) {
            gpuModels.add(vmInfo.gpuModel)
          }
          processedRegions.add(vmInfo.location)
        }
      }

      // 중복 제거 및 정렬
      const uniqueInstances = this.removeDuplicateInstances(instances)

      return {
        success: true,
        data: {
          instances: uniqueInstances.sort((a, b) => a.pricePerHour - b.pricePerHour),
          totalCount: uniqueInstances.length,
          fetchedAt: new Date().toISOString(),
          currency: 'USD',
          regions: Array.from(processedRegions).sort(),
          gpuModels: Array.from(gpuModels).sort()
        }
      }

    } catch (error) {
      console.error('Azure pricing fetch error:', error)
      
      // API 실패 시 목업 데이터 반환
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Azure API 호출에 실패했습니다. 목업 데이터를 표시합니다.',
        ...this.getMockAzurePrices()
      }
    }
  }

  /**
   * Azure API 응답 아이템 파싱
   */
  private parseAzureItem(item: any): AzureGPUInstance | null {
    try {
      if (!item.productName || !item.skuName || !item.unitPrice) {
        return null
      }

      // VM 크기 추출
      const vmSize = this.extractVMSizeFromProduct(item.productName, item.skuName)
      if (!vmSize) {
        return null
      }

      // GPU 정보 매핑
      const gpuInfo = this.getGPUInfo(vmSize)

      return {
        vmSize,
        location: item.armRegionName || item.location || 'Unknown',
        meterName: item.meterName || item.skuName,
        meterSubCategory: item.productName,
        unit: item.unitOfMeasure || 'Hours',
        pricePerHour: parseFloat(item.unitPrice) || 0,
        currency: item.currencyCode || 'USD',
        effectiveDate: item.effectiveStartDate || new Date().toISOString(),
        ...gpuInfo
      }
    } catch (error) {
      console.error('Error parsing Azure item:', error)
      return null
    }
  }

  /**
   * 제품명과 SKU에서 VM 크기 추출
   */
  private extractVMSizeFromProduct(productName: string, skuName: string): string | null {
    // 일반적인 Azure VM 크기 패턴 매칭
    const patterns = [
      /Standard[_\s]([A-Z]+\d+[a-z]*(?:[_\s][A-Z0-9]+)*)/i,
      /(NC\d+[a-z]*[_\s]?[A-Z0-9]*)/i,
      /(ND\d+[a-z]*[_\s]?[A-Z0-9]*)/i,
      /(NV\d+[a-z]*[_\s]?[A-Z0-9]*)/i
    ]

    // 먼저 SKU에서 시도
    for (const pattern of patterns) {
      const match = skuName.match(pattern)
      if (match) {
        return `Standard_${match[1].replace(/\s/g, '_')}`
      }
    }

    // 다음 제품명에서 시도
    for (const pattern of patterns) {
      const match = productName.match(pattern)
      if (match) {
        return `Standard_${match[1].replace(/\s/g, '_')}`
      }
    }

    return null
  }

  /**
   * 중복 인스턴스 제거
   */
  private removeDuplicateInstances(instances: AzureGPUInstance[]): AzureGPUInstance[] {
    const seen = new Map<string, AzureGPUInstance>()
    
    for (const instance of instances) {
      const key = `${instance.vmSize}-${instance.location}`
      
      if (!seen.has(key) || seen.get(key)!.pricePerHour > instance.pricePerHour) {
        seen.set(key, instance)
      }
    }
    
    return Array.from(seen.values())
  }


  /**
   * VM 크기에서 GPU 정보 조회
   */
  private getGPUInfo(vmSize: string) {
    // 모든 GPU 패밀리에서 검색
    for (const [family, instances] of Object.entries(AZURE_GPU_FAMILIES)) {
      if (instances[vmSize]) {
        return instances[vmSize]
      }
    }

    // 기본값 반환
    return {
      gpuModel: 'Unknown',
      gpuCount: 1,
      vcpu: 4,
      ram: 28
    }
  }

  /**
   * 목업 Azure 가격 데이터
   */
  private getMockAzurePrices(): Partial<AzurePricingResponse> {
    const mockInstances: AzureGPUInstance[] = [
      {
        vmSize: 'Standard_NC4as_T4_v3',
        location: 'East US',
        meterName: 'NC4as T4 v3',
        meterSubCategory: 'NCasT4_v3 Series Virtual Machines',
        unit: 'Hours',
        pricePerHour: 0.526,
        currency: 'USD',
        effectiveDate: new Date().toISOString(),
        gpuModel: 'Tesla T4',
        gpuCount: 1,
        vcpu: 4,
        ram: 28
      },
      {
        vmSize: 'Standard_NC8as_T4_v3',
        location: 'East US',
        meterName: 'NC8as T4 v3',
        meterSubCategory: 'NCasT4_v3 Series Virtual Machines',
        unit: 'Hours',
        pricePerHour: 1.052,
        currency: 'USD',
        effectiveDate: new Date().toISOString(),
        gpuModel: 'Tesla T4',
        gpuCount: 1,
        vcpu: 8,
        ram: 56
      },
      {
        vmSize: 'Standard_NC24ads_A100_v4',
        location: 'East US',
        meterName: 'NC24ads A100 v4',
        meterSubCategory: 'NCads_A100_v4 Series Virtual Machines',
        unit: 'Hours',
        pricePerHour: 3.673,
        currency: 'USD',
        effectiveDate: new Date().toISOString(),
        gpuModel: 'A100',
        gpuCount: 1,
        vcpu: 24,
        ram: 220
      },
      {
        vmSize: 'Standard_NC6s_v3',
        location: 'West Europe',
        meterName: 'NC6s v3',
        meterSubCategory: 'NCv3 Series Virtual Machines',
        unit: 'Hours',
        pricePerHour: 3.168,
        currency: 'USD',
        effectiveDate: new Date().toISOString(),
        gpuModel: 'Tesla V100',
        gpuCount: 1,
        vcpu: 6,
        ram: 112
      },
      {
        vmSize: 'Standard_ND40s_v2',
        location: 'South Central US',
        meterName: 'ND40s v2',
        meterSubCategory: 'NDv2 Series Virtual Machines',
        unit: 'Hours',
        pricePerHour: 18.144,
        currency: 'USD',
        effectiveDate: new Date().toISOString(),
        gpuModel: 'Tesla V100',
        gpuCount: 8,
        vcpu: 40,
        ram: 672
      },
      {
        vmSize: 'Standard_NC16as_T4_v3',
        location: 'Korea Central',
        meterName: 'NC16as T4 v3',
        meterSubCategory: 'NCasT4_v3 Series Virtual Machines',
        unit: 'Hours',
        pricePerHour: 2.104,
        currency: 'USD',
        effectiveDate: new Date().toISOString(),
        gpuModel: 'Tesla T4',
        gpuCount: 1,
        vcpu: 16,
        ram: 110
      }
    ]

    return {
      data: {
        instances: mockInstances,
        totalCount: mockInstances.length,
        fetchedAt: new Date().toISOString(),
        currency: 'USD',
        regions: Array.from(new Set(mockInstances.map(i => i.location))).sort(),
        gpuModels: Array.from(new Set(mockInstances.map(i => i.gpuModel!))).sort()
      }
    }
  }

  /**
   * 특정 리전의 GPU VM 가격 조회
   */
  async fetchRegionGPUPrices(region: string): Promise<AzurePricingResponse> {
    const allPrices = await this.fetchGPUVMPrices()
    
    if (!allPrices.success || !allPrices.data) {
      return allPrices
    }

    const regionInstances = allPrices.data.instances.filter(
      instance => instance.location.toLowerCase().includes(region.toLowerCase())
    )

    return {
      success: true,
      data: {
        ...allPrices.data,
        instances: regionInstances,
        totalCount: regionInstances.length
      }
    }
  }

  /**
   * GPU 모델별 가격 조회
   */
  async fetchGPUModelPrices(gpuModel: string): Promise<AzurePricingResponse> {
    const allPrices = await this.fetchGPUVMPrices()
    
    if (!allPrices.success || !allPrices.data) {
      return allPrices
    }

    const modelInstances = allPrices.data.instances.filter(
      instance => instance.gpuModel?.toLowerCase().includes(gpuModel.toLowerCase())
    )

    return {
      success: true,
      data: {
        ...allPrices.data,
        instances: modelInstances,
        totalCount: modelInstances.length
      }
    }
  }
}

// 싱글톤 인스턴스
export const azurePricingService = new AzurePricingService()

// 유틸리티 함수
export const formatAzureVMSize = (vmSize: string): string => {
  return vmSize.replace('Standard_', '')
}

export const getAzureGPUFamilies = () => {
  return Object.keys(AZURE_GPU_FAMILIES)
}

export const getAzureRegions = () => {
  return Object.values(AZURE_REGION_MAPPING)
}
