"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SimpleSelect, SimpleSelectItem } from "@/components/ui/simple-select"
import { Input } from "@/components/ui/input"
import { Search, Filter, ArrowUpDown, ExternalLink, Loader2, RefreshCw, CheckCircle, AlertTriangle, XCircle, Home, Lightbulb } from "lucide-react"
import Link from "next/link"

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

interface CapacityScoreData {
  region: string
  vmSize: string
  score: number
  label: 'AVAILABLE' | 'LIMITED' | 'UNAVAILABLE'
  confidence: number
  calculatedAt: string
}

interface ApiResponse {
  instances: InstanceData[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
  filters: {
    providers: string[]
    regions: string[]
    gpuModels: string[]
  }
  meta: {
    currency: string
    lastUpdated: string
    apiVersion: string
  }
}

interface ExchangeRateData {
  success: boolean
  from: string
  to: string
  rate: number
  lastUpdated: string
  source: string
}

async function fetchInstances(params: {
  provider?: string
  region?: string
  gpuModel?: string
  sortBy?: string
  sortDirection?: string
  page?: number
  limit?: number
  search?: string
}): Promise<ApiResponse> {
  const searchParams = new URLSearchParams()
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== 'all') {
      searchParams.append(key, value.toString())
    }
  })

  const response = await fetch(`/api/instances?${searchParams.toString()}`)
  
  if (!response.ok) {
    throw new Error('Failed to fetch instances')
  }
  
  return response.json()
}

async function fetchExchangeRate(): Promise<ExchangeRateData> {
  const response = await fetch('/api/exchange-rates')
  
  if (!response.ok) {
    throw new Error('Failed to fetch exchange rate')
  }
  
  return response.json()
}

async function fetchCapacityScores(): Promise<CapacityScoreData[]> {
  try {
    const response = await fetch('/api/azure/capacity-scores?limit=50')
    
    if (!response.ok) {
      throw new Error('Failed to fetch capacity scores')
    }
    
    const data = await response.json()
    return data.success ? data.data.scores : []
  } catch (error) {
    console.error('Failed to fetch capacity scores:', error)
    return []
  }
}

type SortField = 'pricePerHour' | 'pricePerGpu' | 'gpuCount' | 'vcpu' | 'ramGB'
type SortDirection = 'asc' | 'desc'
type Currency = 'USD' | 'KRW'

export default function InstancesPage() {
  const router = useRouter()
  const [apiData, setApiData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProvider, setSelectedProvider] = useState<string>('all')
  const [selectedRegion, setSelectedRegion] = useState<string>('all')
  const [selectedGpuModel, setSelectedGpuModel] = useState<string>('all')
  const [selectedAvailability, setSelectedAvailability] = useState<string>('all')
  const [sortField, setSortField] = useState<SortField>('pricePerGpu')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [selectedInstances, setSelectedInstances] = useState<string[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  
  // 환율 관련 상태
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>('USD')
  const [exchangeRate, setExchangeRate] = useState<ExchangeRateData | null>(null)
  const [rateLoading, setRateLoading] = useState(false)
  
  // 용량 스코어 관련 상태
  const [capacityScores, setCapacityScores] = useState<CapacityScoreData[]>([])
  const [scoresLoading, setScoresLoading] = useState(false)

  // API 데이터에서 필터 옵션 추출
  const providers = apiData?.filters.providers || []
  const regions = apiData?.filters.regions || []
  const gpuModels = apiData?.filters.gpuModels || []
  const allInstances = apiData?.instances || []
  const pagination = apiData?.pagination

  // 환율 로드
  useEffect(() => {
    const loadExchangeRate = async () => {
      try {
        setRateLoading(true)
        const rateData = await fetchExchangeRate()
        setExchangeRate(rateData)
      } catch (error) {
        console.error('Failed to load exchange rate:', error)
        // 환율 로드 실패 시 기본값 사용
        setExchangeRate({
          success: true,
          from: 'USD',
          to: 'KRW',
          rate: 1300,
          lastUpdated: new Date().toISOString(),
          source: 'fallback'
        })
      } finally {
        setRateLoading(false)
      }
    }

    loadExchangeRate()
  }, [])

  // 용량 스코어 로드
  useEffect(() => {
    const loadCapacityScores = async () => {
      try {
        setScoresLoading(true)
        const scores = await fetchCapacityScores()
        setCapacityScores(scores)
      } catch (error) {
        console.error('Failed to load capacity scores:', error)
      } finally {
        setScoresLoading(false)
      }
    }

    loadCapacityScores()
  }, [])

  // API 데이터 로드
  useEffect(() => {
    const loadInstances = async () => {
      try {
        setLoading(true)
        setError(null)
        
        const data = await fetchInstances({
          provider: selectedProvider,
          region: selectedRegion,
          gpuModel: selectedGpuModel,
          sortBy: sortField,
          sortDirection: sortDirection,
          page: currentPage,
          limit: 20,
          search: searchTerm
        })
        
        setApiData(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load instances')
      } finally {
        setLoading(false)
      }
    }

    loadInstances()
  }, [selectedProvider, selectedRegion, selectedGpuModel, sortField, sortDirection, currentPage, searchTerm])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
    setCurrentPage(1) // 정렬 변경 시 첫 페이지로
  }

  const toggleInstanceSelection = (instanceId: string) => {
    setSelectedInstances(prev => 
      prev.includes(instanceId) 
        ? prev.filter(id => id !== instanceId)
        : [...prev, instanceId]
    )
  }

  const handleCompareInstances = () => {
    if (selectedInstances.length < 2) {
      // 버튼이 disabled되어 있어서 이 경우는 발생하지 않음
      return
    }
    
    if (selectedInstances.length > 4) {
      // 버튼이 disabled되어 있어서 이 경우는 발생하지 않음
      return
    }

    const queryString = selectedInstances.join(',')
    router.push(`/instances/compare?ids=${queryString}`)
  }

  const getProviderColor = (provider: string) => {
    switch (provider) {
      case 'AWS': return 'bg-orange-100 text-orange-800'
      case 'AZURE': return 'bg-blue-100 text-blue-800'
      case 'GCP': return 'bg-green-100 text-green-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatPrice = (price: number, currency: Currency = selectedCurrency) => {
    if (currency === 'USD') {
      return `$${price.toFixed(3)}`
    } else {
      // USD를 KRW로 변환
      const krwPrice = exchangeRate ? price * exchangeRate.rate : price * 1300
      return `₩${Math.round(krwPrice).toLocaleString()}`
    }
  }

  const getInstanceDocumentationUrl = (provider: string, instanceName: string, region: string) => {
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

  const handleExternalLink = (provider: string, instanceName: string, region: string) => {
    const url = getInstanceDocumentationUrl(provider, instanceName, region)
    if (url !== '#') {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  const refreshExchangeRate = async () => {
    try {
      setRateLoading(true)
      const rateData = await fetchExchangeRate()
      setExchangeRate(rateData)
    } catch (error) {
      console.error('Failed to refresh exchange rate:', error)
    } finally {
      setRateLoading(false)
    }
  }

  // Azure 인스턴스의 용량 스코어 찾기
  const getCapacityScore = (instance: InstanceData): CapacityScoreData | null => {
    if (instance.provider !== 'AZURE') return null
    
    // 리전명은 이미 Azure 형식으로 오므로 그대로 사용
    const azureRegion = instance.region.toLowerCase()
    
    // VM 크기는 이미 Standard_ 형식으로 오므로 그대로 사용
    const vmSize = instance.instanceName
    
    
    return capacityScores.find(score => 
      score.region === azureRegion && score.vmSize === vmSize
    ) || null
  }

  // Availability 필터링된 인스턴스
  const instances = allInstances.filter(instance => {
    if (selectedAvailability === 'all') return true
    
    const score = getCapacityScore(instance)
    
    // Azure가 아닌 경우
    if (instance.provider !== 'AZURE') {
      return selectedAvailability === 'na' // N/A 필터
    }
    
    // 스코어가 없는 경우
    if (!score) {
      return selectedAvailability === 'unknown' // 미확인 필터
    }
    
    // 스코어 기반 필터링
    switch (selectedAvailability) {
      case 'available':
        return score.label === 'AVAILABLE'
      case 'limited':
        return score.label === 'LIMITED'
      case 'unavailable':
        return score.label === 'UNAVAILABLE'
      default:
        return true
    }
  })

  // Availability 뱃지 렌더링
  const renderAvailabilityBadge = (instance: InstanceData) => {
    const score = getCapacityScore(instance)
    
    // Azure가 아닌 경우 기본 표시
    if (instance.provider !== 'AZURE') {
      return (
        <Badge variant="outline" className="text-xs">
          <div className="w-2 h-2 bg-gray-400 rounded-full mr-1"></div>
          N/A
        </Badge>
      )
    }
    
    // 스코어가 없는 경우
    if (!score) {
      return (
        <Badge variant="outline" className="text-xs">
          <div className="w-2 h-2 bg-gray-400 rounded-full mr-1"></div>
          미확인
        </Badge>
      )
    }
    
    // 스코어 기반 분류
    switch (score.label) {
      case 'AVAILABLE':
        return (
          <Badge className="bg-green-100 text-green-800 text-xs">
            <CheckCircle className="w-3 h-3 mr-1" />
            Available ({score.score}점)
          </Badge>
        )
      case 'LIMITED':
        return (
          <Badge variant="secondary" className="text-xs">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Limited ({score.score}점)
          </Badge>
        )
      case 'UNAVAILABLE':
        return (
          <Badge variant="destructive" className="text-xs">
            <XCircle className="w-3 h-3 mr-1" />
            Unavailable ({score.score}점)
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="text-xs">
            <div className="w-2 h-2 bg-gray-400 rounded-full mr-1"></div>
            알 수 없음
          </Badge>
        )
    }
  }

  return (
    <div className="container mx-auto p-6">
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col space-y-2">
            <h1 className="text-3xl font-bold">GPU 인스턴스 비교</h1>
            <p className="text-muted-foreground">
              주요 클라우드 프로바이더의 GPU 인스턴스 가격을 실시간으로 비교하세요
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/">
              <Home className="w-4 h-4 mr-2" />
              홈으로
            </Link>
          </Button>
        </div>

        {/* 필터 및 검색 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              필터 및 검색
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">검색</label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="인스턴스명 또는 GPU 모델 검색..."
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    className="pl-9"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">프로바이더</label>
                <SimpleSelect 
                  value={selectedProvider} 
                  onValueChange={(value) => { setSelectedProvider(value); setCurrentPage(1); }}
                  placeholder="프로바이더 선택"
                >
                  <SimpleSelectItem value="all">전체</SimpleSelectItem>
                  {providers.map(provider => (
                    <SimpleSelectItem key={provider} value={provider}>{provider}</SimpleSelectItem>
                  ))}
                </SimpleSelect>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">리전</label>
                <SimpleSelect 
                  value={selectedRegion} 
                  onValueChange={(value) => { setSelectedRegion(value); setCurrentPage(1); }}
                  placeholder="리전 선택"
                >
                  <SimpleSelectItem value="all">전체</SimpleSelectItem>
                  {regions.map(region => (
                    <SimpleSelectItem key={region} value={region}>{region}</SimpleSelectItem>
                  ))}
                </SimpleSelect>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">GPU 모델</label>
                <SimpleSelect 
                  value={selectedGpuModel} 
                  onValueChange={(value) => { setSelectedGpuModel(value); setCurrentPage(1); }}
                  placeholder="GPU 모델 선택"
                >
                  <SimpleSelectItem value="all">전체</SimpleSelectItem>
                  {gpuModels.map(model => (
                    <SimpleSelectItem key={model} value={model}>{model}</SimpleSelectItem>
                  ))}
                </SimpleSelect>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Availability</label>
                <SimpleSelect 
                  value={selectedAvailability} 
                  onValueChange={(value) => { setSelectedAvailability(value); setCurrentPage(1); }}
                  placeholder="가용성 선택"
                >
                  <SimpleSelectItem value="all">전체</SimpleSelectItem>
                  <SimpleSelectItem value="available">🟢 Available</SimpleSelectItem>
                  <SimpleSelectItem value="limited">🟡 Limited</SimpleSelectItem>
                  <SimpleSelectItem value="unavailable">🔴 Unavailable</SimpleSelectItem>
                  <SimpleSelectItem value="na">⚪ N/A (Non-Azure)</SimpleSelectItem>
                  <SimpleSelectItem value="unknown">❓ 미확인</SimpleSelectItem>
                </SimpleSelect>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">통화</label>
                <SimpleSelect 
                  value={selectedCurrency} 
                  onValueChange={(value) => setSelectedCurrency(value as Currency)}
                  placeholder="통화 선택"
                >
                  <SimpleSelectItem value="USD">USD ($)</SimpleSelectItem>
                  <SimpleSelectItem value="KRW">KRW (₩)</SimpleSelectItem>
                </SimpleSelect>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">정렬</label>
                <SimpleSelect 
                  value={`${sortField}-${sortDirection}`} 
                  onValueChange={(value) => {
                    const [field, direction] = value.split('-') as [SortField, SortDirection]
                    setSortField(field)
                    setSortDirection(direction)
                  }}
                  placeholder="정렬 기준"
                >
                  <SimpleSelectItem value="pricePerGpu-asc">GPU당 가격 (낮음)</SimpleSelectItem>
                  <SimpleSelectItem value="pricePerGpu-desc">GPU당 가격 (높음)</SimpleSelectItem>
                  <SimpleSelectItem value="pricePerHour-asc">시간당 가격 (낮음)</SimpleSelectItem>
                  <SimpleSelectItem value="pricePerHour-desc">시간당 가격 (높음)</SimpleSelectItem>
                  <SimpleSelectItem value="gpuCount-desc">GPU 수 (많음)</SimpleSelectItem>
                  <SimpleSelectItem value="vcpu-desc">vCPU (많음)</SimpleSelectItem>
                  <SimpleSelectItem value="ramGB-desc">RAM (많음)</SimpleSelectItem>
                </SimpleSelect>
              </div>
            </div>

            {/* 환율 정보 */}
            {selectedCurrency === 'KRW' && exchangeRate && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-blue-800">
                      환율: 1 USD = ₩{Math.round(exchangeRate.rate).toLocaleString()} KRW
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {exchangeRate.source === 'api' ? '실시간' : '기본값'}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={refreshExchangeRate}
                    disabled={rateLoading}
                    className="text-blue-600 hover:text-blue-700"
                  >
                    {rateLoading ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                  </Button>
                </div>
                <div className="text-xs text-blue-600 mt-1">
                  마지막 업데이트: {new Date(exchangeRate.lastUpdated).toLocaleString('ko-KR')}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 결과 요약 및 로딩/에러 상태 */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span>인스턴스 정보를 불러오는 중...</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">오류: {error}</p>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-2"
              onClick={() => window.location.reload()}
            >
              다시 시도
            </Button>
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  총 {pagination?.total || 0}개 인스턴스 중 {instances.length}개 표시 중
                  {selectedAvailability !== 'all' && (
                    <span className="ml-2 text-blue-600">
                      (Availability 필터 적용됨)
                    </span>
                  )}
                </p>
                {pagination && pagination.totalPages > 1 && (
                  <p className="text-xs text-muted-foreground">
                    페이지 {pagination.page} / {pagination.totalPages}
                  </p>
                )}
              </div>
              {selectedInstances.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex flex-col items-end">
                    <span className="text-sm text-muted-foreground">
                      {selectedInstances.length}개 선택됨
                    </span>
                    {selectedInstances.length < 2 && (
                      <span className="text-xs text-orange-600">
                        비교하려면 최소 2개 선택
                      </span>
                    )}
                    {selectedInstances.length > 4 && (
                      <span className="text-xs text-red-600">
                        최대 4개까지 선택 가능
                      </span>
                    )}
                  </div>
                  <Button 
                    variant={selectedInstances.length >= 2 && selectedInstances.length <= 4 ? "default" : "outline"}
                    size="sm"
                    onClick={handleCompareInstances}
                    disabled={selectedInstances.length < 2 || selectedInstances.length > 4}
                  >
                    {selectedInstances.length >= 2 && selectedInstances.length <= 4 
                      ? `${selectedInstances.length}개 인스턴스 비교` 
                      : '선택한 인스턴스 비교'
                    }
                  </Button>
                </div>
              )}
            </div>

        {/* 인스턴스 테이블 */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">선택</TableHead>
                    <TableHead>프로바이더</TableHead>
                    <TableHead>리전</TableHead>
                    <TableHead>인스턴스 타입</TableHead>
                    <TableHead>GPU</TableHead>
                    <TableHead className="text-center">사양</TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => handleSort('pricePerHour')}>
                      <div className="flex items-center justify-end gap-1">
                        시간당 가격
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => handleSort('pricePerGpu')}>
                      <div className="flex items-center justify-end gap-1">
                        GPU당 가격
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        Availability
                        {scoresLoading && <RefreshCw className="h-3 w-3 animate-spin ml-1" />}
                      </div>
                    </TableHead>
                    <TableHead className="text-center">특성</TableHead>
                    <TableHead className="text-center">추천</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {instances.map((instance) => (
                    <TableRow key={instance.id} className="hover:bg-muted/50">
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedInstances.includes(instance.id)}
                          onChange={() => toggleInstanceSelection(instance.id)}
                          className="rounded border-gray-300"
                        />
                      </TableCell>
                      <TableCell>
                        <Badge className={getProviderColor(instance.provider)}>
                          {instance.provider}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {instance.region}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {instance.instanceName}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{instance.specs.gpuModel}</div>
                          <div className="text-xs text-muted-foreground">
                            {instance.specs.gpuCount}x {instance.specs.gpuMemoryGB}GB
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="space-y-1 text-sm">
                          <div>{instance.specs.vcpu} vCPU</div>
                          <div className="text-muted-foreground">{instance.specs.ramGB}GB RAM</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatPrice(instance.pricePerHour)}/h
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold">
                        {formatPrice(instance.pricePerGpu)}/GPU·h
                      </TableCell>
                      <TableCell className="text-center">
                        {renderAvailabilityBadge(instance)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="secondary" className="text-xs">
                            {instance.specs.interconnect}
                          </Badge>
                          {instance.specs.nvlinkSupport && (
                            <Badge variant="outline" className="text-xs">
                              NVLink
                            </Badge>
                          )}
                          {instance.specs.migSupport && (
                            <Badge variant="outline" className="text-xs">
                              MIG
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {instance.provider === 'AZURE' ? (
                          <Button 
                            asChild
                            variant="ghost" 
                            size="sm"
                            title="대체 리전/VM 추천받기"
                          >
                            <Link 
                              href={`/recommendations/azure?region=${encodeURIComponent(instance.region)}&vmSize=${encodeURIComponent(instance.instanceName)}`}
                            >
                              <Lightbulb className="h-4 w-4" />
                            </Link>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleExternalLink(instance.provider, instance.instanceName, instance.region)}
                          title={`${instance.provider} 공식 문서 보기`}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

            {/* 페이지네이션 */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={!pagination.hasPrev}
                >
                  이전
                </Button>
                
                <div className="flex items-center space-x-1">
                  {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                    let pageNum
                    if (pagination.totalPages <= 5) {
                      pageNum = i + 1
                    } else if (currentPage <= 3) {
                      pageNum = i + 1
                    } else if (currentPage >= pagination.totalPages - 2) {
                      pageNum = pagination.totalPages - 4 + i
                    } else {
                      pageNum = currentPage - 2 + i
                    }
                    
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(pageNum)}
                      >
                        {pageNum}
                      </Button>
                    )
                  })}
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={!pagination.hasNext}
                >
                  다음
                </Button>
              </div>
            )}

            {/* 하단 정보 */}
            <div className="text-xs text-muted-foreground space-y-1">
              <p>※ 가격은 온디맨드 기준이며, 예고 없이 변경될 수 있습니다.</p>
              <p>※ 실제 사용 전 각 프로바이더의 공식 가격을 확인해주세요.</p>
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-1">
                  <CheckCircle className="h-3 w-3 text-green-600" />
                  <span>🟢 Available (75점 이상): 즉시 사용 가능</span>
                </div>
                <div className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-yellow-600" />
                  <span>🟡 Limited (40-74점): 제한적 사용 가능</span>
                </div>
                <div className="flex items-center gap-1">
                  <XCircle className="h-3 w-3 text-red-600" />
                  <span>🔴 Unavailable (39점 이하): 사용 어려움</span>
                </div>
              </div>
              <p>※ Availability는 Azure 실시간 용량 모니터링 기반 (용량 체크 + Spot 신호 종합 스코어)</p>
              {apiData?.meta && (
                <p>※ 마지막 업데이트: {new Date(apiData.meta.lastUpdated).toLocaleString('ko-KR')}</p>
              )}
              {selectedCurrency === 'KRW' && exchangeRate && (
                <p>※ 환율 정보: {exchangeRate.source === 'api' ? '실시간 API' : '기본값'} 기준</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
