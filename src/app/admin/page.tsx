"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  RefreshCw, 
  Save, 
  AlertCircle, 
  CheckCircle2, 
  DollarSign,
  Database,
  Clock,
  TrendingUp,
  Download,
  Zap
} from "lucide-react"

interface PriceUpdateData {
  instanceId: string
  provider: string
  instanceName: string
  region: string
  currentPrice: number
  newPrice: number
  currency: string
  lastUpdated: string
}

interface AdminStats {
  totalInstances: number
  lastPriceUpdate: string
  averagePrice: number
  priceRange: {
    min: number
    max: number
  }
}

export default function AdminPage() {
  const [priceData, setPriceData] = useState<PriceUpdateData[]>([])
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [azureSyncing, setAzureSyncing] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [editingPrices, setEditingPrices] = useState<Record<string, number>>({})

  useEffect(() => {
    loadPriceData()
  }, [])

  const loadPriceData = async () => {
    try {
      setLoading(true)
      // 현재 인스턴스 데이터 가져오기
      const response = await fetch('/api/instances?limit=100')
      const data = await response.json()
      
      const priceUpdates: PriceUpdateData[] = data.instances.map((instance: any) => ({
        instanceId: instance.id,
        provider: instance.provider,
        instanceName: instance.instanceName,
        region: instance.region,
        currentPrice: instance.pricePerHour,
        newPrice: instance.pricePerHour,
        currency: instance.currency,
        lastUpdated: instance.lastUpdated
      }))

      setPriceData(priceUpdates)
      
      // 통계 계산
      const prices = priceUpdates.map(p => p.currentPrice)
      const statsData: AdminStats = {
        totalInstances: priceUpdates.length,
        lastPriceUpdate: new Date().toISOString(),
        averagePrice: prices.reduce((a, b) => a + b, 0) / prices.length,
        priceRange: {
          min: Math.min(...prices),
          max: Math.max(...prices)
        }
      }
      setStats(statsData)
      
    } catch (error) {
      setMessage({ type: 'error', text: '데이터 로딩 중 오류가 발생했습니다.' })
    } finally {
      setLoading(false)
    }
  }

  const handlePriceChange = (instanceId: string, newPrice: string) => {
    const price = parseFloat(newPrice)
    if (!isNaN(price) && price >= 0) {
      setEditingPrices(prev => ({
        ...prev,
        [instanceId]: price
      }))
      
      setPriceData(prev => prev.map(item => 
        item.instanceId === instanceId 
          ? { ...item, newPrice: price }
          : item
      ))
    }
  }

  const hasChanges = () => {
    return priceData.some(item => item.currentPrice !== item.newPrice)
  }

  const resetChanges = () => {
    setPriceData(prev => prev.map(item => ({
      ...item,
      newPrice: item.currentPrice
    })))
    setEditingPrices({})
  }

  const saveChanges = async () => {
    if (!hasChanges()) {
      setMessage({ type: 'error', text: '변경된 가격이 없습니다.' })
      return
    }

    try {
      setSaving(true)
      setMessage(null)

      const changedItems = priceData.filter(item => item.currentPrice !== item.newPrice)
      
      // 가격 업데이트 API 호출
      const response = await fetch('/api/admin/prices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          updates: changedItems.map(item => ({
            instanceId: item.instanceId,
            newPrice: item.newPrice,
            currency: item.currency
          }))
        })
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to update prices')
      }
      
      // 성공 시 현재 가격을 새 가격으로 업데이트
      setPriceData(prev => prev.map(item => ({
        ...item,
        currentPrice: item.newPrice,
        lastUpdated: new Date().toISOString()
      })))
      
      setEditingPrices({})
      setMessage({ 
        type: 'success', 
        text: result.message || `${changedItems.length}개 인스턴스의 가격이 업데이트되었습니다.` 
      })

    } catch (error) {
      console.error('Price update error:', error)
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : '가격 업데이트 중 오류가 발생했습니다.' 
      })
    } finally {
      setSaving(false)
    }
  }

  const syncAWSPrices = async () => {
    try {
      setSyncing(true)
      setMessage(null)

      const response = await fetch('/api/admin/sync-aws-prices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to sync AWS prices')
      }

      // 동기화 성공 시 데이터 다시 로드
      await loadPriceData()

      setMessage({ 
        type: 'success', 
        text: `AWS 가격 동기화 완료: ${result.data?.updated || 0}개 인스턴스 업데이트됨`
      })

    } catch (error) {
      console.error('AWS price sync error:', error)
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'AWS 가격 동기화 중 오류가 발생했습니다.' 
      })
    } finally {
      setSyncing(false)
    }
  }

  const syncAzurePrices = async () => {
    try {
      setAzureSyncing(true)
      setMessage(null)

      const response = await fetch('/api/admin/sync-azure-prices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          regions: [], // 모든 리전
          dryRun: false
        })
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to sync Azure prices')
      }

      // 동기화 성공 시 데이터 다시 로드
      await loadPriceData()

      setMessage({ 
        type: 'success', 
        text: `Azure 가격 동기화 완료: ${result.data?.updated || 0}개 인스턴스 업데이트됨`
      })

    } catch (error) {
      console.error('Azure price sync error:', error)
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Azure 가격 동기화 중 오류가 발생했습니다.' 
      })
    } finally {
      setAzureSyncing(false)
    }
  }

  const formatPrice = (price: number) => {
    return `$${price.toFixed(3)}`
  }

  const getProviderColor = (provider: string) => {
    switch (provider) {
      case 'AWS': return 'bg-orange-100 text-orange-800'
      case 'AZURE': return 'bg-blue-100 text-blue-800'
      case 'GCP': return 'bg-green-100 text-green-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <RefreshCw className="h-8 w-8 animate-spin mr-3" />
          <span className="text-lg">데이터를 불러오는 중...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex flex-col space-y-2">
          <h1 className="text-3xl font-bold">관리자 패널</h1>
          <p className="text-muted-foreground">
            GPU 인스턴스 가격 관리 및 시스템 모니터링
          </p>
        </div>

        {/* 알림 메시지 */}
        {message && (
          <Alert className={message.type === 'error' ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}>
            {message.type === 'error' ? (
              <AlertCircle className="h-4 w-4 text-red-600" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            )}
            <AlertDescription className={message.type === 'error' ? 'text-red-800' : 'text-green-800'}>
              {message.text}
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="prices" className="space-y-4">
            <TabsList>
            <TabsTrigger value="prices">가격 관리</TabsTrigger>
            <TabsTrigger value="stats">통계</TabsTrigger>
            <TabsTrigger value="automation">자동화</TabsTrigger>
          </TabsList>

          <TabsContent value="stats" className="space-y-4">
            {/* 통계 대시보드 */}
            {stats && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">총 인스턴스</CardTitle>
                    <Database className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.totalInstances}</div>
                    <p className="text-xs text-muted-foreground">활성 GPU 인스턴스</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">평균 가격</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatPrice(stats.averagePrice)}</div>
                    <p className="text-xs text-muted-foreground">시간당 평균</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">가격 범위</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold">
                      {formatPrice(stats.priceRange.min)} - {formatPrice(stats.priceRange.max)}
                    </div>
                    <p className="text-xs text-muted-foreground">최저 - 최고</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">마지막 업데이트</CardTitle>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-lg font-bold">
                      {new Date(stats.lastPriceUpdate).toLocaleDateString('ko-KR')}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(stats.lastPriceUpdate).toLocaleTimeString('ko-KR')}
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="automation" className="space-y-4">
            {/* 자동화 설정 */}
            <div className="space-y-6">
              <div className="space-y-1">
                <h2 className="text-2xl font-semibold">가격 동기화 자동화</h2>
                <p className="text-sm text-muted-foreground">
                  외부 API와의 가격 동기화를 관리합니다.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* AWS 동기화 */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-orange-100 rounded flex items-center justify-center">
                        <span className="text-orange-600 text-xs font-bold">AWS</span>
                      </div>
                      AWS Price List API
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                      Seoul 리전의 GPU 인스턴스 가격을 AWS 공식 API에서 자동으로 가져옵니다.
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>지원 인스턴스 패밀리:</span>
                        <span className="font-mono">P3, P4, P5, G4, G5, G6</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>업데이트 주기:</span>
                        <span>수동 (권장: 일 1회)</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>마지막 동기화:</span>
                        <span>{new Date().toLocaleDateString('ko-KR')}</span>
                      </div>
                    </div>

                    <Button 
                      onClick={syncAWSPrices} 
                      disabled={syncing}
                      className="w-full"
                    >
                      {syncing ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 mr-2" />
                      )}
                      {syncing ? '동기화 중...' : '지금 동기화'}
                    </Button>
                  </CardContent>
                </Card>

                {/* 향후 확장: Azure, GCP */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-blue-100 rounded flex items-center justify-center">
                        <span className="text-blue-600 text-xs font-bold">AZ</span>
                      </div>
                      Azure Retail Prices API
                      <Badge variant="secondary" className="text-xs">활성</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                      Azure GPU 인스턴스 가격을 공식 API에서 가져옵니다.
                    </div>
                    <Button 
                      onClick={syncAzurePrices}
                      disabled={azureSyncing || loading}
                      className="w-full bg-blue-600 hover:bg-blue-700"
                    >
                      {azureSyncing ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          동기화 중...
                        </>
                      ) : (
                        <>
                          <Zap className="h-4 w-4 mr-2" />
                          Azure 가격 동기화
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                <Card className="opacity-60">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-green-100 rounded flex items-center justify-center">
                        <span className="text-green-600 text-xs font-bold">GCP</span>
                      </div>
                      Google Cloud Billing API
                      <Badge variant="outline" className="text-xs">곧 출시</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                      Google Cloud GPU 인스턴스 가격을 공식 API에서 가져옵니다.
                    </div>
                    <Button disabled className="w-full">
                      <Zap className="h-4 w-4 mr-2" />
                      개발 예정
                    </Button>
                  </CardContent>
                </Card>

                {/* 설정 */}
                <Card>
                  <CardHeader>
                    <CardTitle>동기화 설정</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">자동 동기화 주기</label>
                      <select className="w-full p-2 border rounded-md text-sm" disabled>
                        <option>수동</option>
                        <option>매일 오전 9시</option>
                        <option>주 1회 (월요일)</option>
                      </select>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-medium">가격 변동 임계값</label>
                      <Input 
                        type="number" 
                        placeholder="10%" 
                        disabled
                        className="text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        이 비율 이상 변동 시 알림
                      </p>
                    </div>

                    <Button disabled className="w-full" variant="outline">
                      <Save className="h-4 w-4 mr-2" />
                      설정 저장 (개발 예정)
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="prices" className="space-y-4">
            {/* 가격 관리 */}
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <h2 className="text-2xl font-semibold">가격 관리</h2>
                <p className="text-sm text-muted-foreground">
                  인스턴스별 가격을 확인하고 수동으로 업데이트할 수 있습니다.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={loadPriceData} disabled={loading}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  새로고침
                </Button>
                <Button 
                  variant="outline" 
                  onClick={syncAWSPrices} 
                  disabled={syncing || loading}
                  className="bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100"
                >
                  {syncing ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  {syncing ? 'AWS 동기화 중...' : 'AWS 가격 동기화'}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={syncAzurePrices} 
                  disabled={azureSyncing || loading}
                  className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                >
                  {azureSyncing ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  {azureSyncing ? 'Azure 동기화 중...' : 'Azure 가격 동기화'}
                </Button>
                {hasChanges() && (
                  <>
                    <Button variant="outline" onClick={resetChanges}>
                      변경사항 취소
                    </Button>
                    <Button onClick={saveChanges} disabled={saving}>
                      {saving ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      {saving ? '저장 중...' : '변경사항 저장'}
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* 가격 테이블 */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>프로바이더</TableHead>
                        <TableHead>리전</TableHead>
                        <TableHead>인스턴스</TableHead>
                        <TableHead className="text-right">현재 가격</TableHead>
                        <TableHead className="text-right">새 가격</TableHead>
                        <TableHead className="text-right">변경량</TableHead>
                        <TableHead>마지막 업데이트</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {priceData.map((item) => {
                        const priceChange = item.newPrice - item.currentPrice
                        const priceChangePercent = ((priceChange / item.currentPrice) * 100)
                        
                        return (
                          <TableRow key={item.instanceId}>
                            <TableCell>
                              <Badge className={getProviderColor(item.provider)}>
                                {item.provider}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {item.region}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {item.instanceName}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatPrice(item.currentPrice)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                step="0.001"
                                value={item.newPrice}
                                onChange={(e) => handlePriceChange(item.instanceId, e.target.value)}
                                className="w-24 text-right font-mono"
                                min="0"
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              {Math.abs(priceChange) > 0.001 ? (
                                <div className={`text-sm ${priceChange > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                  {priceChange > 0 ? '+' : ''}{formatPrice(priceChange)}
                                  <div className="text-xs">
                                    ({priceChange > 0 ? '+' : ''}{priceChangePercent.toFixed(1)}%)
                                  </div>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-sm">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(item.lastUpdated).toLocaleDateString('ko-KR')}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* 하단 정보 */}
        <div className="text-xs text-muted-foreground space-y-1 border-t pt-4">
          <p>※ 가격 변경 시 모든 사용자에게 즉시 반영됩니다.</p>
          <p>※ 변경 전 가격을 다시 한 번 확인해주세요.</p>
          <p>※ 시스템 로그에 모든 변경 사항이 기록됩니다.</p>
        </div>
      </div>
    </div>
  )
}
