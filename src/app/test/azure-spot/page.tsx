'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { TrendingDown, TrendingUp, AlertTriangle, Activity, DollarSign, Zap, RefreshCw, Play, Settings, Home } from 'lucide-react';
import Link from 'next/link';

interface SpotSignal {
  region: string;
  vmSize: string;
  spotPrice: number;
  onDemandPrice: number;
  priceRatio: number;
  volatility: number;
  evictionRate: number;
  marketStress: number;
  timestamp: string;
  analysis?: {
    priceStatus: 'cheap' | 'moderate' | 'expensive';
    marketCondition: 'low_stress' | 'moderate_stress' | 'high_stress';
    evictionRisk: 'low' | 'medium' | 'high';
  };
}

interface MarketSummary {
  avgPriceRatio: number;
  avgVolatility: number;
  avgEvictionRate: number;
  avgMarketStress: number;
  totalSignals: number;
  condition: string;
  avgDiscount: string;
}

export default function AzureSpotTestPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [signals, setSignals] = useState<SpotSignal[]>([]);
  const [marketSummary, setMarketSummary] = useState<MarketSummary | null>(null);
  const [workerStatus, setWorkerStatus] = useState<any>(null);
  const [selectedRegion, setSelectedRegion] = useState('koreacentral');
  const [selectedVmSize, setSelectedVmSize] = useState('Standard_NC24ads_A100_v4');

  const regions = [
    { code: 'koreacentral', name: 'Korea Central' },
    { code: 'eastus', name: 'East US' },
    { code: 'japaneast', name: 'Japan East' },
    { code: 'westeurope', name: 'West Europe' }
  ];

  const vmSizes = [
    { code: 'Standard_NC4as_T4_v3', name: 'NC4as T4 v3 (Tesla T4)', price: '$0.526/h' },
    { code: 'Standard_NC8as_T4_v3', name: 'NC8as T4 v3 (Tesla T4)', price: '$1.052/h' },
    { code: 'Standard_NC24ads_A100_v4', name: 'NC24ads A100 v4 (A100)', price: '$3.673/h' },
    { code: 'Standard_NC48ads_A100_v4', name: 'NC48ads A100 v4 (A100 x2)', price: '$7.346/h' }
  ];

  // 단일 Spot 신호 수집
  const handleSingleCollection = async (force = false) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/azure/spot-signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region: selectedRegion,
          vmSize: selectedVmSize,
          force
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setSignals(prev => [data.data.signal, ...prev.slice(0, 9)]);
        console.log('Spot 신호 수집 성공:', data.data);
      } else {
        alert(`Spot 신호 수집 실패: ${data.message}`);
      }
    } catch (error) {
      console.error('단일 Spot 수집 오류:', error);
      alert('API 호출에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 배치 Spot 신호 수집
  const handleBatchCollection = async (force = false) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/azure/spot-signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          regions: regions.map(r => r.code),
          vmSizes: vmSizes.map(v => v.code),
          force
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setSignals(data.data.signals.filter((s: any) => !s.error));
        console.log('배치 Spot 수집 성공:', data.data);
      } else {
        alert(`배치 Spot 수집 실패: ${data.message}`);
      }
    } catch (error) {
      console.error('배치 Spot 수집 오류:', error);
      alert('API 호출에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 시장 요약 로드
  const loadMarketSummary = async () => {
    try {
      const response = await fetch('/api/azure/spot-signals?summary=true');
      const data = await response.json();
      
      if (data.success) {
        setMarketSummary(data.data.marketSummary);
      }
    } catch (error) {
      console.error('시장 요약 조회 오류:', error);
    }
  };

  // Spot 워커 실행
  const handleSpotWorkerRun = async (dryRun = false) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/azure/spot-worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dryRun,
          maxCombinations: 12
        })
      });

      const data = await response.json();
      
      if (data.success) {
        alert(`Spot 워커 ${dryRun ? '시뮬레이션' : '실행'} 완료: ${data.message}`);
        if (!dryRun && data.data.results) {
          loadRecentSignals();
          loadMarketSummary();
        }
      } else {
        alert(`Spot 워커 실행 실패: ${data.message}`);
      }
    } catch (error) {
      console.error('Spot 워커 실행 오류:', error);
      alert('Spot 워커 API 호출에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 워커 상태 조회
  const loadWorkerStatus = async () => {
    try {
      const response = await fetch('/api/azure/spot-worker');
      const data = await response.json();
      
      if (data.success) {
        setWorkerStatus(data.data);
      }
    } catch (error) {
      console.error('워커 상태 조회 오류:', error);
    }
  };

  // 최근 신호 조회
  const loadRecentSignals = async () => {
    try {
      const response = await fetch('/api/azure/spot-signals?hours=24');
      const data = await response.json();
      
      if (data.success) {
        setSignals(data.data.signals);
      }
    } catch (error) {
      console.error('최근 신호 조회 오류:', error);
    }
  };

  // 가격 상태 뱃지 렌더링
  const renderPriceStatusBadge = (signal: SpotSignal) => {
    const discount = (1 - signal.priceRatio) * 100;
    
    if (discount >= 60) {
      return <Badge className="bg-green-100 text-green-800">
        <TrendingDown className="w-3 h-3 mr-1" />
        저렴 ({discount.toFixed(0)}% 할인)
      </Badge>;
    } else if (discount >= 30) {
      return <Badge variant="secondary">
        <DollarSign className="w-3 h-3 mr-1" />
        보통 ({discount.toFixed(0)}% 할인)
      </Badge>;
    } else {
      return <Badge variant="destructive">
        <TrendingUp className="w-3 h-3 mr-1" />
        비쌈 ({discount.toFixed(0)}% 할인)
      </Badge>;
    }
  };

  // 시장 스트레스 뱃지 렌더링
  const renderMarketStressBadge = (stress: number) => {
    if (stress > 0.6) {
      return <Badge variant="destructive">
        <AlertTriangle className="w-3 h-3 mr-1" />
        높은 스트레스
      </Badge>;
    } else if (stress > 0.3) {
      return <Badge variant="secondary">
        <Activity className="w-3 h-3 mr-1" />
        보통 스트레스
      </Badge>;
    } else {
      return <Badge className="bg-green-100 text-green-800">
        <Zap className="w-3 h-3 mr-1" />
        낮은 스트레스
      </Badge>;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Azure Spot 신호 테스트</h1>
          <p className="text-muted-foreground mt-2">
            Azure Spot VM 가격 신호 수집 및 시장 분석 시스템
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadMarketSummary}>
            <RefreshCw className="w-4 h-4 mr-2" />
            시장 요약 새로고침
          </Button>
          <Button variant="outline" onClick={loadWorkerStatus}>
            <Settings className="w-4 h-4 mr-2" />
            워커 상태 확인
          </Button>
          <Button asChild variant="outline">
            <Link href="/">
              <Home className="w-4 h-4 mr-2" />
              홈으로
            </Link>
          </Button>
        </div>
      </div>

      {/* 시장 요약 */}
      {marketSummary && (
        <Card>
          <CardHeader>
            <CardTitle>시장 요약</CardTitle>
            <CardDescription>전반적인 Azure Spot 시장 상황</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {marketSummary.avgDiscount}
                </div>
                <div className="text-sm text-muted-foreground">평균 할인율</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {(marketSummary.avgMarketStress * 100).toFixed(0)}%
                </div>
                <div className="text-sm text-muted-foreground">시장 스트레스</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {(marketSummary.avgEvictionRate * 100).toFixed(1)}%
                </div>
                <div className="text-sm text-muted-foreground">예상 중단율</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {marketSummary.totalSignals}
                </div>
                <div className="text-sm text-muted-foreground">수집된 신호</div>
              </div>
            </div>
            <div className="mt-4">
              <Progress 
                value={marketSummary.avgMarketStress * 100} 
                className="h-2"
              />
              <div className="text-xs text-muted-foreground mt-1">
                시장 상태: {marketSummary.condition === 'calm' ? '안정' : 
                         marketSummary.condition === 'moderate' ? '보통' : '혼잡'}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="single" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="single">단일 수집</TabsTrigger>
          <TabsTrigger value="batch">배치 수집</TabsTrigger>
          <TabsTrigger value="worker">Spot 워커</TabsTrigger>
        </TabsList>

        {/* 단일 수집 탭 */}
        <TabsContent value="single" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>단일 Spot 신호 수집</CardTitle>
              <CardDescription>
                특정 리전과 VM 크기의 Spot 가격 신호를 수집합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">리전</label>
                  <select 
                    value={selectedRegion}
                    onChange={(e) => setSelectedRegion(e.target.value)}
                    className="w-full mt-1 p-2 border rounded-md"
                  >
                    {regions.map(region => (
                      <option key={region.code} value={region.code}>
                        {region.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">VM 크기</label>
                  <select 
                    value={selectedVmSize}
                    onChange={(e) => setSelectedVmSize(e.target.value)}
                    className="w-full mt-1 p-2 border rounded-md"
                  >
                    {vmSizes.map(vm => (
                      <option key={vm.code} value={vm.code}>
                        {vm.name} ({vm.price})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={() => handleSingleCollection(false)}
                  disabled={isLoading}
                >
                  <Activity className="w-4 h-4 mr-2" />
                  Spot 신호 수집
                </Button>
                <Button 
                  onClick={() => handleSingleCollection(true)}
                  disabled={isLoading}
                  variant="outline"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  강제 수집
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 배치 수집 탭 */}
        <TabsContent value="batch" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>배치 Spot 신호 수집</CardTitle>
              <CardDescription>
                모든 리전과 VM크기 조합의 Spot 신호를 한 번에 수집합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button 
                  onClick={() => handleBatchCollection(false)}
                  disabled={isLoading}
                >
                  <Play className="w-4 h-4 mr-2" />
                  배치 수집 시작
                </Button>
                <Button 
                  onClick={() => handleBatchCollection(true)}
                  disabled={isLoading}
                  variant="outline"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  강제 배치 수집
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 워커 탭 */}
        <TabsContent value="worker" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Spot 신호 수집 워커</CardTitle>
              <CardDescription>
                자동화된 Spot 신호 수집 워커를 실행하고 상태를 확인합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {workerStatus && (
                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="font-medium mb-2">워커 상태</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">마지막 실행:</span>
                      <br />
                      {workerStatus.workerStatus.lastRun ? 
                        new Date(workerStatus.workerStatus.lastRun).toLocaleString() : 
                        '없음'
                      }
                    </div>
                    <div>
                      <span className="text-muted-foreground">상태:</span>
                      <br />
                      {workerStatus.workerStatus.inCooldown ? (
                        <Badge variant="secondary">쿨다운 중</Badge>
                      ) : (
                        <Badge variant="default">실행 가능</Badge>
                      )}
                    </div>
                  </div>
                  {workerStatus.recommendations && (
                    <div className="mt-3">
                      <span className="text-sm font-medium">추천사항:</span>
                      <ul className="text-sm text-muted-foreground mt-1">
                        {workerStatus.recommendations.map((rec: string, idx: number) => (
                          <li key={idx}>• {rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <Button 
                  onClick={() => handleSpotWorkerRun(true)}
                  disabled={isLoading}
                  variant="outline"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Dry Run
                </Button>
                <Button 
                  onClick={() => handleSpotWorkerRun(false)}
                  disabled={isLoading || workerStatus?.workerStatus?.inCooldown}
                >
                  <Play className="w-4 h-4 mr-2" />
                  워커 실행
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 결과 표시 */}
      <Card>
        <CardHeader>
          <CardTitle>최근 Spot 신호</CardTitle>
          <CardDescription>
            최근 수집된 Azure Spot VM 가격 신호들
          </CardDescription>
        </CardHeader>
        <CardContent>
          {signals.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              아직 수집된 Spot 신호가 없습니다. 위에서 수집을 시작해보세요.
            </p>
          ) : (
            <div className="space-y-3">
              {signals.map((signal, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      {renderPriceStatusBadge(signal)}
                      {renderMarketStressBadge(signal.marketStress)}
                      <div>
                        <div className="font-medium">
                          {regions.find(r => r.code === signal.region)?.name || signal.region}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {vmSizes.find(v => v.code === signal.vmSize)?.name || signal.vmSize}
                        </div>
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-medium">
                        ${signal.spotPrice.toFixed(3)}/h
                      </div>
                      <div className="text-muted-foreground">
                        정가: ${signal.onDemandPrice.toFixed(3)}/h
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
                    <div>
                      <span>변동성:</span> {(signal.volatility * 100).toFixed(1)}%
                    </div>
                    <div>
                      <span>예상 중단율:</span> {(signal.evictionRate * 100).toFixed(1)}%
                    </div>
                    <div>
                      <span>수집 시간:</span> {new Date(signal.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
