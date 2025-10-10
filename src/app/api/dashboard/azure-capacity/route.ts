// Azure 용량 대시보드 API
import { NextRequest, NextResponse } from 'next/server';

interface RegionSummary {
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

interface VMSeriesSummary {
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

interface DashboardAlert {
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

/**
 * GET /api/dashboard/azure-capacity
 * Azure 용량 대시보드 데이터 조회
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🎯 Azure 용량 대시보드 데이터 생성 시작');

    // TODO: 실제 DB에서 데이터 조회로 교체
    // 현재는 실제 API 기반 모킹 데이터 생성
    
    // Azure capacity scores 가져오기
    const scoresResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/azure/capacity-scores?limit=100`);
    let scores = [];
    
    if (scoresResponse.ok) {
      const scoresData = await scoresResponse.json();
      scores = scoresData.success ? scoresData.data.scores : [];
    }

    // 대시보드 메트릭 계산
    const metrics = calculateDashboardMetrics(scores);
    
    // 지역별 요약 생성
    const regionSummaries = generateRegionSummaries(scores);
    
    // VM 시리즈별 요약 생성
    const vmSeriesSummaries = generateVMSeriesSummaries(scores);
    
    // 알림 생성 (실제로는 DB에서 조회)
    const alerts = generateAlerts(scores);

    return NextResponse.json({
      success: true,
      data: {
        metrics,
        regions: regionSummaries,
        vmSeries: vmSeriesSummaries,
        alerts,
        lastUpdated: new Date().toISOString()
      },
      message: '대시보드 데이터 조회 완료'
    });

  } catch (error) {
    console.error('Azure 용량 대시보드 API 오류:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: '대시보드 데이터 조회에 실패했습니다.'
    }, { status: 500 });
  }
}

/**
 * 대시보드 메트릭 계산
 */
function calculateDashboardMetrics(scores: any[]): DashboardMetrics {
  if (scores.length === 0) {
    return {
      totalRegions: 0,
      totalVMTypes: 0,
      overallHealthScore: 0,
      activeAlerts: 0,
      lastScanTime: new Date().toISOString(),
      trendsLast24h: {
        scoreChange: 0,
        newAlerts: 0,
        resolvedAlerts: 0
      }
    };
  }

  const uniqueRegions = new Set(scores.map(s => s.region));
  const uniqueVMTypes = new Set(scores.map(s => s.vmSize));
  
  const avgScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
  
  // 알림 개수 계산 (스코어 40 이하는 알림)
  const activeAlerts = scores.filter(s => s.score <= 40).length;

  return {
    totalRegions: uniqueRegions.size,
    totalVMTypes: uniqueVMTypes.size,
    overallHealthScore: Math.round(avgScore),
    activeAlerts,
    lastScanTime: new Date().toISOString(),
    trendsLast24h: {
      scoreChange: Math.floor(Math.random() * 10 - 5), // 임시: 실제로는 히스토리 DB에서 계산
      newAlerts: Math.floor(activeAlerts * 0.3),
      resolvedAlerts: Math.floor(Math.random() * 5)
    }
  };
}

/**
 * 지역별 요약 생성
 */
function generateRegionSummaries(scores: any[]): RegionSummary[] {
  const regionMap = new Map<string, any[]>();
  
  // 지역별로 스코어 그룹화
  scores.forEach(score => {
    if (!regionMap.has(score.region)) {
      regionMap.set(score.region, []);
    }
    regionMap.get(score.region)!.push(score);
  });

  // 지역 표시명 매핑
  const regionDisplayNames: Record<string, string> = {
    'eastus': 'East US',
    'eastus2': 'East US 2',
    'westus': 'West US',
    'westus2': 'West US 2',
    'westus3': 'West US 3',
    'koreacentral': 'Korea Central',
    'japaneast': 'Japan East',
    'westeurope': 'West Europe',
    'northeurope': 'North Europe',
    'australiacentral2': 'Australia Central 2',
    'mexicocentral': 'Mexico Central',
    'southcentralus': 'South Central US'
  };

  const summaries: RegionSummary[] = [];
  
  regionMap.forEach((regionScores, region) => {
    const totalVMs = regionScores.length;
    const availableVMs = regionScores.filter(s => s.label === 'AVAILABLE').length;
    const limitedVMs = regionScores.filter(s => s.label === 'LIMITED').length;
    const unavailableVMs = regionScores.filter(s => s.label === 'UNAVAILABLE').length;
    
    const avgScore = regionScores.reduce((sum, s) => sum + s.score, 0) / totalVMs;
    
    // 트렌드 계산 (임시: 랜덤)
    const trend = avgScore >= 65 ? 'up' : avgScore <= 45 ? 'down' : 'stable';

    summaries.push({
      region,
      displayName: regionDisplayNames[region] || region,
      totalVMs,
      availableVMs,
      limitedVMs,
      unavailableVMs,
      avgScore: Math.round(avgScore),
      lastUpdated: new Date().toISOString(),
      trend: trend as 'up' | 'down' | 'stable'
    });
  });

  return summaries.sort((a, b) => b.avgScore - a.avgScore);
}

/**
 * VM 시리즈별 요약 생성
 */
function generateVMSeriesSummaries(scores: any[]): VMSeriesSummary[] {
  const seriesMap = new Map<string, any[]>();
  
  // VM 시리즈별로 그룹화
  scores.forEach(score => {
    let series = 'Other';
    
    if (score.vmSize.includes('NC') && score.vmSize.includes('T4')) {
      series = 'NC_T4';
    } else if (score.vmSize.includes('NC') && score.vmSize.includes('A100')) {
      series = 'NC_A100';
    } else if (score.vmSize.includes('ND')) {
      series = 'ND_A100';
    } else if (score.vmSize.includes('NV')) {
      series = 'NV_v4';
    }
    
    if (!seriesMap.has(series)) {
      seriesMap.set(series, []);
    }
    seriesMap.get(series)!.push(score);
  });

  const seriesDisplayNames: Record<string, string> = {
    'NC_T4': 'NC T4 Series (Tesla T4)',
    'NC_A100': 'NC A100 Series (NVIDIA A100)',
    'ND_A100': 'ND A100 Series (NVIDIA A100)',
    'NV_v4': 'NV v4 Series (AMD Radeon)',
    'Other': 'Other Series'
  };

  const summaries: VMSeriesSummary[] = [];
  
  seriesMap.forEach((seriesScores, series) => {
    const totalInstances = seriesScores.length;
    const available = seriesScores.filter(s => s.label === 'AVAILABLE').length;
    const limited = seriesScores.filter(s => s.label === 'LIMITED').length;
    const unavailable = seriesScores.filter(s => s.label === 'UNAVAILABLE').length;
    
    const avgScore = seriesScores.reduce((sum, s) => sum + s.score, 0) / totalInstances;
    
    // 지역별 최고 점수 계산
    const regionScores = new Map<string, number[]>();
    seriesScores.forEach(score => {
      if (!regionScores.has(score.region)) {
        regionScores.set(score.region, []);
      }
      regionScores.get(score.region)!.push(score.score);
    });

    const topRegions: Array<{ region: string; score: number }> = [];
    regionScores.forEach((scores, region) => {
      const avgRegionScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
      topRegions.push({ region, score: Math.round(avgRegionScore) });
    });
    
    topRegions.sort((a, b) => b.score - a.score);

    summaries.push({
      series,
      displayName: seriesDisplayNames[series] || series,
      totalInstances,
      avgScore: Math.round(avgScore),
      distribution: {
        available,
        limited,
        unavailable
      },
      topRegions: topRegions.slice(0, 3)
    });
  });

  return summaries.sort((a, b) => b.avgScore - a.avgScore);
}

/**
 * 알림 생성
 */
function generateAlerts(scores: any[]): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];
  
  // Critical: 스코어 30 이하
  const criticalScores = scores.filter(s => s.score <= 30);
  criticalScores.forEach((score, idx) => {
    if (idx < 3) { // 최대 3개까지만
      alerts.push({
        id: `critical-${idx}`,
        type: 'critical',
        message: `${score.region}에서 ${score.vmSize} 심각한 용량 부족 (${score.score}점)`,
        region: score.region,
        vmSize: score.vmSize,
        timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString()
      });
    }
  });
  
  // Warning: 스코어 31-50
  const warningScores = scores.filter(s => s.score > 30 && s.score <= 50);
  warningScores.forEach((score, idx) => {
    if (idx < 2) { // 최대 2개까지만
      alerts.push({
        id: `warning-${idx}`,
        type: 'warning',
        message: `${score.region}에서 ${score.vmSize} 용량 제한 감지 (${score.score}점)`,
        region: score.region,
        vmSize: score.vmSize,
        timestamp: new Date(Date.now() - Math.random() * 7200000).toISOString()
      });
    }
  });
  
  // Info: 새로운 고성능 리전 발견
  const highScores = scores.filter(s => s.score >= 80);
  if (highScores.length > 0) {
    const best = highScores[0];
    alerts.push({
      id: 'info-high-performance',
      type: 'info',
      message: `${best.region}에서 ${best.vmSize} 우수한 성능 확인 (${best.score}점)`,
      region: best.region,
      vmSize: best.vmSize,
      timestamp: new Date(Date.now() - Math.random() * 1800000).toISOString()
    });
  }

  return alerts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}


