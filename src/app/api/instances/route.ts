import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import fs from 'fs/promises'
import path from 'path'

// 요청 파라미터 스키마
const instancesQuerySchema = z.object({
  provider: z.string().optional(),
  region: z.string().optional(),
  gpuModel: z.string().optional(),
  sortBy: z.enum(['pricePerHour', 'pricePerGpu', 'gpuCount', 'vcpu', 'ramGB']).optional().default('pricePerGpu'),
  sortDirection: z.enum(['asc', 'desc']).optional().default('asc'),
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  search: z.string().optional()
})

// 인스턴스 데이터 타입
interface InstanceSpecs {
  family: string
  gpuModel: string
  gpuCount: number
  gpuMemoryGB: number
  vcpu: number
  ramGB: number
  localSsdGB: number
  interconnect: string
  networkPerformance: string
  nvlinkSupport: boolean
  migSupport: boolean
}

interface InstanceData {
  id: string
  provider: string
  region: string
  instanceName: string
  specs: InstanceSpecs
  pricePerHour: number
  pricePerGpu: number
  currency: string
  lastUpdated: string
}

// 동적 가격 데이터 가져오기 (AWS + Azure)
async function getCurrentPrices(): Promise<Record<string, { pricePerHour: number; currency: string; lastUpdated: string }>> {
  try {
    // 기존 AWS 가격 가져오기
    const awsResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/admin/prices`)
    const awsData = await awsResponse.json()
    
    // Azure 가격 가져오기
    const azureResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/admin/sync-azure-prices`)
    const azureData = await azureResponse.json()
    
    const combinedPrices: Record<string, { pricePerHour: number; currency: string; lastUpdated: string }> = {}
    
    // AWS 가격 추가
    if (awsData.prices) {
      Object.assign(combinedPrices, awsData.prices)
    }
    
    // Azure 가격 추가
    if (azureData.success && azureData.data?.instances) {
      for (const instance of azureData.data.instances) {
        const instanceId = `azure-${instance.vmSize.toLowerCase()}-${instance.location.toLowerCase().replace(/\s+/g, '-')}`
        combinedPrices[instanceId] = {
          pricePerHour: instance.pricePerHour,
          currency: instance.currency || 'USD',
          lastUpdated: instance.effectiveDate || new Date().toISOString()
        }
      }
    }
    
    return combinedPrices
  } catch (error) {
    console.error('Failed to fetch current prices:', error)
    // 폴백 데이터
    return {
      'aws-p5d.24xlarge': { pricePerHour: 98.32, currency: 'USD', lastUpdated: new Date().toISOString() },
      'aws-p4d.24xlarge': { pricePerHour: 32.77, currency: 'USD', lastUpdated: new Date().toISOString() },
      'aws-g5.xlarge': { pricePerHour: 1.006, currency: 'USD', lastUpdated: new Date().toISOString() },
      'aws-g5.2xlarge': { pricePerHour: 1.89, currency: 'USD', lastUpdated: new Date().toISOString() },
      'azure-Standard_ND_H100_v5': { pricePerHour: 89.76, currency: 'USD', lastUpdated: new Date().toISOString() },
      'azure-Standard_ND96amsr_A100_v4': { pricePerHour: 27.20, currency: 'USD', lastUpdated: new Date().toISOString() },
      'azure-Standard_ND40rs_v2': { pricePerHour: 19.44, currency: 'USD', lastUpdated: new Date().toISOString() },
      'gcp-a3-highgpu-8g': { pricePerHour: 91.45, currency: 'USD', lastUpdated: new Date().toISOString() },
      'gcp-a2-highgpu-8g': { pricePerHour: 29.89, currency: 'USD', lastUpdated: new Date().toISOString() },
      'gcp-g2-standard-4': { pricePerHour: 0.736, currency: 'USD', lastUpdated: new Date().toISOString() }
    }
  }
}

// 리전 매핑
const regionMapping: Record<string, string> = {
  'aws-p5d.24xlarge': 'ap-northeast-2',
  'aws-p4d.24xlarge': 'ap-northeast-2',
  'aws-g5.xlarge': 'ap-northeast-2',
  'aws-g5.2xlarge': 'ap-northeast-2',
  'azure-Standard_ND_H100_v5': 'koreacentral',
  'azure-Standard_ND96amsr_A100_v4': 'koreacentral',
  'azure-Standard_ND40rs_v2': 'koreacentral',
  'gcp-a3-highgpu-8g': 'asia-northeast1',
  'gcp-a2-highgpu-8g': 'asia-northeast1',
  'gcp-g2-standard-4': 'asia-northeast1'
}

async function loadInstanceSpecs(): Promise<Record<string, Record<string, InstanceSpecs>>> {
  try {
    const dataPath = path.join(process.cwd(), 'data', 'instance-specs.json')
    const data = await fs.readFile(dataPath, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    console.error('Failed to load instance specs:', error)
    return {}
  }
}

function generateInstanceId(provider: string, instanceName: string): string {
  return `${provider.toLowerCase()}-${instanceName}`
}

export async function GET(request: NextRequest) {
  try {
    // URL 파라미터 파싱
    const { searchParams } = new URL(request.url)
    const queryParams = {
      provider: searchParams.get('provider') || undefined,
      region: searchParams.get('region') || undefined,
      gpuModel: searchParams.get('gpuModel') || undefined,
      sortBy: searchParams.get('sortBy') || undefined,
      sortDirection: searchParams.get('sortDirection') || undefined,
      page: searchParams.get('page') || undefined,
      limit: searchParams.get('limit') || undefined,
      search: searchParams.get('search') || undefined
    }

    // 파라미터 검증
    const validatedParams = instancesQuerySchema.parse(queryParams)

    // 인스턴스 스펙 및 가격 데이터 로드
    const [specsData, currentPrices] = await Promise.all([
      loadInstanceSpecs(),
      getCurrentPrices()
    ])
    
    // 모든 인스턴스 데이터 생성
    const allInstances: InstanceData[] = []
    
    // 기존 specs 파일에서 인스턴스 생성 (AWS, GCP)
    for (const [provider, instances] of Object.entries(specsData)) {
      for (const [instanceName, specs] of Object.entries(instances)) {
        const instanceId = generateInstanceId(provider, instanceName)
        const priceData = currentPrices[instanceId]
        const region = regionMapping[instanceId]
        
        if (priceData && region) {
          allInstances.push({
            id: instanceId,
            provider: provider.toUpperCase(),
            region,
            instanceName,
            specs,
            pricePerHour: priceData.pricePerHour,
            pricePerGpu: priceData.pricePerHour / specs.gpuCount,
            currency: priceData.currency,
            lastUpdated: priceData.lastUpdated
          })
        }
      }
    }

    // Azure 인스턴스 추가 (동적 데이터)
    try {
      const azureResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/admin/sync-azure-prices`)
      const azureData = await azureResponse.json()
      
      if (azureData.success && azureData.data?.instances) {
        for (const azureInstance of azureData.data.instances) {
          const instanceId = `azure-${azureInstance.vmSize.toLowerCase()}-${azureInstance.location.toLowerCase().replace(/\s+/g, '-')}`
          
          // Azure 인스턴스를 표준 포맷으로 변환
          const specs: InstanceSpecs = {
            family: azureInstance.vmSize.split('_')[1] || 'Unknown',
            gpuModel: azureInstance.gpuModel || 'Unknown',
            gpuCount: azureInstance.gpuCount || 1,
            gpuMemoryGB: azureInstance.gpuModel === 'A100' ? 80 : 
                        azureInstance.gpuModel === 'Tesla V100' ? 32 :
                        azureInstance.gpuModel === 'Tesla T4' ? 16 : 16,
            vcpu: azureInstance.vcpu || 4,
            ramGB: azureInstance.ram || 28,
            localSsdGB: 0, // Azure는 별도 디스크
            interconnect: azureInstance.gpuModel === 'A100' ? 'NVLink' : 
                         azureInstance.gpuModel === 'Tesla V100' ? 'NVLink' : 'PCIe',
            networkPerformance: 'High',
            nvlinkSupport: azureInstance.gpuModel === 'A100' || azureInstance.gpuModel === 'Tesla V100',
            migSupport: azureInstance.gpuModel === 'A100'
          }

          allInstances.push({
            id: instanceId,
            provider: 'AZURE',
            region: azureInstance.location,
            instanceName: azureInstance.vmSize,
            specs,
            pricePerHour: azureInstance.pricePerHour,
            pricePerGpu: azureInstance.pricePerHour / specs.gpuCount,
            currency: azureInstance.currency || 'USD',
            lastUpdated: azureInstance.effectiveDate || new Date().toISOString()
          })
        }
      }
    } catch (error) {
      console.error('Failed to load Azure instances:', error)
    }

    // 필터링
    let filteredInstances = allInstances.filter(instance => {
      const matchesProvider = !validatedParams.provider || 
        instance.provider.toLowerCase() === validatedParams.provider.toLowerCase()
      
      const matchesRegion = !validatedParams.region || 
        instance.region === validatedParams.region
      
      const matchesGpuModel = !validatedParams.gpuModel || 
        instance.specs.gpuModel === validatedParams.gpuModel
      
      const matchesSearch = !validatedParams.search || 
        instance.instanceName.toLowerCase().includes(validatedParams.search.toLowerCase()) ||
        instance.specs.gpuModel.toLowerCase().includes(validatedParams.search.toLowerCase())
      
      return matchesProvider && matchesRegion && matchesGpuModel && matchesSearch
    })

    // 정렬
    filteredInstances.sort((a, b) => {
      let aValue: number
      let bValue: number

      switch (validatedParams.sortBy) {
        case 'pricePerHour':
          aValue = a.pricePerHour
          bValue = b.pricePerHour
          break
        case 'pricePerGpu':
          aValue = a.pricePerGpu
          bValue = b.pricePerGpu
          break
        case 'gpuCount':
          aValue = a.specs.gpuCount
          bValue = b.specs.gpuCount
          break
        case 'vcpu':
          aValue = a.specs.vcpu
          bValue = b.specs.vcpu
          break
        case 'ramGB':
          aValue = a.specs.ramGB
          bValue = b.specs.ramGB
          break
        default:
          aValue = a.pricePerGpu
          bValue = b.pricePerGpu
      }

      if (validatedParams.sortDirection === 'desc') {
        return bValue - aValue
      }
      return aValue - bValue
    })

    // 페이지네이션
    const total = filteredInstances.length
    const totalPages = Math.ceil(total / validatedParams.limit)
    const offset = (validatedParams.page - 1) * validatedParams.limit
    const paginatedInstances = filteredInstances.slice(offset, offset + validatedParams.limit)

    // 고유 값들 추출 (필터링용)
    const uniqueProviders = Array.from(new Set(allInstances.map(i => i.provider)))
    const uniqueRegions = Array.from(new Set(allInstances.map(i => i.region)))
    const uniqueGpuModels = Array.from(new Set(allInstances.map(i => i.specs.gpuModel)))

    // 응답 데이터
    const response = {
      instances: paginatedInstances,
      pagination: {
        page: validatedParams.page,
        limit: validatedParams.limit,
        total,
        totalPages,
        hasNext: validatedParams.page < totalPages,
        hasPrev: validatedParams.page > 1
      },
      filters: {
        providers: uniqueProviders,
        regions: uniqueRegions,
        gpuModels: uniqueGpuModels
      },
      meta: {
        currency: 'USD',
        lastUpdated: new Date().toISOString(),
        apiVersion: '1.0.0'
      }
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('API Error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Invalid query parameters', 
          details: error.errors 
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: 'Failed to fetch instances'
      },
      { status: 500 }
    )
  }
}
