import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

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

        <div className="flex flex-col sm:flex-row gap-4">
          <Button asChild size="lg">
            <Link href="/test">
              시스템 테스트 확인
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/instances">
              인스턴스 비교하기
            </Link>
          </Button>
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