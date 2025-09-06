import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import fs from 'fs/promises'
import path from 'path'

// 요청 스키마
const compareRequestSchema = z.object({
  instanceIds: z.array(z.string()).min(2).max(4)
})

// 인스턴스 스펙 타입
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

interface ComparisonInstance {
  id: string
  provider: string
  region: string
  instanceName: string
  specs: InstanceSpecs
  pricing: {
    pricePerHour: number
    pricePerGpu: number
    pricePerVcpu: number
    pricePerRamGB: number
    currency: string
  }
  performance: {
    totalGpuMemory: number
    memoryBandwidth: string
    interconnectType: string
    computeCapability: string
  }
  costEfficiency: {
    pricePerformanceRatio: number
    memoryPriceRatio: number
    vcpuPriceRatio: number
  }
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

function parseInstanceId(instanceId: string): { provider: string; instanceName: string } {
  const [provider, ...nameParts] = instanceId.split('-')
  return {
    provider: provider.toLowerCase(),
    instanceName: nameParts.join('-')
  }
}

function calculatePerformanceMetrics(specs: InstanceSpecs): {
  totalGpuMemory: number
  memoryBandwidth: string
  interconnectType: string
  computeCapability: string
} {
  const totalGpuMemory = specs.gpuCount * specs.gpuMemoryGB
  
  // GPU 모델별 메모리 대역폭 (추정값)
  const memoryBandwidthMap: Record<string, string> = {
    'H100': '3.35 TB/s',
    'A100': '1.93 TB/s',
    'A10G': '600 GB/s',
    'V100': '900 GB/s',
    'L4': '300 GB/s'
  }
  
  // GPU 모델별 컴퓨팅 성능 (추정값)
  const computeCapabilityMap: Record<string, string> = {
    'H100': '165 TFLOPS (BF16)',
    'A100': '77 TFLOPS (BF16)',
    'A10G': '31.2 TFLOPS (FP16)',
    'V100': '28 TFLOPS (FP16)',
    'L4': '30.3 TFLOPS (FP16)'
  }
  
  return {
    totalGpuMemory,
    memoryBandwidth: memoryBandwidthMap[specs.gpuModel] || 'Unknown',
    interconnectType: specs.interconnect,
    computeCapability: computeCapabilityMap[specs.gpuModel] || 'Unknown'
  }
}

function calculateCostEfficiency(
  pricePerHour: number,
  specs: InstanceSpecs
): {
  pricePerformanceRatio: number
  memoryPriceRatio: number
  vcpuPriceRatio: number
} {
  const totalGpuMemory = specs.gpuCount * specs.gpuMemoryGB
  
  return {
    pricePerformanceRatio: pricePerHour / specs.gpuCount, // Price per GPU unit
    memoryPriceRatio: pricePerHour / totalGpuMemory, // Price per GB GPU memory
    vcpuPriceRatio: pricePerHour / specs.vcpu // Price per vCPU
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { instanceIds } = compareRequestSchema.parse(body)

    // 인스턴스 스펙 데이터 로드
    const specsData = await loadInstanceSpecs()
    
    const comparisonData: ComparisonInstance[] = []
    const notFoundInstances: string[] = []

    for (const instanceId of instanceIds) {
      const { provider, instanceName } = parseInstanceId(instanceId)
      const specs = specsData[provider]?.[instanceName]
      const priceData = mockPrices[instanceId]

      if (!specs || !priceData) {
        notFoundInstances.push(instanceId)
        continue
      }

      const pricePerHour = priceData.pricePerHour
      const pricePerGpu = pricePerHour / specs.gpuCount
      const pricePerVcpu = pricePerHour / specs.vcpu
      const pricePerRamGB = pricePerHour / specs.ramGB

      const performance = calculatePerformanceMetrics(specs)
      const costEfficiency = calculateCostEfficiency(pricePerHour, specs)

      comparisonData.push({
        id: instanceId,
        provider: provider.toUpperCase(),
        region: priceData.region,
        instanceName,
        specs,
        pricing: {
          pricePerHour,
          pricePerGpu,
          pricePerVcpu,
          pricePerRamGB,
          currency: priceData.currency
        },
        performance,
        costEfficiency,
        lastUpdated: new Date().toISOString()
      })
    }

    if (notFoundInstances.length > 0) {
      return NextResponse.json(
        {
          error: 'Some instances not found',
          notFoundInstances,
          message: `The following instances could not be found: ${notFoundInstances.join(', ')}`
        },
        { status: 404 }
      )
    }

    if (comparisonData.length < 2) {
      return NextResponse.json(
        {
          error: 'Insufficient instances for comparison',
          message: 'At least 2 valid instances are required for comparison'
        },
        { status: 400 }
      )
    }

    // 비교 분석 생성
    const analysis = {
      summary: {
        totalInstances: comparisonData.length,
        priceRange: {
          min: Math.min(...comparisonData.map(i => i.pricing.pricePerHour)),
          max: Math.max(...comparisonData.map(i => i.pricing.pricePerHour)),
          currency: comparisonData[0].pricing.currency
        },
        gpuCountRange: {
          min: Math.min(...comparisonData.map(i => i.specs.gpuCount)),
          max: Math.max(...comparisonData.map(i => i.specs.gpuCount))
        }
      },
      recommendations: {
        bestValue: comparisonData.reduce((best, current) => 
          current.costEfficiency.pricePerformanceRatio < best.costEfficiency.pricePerformanceRatio ? current : best
        ),
        mostPowerful: comparisonData.reduce((most, current) => 
          current.specs.gpuCount > most.specs.gpuCount ? current : most
        ),
        cheapest: comparisonData.reduce((cheapest, current) => 
          current.pricing.pricePerHour < cheapest.pricing.pricePerHour ? current : cheapest
        )
      }
    }

    const response = {
      instances: comparisonData,
      analysis,
      meta: {
        comparisonId: `cmp_${Date.now()}`,
        currency: 'USD',
        generatedAt: new Date().toISOString(),
        apiVersion: '1.0.0'
      }
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('Comparison API Error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Invalid request body', 
          details: error.errors 
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: 'Failed to compare instances'
      },
      { status: 500 }
    )
  }
}

// GET 메서드로도 비교 가능 (URL 파라미터 사용)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const instanceIds = searchParams.get('ids')?.split(',') || []

    if (instanceIds.length < 2 || instanceIds.length > 4) {
      return NextResponse.json(
        {
          error: 'Invalid instance IDs',
          message: 'Please provide 2-4 instance IDs separated by commas'
        },
        { status: 400 }
      )
    }

    // POST 메서드와 동일한 로직 재사용
    const mockRequest = new NextRequest(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify({ instanceIds })
    })

    return await POST(mockRequest)

  } catch (error) {
    console.error('Comparison GET API Error:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: 'Failed to compare instances'
      },
      { status: 500 }
    )
  }
}
