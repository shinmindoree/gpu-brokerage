import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, BarChart3, Database, Settings, Zap } from "lucide-react"

export default function Home() {
  return (
    <div className="container mx-auto p-6 min-h-screen">
      <div className="flex flex-col items-center justify-center min-h-[80vh] space-y-8">
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