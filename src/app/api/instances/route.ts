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

// 가격 데이터 (실제로는 DB에서 가져와야 함)
const mockPrices: Record<string, { pricePerHour: number; currency: string; region: string }> = {
  // AWS
  'aws-p5d.24xlarge': { pricePerHour: 98.32, currency: 'USD', region: 'ap-northeast-2' },
  'aws-p4d.24xlarge': { pricePerHour: 32.77, currency: 'USD', region: 'ap-northeast-2' },
  'aws-g5.xlarge': { pricePerHour: 1.006, currency: 'USD', region: 'ap-northeast-2' },
  'aws-g5.2xlarge': { pricePerHour: 1.89, currency: 'USD', region: 'ap-northeast-2' },
  
  // Azure
  'azure-Standard_ND_H100_v5': { pricePerHour: 89.76, currency: 'USD', region: 'koreacentral' },
  'azure-Standard_ND96amsr_A100_v4': { pricePerHour: 27.20, currency: 'USD', region: 'koreacentral' },
  'azure-Standard_ND40rs_v2': { pricePerHour: 19.44, currency: 'USD', region: 'koreacentral' },
  
  // GCP
  'gcp-a3-highgpu-8g': { pricePerHour: 91.45, currency: 'USD', region: 'asia-northeast1' },
  'gcp-a2-highgpu-8g': { pricePerHour: 29.89, currency: 'USD', region: 'asia-northeast1' },
  'gcp-g2-standard-4': { pricePerHour: 0.736, currency: 'USD', region: 'asia-northeast1' }
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

    // 인스턴스 스펙 데이터 로드
    const specsData = await loadInstanceSpecs()
    
    // 모든 인스턴스 데이터 생성
    const allInstances: InstanceData[] = []
    
    for (const [provider, instances] of Object.entries(specsData)) {
      for (const [instanceName, specs] of Object.entries(instances)) {
        const instanceId = generateInstanceId(provider, instanceName)
        const priceData = mockPrices[instanceId]
        
        if (priceData) {
          allInstances.push({
            id: instanceId,
            provider: provider.toUpperCase(),
            region: priceData.region,
            instanceName,
            specs,
            pricePerHour: priceData.pricePerHour,
            pricePerGpu: priceData.pricePerHour / specs.gpuCount,
            currency: priceData.currency,
            lastUpdated: new Date().toISOString()
          })
        }
      }
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
