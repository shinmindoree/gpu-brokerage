'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, CheckCircle, Clock, Play, RefreshCw, Settings, Home } from 'lucide-react';
import Link from 'next/link';

interface CapacityResult {
  region: string;
  vmSize: string;
  success: boolean | null;
  errorCode?: string;
  errorClass: string;
  provisionMs?: number;
  timestamp: string;
  cached: boolean;
}

interface WorkerStatus {
  lastRun?: string;
  inCooldown: boolean;
  cooldownEndsAt?: string;
  config: {
    maxRunTimeMinutes: number;
    batchSizeLimit: number;
    cooldownMinutes: number;
  };
}

export default function AzureCapacityTestPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<CapacityResult[]>([]);
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus | null>(null);
  const [selectedRegion, setSelectedRegion] = useState('koreacentral');
  const [selectedVmSize, setSelectedVmSize] = useState('Standard_NC4as_T4_v3');

  const regions = [
    { code: 'koreacentral', name: 'Korea Central' },
    { code: 'eastus', name: 'East US' },
    { code: 'japaneast', name: 'Japan East' },
    { code: 'westeurope', name: 'West Europe' }
  ];

  const vmSizes = [
    { code: 'Standard_NC4as_T4_v3', name: 'NC4as T4 v3 (Tesla T4 x1)', gpu: 'T4' },
    { code: 'Standard_NC8as_T4_v3', name: 'NC8as T4 v3 (Tesla T4 x1)', gpu: 'T4' },
    { code: 'Standard_NC24ads_A100_v4', name: 'NC24ads A100 v4 (A100 x1)', gpu: 'A100' },
    { code: 'Standard_NC48ads_A100_v4', name: 'NC48ads A100 v4 (A100 x2)', gpu: 'A100' }
  ];

  // 단일 용량 체크
  const handleSingleCheck = async (force = false) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/azure/capacity-check', {
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
        setResults(prev => [data.data.result, ...prev.slice(0, 9)]); // 최근 10개만 유지
      } else {
        alert(`용량 체크 실패: ${data.message}`);
      }
    } catch (error) {
      console.error('단일 체크 오류:', error);
      alert('API 호출에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 배치 용량 체크
  const handleBatchCheck = async (force = false) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/azure/capacity-check', {
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
        setResults(data.data.results);
      } else {
        alert(`배치 체크 실패: ${data.message}`);
      }
    } catch (error) {
      console.error('배치 체크 오류:', error);
      alert('API 호출에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 워커 실행
  const handleWorkerRun = async (dryRun = false) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/azure/capacity-worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dryRun,
          maxCombinations: 8
        })
      });

      const data = await response.json();
      
      if (data.success) {
        alert(`워커 ${dryRun ? '시뮬레이션' : '실행'} 완료: ${data.message}`);
        if (!dryRun && data.data.results) {
          // 실제 실행인 경우 최근 결과 다시 로드
          loadRecentResults();
        }
      } else {
        alert(`워커 실행 실패: ${data.message}`);
      }
    } catch (error) {
      console.error('워커 실행 오류:', error);
      alert('워커 API 호출에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 워커 상태 조회
  const loadWorkerStatus = async () => {
    try {
      const response = await fetch('/api/azure/capacity-worker');
      const data = await response.json();
      
      if (data.success) {
        setWorkerStatus(data.data.workerStatus);
      }
    } catch (error) {
      console.error('워커 상태 조회 오류:', error);
    }
  };

  // 최근 결과 조회
  const loadRecentResults = async () => {
    try {
      const response = await fetch('/api/azure/capacity-check?hours=24');
      const data = await response.json();
      
      if (data.success) {
        setResults(data.data.results);
      }
    } catch (error) {
      console.error('최근 결과 조회 오류:', error);
    }
  };

  // 성공 상태에 따른 뱃지 렌더링
  const renderStatusBadge = (result: CapacityResult) => {
    if (result.success === true) {
      return <Badge variant="default" className="bg-green-100 text-green-800">
        <CheckCircle className="w-3 h-3 mr-1" />
        Available
      </Badge>;
    } else if (result.success === false) {
      return <Badge variant="destructive">
        <AlertCircle className="w-3 h-3 mr-1" />
        Unavailable
      </Badge>;
    } else {
      return <Badge variant="secondary">
        <Clock className="w-3 h-3 mr-1" />
        Ignored
      </Badge>;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Azure 용량 체크 테스트</h1>
          <p className="text-muted-foreground mt-2">
            Azure GPU VM 용량 모니터링 시스템 테스트 페이지
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadWorkerStatus}>
            <RefreshCw className="w-4 h-4 mr-2" />
            워커 상태 새로고침
          </Button>
          <Button variant="outline" onClick={loadRecentResults}>
            <RefreshCw className="w-4 h-4 mr-2" />
            결과 새로고침
          </Button>
          <Button asChild variant="outline">
            <Link href="/">
              <Home className="w-4 h-4 mr-2" />
              홈으로
            </Link>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="single" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="single">단일 체크</TabsTrigger>
          <TabsTrigger value="batch">배치 체크</TabsTrigger>
          <TabsTrigger value="worker">백그라운드 워커</TabsTrigger>
        </TabsList>

        {/* 단일 체크 탭 */}
        <TabsContent value="single" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>단일 리전/VM크기 용량 체크</CardTitle>
              <CardDescription>
                특정 리전과 VM 크기 조합의 용량을 확인합니다.
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
                        {vm.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={() => handleSingleCheck(false)}
                  disabled={isLoading}
                >
                  <Play className="w-4 h-4 mr-2" />
                  용량 체크 (캐시 사용)
                </Button>
                <Button 
                  onClick={() => handleSingleCheck(true)}
                  disabled={isLoading}
                  variant="outline"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  강제 체크
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 배치 체크 탭 */}
        <TabsContent value="batch" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>배치 용량 체크</CardTitle>
              <CardDescription>
                모든 리전과 VM크기 조합의 용량을 한 번에 확인합니다. (최대 16개 조합)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button 
                  onClick={() => handleBatchCheck(false)}
                  disabled={isLoading}
                >
                  <Play className="w-4 h-4 mr-2" />
                  배치 체크 (캐시 사용)
                </Button>
                <Button 
                  onClick={() => handleBatchCheck(true)}
                  disabled={isLoading}
                  variant="outline"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  강제 배치 체크
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 워커 탭 */}
        <TabsContent value="worker" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>백그라운드 워커</CardTitle>
              <CardDescription>
                자동화된 용량 체크 워커를 실행하고 상태를 확인합니다.
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
                      {workerStatus.lastRun ? 
                        new Date(workerStatus.lastRun).toLocaleString() : 
                        '없음'
                      }
                    </div>
                    <div>
                      <span className="text-muted-foreground">쿨다운 상태:</span>
                      <br />
                      {workerStatus.inCooldown ? (
                        <Badge variant="secondary">쿨다운 중</Badge>
                      ) : (
                        <Badge variant="default">실행 가능</Badge>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <Button 
                  onClick={() => handleWorkerRun(true)}
                  disabled={isLoading}
                  variant="outline"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Dry Run (시뮬레이션)
                </Button>
                <Button 
                  onClick={() => handleWorkerRun(false)}
                  disabled={isLoading || workerStatus?.inCooldown}
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
          <CardTitle>최근 체크 결과</CardTitle>
          <CardDescription>
            최근 24시간 내 Azure 용량 체크 결과 (최신순)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {results.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              아직 체크 결과가 없습니다. 위에서 체크를 실행해보세요.
            </p>
          ) : (
            <div className="space-y-3">
              {results.map((result, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {renderStatusBadge(result)}
                    <div>
                      <div className="font-medium">
                        {regions.find(r => r.code === result.region)?.name || result.region}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {vmSizes.find(v => v.code === result.vmSize)?.name || result.vmSize}
                      </div>
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="flex items-center gap-2">
                      {result.cached && (
                        <Badge variant="outline" className="text-xs">캐시됨</Badge>
                      )}
                      {result.provisionMs && (
                        <span className="text-muted-foreground">
                          {result.provisionMs}ms
                        </span>
                      )}
                    </div>
                    <div className="text-muted-foreground">
                      {new Date(result.timestamp).toLocaleString()}
                    </div>
                    {result.errorCode && (
                      <div className="text-xs text-red-600">
                        {result.errorCode}
                      </div>
                    )}
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
