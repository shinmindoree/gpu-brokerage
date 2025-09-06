"use client"

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2, TrendingUp, TrendingDown, Minus, ExternalLink } from "lucide-react"

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

interface ComparisonResponse {
  instances: ComparisonInstance[]
  analysis: {
    summary: {
      totalInstances: number
      priceRange: {
        min: number
        max: number
        currency: string
      }
      gpuCountRange: {
        min: number
        max: number
      }
    }
    recommendations: {
      bestValue: ComparisonInstance
      mostPowerful: ComparisonInstance
      cheapest: ComparisonInstance
    }
  }
  meta: {
    comparisonId: string
    currency: string
    generatedAt: string
    apiVersion: string
  }
}

async function fetchComparison(instanceIds: string[]): Promise<ComparisonResponse> {
  const response = await fetch('/api/instances/compare', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ instanceIds }),
  })

  if (!response.ok) {
    throw new Error('Failed to fetch comparison data')
  }

  return response.json()
}

export default function InstanceComparePage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [comparisonData, setComparisonData] = useState<ComparisonResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const instanceIdsParam = searchParams.get('ids')
  const instanceIds = instanceIdsParam?.split(',') || []

  useEffect(() => {
    if (!instanceIdsParam) {
      setError('비교할 인스턴스가 지정되지 않았습니다.')
      setLoading(false)
      return
    }

    if (instanceIds.length < 2) {
      setError('비교하려면 최소 2개의 인스턴스를 선택해야 합니다.')
      setLoading(false)
      return
    }

    if (instanceIds.length > 4) {
      setError('최대 4개의 인스턴스까지만 비교할 수 있습니다.')
      setLoading(false)
      return
    }

    const loadComparison = async () => {
      try {
        setLoading(true)
        setError(null)
        console.log('Fetching comparison for:', instanceIds)
        const data = await fetchComparison(instanceIds)
        console.log('Comparison data received:', data)
        setComparisonData(data)
      } catch (err) {
        console.error('Comparison fetch error:', err)
        setError(err instanceof Error ? err.message : 'Failed to load comparison')
      } finally {
        setLoading(false)
      }
    }

    loadComparison()
  }, [instanceIdsParam]) // instanceIds 대신 instanceIdsParam 사용

  const getProviderColor = (provider: string) => {
    switch (provider) {
      case 'AWS': return 'bg-orange-100 text-orange-800'
      case 'AZURE': return 'bg-blue-100 text-blue-800'
      case 'GCP': return 'bg-green-100 text-green-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatPrice = (price: number) => {
    return `$${price.toFixed(3)}`
  }

  const getInstanceDocumentationUrl = (provider: string, instanceName: string) => {
    switch (provider.toLowerCase()) {
      case 'aws':
        return `https://aws.amazon.com/ec2/instance-types/${instanceName.split('.')[0]}/`
      case 'azure':
        if (instanceName.includes('ND')) {
          return 'https://docs.microsoft.com/en-us/azure/virtual-machines/nd-series'
        }
        return 'https://docs.microsoft.com/en-us/azure/virtual-machines/sizes-gpu'
      case 'gcp':
        if (instanceName.startsWith('a3')) {
          return 'https://cloud.google.com/compute/docs/accelerator-optimized-machines#a3_vms'
        } else if (instanceName.startsWith('a2')) {
          return 'https://cloud.google.com/compute/docs/accelerator-optimized-machines#a2_vms'
        } else if (instanceName.startsWith('g2')) {
          return 'https://cloud.google.com/compute/docs/accelerator-optimized-machines#g2_vms'
        }
        return 'https://cloud.google.com/compute/docs/accelerator-optimized-machines'
      default:
        return '#'
    }
  }

  const getComparisonIcon = (current: number, best: number, isLowerBetter = true) => {
    if (Math.abs(current - best) < 0.001) {
      return <Badge variant="outline" className="text-green-600">최적</Badge>
    }
    
    const isBetter = isLowerBetter ? current < best : current > best
    return isBetter ? 
      <TrendingUp className="h-4 w-4 text-green-500" /> : 
      <TrendingDown className="h-4 w-4 text-red-500" />
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin mr-3" />
          <span className="text-lg">인스턴스 비교 데이터를 불러오는 중...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md text-center">
            <p className="text-red-800 mb-4">{error}</p>
            <div className="space-x-2">
              <Button variant="outline" onClick={() => router.back()}>
                돌아가기
              </Button>
              <Button onClick={() => window.location.reload()}>
                다시 시도
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!comparisonData) {
    return null
  }

  const { instances, analysis } = comparisonData

  return (
    <div className="container mx-auto p-6">
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex items-center space-x-4">
          <Button variant="outline" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            목록으로 돌아가기
          </Button>
          <div>
            <h1 className="text-3xl font-bold">GPU 인스턴스 비교</h1>
            <p className="text-muted-foreground">
              {instances.length}개 인스턴스의 상세 비교 분석
            </p>
          </div>
        </div>

        {/* 요약 정보 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">가격 범위</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatPrice(analysis.summary.priceRange.min)} - {formatPrice(analysis.summary.priceRange.max)}
              </div>
              <p className="text-xs text-muted-foreground">시간당 ({analysis.summary.priceRange.currency})</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">GPU 범위</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {analysis.summary.gpuCountRange.min} - {analysis.summary.gpuCountRange.max}개
              </div>
              <p className="text-xs text-muted-foreground">GPU 수</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">최고 가성비</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold">
                {analysis.recommendations.bestValue.instanceName}
              </div>
              <p className="text-xs text-muted-foreground">
                {formatPrice(analysis.recommendations.bestValue.pricing.pricePerGpu)}/GPU·h
              </p>
            </CardContent>
          </Card>
        </div>

        {/* 상세 비교 테이블 */}
        <Card>
          <CardHeader>
            <CardTitle>상세 비교</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">항목</TableHead>
                    {instances.map((instance) => (
                      <TableHead key={instance.id} className="text-center min-w-[200px]">
                        <div className="space-y-2">
                          <div className="flex items-center justify-center space-x-2">
                            <Badge className={getProviderColor(instance.provider)}>
                              {instance.provider}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const url = getInstanceDocumentationUrl(instance.provider, instance.instanceName)
                                if (url !== '#') {
                                  window.open(url, '_blank', 'noopener,noreferrer')
                                }
                              }}
                              title={`${instance.provider} 공식 문서 보기`}
                              className="h-6 w-6 p-0"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="font-mono text-sm">{instance.instanceName}</div>
                          <div className="text-xs text-muted-foreground">{instance.region}</div>
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* GPU 정보 */}
                  <TableRow>
                    <TableCell className="font-medium">GPU 모델</TableCell>
                    {instances.map((instance) => (
                      <TableCell key={instance.id} className="text-center">
                        <div className="font-medium">{instance.specs.gpuModel}</div>
                      </TableCell>
                    ))}
                  </TableRow>
                  
                  <TableRow>
                    <TableCell className="font-medium">GPU 수</TableCell>
                    {instances.map((instance) => (
                      <TableCell key={instance.id} className="text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <span className="font-medium">{instance.specs.gpuCount}개</span>
                          {getComparisonIcon(
                            instance.specs.gpuCount, 
                            analysis.summary.gpuCountRange.max, 
                            false
                          )}
                        </div>
                      </TableCell>
                    ))}
                  </TableRow>

                  <TableRow>
                    <TableCell className="font-medium">GPU 메모리</TableCell>
                    {instances.map((instance) => (
                      <TableCell key={instance.id} className="text-center">
                        <div>{instance.performance.totalGpuMemory}GB</div>
                        <div className="text-xs text-muted-foreground">
                          {instance.specs.gpuMemoryGB}GB × {instance.specs.gpuCount}
                        </div>
                      </TableCell>
                    ))}
                  </TableRow>

                  {/* 컴퓨팅 리소스 */}
                  <TableRow>
                    <TableCell className="font-medium">vCPU</TableCell>
                    {instances.map((instance) => (
                      <TableCell key={instance.id} className="text-center">
                        {instance.specs.vcpu}
                      </TableCell>
                    ))}
                  </TableRow>

                  <TableRow>
                    <TableCell className="font-medium">RAM</TableCell>
                    {instances.map((instance) => (
                      <TableCell key={instance.id} className="text-center">
                        {instance.specs.ramGB}GB
                      </TableCell>
                    ))}
                  </TableRow>

                  {/* 가격 정보 */}
                  <TableRow className="bg-muted/50">
                    <TableCell className="font-medium">시간당 가격</TableCell>
                    {instances.map((instance) => (
                      <TableCell key={instance.id} className="text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <span className="font-mono font-bold">
                            {formatPrice(instance.pricing.pricePerHour)}/h
                          </span>
                          {getComparisonIcon(
                            instance.pricing.pricePerHour, 
                            analysis.summary.priceRange.min
                          )}
                        </div>
                      </TableCell>
                    ))}
                  </TableRow>

                  <TableRow className="bg-muted/50">
                    <TableCell className="font-medium">GPU당 가격</TableCell>
                    {instances.map((instance) => (
                      <TableCell key={instance.id} className="text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <span className="font-mono font-bold text-green-600">
                            {formatPrice(instance.pricing.pricePerGpu)}/GPU·h
                          </span>
                          {instance.id === analysis.recommendations.bestValue.id && (
                            <Badge variant="outline" className="text-green-600">최고 가성비</Badge>
                          )}
                        </div>
                      </TableCell>
                    ))}
                  </TableRow>

                  {/* 성능 정보 */}
                  <TableRow>
                    <TableCell className="font-medium">컴퓨팅 성능</TableCell>
                    {instances.map((instance) => (
                      <TableCell key={instance.id} className="text-center">
                        <div>{instance.performance.computeCapability}</div>
                      </TableCell>
                    ))}
                  </TableRow>

                  <TableRow>
                    <TableCell className="font-medium">메모리 대역폭</TableCell>
                    {instances.map((instance) => (
                      <TableCell key={instance.id} className="text-center">
                        {instance.performance.memoryBandwidth}
                      </TableCell>
                    ))}
                  </TableRow>

                  <TableRow>
                    <TableCell className="font-medium">인터커넥트</TableCell>
                    {instances.map((instance) => (
                      <TableCell key={instance.id} className="text-center">
                        <Badge variant="secondary">{instance.performance.interconnectType}</Badge>
                      </TableCell>
                    ))}
                  </TableRow>

                  {/* 특성 */}
                  <TableRow>
                    <TableCell className="font-medium">특성</TableCell>
                    {instances.map((instance) => (
                      <TableCell key={instance.id} className="text-center">
                        <div className="flex flex-wrap gap-1 justify-center">
                          {instance.specs.nvlinkSupport && (
                            <Badge variant="outline" className="text-xs">NVLink</Badge>
                          )}
                          {instance.specs.migSupport && (
                            <Badge variant="outline" className="text-xs">MIG</Badge>
                          )}
                          {!instance.specs.nvlinkSupport && !instance.specs.migSupport && (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </div>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* 추천 사항 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-green-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-green-700">💰 최고 가성비</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-medium">{analysis.recommendations.bestValue.instanceName}</div>
              <div className="text-sm text-muted-foreground">
                {formatPrice(analysis.recommendations.bestValue.pricing.pricePerGpu)}/GPU·h
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-blue-700">🚀 최고 성능</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-medium">{analysis.recommendations.mostPowerful.instanceName}</div>
              <div className="text-sm text-muted-foreground">
                {analysis.recommendations.mostPowerful.specs.gpuCount}개 GPU
              </div>
            </CardContent>
          </Card>

          <Card className="border-orange-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-orange-700">💸 최저 가격</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-medium">{analysis.recommendations.cheapest.instanceName}</div>
              <div className="text-sm text-muted-foreground">
                {formatPrice(analysis.recommendations.cheapest.pricing.pricePerHour)}/h
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 하단 정보 */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>※ 가격은 온디맨드 기준이며, 예고 없이 변경될 수 있습니다.</p>
          <p>※ 성능 지표는 추정값이며, 실제 워크로드에서 차이가 있을 수 있습니다.</p>
          <p>※ 비교 ID: {comparisonData.meta.comparisonId}</p>
        </div>
      </div>
    </div>
  )
}
