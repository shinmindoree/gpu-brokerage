// Azure 용량 확인 서비스
import { ComputeManagementClient } from '@azure/arm-compute';
import { DefaultAzureCredential } from '@azure/identity';
import { prisma } from './prisma';

// Azure 에러 코드 매핑 (용량 관련만)
export const AZURE_CAPACITY_ERRORS = [
  'AllocationFailed',
  'SkuNotAvailable', 
  'InsufficientCapacity',
  'ZoneNotAvailable',
  'ResourceUnavailable',
  'OperationNotAllowed',
  'InternalError' // 때로는 용량 부족으로 나타남
] as const;

export const AZURE_IGNORED_ERRORS = [
  'QuotaExceeded',          // 쿼터 → 무시
  'AuthorizationFailed',    // 권한 → 무시
  'InvalidParameter',       // 기타 → 무시
  'BadRequest',             // 요청 오류 → 무시
  'Forbidden',              // 권한 → 무시
  'Unauthorized'            // 권한 → 무시
] as const;

export interface AzureCapacityProbeConfig {
  subscriptionId: string;
  resourceGroupName?: string;
  testRegions: string[];
  testVmSizes: string[];
  probeIntervalMinutes: number;
  maxCostPerMonth: number; // USD
  enableActualVmCreation: boolean; // false면 모킹
}

export interface AzureCapacityProbeResult {
  region: string;
  vmSize: string;
  success: boolean | null; // null = ignored error
  errorCode?: string;
  errorClass: 'capacity' | 'quota' | 'permission' | 'ignored';
  provisionMs?: number;
  testInstanceId?: string;
  cost?: number;
  timestamp: Date;
}

export class AzureCapacityService {
  private computeClient: ComputeManagementClient | null = null;
  private config: AzureCapacityProbeConfig;
  private isInitialized = false;

  constructor(config: AzureCapacityProbeConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    try {
      if (this.config.enableActualVmCreation) {
        // 실제 Azure 연결
        const credential = new DefaultAzureCredential();
        this.computeClient = new ComputeManagementClient(
          credential, 
          this.config.subscriptionId
        );
        
        // 연결 테스트
        await this.computeClient.virtualMachines.list(
          this.config.resourceGroupName || 'gpu-brokerage-test'
        );
        
        console.log('✅ Azure Compute Client 초기화 완료');
      } else {
        console.log('🔄 Azure Capacity Service 모킹 모드로 초기화');
      }
      
      this.isInitialized = true;
    } catch (error) {
      console.error('❌ Azure Capacity Service 초기화 실패:', error);
      this.isInitialized = false;
      throw error;
    }
  }

  /**
   * 단일 리전/VM크기에 대한 용량 확인
   */
  async checkCapacity(region: string, vmSize: string): Promise<AzureCapacityProbeResult> {
    const startTime = Date.now();
    
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (this.config.enableActualVmCreation && this.computeClient) {
        return await this.actualCapacityCheck(region, vmSize, startTime);
      } else {
        return await this.mockCapacityCheck(region, vmSize, startTime);
      }
    } catch (error) {
      const errorCode = this.extractErrorCode(error);
      const errorClass = this.classifyError(errorCode);
      
      return {
        region,
        vmSize,
        success: errorClass === 'capacity' ? false : null,
        errorCode,
        errorClass,
        provisionMs: Date.now() - startTime,
        timestamp: new Date()
      };
    }
  }

  /**
   * 실제 Azure VM 생성으로 용량 확인
   */
  private async actualCapacityCheck(
    region: string, 
    vmSize: string, 
    startTime: number
  ): Promise<AzureCapacityProbeResult> {
    const resourceGroupName = this.config.resourceGroupName || 'gpu-brokerage-test';
    const vmName = `capacity-test-${Date.now()}`;
    
    try {
      // 최소 VM 설정으로 생성 시도
      const vmParameters = {
        location: region,
        hardwareProfile: {
          vmSize: vmSize
        },
        osProfile: {
          computerName: vmName,
          adminUsername: 'azureuser',
          adminPassword: 'TempPassword123!', // 테스트용 임시 비밀번호
          linuxConfiguration: {
            disablePasswordAuthentication: false
          }
        },
        storageProfile: {
          imageReference: {
            publisher: 'Canonical',
            offer: '0001-com-ubuntu-server-focal',
            sku: '20_04-lts-gen2',
            version: 'latest'
          },
          osDisk: {
            createOption: 'FromImage',
            managedDisk: {
              storageAccountType: 'Standard_LRS'
            }
          }
        },
        networkProfile: {
          networkInterfaces: []
        }
      };

      console.log(`🔍 Azure 용량 체크 시작: ${region}/${vmSize}`);
      
      // VM 생성 시도 (DryRun이 없으므로 실제 생성)
      const createOperation = await this.computeClient!.virtualMachines.beginCreateOrUpdate(
        resourceGroupName,
        vmName,
        vmParameters
      );

      // 생성이 시작되면 즉시 취소/삭제 시도
      const result = await createOperation.pollUntilDone();
      
      if (result) {
        console.log(`✅ VM 생성 성공: ${vmName}, 즉시 삭제 예약`);
        
        // 백그라운드에서 즉시 삭제
        this.cleanupTestVM(resourceGroupName, vmName);
        
        return {
          region,
          vmSize,
          success: true,
          provisionMs: Date.now() - startTime,
          testInstanceId: vmName,
          cost: this.estimateTestCost(vmSize),
          errorClass: 'capacity' as const,
          timestamp: new Date()
        };
      }
      
      throw new Error('VM 생성 결과가 null입니다');
      
    } catch (error: any) {
      console.error(`❌ Azure 용량 체크 실패: ${region}/${vmSize}`, error);
      
      const errorCode = this.extractErrorCode(error);
      const errorClass = this.classifyError(errorCode);
      
      return {
        region,
        vmSize,
        success: errorClass === 'capacity' ? false : null,
        errorCode,
        errorClass,
        provisionMs: Date.now() - startTime,
        timestamp: new Date()
      };
    }
  }

  /**
   * 테스트 VM 정리 (백그라운드)
   */
  private async cleanupTestVM(resourceGroupName: string, vmName: string): Promise<void> {
    try {
      console.log(`🧹 테스트 VM 삭제 시작: ${vmName}`);
      
      // VM 삭제
      const deleteOperation = await this.computeClient!.virtualMachines.beginDelete(
        resourceGroupName,
        vmName
      );
      
      await deleteOperation.pollUntilDone();
      console.log(`✅ 테스트 VM 삭제 완료: ${vmName}`);
      
      // DB에 정리 완료 표시
      // TODO: Prisma 클라이언트 업데이트 후 활성화
      // await prisma.azureCapacityProbe.updateMany({
      //   where: { testInstanceId: vmName },
      //   data: { cleanedUp: true }
      // });
      
    } catch (error) {
      console.error(`❌ 테스트 VM 삭제 실패: ${vmName}`, error);
    }
  }

  /**
   * 모킹된 용량 확인 (개발/테스트용)
   */
  private async mockCapacityCheck(
    region: string, 
    vmSize: string, 
    startTime: number
  ): Promise<AzureCapacityProbeResult> {
    // 시뮬레이션 지연
    await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
    
    // 지역/VM 크기별 성공률 시뮬레이션
    const successProbability = this.getMockSuccessProbability(region, vmSize);
    const isSuccess = Math.random() < successProbability;
    
    if (isSuccess) {
      return {
        region,
        vmSize,
        success: true,
        provisionMs: Date.now() - startTime,
        errorClass: 'capacity' as const,
        timestamp: new Date()
      };
    } else {
      // 용량 부족 시뮬레이션
      const mockErrorCodes = ['AllocationFailed', 'SkuNotAvailable', 'InsufficientCapacity'];
      const errorCode = mockErrorCodes[Math.floor(Math.random() * mockErrorCodes.length)];
      
      return {
        region,
        vmSize,
        success: false,
        errorCode,
        errorClass: 'capacity' as const,
        provisionMs: Date.now() - startTime,
        timestamp: new Date()
      };
    }
  }

  /**
   * 모킹 성공률 (지역/VM크기별 차등)
   */
  private getMockSuccessProbability(region: string, vmSize: string): number {
    // H100/A100 등 고급 GPU는 성공률 낮게
    if (vmSize.includes('H100')) return 0.3;
    if (vmSize.includes('A100')) return 0.5;
    if (vmSize.includes('V100')) return 0.7;
    if (vmSize.includes('T4')) return 0.8;
    
    // 인기 리전은 성공률 낮게
    if (region.includes('eastus') || region.includes('koreacentral')) return 0.6;
    
    return 0.8; // 기본 성공률
  }

  /**
   * Azure 에러에서 에러 코드 추출
   */
  private extractErrorCode(error: any): string {
    if (error?.code) return error.code;
    if (error?.message) {
      // 메시지에서 에러 코드 패턴 추출
      const match = error.message.match(/([A-Z][a-zA-Z]+(?:Failed|Error|Exceeded|NotAvailable))/);
      if (match) return match[1];
    }
    return 'UnknownError';
  }

  /**
   * 에러 코드를 카테고리로 분류
   */
  private classifyError(errorCode: string): 'capacity' | 'quota' | 'permission' | 'ignored' {
    if (AZURE_CAPACITY_ERRORS.includes(errorCode as any)) {
      return 'capacity';
    }
    if (AZURE_IGNORED_ERRORS.includes(errorCode as any)) {
      return 'ignored';
    }
    if (errorCode.includes('Quota')) return 'quota';
    if (errorCode.includes('Authorization') || errorCode.includes('Permission')) {
      return 'permission';
    }
    
    // 모르는 에러는 일단 용량 관련으로 분류
    return 'capacity';
  }

  /**
   * 테스트 비용 추정 (매우 단순)
   */
  private estimateTestCost(vmSize: string): number {
    // VM 크기별 시간당 비용 추정 (분 단위로 청구 가정)
    const hourlyRates: Record<string, number> = {
      'Standard_NC4as_T4_v3': 0.526,
      'Standard_NC8as_T4_v3': 1.052,
      'Standard_NC24ads_A100_v4': 3.673,
      'Standard_NC48ads_A100_v4': 7.346,
      'Standard_ND96amsr_A100_v4': 27.20,
      'Standard_ND96isr_H100_v5': 40.00
    };
    
    const hourlyRate = hourlyRates[vmSize] || 1.0;
    return hourlyRate / 60; // 1분 사용 비용
  }

  /**
   * 프로브 결과를 DB에 저장
   */
  async saveProbeResult(result: AzureCapacityProbeResult): Promise<void> {
    try {
      // TODO: Prisma 클라이언트 업데이트 후 활성화
      console.log(`💾 프로브 결과 (모킹): ${result.region}/${result.vmSize} → ${result.success}`);
      console.log('실제 저장은 Prisma 업데이트 후 활성화됩니다.');
      
      // await prisma.azureCapacityProbe.create({
      //   data: {
      //     region: result.region,
      //     vmSize: result.vmSize,
      //     success: result.success,
      //     errorCode: result.errorCode,
      //     errorClass: result.errorClass,
      //     provisionMs: result.provisionMs,
      //     testInstanceId: result.testInstanceId,
      //     cost: result.cost,
      //     timestamp: result.timestamp,
      //     cleanedUp: result.success ? false : true
      //   }
      // });
    } catch (error) {
      console.error('프로브 결과 저장 실패:', error);
    }
  }

  /**
   * 배치 용량 확인 (여러 리전/VM크기)
   */
  async batchCheckCapacity(): Promise<AzureCapacityProbeResult[]> {
    const results: AzureCapacityProbeResult[] = [];
    
    for (const region of this.config.testRegions) {
      for (const vmSize of this.config.testVmSizes) {
        try {
          console.log(`🔍 배치 용량 체크: ${region}/${vmSize}`);
          
          const result = await this.checkCapacity(region, vmSize);
          results.push(result);
          
          // DB에 저장
          await this.saveProbeResult(result);
          
          // 배치 간 간격 (Azure API 레이트 리밋 고려)
          await new Promise(resolve => setTimeout(resolve, 5000));
          
        } catch (error) {
          console.error(`배치 체크 중 오류: ${region}/${vmSize}`, error);
        }
      }
    }
    
    return results;
  }

  /**
   * 최근 프로브 결과 조회
   */
  async getRecentProbeResults(
    region?: string, 
    vmSize?: string, 
    hours: number = 24
  ): Promise<any[]> {
    // TODO: Prisma 클라이언트 업데이트 후 활성화
    console.log(`📊 최근 결과 조회 (모킹): ${region || 'all'}/${vmSize || 'all'}, ${hours}시간`);
    
    // 임시 목업 데이터 반환
    return [
      {
        region: 'koreacentral',
        vmSize: 'Standard_NC4as_T4_v3',
        success: true,
        errorClass: 'capacity',
        provisionMs: 3500,
        timestamp: new Date()
      },
      {
        region: 'eastus',
        vmSize: 'Standard_NC24ads_A100_v4',
        success: false,
        errorCode: 'AllocationFailed',
        errorClass: 'capacity',
        provisionMs: 2100,
        timestamp: new Date(Date.now() - 30 * 60 * 1000)
      }
    ];
    
    // const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    // return await prisma.azureCapacityProbe.findMany({
    //   where: {
    //     timestamp: { gte: since },
    //     ...(region && { region }),
    //     ...(vmSize && { vmSize })
    //   },
    //   orderBy: { timestamp: 'desc' }
    // });
  }
}

// 기본 설정으로 초기화된 인스턴스 내보내기
export const azureCapacityService = new AzureCapacityService({
  subscriptionId: process.env.AZURE_SUBSCRIPTION_ID || 'demo-subscription',
  resourceGroupName: process.env.AZURE_RESOURCE_GROUP || 'gpu-brokerage-test',
  testRegions: ['koreacentral', 'eastus', 'japaneast', 'westeurope'],
  testVmSizes: [
    'Standard_NC4as_T4_v3',
    'Standard_NC8as_T4_v3', 
    'Standard_NC24ads_A100_v4',
    'Standard_NC48ads_A100_v4'
  ],
  probeIntervalMinutes: 15,
  maxCostPerMonth: 50,
  enableActualVmCreation: process.env.NODE_ENV === 'production' && !!process.env.AZURE_SUBSCRIPTION_ID
});
