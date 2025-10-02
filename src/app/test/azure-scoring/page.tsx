'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle, AlertTriangle, XCircle, TrendingUp, Clock, Zap, BarChart3, Target, RefreshCw, Play, Settings, Home } from 'lucide-react';
import Link from 'next/link';

interface CapacityScore {
  region: string;
  vmSize: string;
  score: number;
  label: 'AVAILABLE' | 'LIMITED' | 'UNAVAILABLE';
  confidence: number;
  successRate: number;
  avgProvisionMs: number;
  capacityErrorRate: number;
  spotStress: number;
  sampleCount: number;
  dataFreshness: number;
  calculatedAt: string;
  recommendation?: string;
  alternatives?: string[];
  analysis?: {
    scoreBreakdown: {
      successRate: string;
      provisionSpeed: string;
      errorRate: string;
      spotStress: string;
    };
    strengths: string[];
    weaknesses: string[];
    reliability: {
      confidence: string;
      dataQuality: 'high' | 'medium' | 'low';
    };
  };
}

interface ScoreInsights {
  primary: string;
  secondary: string[];
  actionItems: string[];
}

export default function AzureScoringTestPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [scores, setScores] = useState<CapacityScore[]>([]);
  const [selectedRegion, setSelectedRegion] = useState('koreacentral');
  const [selectedVmSize, setSelectedVmSize] = useState('Standard_NC24ads_A100_v4');
  const [windowHours, setWindowHours] = useState(24);
  const [currentScore, setCurrentScore] = useState<CapacityScore | null>(null);
  const [insights, setInsights] = useState<ScoreInsights | null>(null);

  const regions = [
    { code: 'koreacentral', name: 'Korea Central' },
    { code: 'eastus', name: 'East US' },
    { code: 'japaneast', name: 'Japan East' },
    { code: 'westeurope', name: 'West Europe' }
  ];

  const vmSizes = [
    { code: 'Standard_NC4as_T4_v3', name: 'NC4as T4 v3 (Tesla T4)', desc: '기본 GPU' },
    { code: 'Standard_NC8as_T4_v3', name: 'NC8as T4 v3 (Tesla T4)', desc: '기본 GPU' },
    { code: 'Standard_NC24ads_A100_v4', name: 'NC24ads A100 v4 (A100)', desc: '고성능 GPU' },
    { code: 'Standard_NC48ads_A100_v4', name: 'NC48ads A100 v4 (A100 x2)', desc: '고성능 GPU' }
  ];

  // 단일 스코어 계산
  const handleSingleScoreCalculation = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/azure/capacity-scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region: selectedRegion,
          vmSize: selectedVmSize,
          windowHours
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setCurrentScore(data.data.score);
        setInsights(data.data.insights);
        setScores(prev => [data.data.score, ...prev.slice(0, 9)]);
        console.log('스코어 계산 성공:', data.data);
      } else {
        alert(`스코어 계산 실패: ${data.message}`);
      }
    } catch (error) {
      console.error('단일 스코어 계산 오류:', error);
      alert('API 호출에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 배치 스코어 계산
  const handleBatchScoreCalculation = async () => {
    setIsLoading(true);
    try {
      const combinations = regions.flatMap(region => 
        vmSizes.map(vm => ({ region: region.code, vmSize: vm.code }))
      );

      const response = await fetch('/api/azure/capacity-scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          combinations,
          windowHours
        })
      });

      const data = await response.json();
      
      if (data.success) {
        const validScores = data.data.scores.filter((s: any) => !s.error);
        setScores(validScores);
        console.log('배치 스코어 계산 성공:', data.data);
      } else {
        alert(`배치 스코어 계산 실패: ${data.message}`);
      }
    } catch (error) {
      console.error('배치 스코어 계산 오류:', error);
      alert('API 호출에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 저장된 스코어 조회
  const loadSavedScores = async () => {
    try {
      const response = await fetch('/api/azure/capacity-scores?limit=20');
      const data = await response.json();
      
      if (data.success) {
        setScores(data.data.scores);
      }
    } catch (error) {
      console.error('저장된 스코어 조회 오류:', error);
    }
  };

  // 스코어 라벨에 따른 아이콘과 색상
  const renderScoreLabel = (score: CapacityScore) => {
    switch (score.label) {
      case 'AVAILABLE':
        return (
          <Badge className="bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" />
            사용 가능
          </Badge>
        );
      case 'LIMITED':
        return (
          <Badge variant="secondary">
            <AlertTriangle className="w-3 h-3 mr-1" />
            제한적
          </Badge>
        );
      case 'UNAVAILABLE':
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            사용 불가
          </Badge>
        );
    }
  };

  // 신뢰도 표시
  const renderConfidenceBadge = (confidence: number) => {
    const percentage = Math.round(confidence * 100);
    if (confidence >= 0.7) {
      return <Badge variant="default">신뢰도 높음 ({percentage}%)</Badge>;
    } else if (confidence >= 0.4) {
      return <Badge variant="secondary">신뢰도 보통 ({percentage}%)</Badge>;
    } else {
      return <Badge variant="outline">신뢰도 낮음 ({percentage}%)</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Azure 용량 스코어링 테스트</h1>
          <p className="text-muted-foreground mt-2">
            용량 체크와 Spot 신호를 종합한 Azure GPU VM 용량 스코어링 시스템
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadSavedScores}>
            <RefreshCw className="w-4 h-4 mr-2" />
            저장된 스코어
          </Button>
          <Button asChild variant="outline">
            <Link href="/">
              <Home className="w-4 h-4 mr-2" />
              홈으로
            </Link>
          </Button>
        </div>
      </div>

      {/* 현재 계산된 스코어 표시 */}
      {currentScore && (
        <Card className="border-2 border-primary">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center">
                <Target className="w-5 h-5 mr-2" />
                최신 스코어 결과
              </CardTitle>
              {renderScoreLabel(currentScore)}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 메인 스코어 */}
            <div className="text-center">
              <div className="text-6xl font-bold mb-2" style={{
                color: currentScore.score >= 75 ? '#22c55e' : 
                       currentScore.score >= 40 ? '#f59e0b' : '#ef4444'
              }}>
                {currentScore.score}
              </div>
              <div className="text-lg text-muted-foreground">/ 100점</div>
              <div className="mt-2">
                {renderConfidenceBadge(currentScore.confidence)}
              </div>
            </div>

            {/* 진행률 바 */}
            <div className="space-y-2">
              <Progress value={currentScore.score} className="h-3" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0점</span>
                <span>50점</span>
                <span>100점</span>
              </div>
            </div>

            {/* 세부 지표들 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-lg font-bold text-green-600">
                  {(currentScore.successRate * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">성공률</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold">
                  {(currentScore.avgProvisionMs / 1000).toFixed(1)}s
                </div>
                <div className="text-xs text-muted-foreground">프로비저닝</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold">
                  {(currentScore.capacityErrorRate * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">에러율</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold">
                  {(currentScore.spotStress * 100).toFixed(0)}%
                </div>
                <div className="text-xs text-muted-foreground">Spot 스트레스</div>
              </div>
            </div>

            {/* 추천사항 */}
            {currentScore.recommendation && (
              <div className="p-3 bg-muted rounded-lg">
                <div className="font-medium mb-1">추천사항</div>
                <div className="text-sm">{currentScore.recommendation}</div>
              </div>
            )}

            {/* 인사이트 */}
            {insights && (
              <div className="space-y-3">
                <div className="p-3 bg-blue-50 rounded-lg">
                  <div className="font-medium text-blue-900 mb-1">주요 인사이트</div>
                  <div className="text-sm text-blue-800">{insights.primary}</div>
                </div>
                
                {insights.secondary.length > 0 && (
                  <div className="p-3 bg-yellow-50 rounded-lg">
                    <div className="font-medium text-yellow-900 mb-1">보조 인사이트</div>
                    <ul className="text-sm text-yellow-800 space-y-1">
                      {insights.secondary.map((insight, idx) => (
                        <li key={idx}>• {insight}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {insights.actionItems.length > 0 && (
                  <div className="p-3 bg-red-50 rounded-lg">
                    <div className="font-medium text-red-900 mb-1">권장 액션</div>
                    <ul className="text-sm text-red-800 space-y-1">
                      {insights.actionItems.map((action, idx) => (
                        <li key={idx}>• {action}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="single" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="single">단일 스코어 계산</TabsTrigger>
          <TabsTrigger value="batch">배치 스코어 계산</TabsTrigger>
          <TabsTrigger value="analysis">스코어 분석</TabsTrigger>
        </TabsList>

        {/* 단일 스코어 계산 탭 */}
        <TabsContent value="single" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>단일 용량 스코어 계산</CardTitle>
              <CardDescription>
                특정 리전과 VM 크기의 종합 용량 스코어를 계산합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <div>
                  <label className="text-sm font-medium">분석 기간 (시간)</label>
                  <select 
                    value={windowHours}
                    onChange={(e) => setWindowHours(parseInt(e.target.value))}
                    className="w-full mt-1 p-2 border rounded-md"
                  >
                    <option value={6}>6시간</option>
                    <option value={12}>12시간</option>
                    <option value={24}>24시간</option>
                    <option value={48}>48시간</option>
                    <option value={72}>72시간</option>
                  </select>
                </div>
              </div>
              
              <Button 
                onClick={handleSingleScoreCalculation}
                disabled={isLoading}
                size="lg"
                className="w-full"
              >
                <BarChart3 className="w-4 h-4 mr-2" />
                용량 스코어 계산하기
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 배치 스코어 계산 탭 */}
        <TabsContent value="batch" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>배치 용량 스코어 계산</CardTitle>
              <CardDescription>
                모든 리전과 VM크기 조합의 용량 스코어를 한 번에 계산합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">
                  계산할 조합: {regions.length}개 리전 × {vmSizes.length}개 VM = {regions.length * vmSizes.length}개 조합
                </div>
                <div className="text-sm text-muted-foreground">
                  예상 소요 시간: 약 {Math.ceil(regions.length * vmSizes.length * 1.5 / 60)}분
                </div>
              </div>
              
              <Button 
                onClick={handleBatchScoreCalculation}
                disabled={isLoading}
                size="lg"
                className="w-full"
              >
                <Play className="w-4 h-4 mr-2" />
                배치 스코어 계산 시작
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 스코어 분석 탭 */}
        <TabsContent value="analysis" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>스코어 분석 및 비교</CardTitle>
              <CardDescription>
                계산된 용량 스코어들을 분석하고 비교합니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {scores.length === 0 ? (
                <div className="text-center py-8">
                  <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    아직 계산된 스코어가 없습니다. 위에서 스코어 계산을 시작해보세요.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* 요약 통계 */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
                    <div className="text-center">
                      <div className="text-lg font-bold">
                        {scores.filter(s => s.label === 'AVAILABLE').length}
                      </div>
                      <div className="text-sm text-muted-foreground">사용 가능</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold">
                        {scores.filter(s => s.label === 'LIMITED').length}
                      </div>
                      <div className="text-sm text-muted-foreground">제한적</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold">
                        {scores.filter(s => s.label === 'UNAVAILABLE').length}
                      </div>
                      <div className="text-sm text-muted-foreground">사용 불가</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold">
                        {(scores.reduce((sum, s) => sum + s.score, 0) / scores.length).toFixed(1)}
                      </div>
                      <div className="text-sm text-muted-foreground">평균 점수</div>
                    </div>
                  </div>

                  {/* 스코어 목록 */}
                  <div className="space-y-3">
                    {scores.map((score, index) => (
                      <div key={index} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            {renderScoreLabel(score)}
                            <div>
                              <div className="font-medium">
                                {regions.find(r => r.code === score.region)?.name} / 
                                {vmSizes.find(v => v.code === score.vmSize)?.name}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {renderConfidenceBadge(score.confidence)}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold">
                              {score.score}점
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(score.calculatedAt).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">성공률:</span> {(score.successRate * 100).toFixed(1)}%
                          </div>
                          <div>
                            <span className="text-muted-foreground">속도:</span> {(score.avgProvisionMs / 1000).toFixed(1)}s
                          </div>
                          <div>
                            <span className="text-muted-foreground">에러율:</span> {(score.capacityErrorRate * 100).toFixed(1)}%
                          </div>
                          <div>
                            <span className="text-muted-foreground">Spot:</span> {(score.spotStress * 100).toFixed(0)}%
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
