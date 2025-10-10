'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  AlertTriangle, 
  ArrowRight, 
  CheckCircle, 
  Clock, 
  DollarSign, 
  Globe, 
  Home, 
  Lightbulb, 
  MapPin, 
  RefreshCw, 
  Search, 
  Server, 
  Star, 
  TrendingUp, 
  XCircle, 
  Zap 
} from 'lucide-react';
import Link from 'next/link';

interface RegionRecommendation {
  region: string;
  displayName: string;
  vmSize: string;
  score: number;
  label: string;
  confidence: number;
  pricePerHour?: number;
  pricePerGpu?: number;
  distance: number;
  reason: string;
}

interface SKURecommendation {
  region: string;
  vmSize: string;
  score: number;
  label: string;
  confidence: number;
  pricePerHour?: number;
  pricePerGpu?: number;
  gpuModel: string;
  gpuCount: number;
  gpuMemoryGB: number;
  performanceRatio: number;
  priceRatio: number;
  reason: string;
  compatibility: 'exact' | 'upgrade' | 'similar' | 'downgrade';
}

interface RecommendationResult {
  originalRequest: {
    region: string;
    vmSize: string;
    currentScore?: number;
    currentLabel?: string;
  };
  regionAlternatives: RegionRecommendation[];
  skuAlternatives: SKURecommendation[];
  summary: {
    totalAlternatives: number;
    bestRegionAlternative?: RegionRecommendation;
    bestSKUAlternative?: SKURecommendation;
    recommendationStrength: 'strong' | 'moderate' | 'weak';
  };
}

export const dynamic = 'force-dynamic'

function PageContent() {
  const searchParams = useSearchParams();
  const [originalRegion, setOriginalRegion] = useState('koreacentral');
  const [originalVMSize, setOriginalVMSize] = useState('Standard_NC24ads_A100_v4');
  const [includeHigherTier, setIncludeHigherTier] = useState(true);
  const [includeLowerTier, setIncludeLowerTier] = useState(false);
  const [maxPriceIncrease, setMaxPriceIncrease] = useState(2.0);
  const [minAvailabilityScore, setMinAvailabilityScore] = useState(40);
  
  const [recommendations, setRecommendations] = useState<RecommendationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // URL 파라미터로부터 초기값 설정
  useEffect(() => {
    const region = searchParams.get('region');
    const vmSize = searchParams.get('vmSize');
    
    if (region) {
      setOriginalRegion(region);
    }
    if (vmSize) {
      setOriginalVMSize(vmSize);
    }
    
    // URL에서 파라미터가 있으면 자동으로 추천 생성
    if (region && vmSize) {
      generateRecommendations();
    }
  }, [searchParams]);

  // 추천 요청
  const generateRecommendations = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/azure/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          originalRegion,
          originalVMSize,
          maxAlternatives: 8,
          includeHigherTier,
          includeLowerTier,
          maxPriceIncrease,
          minAvailabilityScore
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate recommendations');
      }

      const data = await response.json();
      
      if (data.success) {
        setRecommendations(data.data);
      } else {
        throw new Error(data.message || 'API returned error');
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // 가용성 라벨 색상
  const getAvailabilityColor = (label: string) => {
    switch (label) {
      case 'AVAILABLE':
        return 'bg-green-100 text-green-800';
      case 'LIMITED':
        return 'bg-yellow-100 text-yellow-800';
      case 'UNAVAILABLE':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // 호환성 뱃지 색상
  const getCompatibilityColor = (compatibility: string) => {
    switch (compatibility) {
      case 'exact':
        return 'bg-blue-100 text-blue-800';
      case 'upgrade':
        return 'bg-green-100 text-green-800';
      case 'similar':
        return 'bg-purple-100 text-purple-800';
      case 'downgrade':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // 추천 강도 색상
  const getRecommendationStrengthColor = (strength: string) => {
    switch (strength) {
      case 'strong':
        return 'text-green-600';
      case 'moderate':
        return 'text-yellow-600';
      case 'weak':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Azure GPU VM 추천 시스템</h1>
          <p className="text-muted-foreground mt-2">
            용량 부족시 최적의 대체 리전 및 VM 추천
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/">
            <Home className="w-4 h-4 mr-2" />
            홈으로
          </Link>
        </Button>
      </div>

      {/* 추천 요청 폼 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Search className="w-5 h-5 mr-2" />
            추천 요청
          </CardTitle>
          <CardDescription>
            원하는 GPU VM의 리전과 타입을 입력하여 최적의 대안을 찾아보세요
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">원본 리전</label>
              <Input
                value={originalRegion}
                onChange={(e) => setOriginalRegion(e.target.value)}
                placeholder="예: koreacentral"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">원본 VM 크기</label>
              <Input
                value={originalVMSize}
                onChange={(e) => setOriginalVMSize(e.target.value)}
                placeholder="예: Standard_NC24ads_A100_v4"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">상위 티어 포함</label>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={includeHigherTier}
                  onChange={(e) => setIncludeHigherTier(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">더 높은 성능 VM</span>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">하위 티어 포함</label>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={includeLowerTier}
                  onChange={(e) => setIncludeLowerTier(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">더 낮은 성능 VM</span>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">최대 가격 증가</label>
              <Input
                type="number"
                step="0.1"
                min="1"
                max="5"
                value={maxPriceIncrease}
                onChange={(e) => setMaxPriceIncrease(parseFloat(e.target.value))}
                placeholder="2.0"
              />
              <span className="text-xs text-muted-foreground">
                {((maxPriceIncrease - 1) * 100).toFixed(0)}% 증가까지 허용
              </span>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">최소 가용성 점수</label>
              <Input
                type="number"
                min="0"
                max="100"
                value={minAvailabilityScore}
                onChange={(e) => setMinAvailabilityScore(parseInt(e.target.value))}
                placeholder="40"
              />
            </div>
          </div>

          <Button 
            onClick={generateRecommendations} 
            disabled={loading || !originalRegion || !originalVMSize}
            className="w-full"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Lightbulb className="w-4 h-4 mr-2" />
            )}
            추천 생성
          </Button>
        </CardContent>
      </Card>

      {/* 오류 메시지 */}
      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            {error}
          </AlertDescription>
        </Alert>
      )}

      {/* 추천 결과 */}
      {recommendations && (
        <div className="space-y-6">
          {/* 요약 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center">
                  <Star className="w-5 h-5 mr-2" />
                  추천 요약
                </span>
                <Badge 
                  className={`${getRecommendationStrengthColor(recommendations.summary.recommendationStrength)}`}
                  variant="outline"
                >
                  {recommendations.summary.recommendationStrength === 'strong' && '강한 추천'}
                  {recommendations.summary.recommendationStrength === 'moderate' && '보통 추천'}
                  {recommendations.summary.recommendationStrength === 'weak' && '약한 추천'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-600">
                    {recommendations.summary.totalAlternatives}
                  </div>
                  <div className="text-sm text-muted-foreground">총 대안 수</div>
                </div>
                
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {recommendations.regionAlternatives.length}
                  </div>
                  <div className="text-sm text-muted-foreground">대체 리전</div>
                </div>
                
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    {recommendations.skuAlternatives.length}
                  </div>
                  <div className="text-sm text-muted-foreground">대체 VM</div>
                </div>
              </div>

              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <div className="text-sm">
                  <strong>원본 요청:</strong> {recommendations.originalRequest.region} / {recommendations.originalRequest.vmSize}
                  {recommendations.originalRequest.currentScore && (
                    <span className="ml-2">
                      (현재 점수: {recommendations.originalRequest.currentScore}점)
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 추천 탭 */}
          <Tabs defaultValue="regions" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="regions">대체 리전 ({recommendations.regionAlternatives.length})</TabsTrigger>
              <TabsTrigger value="skus">대체 VM ({recommendations.skuAlternatives.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="regions" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Globe className="w-5 h-5 mr-2" />
                    대체 리전 추천
                  </CardTitle>
                  <CardDescription>
                    동일한 VM으로 다른 리전에서 사용 가능한 옵션들
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {recommendations.regionAlternatives.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <XCircle className="w-8 h-8 mx-auto mb-2" />
                      조건에 맞는 대체 리전을 찾을 수 없습니다
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {recommendations.regionAlternatives.map((rec, idx) => (
                        <Card key={`${rec.region}-${idx}`} className="border">
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-base flex items-center">
                                <MapPin className="w-4 h-4 mr-2" />
                                {rec.displayName}
                              </CardTitle>
                              {idx === 0 && (
                                <Badge className="bg-yellow-100 text-yellow-800">
                                  최우선 추천
                                </Badge>
                              )}
                            </div>
                            <CardDescription className="text-xs">
                              {rec.region}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm">가용성 점수</span>
                              <Badge className={getAvailabilityColor(rec.label)}>
                                {rec.score}점 ({rec.label})
                              </Badge>
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <span className="text-sm">지연시간</span>
                              <div className="flex items-center">
                                <Clock className="w-3 h-3 mr-1" />
                                <span className="text-sm">
                                  {rec.distance === 1 ? '매우 낮음' : 
                                   rec.distance === 2 ? '낮음' : 
                                   rec.distance === 3 ? '보통' : 
                                   rec.distance === 4 ? '높음' : '매우 높음'}
                                </span>
                              </div>
                            </div>
                            
                            {rec.pricePerHour && (
                              <div className="flex items-center justify-between">
                                <span className="text-sm">시간당 가격</span>
                                <div className="flex items-center">
                                  <DollarSign className="w-3 h-3 mr-1" />
                                  <span className="text-sm font-medium">
                                    ${rec.pricePerHour.toFixed(3)}/h
                                  </span>
                                </div>
                              </div>
                            )}
                            
                            <div className="text-xs text-muted-foreground bg-gray-50 p-2 rounded">
                              <strong>추천 이유:</strong> {rec.reason}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="skus" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Server className="w-5 h-5 mr-2" />
                    대체 VM 추천
                  </CardTitle>
                  <CardDescription>
                    동일한 리전에서 다른 VM 타입으로 사용 가능한 옵션들
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {recommendations.skuAlternatives.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <XCircle className="w-8 h-8 mx-auto mb-2" />
                      조건에 맞는 대체 VM을 찾을 수 없습니다
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {recommendations.skuAlternatives.map((rec, idx) => (
                        <Card key={`${rec.vmSize}-${idx}`} className="border">
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-base">{rec.vmSize}</CardTitle>
                              {idx === 0 && (
                                <Badge className="bg-yellow-100 text-yellow-800">
                                  최우선 추천
                                </Badge>
                              )}
                            </div>
                            <CardDescription className="text-xs">
                              {rec.gpuModel} × {rec.gpuCount} ({rec.gpuMemoryGB}GB)
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm">호환성</span>
                              <Badge className={getCompatibilityColor(rec.compatibility)}>
                                {rec.compatibility === 'exact' && '정확히 일치'}
                                {rec.compatibility === 'upgrade' && '성능 향상'}
                                {rec.compatibility === 'similar' && '유사'}
                                {rec.compatibility === 'downgrade' && '성능 절약'}
                              </Badge>
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <span className="text-sm">가용성 점수</span>
                              <Badge className={getAvailabilityColor(rec.label)}>
                                {rec.score}점 ({rec.label})
                              </Badge>
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <span className="text-sm">성능 비율</span>
                              <div className="flex items-center">
                                <TrendingUp className="w-3 h-3 mr-1" />
                                <span className="text-sm">
                                  {(rec.performanceRatio * 100).toFixed(0)}%
                                </span>
                              </div>
                            </div>
                            
                            {rec.pricePerHour && (
                              <div className="flex items-center justify-between">
                                <span className="text-sm">가격 비율</span>
                                <div className="flex items-center">
                                  <DollarSign className="w-3 h-3 mr-1" />
                                  <span className={`text-sm ${rec.priceRatio < 1 ? 'text-green-600' : rec.priceRatio > 1 ? 'text-red-600' : ''}`}>
                                    {(rec.priceRatio * 100).toFixed(0)}%
                                  </span>
                                </div>
                              </div>
                            )}
                            
                            <div className="text-xs text-muted-foreground bg-gray-50 p-2 rounded">
                              <strong>추천 이유:</strong> {rec.reason}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}

export default function AzureRecommendationsPage() {
  return (
    <Suspense fallback={<div className="container mx-auto p-6"><div className="flex items-center justify-center min-h-[400px]"><RefreshCw className="h-5 w-5 animate-spin mr-2" />로딩 중...</div></div>}>
      <PageContent />
    </Suspense>
  )
}
