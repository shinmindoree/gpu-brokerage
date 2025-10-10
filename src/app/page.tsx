"use client"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { SimpleSelect, SimpleSelectItem } from "@/components/ui/simple-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ArrowRight, BarChart3, Database, Settings, Zap, Search, Filter, RefreshCw, ExternalLink, CheckCircle, AlertTriangle, XCircle } from "lucide-react"

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
  pagination: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean }
  filters: { providers: string[]; regions: string[]; gpuModels: string[]; countries: string[] }
  meta: { currency: string; lastUpdated: string; apiVersion: string }
}

interface CapacityScoreData {
  region: string
  vmSize: string
  score: number
  label: 'AVAILABLE' | 'LIMITED' | 'UNAVAILABLE'
  confidence: number
  calculatedAt: string
}

async function fetchInstances(params: Partial<{ provider: string; region: string; country: string; gpuModel: string; sortBy: string; sortDirection: string; page: number; limit: number; search: string }>): Promise<ApiResponse> {
  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== 'all') searchParams.append(k, String(v)) })
  const res = await fetch(`/api/instances?${searchParams.toString()}`)
  if (!res.ok) throw new Error('Failed to fetch instances')
  return res.json()
}

async function fetchCapacityScores(): Promise<CapacityScoreData[]> {
  try {
    const response = await fetch('/api/azure/capacity-scores?limit=50')
    if (!response.ok) throw new Error('Failed to fetch capacity scores')
    const data = await response.json()
    return data.success ? data.data.scores : []
  } catch {
    return []
  }
}

export default function Home() {
  const [keyword, setKeyword] = useState("")
  const [region, setRegion] = useState("all")
  const [country, setCountry] = useState("all")
  const [maxPrice, setMaxPrice] = useState<string>("")
  const [availability, setAvailability] = useState("all")
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<InstanceData[]>([])
  const [regions, setRegions] = useState<string[]>([])
  const [countries, setCountries] = useState<string[]>([])
  const [scores, setScores] = useState<CapacityScoreData[]>([])

  useEffect(() => {
    fetchInstances({ limit: 1 }).then((d) => { setRegions(d.filters.regions); (d as any).filters?.countries && setCountries((d as any).filters.countries) }).catch(() => {})
    fetchCapacityScores().then(setScores).catch(() => {})
  }, [])

  const getCapacity = (inst: InstanceData): CapacityScoreData | null => {
    if (inst.provider !== 'AZURE') return null
    const r = inst.region.toLowerCase()
    const v = inst.instanceName
    return scores.find(s => s.region === r && s.vmSize === v) || null
  }

  const filteredByAvailability = (list: InstanceData[]) => {
    if (availability === 'all') return list
    return list.filter((i) => {
      const s = getCapacity(i)
      if (i.provider !== 'AZURE') return availability === 'na'
      if (!s) return availability === 'unknown'
      if (availability === 'available') return s.label === 'AVAILABLE'
      if (availability === 'limited') return s.label === 'LIMITED'
      if (availability === 'unavailable') return s.label === 'UNAVAILABLE'
      return true
    })
  }

  const search = async () => {
    try {
      setLoading(true)
      const data = await fetchInstances({
        country: country,
        search: keyword.trim() || undefined,
        sortBy: 'pricePerGpu',
        sortDirection: 'asc',
        limit: 100
      })
      let list = data.instances
      if (maxPrice) {
        const threshold = parseFloat(maxPrice)
        if (!Number.isNaN(threshold)) list = list.filter(i => i.pricePerHour <= threshold)
      }
      list = filteredByAvailability(list)
      setResults(list)
    } finally {
      setLoading(false)
    }
  }
  return (
    <div className="mx-auto p-6 min-h-screen max-w-[1600px]">
      <div className="flex flex-col items-center justify-center min-h-[80vh] space-y-8">
        {/* 메인 검색 패널 */}
        <Card className="w-full">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Search className="w-5 h-5" />
              원하는 GPU를 검색하세요
            </CardTitle>
            <CardDescription>GPU 카드(H100/A100 등), 국가, 시간당 가격, Availability로 빠르게 찾아보세요</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border bg-white overflow-hidden">
              <div className="flex flex-col md:flex-row items-stretch gap-3 md:gap-4">
                <div className="flex-1 p-3 md:p-4">
                  <label className="text-xs text-muted-foreground block mb-1">GPU 키워드</label>
                  <Input className="h-12" placeholder="예: H100, A100, L4" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
                </div>
                <div className="flex-1 p-3 md:p-4">
                  <label className="text-xs text-muted-foreground block mb-1">리전</label>
                  <SimpleSelect className="h-12" value={region} onValueChange={setRegion}>
                    <SimpleSelectItem value="all">전체</SimpleSelectItem>
                    {regions.map((r) => (<SimpleSelectItem key={r} value={r}>{r}</SimpleSelectItem>))}
                  </SimpleSelect>
                </div>
                <div className="flex-1 p-3 md:p-4">
                  <label className="text-xs text-muted-foreground block mb-1">국가</label>
                  <SimpleSelect className="h-12" value={country} onValueChange={setCountry}>
                    <SimpleSelectItem value="all">전체</SimpleSelectItem>
                    {countries.map((c) => (<SimpleSelectItem key={c} value={c}>{c}</SimpleSelectItem>))}
                  </SimpleSelect>
                </div>
                <div className="flex-1 p-3 md:p-4 max-w-[240px]">
                  <label className="text-xs text-muted-foreground block mb-1">시간당 최대 가격 (USD)</label>
                  <Input className="h-12" placeholder="예: 5.0" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
                </div>
                <div className="flex-1 p-3 md:p-4 max-w-[220px]">
                  <label className="text-xs text-muted-foreground block mb-1">Availability</label>
                  <SimpleSelect className="h-12" value={availability} onValueChange={setAvailability}>
                    <SimpleSelectItem value="all">전체</SimpleSelectItem>
                    <SimpleSelectItem value="available">🟢 Available</SimpleSelectItem>
                    <SimpleSelectItem value="limited">🟡 Limited</SimpleSelectItem>
                    <SimpleSelectItem value="unavailable">🔴 Unavailable</SimpleSelectItem>
                    <SimpleSelectItem value="na">⚪ N/A (Non-Azure)</SimpleSelectItem>
                    <SimpleSelectItem value="unknown">❓ 미확인</SimpleSelectItem>
                  </SimpleSelect>
                </div>
                <div className="p-3 md:p-4 flex items-end md:items-center justify-end md:justify-center">
                  <Button onClick={search} disabled={loading} className="h-12 px-6">
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Filter className="w-4 h-4 mr-2" />}
                    검색하기
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 검색 결과 */}
        {results.length > 0 && (
          <Card className="w-full">
            <CardHeader>
              <CardTitle>검색 결과 ({results.length}개)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>프로바이더</TableHead>
                      <TableHead>리전</TableHead>
                      <TableHead>인스턴스</TableHead>
                      <TableHead>GPU</TableHead>
                      <TableHead className="text-right">$/h</TableHead>
                      <TableHead className="text-right">$/GPU·h</TableHead>
                      <TableHead className="text-center">Availability</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((i) => {
                      const score = getCapacity(i)
                      return (
                        <TableRow key={i.id}>
                          <TableCell><Badge>{i.provider}</Badge></TableCell>
                          <TableCell className="text-sm text-muted-foreground">{i.region}</TableCell>
                          <TableCell className="font-mono text-sm">{i.instanceName}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div className="font-medium">{i.specs.gpuModel}</div>
                              <div className="text-xs text-muted-foreground">{i.specs.gpuCount}x {i.specs.gpuMemoryGB}GB</div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono">${i.pricePerHour.toFixed(3)}</TableCell>
                          <TableCell className="text-right font-mono font-bold">${i.pricePerGpu.toFixed(3)}</TableCell>
                          <TableCell className="text-center">
                            {i.provider !== 'AZURE' ? (
                              <Badge variant="outline" className="text-xs"><div className="w-2 h-2 bg-gray-400 rounded-full mr-1 inline-block"></div>N/A</Badge>
                            ) : !score ? (
                              <Badge variant="outline" className="text-xs"><div className="w-2 h-2 bg-gray-400 rounded-full mr-1 inline-block"></div>미확인</Badge>
                            ) : score.label === 'AVAILABLE' ? (
                              <Badge className="bg-green-100 text-green-800 text-xs"><CheckCircle className="w-3 h-3 mr-1 inline" />Available ({score.score})</Badge>
                            ) : score.label === 'LIMITED' ? (
                              <Badge variant="secondary" className="text-xs"><AlertTriangle className="w-3 h-3 mr-1 inline" />Limited ({score.score})</Badge>
                            ) : (
                              <Badge variant="destructive" className="text-xs"><XCircle className="w-3 h-3 mr-1 inline" />Unavailable ({score.score})</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button asChild variant="ghost" size="sm" title="인스턴스 상세로">
                              <Link href={`/instances?search=${encodeURIComponent(i.instanceName)}`}>
                                <ExternalLink className="h-4 w-4" />
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold tracking-tight">
            GPU 브로커리지 플랫폼
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl">
            주요 클라우드 프로바이더(AWS, Azure, GCP)의 GPU 인스턴스 가격을 
            한눈에 비교하고 최적의 선택을 하세요.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">실시간 가격 비교</CardTitle>
              <CardDescription>
                AWS, Azure, GCP의 GPU 인스턴스 가격을 실시간으로 비교
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">성능 지표</CardTitle>
              <CardDescription>
                GPU별 TFLOPS, 메모리 대역폭 등 상세 성능 정보 제공
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">비용 최적화</CardTitle>
              <CardDescription>
                워크로드에 최적화된 GPU 인스턴스 추천 및 비용 분석
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* 기본 기능 버튼들 */}
        <div className="flex flex-col sm:flex-row gap-4">
          <Button asChild size="lg">
            <Link href="/instances">
              <BarChart3 className="w-5 h-5 mr-2" />
              인스턴스 비교하기
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/instances/compare">
              <Database className="w-5 h-5 mr-2" />
              상세 비교 분석
            </Link>
          </Button>
        </div>

        {/* 새로운 기능 섹션 */}
        <div className="w-full max-w-4xl">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-semibold mb-2">🚀 새로운 기능들</h2>
            <p className="text-muted-foreground">
              최신 개발된 Azure 용량 모니터링 및 관리 기능을 체험해보세요
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Azure 용량 체크 */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center">
                    <Zap className="w-4 h-4 mr-2 text-blue-500" />
                    Azure 용량 체크
                  </CardTitle>
                  <Badge variant="default" className="text-xs">Phase 1</Badge>
                </div>
                <CardDescription className="text-sm">
                  Azure GPU VM의 실시간 용량 상태를 확인하고 모니터링
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href="/test/azure-capacity">
                    테스트해보기
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </CardContent>
            </Card>

            {/* Azure Spot 신호 */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center">
                    <BarChart3 className="w-4 h-4 mr-2 text-orange-500" />
                    Azure Spot 신호
                  </CardTitle>
                  <Badge variant="default" className="text-xs">Phase 2</Badge>
                </div>
                <CardDescription className="text-sm">
                  Azure Spot VM 가격 신호 수집 및 시장 혼잡도 분석
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href="/test/azure-spot">
                    테스트해보기
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </CardContent>
            </Card>

            {/* Azure 용량 스코어링 */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center">
                    <Database className="w-4 h-4 mr-2 text-purple-500" />
                    Azure 용량 스코어링
                  </CardTitle>
                  <Badge variant="default" className="text-xs">Phase 3</Badge>
                </div>
                <CardDescription className="text-sm">
                  용량 체크와 Spot 신호를 종합한 스마트 스코어링 시스템
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href="/test/azure-scoring">
                    테스트해보기
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </CardContent>
            </Card>

            {/* Azure 용량 대시보드 */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center">
                    <BarChart3 className="w-4 h-4 mr-2 text-indigo-500" />
                    Azure 용량 대시보드
                  </CardTitle>
                  <Badge variant="default" className="text-xs">Phase 4</Badge>
                </div>
                <CardDescription className="text-sm">
                  실시간 용량 모니터링 및 지역별 가용성 분석 대시보드
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href="/dashboard/azure-capacity">
                    대시보드 보기
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </CardContent>
            </Card>

            {/* Azure 추천 시스템 */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center">
                    <Zap className="w-4 h-4 mr-2 text-amber-500" />
                    Azure 추천 시스템
                  </CardTitle>
                  <Badge variant="default" className="text-xs">Phase 5</Badge>
                </div>
                <CardDescription className="text-sm">
                  용량 부족시 최적의 대체 리전 및 VM 추천 시스템
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href="/recommendations/azure">
                    추천 받기
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </CardContent>
            </Card>

            {/* 시스템 테스트 */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center">
                    <Settings className="w-4 h-4 mr-2 text-green-500" />
                    시스템 테스트
                  </CardTitle>
                </div>
                <CardDescription className="text-sm">
                  전체 시스템 상태 및 API 연결 테스트
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href="/test">
                    확인하기
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </CardContent>
            </Card>

            {/* 관리자 페이지 */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center">
                    <Database className="w-4 h-4 mr-2 text-purple-500" />
                    관리자 페이지
                  </CardTitle>
                </div>
                <CardDescription className="text-sm">
                  가격 데이터 동기화 및 시스템 관리
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href="/admin">
                    관리하기
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* 개발 상태 표시 */}
        <div className="w-full max-w-4xl">
          <div className="bg-muted/50 rounded-lg p-4">
            <h3 className="text-lg font-medium mb-3">📈 개발 진행 상황</h3>
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 text-sm">
                     <div className="flex items-center justify-between">
                       <span>Azure 용량 모니터링</span>
                       <Badge variant="default">Phase 1 완료</Badge>
                     </div>
                     <div className="flex items-center justify-between">
                       <span>Spot 가격 신호</span>
                       <Badge variant="default">Phase 2 완료</Badge>
                     </div>
                     <div className="flex items-center justify-between">
                       <span>스코어링 엔진</span>
                       <Badge variant="default">Phase 3 완료</Badge>
                     </div>
                     <div className="flex items-center justify-between">
                       <span>실시간 대시보드</span>
                       <Badge variant="default">Phase 4 완료</Badge>
                     </div>
                     <div className="flex items-center justify-between">
                       <span>추천 시스템</span>
                       <Badge variant="default">Phase 5 완료</Badge>
                     </div>
                   </div>
          </div>
        </div>

        <div className="text-sm text-muted-foreground text-center">
          현재 <strong>9개 주요 GPU 인스턴스</strong> 타입의 가격 정보를 제공합니다
          <br />
          H100, A100, A10G, V100, L4 GPU 모델 지원
        </div>
      </div>
    </div>
  )
}