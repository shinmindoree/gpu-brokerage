"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Search, Filter, ArrowUpDown, ExternalLink, Loader2 } from "lucide-react"

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

type SortField = 'pricePerHour' | 'pricePerGpu' | 'gpuCount' | 'vcpu' | 'ramGB'
type SortDirection = 'asc' | 'desc'

export default function InstancesPage() {
  const [apiData, setApiData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProvider, setSelectedProvider] = useState<string>('all')
  const [selectedRegion, setSelectedRegion] = useState<string>('all')
  const [selectedGpuModel, setSelectedGpuModel] = useState<string>('all')
  const [sortField, setSortField] = useState<SortField>('pricePerGpu')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [selectedInstances, setSelectedInstances] = useState<string[]>([])
  const [currentPage, setCurrentPage] = useState(1)

  // API 데이터에서 필터 옵션 추출
  const providers = apiData?.filters.providers || []
  const regions = apiData?.filters.regions || []
  const gpuModels = apiData?.filters.gpuModels || []
  const instances = apiData?.instances || []
  const pagination = apiData?.pagination

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

  const getProviderColor = (provider: string) => {
    switch (provider) {
      case 'AWS': return 'bg-orange-100 text-orange-800'
      case 'Azure': return 'bg-blue-100 text-blue-800'
      case 'GCP': return 'bg-green-100 text-green-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatPrice = (price: number) => {
    return `$${price.toFixed(3)}`
  }

  return (
    <div className="container mx-auto p-6">
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex flex-col space-y-2">
          <h1 className="text-3xl font-bold">GPU 인스턴스 비교</h1>
          <p className="text-muted-foreground">
            주요 클라우드 프로바이더의 GPU 인스턴스 가격을 실시간으로 비교하세요
          </p>
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
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
                <Select value={selectedProvider} onValueChange={(value) => { setSelectedProvider(value); setCurrentPage(1); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="프로바이더 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    {providers.map(provider => (
                      <SelectItem key={provider} value={provider}>{provider}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">리전</label>
                <Select value={selectedRegion} onValueChange={(value) => { setSelectedRegion(value); setCurrentPage(1); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="리전 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    {regions.map(region => (
                      <SelectItem key={region} value={region}>{region}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">GPU 모델</label>
                <Select value={selectedGpuModel} onValueChange={(value) => { setSelectedGpuModel(value); setCurrentPage(1); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="GPU 모델 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    {gpuModels.map(model => (
                      <SelectItem key={model} value={model}>{model}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">정렬</label>
                <Select value={`${sortField}-${sortDirection}`} onValueChange={(value) => {
                  const [field, direction] = value.split('-') as [SortField, SortDirection]
                  setSortField(field)
                  setSortDirection(direction)
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="정렬 기준" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pricePerGpu-asc">GPU당 가격 (낮음)</SelectItem>
                    <SelectItem value="pricePerGpu-desc">GPU당 가격 (높음)</SelectItem>
                    <SelectItem value="pricePerHour-asc">시간당 가격 (낮음)</SelectItem>
                    <SelectItem value="pricePerHour-desc">시간당 가격 (높음)</SelectItem>
                    <SelectItem value="gpuCount-desc">GPU 수 (많음)</SelectItem>
                    <SelectItem value="vcpu-desc">vCPU (많음)</SelectItem>
                    <SelectItem value="ramGB-desc">RAM (많음)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
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
                </p>
                {pagination && pagination.totalPages > 1 && (
                  <p className="text-xs text-muted-foreground">
                    페이지 {pagination.page} / {pagination.totalPages}
                  </p>
                )}
              </div>
              {selectedInstances.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {selectedInstances.length}개 선택됨
                  </span>
                  <Button variant="outline" size="sm">
                    선택한 인스턴스 비교
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
                    <TableHead className="text-center">특성</TableHead>
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
                      <TableCell>
                        <Button variant="ghost" size="sm">
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
              {apiData?.meta && (
                <p>※ 마지막 업데이트: {new Date(apiData.meta.lastUpdated).toLocaleString('ko-KR')}</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
