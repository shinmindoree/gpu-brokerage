import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import fs from 'fs/promises'
import path from 'path'

// 인메모리 캐시 구조
interface CachedInstanceData {
  data: InstanceData[]
  lastUpdated: number
  ttl: number // Time to live in milliseconds
}

// 캐시 저장소
const instanceCache = new Map<string, CachedInstanceData>()
const CACHE_TTL = 5 * 60 * 1000 // 5분 캐시

// 요청 파라미터 스키마
const instancesQuerySchema = z.object({
  provider: z.string().optional(),
  region: z.string().optional(),
  gpuModel: z.string().optional(),
  sortBy: z.enum(['pricePerHour', 'pricePerGpu', 'gpuCount', 'vcpu', 'ramGB']).optional().default('pricePerGpu'),
  sortDirection: z.enum(['asc', 'desc']).optional().default('asc'),
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(1000).optional().default(50),
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
    
    // GCP 가격 가져오기
    try {
      const gcpResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/admin/sync-gcp-prices`)
      const gcpData = await gcpResponse.json()
      
      // GCP 가격 추가
      if (gcpData.success && gcpData.data?.instances) {
        for (const instance of gcpData.data.instances) {
          const instanceId = `gcp-${instance.machineType.toLowerCase()}-${instance.region.toLowerCase()}`
          combinedPrices[instanceId] = {
            pricePerHour: instance.pricePerHour,
            currency: instance.currency || 'USD',
            lastUpdated: instance.effectiveDate || new Date().toISOString()
          }
        }
      }
    } catch (gcpError) {
      console.warn('Failed to fetch GCP prices:', gcpError)
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

// Helper functions for Azure GPU info
function getGPUMemorySize(gpuModel: string): number {
  switch (gpuModel) {
    case 'H100': return 80
    case 'A100': return 80
    case 'Tesla V100': return 32
    case 'Tesla T4': return 16
    case 'Tesla P100': return 16
    case 'Tesla P40': return 24
    case 'Tesla K80': return 24
    case 'Tesla M60': return 8
    case 'A10': return 24
    case 'Radeon MI25': return 16
    default: return 16
  }
}

function getInterconnectType(gpuModel: string): string {
  switch (gpuModel) {
    case 'H100':
    case 'A100':
    case 'Tesla V100':
      return 'NVLink'
    default:
      return 'PCIe'
  }
}

function hasNVLinkSupport(gpuModel: string): boolean {
  return ['H100', 'A100', 'Tesla V100'].includes(gpuModel)
}

// 캐시된 인스턴스 데이터 로드 함수
async function getCachedInstances(): Promise<InstanceData[]> {
  const cacheKey = 'all_instances'
  const cached = instanceCache.get(cacheKey)
  const now = Date.now()

  // 캐시가 유효한 경우 반환
  if (cached && (now - cached.lastUpdated) < cached.ttl) {
    console.log('Using cached instance data')
    return cached.data
  }

  console.log('Loading fresh instance data...')
  
  // 모든 인스턴스 데이터 생성
  const allInstances: InstanceData[] = []
  
  // 세 개의 API를 병렬로 호출하여 성능 개선
  const [awsData, azureData, gcpData] = await Promise.allSettled([
    fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/admin/sync-aws-prices?dryRun=true`).then(r => r.json()),
    fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/admin/sync-azure-prices?dryRun=true`).then(r => r.json()),
    fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/admin/sync-gcp-prices?dryRun=true`).then(r => r.json())
  ])

  // AWS 인스턴스 추가
  if (awsData.status === 'fulfilled' && awsData.value.success && awsData.value.data?.instances) {
    for (const awsInstance of awsData.value.data.instances) {
      const instanceId = `aws-${awsInstance.instanceType.toLowerCase()}-${awsInstance.region.toLowerCase().replace(/\s+/g, '-')}`
      
      const specs: InstanceSpecs = {
        family: awsInstance.instanceType.split('.')[0] || 'Unknown',
        gpuModel: awsInstance.gpuModel || 'Unknown',
        gpuCount: awsInstance.gpuCount || 1,
        gpuMemoryGB: getGPUMemorySize(awsInstance.gpuModel),
        vcpu: awsInstance.vcpu || 4,
        ramGB: awsInstance.memory || 28,
        localSsdGB: 0,
        interconnect: getInterconnectType(awsInstance.gpuModel),
        networkPerformance: 'High',
        nvlinkSupport: hasNVLinkSupport(awsInstance.gpuModel),
        migSupport: awsInstance.gpuModel === 'A100' || awsInstance.gpuModel === 'H100'
      }

      allInstances.push({
        id: instanceId,
        provider: 'AWS',
        region: awsInstance.region || 'Unknown',
        instanceName: awsInstance.instanceType || 'Unknown',
        specs,
        pricePerHour: awsInstance.pricePerHour || 0,
        pricePerGpu: (awsInstance.pricePerHour || 0) / specs.gpuCount,
        currency: awsInstance.currency || 'USD',
        lastUpdated: awsInstance.lastUpdated || new Date().toISOString()
      })
    }
  }

  // Azure 인스턴스 추가
  if (azureData.status === 'fulfilled' && azureData.value.success && azureData.value.data?.instances) {
    for (const azureInstance of azureData.value.data.instances) {
      const instanceId = `azure-${azureInstance.vmSize.toLowerCase()}-${azureInstance.location.toLowerCase().replace(/\s+/g, '-')}`
      
      const specs: InstanceSpecs = {
        family: azureInstance.vmSize ? azureInstance.vmSize.split('_')[1] || 'Unknown' : 'Unknown',
        gpuModel: azureInstance.gpuModel || 'Unknown',
        gpuCount: azureInstance.gpuCount || 1,
        gpuMemoryGB: getGPUMemorySize(azureInstance.gpuModel),
        vcpu: azureInstance.vcpu || 4,
        ramGB: azureInstance.ram || 28,
        localSsdGB: 0,
        interconnect: getInterconnectType(azureInstance.gpuModel),
        networkPerformance: 'High',
        nvlinkSupport: hasNVLinkSupport(azureInstance.gpuModel),
        migSupport: azureInstance.gpuModel === 'A100' || azureInstance.gpuModel === 'H100'
      }

      allInstances.push({
        id: instanceId,
        provider: 'AZURE',
        region: azureInstance.location || 'Unknown',
        instanceName: azureInstance.vmSize || 'Unknown',
        specs,
        pricePerHour: azureInstance.pricePerHour || 0,
        pricePerGpu: (azureInstance.pricePerHour || 0) / specs.gpuCount,
        currency: azureInstance.currency || 'USD',
        lastUpdated: azureInstance.effectiveDate || new Date().toISOString()
      })
    }
  }

  // GCP 인스턴스 추가 (중복 제거)
  if (gcpData.status === 'fulfilled' && gcpData.value.success && gcpData.value.data?.instances) {
    const gcpInstancesMap = new Map()
    
    for (const gcpInstance of gcpData.value.data.instances) {
      const instanceId = `gcp-${gcpInstance.machineType.toLowerCase()}-${gcpInstance.region.toLowerCase()}`
      
      // 중복 제거: 같은 instanceId가 이미 있으면 건너뛰기
      if (gcpInstancesMap.has(instanceId)) {
        continue
      }
      
      const specs: InstanceSpecs = {
        family: gcpInstance.machineType.split('-')[0] || 'Unknown',
        gpuModel: gcpInstance.gpuModel || 'Unknown',
        gpuCount: gcpInstance.gpuCount || 1,
        gpuMemoryGB: getGPUMemorySize(gcpInstance.gpuModel),
        vcpu: gcpInstance.vcpu || 4,
        ramGB: gcpInstance.memory || 28,
        localSsdGB: 0,
        interconnect: getInterconnectType(gcpInstance.gpuModel),
        networkPerformance: 'High',
        nvlinkSupport: hasNVLinkSupport(gcpInstance.gpuModel),
        migSupport: gcpInstance.gpuModel === 'A100' || gcpInstance.gpuModel === 'H100'
      }

      const instanceData = {
        id: instanceId,
        provider: 'GCP',
        region: gcpInstance.region || 'Unknown',
        instanceName: gcpInstance.machineType || 'Unknown',
        specs,
        pricePerHour: gcpInstance.pricePerHour || 0,
        pricePerGpu: (gcpInstance.pricePerHour || 0) / specs.gpuCount,
        currency: gcpInstance.currency || 'USD',
        lastUpdated: gcpInstance.effectiveDate || new Date().toISOString()
      }

      gcpInstancesMap.set(instanceId, instanceData)
      allInstances.push(instanceData)
    }
  }

  // 캐시에 저장
  instanceCache.set(cacheKey, {
    data: allInstances,
    lastUpdated: now,
    ttl: CACHE_TTL
  })

  console.log(`Loaded ${allInstances.length} instances into cache`)
  return allInstances
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

    // 캐시된 인스턴스 데이터 로드
    const allInstances = await getCachedInstances()


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

// 캐시 무효화 API (POST 요청)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    if (body.action === 'invalidateCache') {
      instanceCache.clear()
      return NextResponse.json({ 
        success: true, 
        message: 'Instance cache cleared successfully' 
      })
    }
    
    return NextResponse.json({ 
      success: false, 
      message: 'Invalid action' 
    }, { status: 400 })
    
  } catch (error) {
    console.error('Cache invalidation error:', error)
    return NextResponse.json({ 
      success: false, 
      message: 'Failed to invalidate cache',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
