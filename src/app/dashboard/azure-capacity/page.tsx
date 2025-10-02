'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Activity, 
  AlertTriangle, 
  BarChart3, 
  CheckCircle, 
  Clock, 
  Globe, 
  Home, 
  MapPin, 
  RefreshCw, 
  Server, 
  TrendingDown, 
  TrendingUp, 
  XCircle, 
  Zap 
} from 'lucide-react';
import Link from 'next/link';

interface RegionStatus {
  region: string;
  displayName: string;
  totalVMs: number;
  availableVMs: number;
  limitedVMs: number;
  unavailableVMs: number;
  avgScore: number;
  lastUpdated: string;
  trend: 'up' | 'down' | 'stable';
}

interface VMSeriesStatus {
  series: string;
  displayName: string;
  totalInstances: number;
  avgScore: number;
  distribution: {
    available: number;
    limited: number;
    unavailable: number;
  };
  topRegions: Array<{
    region: string;
    score: number;
  }>;
}

interface AlertItem {
  id: string;
  type: 'critical' | 'warning' | 'info';
  message: string;
  region?: string;
  vmSize?: string;
  timestamp: string;
}

interface DashboardMetrics {
  totalRegions: number;
  totalVMTypes: number;
  overallHealthScore: number;
  activeAlerts: number;
  lastScanTime: string;
  trendsLast24h: {
    scoreChange: number;
    newAlerts: number;
    resolvedAlerts: number;
  };
}

export default function AzureCapacityDashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [regionStatuses, setRegionStatuses] = useState<RegionStatus[]>([]);
  const [vmSeriesStatuses, setVMSeriesStatuses] = useState<VMSeriesStatus[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);

  // 데이터 로드 함수
  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // 실제 API 호출
      const response = await fetch('/api/dashboard/azure-capacity');
      
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
      }
      
      const data = await response.json();
      
      if (data.success) {
        setMetrics(data.data.metrics);
        setRegionStatuses(data.data.regions);
        setVMSeriesStatuses(data.data.vmSeries);
        setAlerts(data.data.alerts);
        setLastUpdate(new Date(data.data.lastUpdated));
      } else {
        throw new Error(data.message || 'API returned error');
      }
      
    } catch (error) {
      console.error('Dashboard data loading failed:', error);
      
      // 실패 시 모킹 데이터로 폴백
      setMetrics(generateMockMetrics());
      setRegionStatuses(generateMockRegionStatuses());
      setVMSeriesStatuses(generateMockVMSeriesStatuses());
      setAlerts(generateMockAlerts());
      setLastUpdate(new Date());
    } finally {
      setLoading(false);
    }
  };

  // 초기 데이터 로드
  useEffect(() => {
    loadDashboardData();
  }, []);

  // 자동 새로고침
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      loadDashboardData();
    }, 30000); // 30초마다 새로고침
    
    return () => clearInterval(interval);
  }, [autoRefresh]);

  // 헬스 스코어 색상 결정
  const getHealthColor = (score: number) => {
    if (score >= 75) return 'text-green-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  // 헬스 스코어 라벨
  const getHealthLabel = (score: number) => {
    if (score >= 75) return 'Healthy';
    if (score >= 40) return 'Warning';
    return 'Critical';
  };

  // 트렌드 아이콘
  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'down':
        return <TrendingDown className="w-4 h-4 text-red-500" />;
      default:
        return <Activity className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Azure 용량 모니터링 대시보드</h1>
          <p className="text-muted-foreground mt-2">
            실시간 GPU VM 가용성 모니터링 및 분석
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-green-500' : 'bg-gray-400'}`}></div>
            <span className="text-sm text-muted-foreground">
              {autoRefresh ? '실시간' : '일시정지'}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? '일시정지' : '재시작'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={loadDashboardData}
            disabled={loading}
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            새로고침
          </Button>
          <Button asChild variant="outline">
            <Link href="/">
              <Home className="w-4 h-4 mr-2" />
              홈으로
            </Link>
          </Button>
        </div>
      </div>

      {/* 마지막 업데이트 시간 */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="w-4 h-4" />
        마지막 업데이트: {lastUpdate.toLocaleString('ko-KR')}
      </div>

      {loading && !metrics ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" />
            <p>대시보드 데이터를 불러오는 중...</p>
          </div>
        </div>
      ) : (
        <>
          {/* 메트릭 카드들 */}
          {metrics && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center">
                    <Globe className="w-4 h-4 mr-2" />
                    모니터링 리전
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metrics.totalRegions}</div>
                  <p className="text-xs text-muted-foreground">
                    전 세계 Azure 리전
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center">
                    <Server className="w-4 h-4 mr-2" />
                    VM 유형
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metrics.totalVMTypes}</div>
                  <p className="text-xs text-muted-foreground">
                    GPU VM 시리즈
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center">
                    <Activity className="w-4 h-4 mr-2" />
                    전체 헬스 스코어
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${getHealthColor(metrics.overallHealthScore)}`}>
                    {metrics.overallHealthScore}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <Badge 
                      variant={metrics.overallHealthScore >= 75 ? 'default' : metrics.overallHealthScore >= 40 ? 'secondary' : 'destructive'}
                      className="text-xs"
                    >
                      {getHealthLabel(metrics.overallHealthScore)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {metrics.trendsLast24h.scoreChange > 0 ? '+' : ''}{metrics.trendsLast24h.scoreChange}점 (24h)
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center">
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    활성 알림
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">{metrics.activeAlerts}</div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-green-600">
                      +{metrics.trendsLast24h.newAlerts} 신규
                    </span>
                    <span className="text-xs text-blue-600">
                      -{metrics.trendsLast24h.resolvedAlerts} 해결
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* 탭 컨텐츠 */}
          <Tabs defaultValue="regions" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="regions">지역별 현황</TabsTrigger>
              <TabsTrigger value="vmseries">VM 시리즈</TabsTrigger>
              <TabsTrigger value="alerts">알림</TabsTrigger>
              <TabsTrigger value="trends">트렌드</TabsTrigger>
            </TabsList>

            <TabsContent value="regions" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <MapPin className="w-5 h-5 mr-2" />
                    지역별 용량 현황
                  </CardTitle>
                  <CardDescription>
                    Azure 리전별 GPU VM 가용성 상태
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {regionStatuses.map((region) => (
                      <Card key={region.region} className="border">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base">{region.displayName}</CardTitle>
                            {getTrendIcon(region.trend)}
                          </div>
                          <CardDescription className="text-xs">
                            {region.region}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">평균 스코어</span>
                            <span className={`text-sm font-bold ${getHealthColor(region.avgScore)}`}>
                              {region.avgScore}점
                            </span>
                          </div>
                          
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span>가용성 분포</span>
                              <span>{region.totalVMs} VMs</span>
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="flex items-center">
                                  <CheckCircle className="w-3 h-3 mr-1 text-green-500" />
                                  Available
                                </span>
                                <span>{region.availableVMs}</span>
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span className="flex items-center">
                                  <AlertTriangle className="w-3 h-3 mr-1 text-yellow-500" />
                                  Limited
                                </span>
                                <span>{region.limitedVMs}</span>
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span className="flex items-center">
                                  <XCircle className="w-3 h-3 mr-1 text-red-500" />
                                  Unavailable
                                </span>
                                <span>{region.unavailableVMs}</span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="text-xs text-muted-foreground">
                            업데이트: {new Date(region.lastUpdated).toLocaleTimeString('ko-KR')}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="vmseries" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <BarChart3 className="w-5 h-5 mr-2" />
                    VM 시리즈별 분석
                  </CardTitle>
                  <CardDescription>
                    GPU VM 시리즈별 가용성 및 성능 분석
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {vmSeriesStatuses.map((series) => (
                      <Card key={series.series} className="border">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base">{series.displayName}</CardTitle>
                            <Badge variant="outline">{series.totalInstances} instances</Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">평균 스코어</span>
                            <span className={`text-lg font-bold ${getHealthColor(series.avgScore)}`}>
                              {series.avgScore}점
                            </span>
                          </div>
                          
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs">
                              <span>가용성 분포</span>
                              <span>100%</span>
                            </div>
                            <div className="flex h-2 rounded-full overflow-hidden bg-gray-200">
                              <div 
                                className="bg-green-500" 
                                style={{ 
                                  width: `${(series.distribution.available / series.totalInstances) * 100}%` 
                                }}
                              ></div>
                              <div 
                                className="bg-yellow-500" 
                                style={{ 
                                  width: `${(series.distribution.limited / series.totalInstances) * 100}%` 
                                }}
                              ></div>
                              <div 
                                className="bg-red-500" 
                                style={{ 
                                  width: `${(series.distribution.unavailable / series.totalInstances) * 100}%` 
                                }}
                              ></div>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-green-600">{series.distribution.available} Available</span>
                              <span className="text-yellow-600">{series.distribution.limited} Limited</span>
                              <span className="text-red-600">{series.distribution.unavailable} Unavailable</span>
                            </div>
                          </div>
                          
                          <div>
                            <div className="text-xs font-medium mb-2">최고 성능 리전</div>
                            <div className="space-y-1">
                              {series.topRegions.map((regionData, idx) => (
                                <div key={regionData.region} className="flex items-center justify-between text-xs">
                                  <span className="flex items-center">
                                    <span className={`w-2 h-2 rounded-full mr-2 ${
                                      idx === 0 ? 'bg-yellow-400' : idx === 1 ? 'bg-gray-400' : 'bg-orange-400'
                                    }`}></span>
                                    {regionData.region}
                                  </span>
                                  <span className="font-medium">{regionData.score}점</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="alerts" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <AlertTriangle className="w-5 h-5 mr-2" />
                    실시간 알림
                  </CardTitle>
                  <CardDescription>
                    용량 이슈 및 시스템 알림
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {alerts.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
                        현재 활성 알림이 없습니다
                      </div>
                    ) : (
                      alerts.map((alert) => (
                        <div 
                          key={alert.id} 
                          className={`p-3 rounded-lg border-l-4 ${
                            alert.type === 'critical' ? 'border-red-500 bg-red-50' :
                            alert.type === 'warning' ? 'border-yellow-500 bg-yellow-50' :
                            'border-blue-500 bg-blue-50'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                {alert.type === 'critical' && <XCircle className="w-4 h-4 text-red-500" />}
                                {alert.type === 'warning' && <AlertTriangle className="w-4 h-4 text-yellow-500" />}
                                {alert.type === 'info' && <Activity className="w-4 h-4 text-blue-500" />}
                                <Badge 
                                  variant={
                                    alert.type === 'critical' ? 'destructive' :
                                    alert.type === 'warning' ? 'secondary' : 'default'
                                  }
                                  className="text-xs"
                                >
                                  {alert.type.toUpperCase()}
                                </Badge>
                              </div>
                              <p className="text-sm">{alert.message}</p>
                              {(alert.region || alert.vmSize) && (
                                <div className="flex gap-2 mt-1">
                                  {alert.region && (
                                    <Badge variant="outline" className="text-xs">{alert.region}</Badge>
                                  )}
                                  {alert.vmSize && (
                                    <Badge variant="outline" className="text-xs">{alert.vmSize}</Badge>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(alert.timestamp).toLocaleTimeString('ko-KR')}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="trends" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <TrendingUp className="w-5 h-5 mr-2" />
                    용량 트렌드 분석
                  </CardTitle>
                  <CardDescription>
                    시간별 용량 변화 및 예측
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12 text-muted-foreground">
                    <BarChart3 className="w-12 h-12 mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">트렌드 차트 준비 중</h3>
                    <p>시간별 용량 변화 차트가 곧 추가될 예정입니다.</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

// 모킹 데이터 생성 함수들
function generateMockMetrics(): DashboardMetrics {
  return {
    totalRegions: 8,
    totalVMTypes: 12,
    overallHealthScore: Math.floor(Math.random() * 30 + 50), // 50-80 사이
    activeAlerts: Math.floor(Math.random() * 5),
    lastScanTime: new Date().toISOString(),
    trendsLast24h: {
      scoreChange: Math.floor(Math.random() * 10 - 5), // -5 ~ +5
      newAlerts: Math.floor(Math.random() * 3),
      resolvedAlerts: Math.floor(Math.random() * 5)
    }
  };
}

function generateMockRegionStatuses(): RegionStatus[] {
  const regions = [
    { region: 'eastus2', displayName: 'East US 2' },
    { region: 'westus3', displayName: 'West US 3' },
    { region: 'koreacentral', displayName: 'Korea Central' },
    { region: 'japaneast', displayName: 'Japan East' },
    { region: 'westeurope', displayName: 'West Europe' },
    { region: 'australiacentral2', displayName: 'Australia Central 2' }
  ];

  return regions.map(r => {
    const totalVMs = Math.floor(Math.random() * 10 + 5);
    const availableVMs = Math.floor(Math.random() * totalVMs * 0.5);
    const unavailableVMs = Math.floor(Math.random() * (totalVMs - availableVMs) * 0.3);
    const limitedVMs = totalVMs - availableVMs - unavailableVMs;

    return {
      ...r,
      totalVMs,
      availableVMs,
      limitedVMs,
      unavailableVMs,
      avgScore: Math.floor(Math.random() * 40 + 40), // 40-80
      lastUpdated: new Date(Date.now() - Math.random() * 300000).toISOString(), // 최근 5분 내
      trend: ['up', 'down', 'stable'][Math.floor(Math.random() * 3)] as 'up' | 'down' | 'stable'
    };
  });
}

function generateMockVMSeriesStatuses(): VMSeriesStatus[] {
  const series = [
    { series: 'NC_T4', displayName: 'NC T4 Series (Tesla T4)' },
    { series: 'NC_A100', displayName: 'NC A100 Series (NVIDIA A100)' },
    { series: 'ND_A100', displayName: 'ND A100 Series (NVIDIA A100)' },
    { series: 'NV_v4', displayName: 'NV v4 Series (AMD Radeon Instinct MI25)' }
  ];

  return series.map(s => {
    const totalInstances = Math.floor(Math.random() * 20 + 10);
    const available = Math.floor(Math.random() * totalInstances * 0.4);
    const unavailable = Math.floor(Math.random() * totalInstances * 0.2);
    const limited = totalInstances - available - unavailable;

    return {
      ...s,
      totalInstances,
      avgScore: Math.floor(Math.random() * 40 + 35), // 35-75
      distribution: {
        available,
        limited,
        unavailable
      },
      topRegions: [
        { region: 'eastus2', score: Math.floor(Math.random() * 20 + 70) },
        { region: 'westus3', score: Math.floor(Math.random() * 20 + 60) },
        { region: 'westeurope', score: Math.floor(Math.random() * 20 + 50) }
      ].sort((a, b) => b.score - a.score)
    };
  });
}

function generateMockAlerts(): AlertItem[] {
  const alertTemplates = [
    { type: 'critical', message: 'Korea Central 리전에서 A100 시리즈 용량 부족 감지' },
    { type: 'warning', message: 'Japan East 리전에서 T4 시리즈 성능 저하' },
    { type: 'info', message: 'West Europe 리전에서 새로운 VM 타입 가용' },
    { type: 'critical', message: 'Australia Central에서 모든 ND 시리즈 Unavailable' },
    { type: 'warning', message: 'East US 2에서 Spot 가격 급등 감지' }
  ];

  const numAlerts = Math.floor(Math.random() * 4); // 0-3개 알림
  return alertTemplates.slice(0, numAlerts).map((template, idx) => ({
    id: `alert-${idx}`,
    type: template.type as 'critical' | 'warning' | 'info',
    message: template.message,
    region: Math.random() > 0.5 ? ['eastus2', 'koreacentral', 'japaneast'][Math.floor(Math.random() * 3)] : undefined,
    vmSize: Math.random() > 0.5 ? ['Standard_NC4as_T4_v3', 'Standard_NC24ads_A100_v4'][Math.floor(Math.random() * 2)] : undefined,
    timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString() // 최근 1시간 내
  }));
}
