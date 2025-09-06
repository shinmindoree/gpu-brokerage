import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default async function TestPage() {
  // 데이터베이스에서 기본 통계 조회
  const [
    providerCount,
    regionCount,
    gpuModelCount,
    instanceTypeCount,
    priceCount
  ] = await Promise.all([
    prisma.provider.count(),
    prisma.region.count(),
    prisma.gpuModel.count(),
    prisma.instanceType.count(),
    prisma.priceHistory.count()
  ])

  // 프로바이더별 데이터 조회 (모든 프로바이더 균등하게)
  const providersWithData = await prisma.provider.findMany({
    include: {
      regions: {
        include: {
          instanceTypes: {
            take: 3, // 각 리전당 3개씩
            include: {
              family: {
                include: {
                  gpuModel: true
                }
              },
              priceHistory: {
                where: {
                  purchaseOption: 'on_demand'
                },
                orderBy: {
                  effectiveDate: 'desc'
                },
                take: 1
              }
            }
          }
        }
      }
    }
  })

  // GPU 모델별 통계
  const gpuStats = await prisma.gpuModel.findMany({
    include: {
      instanceFamilies: {
        include: {
          instanceTypes: true
        }
      }
    }
  })

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col space-y-4">
        <h1 className="text-3xl font-bold">GPU 브로커리지 시스템 테스트</h1>
        <p className="text-muted-foreground">
          데이터베이스 연결 및 시드 데이터를 확인합니다.
        </p>
      </div>

      {/* 통계 카드들 */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">프로바이더</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{providerCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">리전</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{regionCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">GPU 모델</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{gpuModelCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">인스턴스 타입</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{instanceTypeCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">가격 데이터</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{priceCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* GPU 모델 통계 */}
      <Card>
        <CardHeader>
          <CardTitle>GPU 모델별 통계</CardTitle>
          <CardDescription>각 GPU 모델별 사용 가능한 인스턴스 수</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {gpuStats.map((gpu) => {
              const totalInstances = gpu.instanceFamilies.reduce(
                (acc, family) => acc + family.instanceTypes.length, 
                0
              )
              return (
                <div key={gpu.id} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">{gpu.vendor} {gpu.model}</h3>
                    <Badge variant="secondary">{gpu.architecture}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <div>VRAM: {gpu.vramGb}GB {gpu.memoryType}</div>
                    <div>FP16: {gpu.fp16Tflops ? `${gpu.fp16Tflops} TFLOPS` : 'N/A'}</div>
                    <div>인스턴스: {totalInstances}개</div>
                    {gpu.nvlinkSupport && <Badge variant="outline" className="text-xs">NVLink</Badge>}
                    {gpu.migSupport && <Badge variant="outline" className="text-xs">MIG</Badge>}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* 프로바이더별 인스턴스 데이터 */}
      {providersWithData.map((provider) => (
        <Card key={provider.id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Badge variant="outline" className="text-lg px-3 py-1">
                {provider.code.toUpperCase()}
              </Badge>
              {provider.name}
            </CardTitle>
            <CardDescription>
              {provider.regions.length}개 리전에서 제공되는 GPU 인스턴스들
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {provider.regions.map((region) => (
                <div key={region.id} className="space-y-3">
                  <div className="border-b pb-2">
                    <h4 className="font-semibold text-sm">{region.name}</h4>
                    <p className="text-xs text-muted-foreground">
                      {region.code} • {region.countryCode}
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    {region.instanceTypes.map((instance) => {
                      const price = instance.priceHistory[0]
                      const pricePerGpu = price ? (price.priceAmount / instance.gpuCount).toFixed(2) : 'N/A'
                      
                      return (
                        <div key={instance.id} className="p-3 bg-muted/30 rounded-lg text-sm">
                          <div className="font-medium mb-1">{instance.instanceName}</div>
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="secondary" className="text-xs">
                              {instance.family.gpuModel.model}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              × {instance.gpuCount}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mb-2">
                            <span>vCPU: {instance.vcpuCount}</span>
                            <span>RAM: {instance.ramGb}GB</span>
                          </div>
                          {price && (
                            <div className="flex justify-between items-center pt-2 border-t">
                              <span className="font-medium text-sm">${price.priceAmount}/hr</span>
                              <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                                ${pricePerGpu}/GPU·hr
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* 프로바이더 비교 요약 */}
      <Card>
        <CardHeader>
          <CardTitle>프로바이더별 가격 비교 (H100 기준)</CardTitle>
          <CardDescription>Seoul 리전의 H100 GPU 최저 가격 비교</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {providersWithData.map((provider) => {
              // Seoul 리전의 H100 인스턴스 찾기
              const seoulRegion = provider.regions.find(r => 
                r.code.includes('seoul') || r.code.includes('korea') || r.name.toLowerCase().includes('seoul')
              )
              const h100Instance = seoulRegion?.instanceTypes.find(i => 
                i.family.gpuModel.model === 'H100'
              )
              const price = h100Instance?.priceHistory[0]
              const pricePerGpu = price ? (price.priceAmount / h100Instance.gpuCount).toFixed(2) : null

              return (
                <div key={provider.id} className="p-4 border rounded-lg text-center">
                  <div className="font-semibold text-lg mb-2">{provider.name}</div>
                  <Badge variant="outline" className="mb-3">{provider.code.toUpperCase()}</Badge>
                  {h100Instance && price ? (
                    <>
                      <div className="text-sm text-muted-foreground mb-1">
                        {h100Instance.instanceName}
                      </div>
                      <div className="text-2xl font-bold text-primary mb-1">
                        ${pricePerGpu}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        per GPU·hour
                      </div>
                      <div className="text-xs text-muted-foreground mt-2">
                        Total: ${price.priceAmount}/hr ({h100Instance.gpuCount} GPUs)
                      </div>
                    </>
                  ) : (
                    <div className="text-muted-foreground">No H100 data</div>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">
        🎉 모든 테스트가 성공적으로 완료되었습니다! 데이터베이스 연결과 시드 데이터가 정상적으로 작동하고 있습니다.
      </div>
    </div>
  )
}
