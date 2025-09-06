# GPU 비교 대시보드 서비스 개발 기획서

## 1. 핵심 컨셉 (MVP 범위)

**대상 CSP:** AWS, Azure, Google Cloud (2단계로 OCI/Alibaba 확장)

### 핵심 기능
- **필터링:** 리전/프로바이더/GPU모델(L4/L40S/A100/H100/H200/MI300X 등) 필터
- **인스턴스 스펙:** GPU 수, GPU 메모리, vCPU, RAM, NVLink/NVSwitch 여부
- **요금:** 온디맨드(시간당), GPU당 환산가(price_per_gpu_hour) 자동 계산
- **정렬:** 시간당 가격, GPU당 가격, vCPU·RAM 대비 가격, (선택) TFLOPS 대비 가격
- **통화 변환:** USD→KRW 등, 부가세 옵션(한국 사용자 고려)

**주의:** 예약/세이빙스플랜/커밋드유즈는 계약·할인폭 다양 → 기본은 공개 소매가(리테일) 기준. AWS Savings Plan 가격은 공개 Price List API 미지원.

## 2. 신뢰 가능한 데이터 소스 (공식)

### AWS
- **Price List Query API:** 제품·요금 JSON 질의, Bulk API(대용량) — EC2 GPU 인스턴스 요금/속성 조회
- **스펙 참고:** EC2 가속 인스턴스/P5(H100/H200) 문서

### Azure
- **Azure Retail Prices API:** 서비스/리전별 PAYG 소매가
- **스펙 참고:** ND H100 v5, NCads H100 v5 VM 시리즈

### Google Cloud
- **Cloud Billing Catalog API:** 공개 요금 SKUs + GPU 머신 타입 문서(A3 등)

### 2단계 확장
- **OCI:** 오라클 Compute Shapes
- **Alibaba:** 알리바바 GPU 인스턴스 가이드

## 3. 수집·정규화(ETL) 설계

### 주기
하루 1~2회 (요금 변동 빈도 낮음, Spot은 제외)

### 파이프라인

#### Fetcher
- **AWS:** Price List Query API로 productFamily="Compute Instance", 리전·운영체제·인스턴스 패밀리 필터 → On-Demand terms 파싱 (Savings Plan은 API 미지원)
- **Azure:** `https://prices.azure.com/api/retail/prices?$filter=serviceName eq 'Virtual Machines' and armRegionName eq 'koreacentral'` 같은 식으로 페이징 수집
- **GCP:** Catalog API의 services/skus.list로 Compute Engine 서비스 중 GPU/VM 관련 SKU 추출

#### 개선된 스펙 조인 전략 (Instance Catalog)

**정적 매핑 테이블 관리:**
```typescript
// /data/instance-specs.json (Git으로 버전 관리)
{
  "aws": {
    "p5d.24xlarge": {
      "family": "p5d",
      "gpuModel": "H100",
      "gpuCount": 8,
      "gpuMemoryGB": 80,
      "vcpu": 96,
      "ramGB": 1152,
      "localSsdGB": 7600,
      "interconnect": "NVSwitch",
      "networkPerformance": "100 Gigabit",
      "nvlinkSupport": true,
      "migSupport": true
    },
    "p4d.24xlarge": {
      "family": "p4d",
      "gpuModel": "A100",
      "gpuCount": 8,
      "gpuMemoryGB": 40,
      "vcpu": 96,
      "ramGB": 1152,
      "localSsdGB": 8000,
      "interconnect": "NVSwitch",
      "networkPerformance": "400 Gigabit",
      "nvlinkSupport": true,
      "migSupport": true
    }
  },
  "azure": {
    "Standard_ND96amsr_A100_v4": {
      "family": "NDv4",
      "gpuModel": "A100",
      "gpuCount": 8,
      "gpuMemoryGB": 40,
      "vcpu": 96,
      "ramGB": 900,
      "localSsdGB": 6400,
      "interconnect": "InfiniBand",
      "networkPerformance": "200 Gbps",
      "nvlinkSupport": true,
      "migSupport": true
    }
  },
  "gcp": {
    "a3-highgpu-8g": {
      "family": "a3",
      "gpuModel": "H100",
      "gpuCount": 8,
      "gpuMemoryGB": 80,
      "vcpu": 208,
      "ramGB": 1872,
      "localSsdGB": 0,
      "interconnect": "NVSwitch",
      "networkPerformance": "200 Gbps",
      "nvlinkSupport": true,
      "migSupport": true
    }
  }
}
```

**자동 검증 및 업데이트 시스템:**
```typescript
export class InstanceSpecValidator {
  async validateAndUpdateSpecs() {
    // 1. API에서 새로운 인스턴스 타입 감지
    const awsInstances = await this.discoverAWSInstances();
    const azureInstances = await this.discoverAzureInstances();
    const gcpInstances = await this.discoverGCPInstances();
    
    // 2. 기존 매핑과 비교
    const existingSpecs = await this.loadStaticSpecs();
    const missingSpecs = this.findMissingSpecs(
      [...awsInstances, ...azureInstances, ...gcpInstances],
      existingSpecs
    );
    
    // 3. 누락된 스펙이 있으면 알림
    if (missingSpecs.length > 0) {
      await this.notifyMissingSpecs(missingSpecs);
    }
    
    // 4. 자동 매핑 시도 (패턴 기반)
    const autoMapped = await this.attemptAutoMapping(missingSpecs);
    
    return {
      missingSpecs,
      autoMapped,
      requiresManualReview: missingSpecs.filter(s => !autoMapped.includes(s))
    };
  }

  private async discoverAWSInstances(): Promise<string[]> {
    // EC2 Describe Instance Types API 활용
    const ec2 = new EC2Client({});
    const command = new DescribeInstanceTypesCommand({
      Filters: [
        { Name: 'processor-info.supported-architecture', Values: ['x86_64'] },
        { Name: 'accelerator-info.accelerator-count', Values: ['1', '2', '4', '8', '16'] }
      ]
    });
    
    const response = await ec2.send(command);
    return response.InstanceTypes?.map(t => t.InstanceType || '') || [];
  }

  private attemptAutoMapping(instanceTypes: string[]): Promise<any[]> {
    const results = [];
    
    for (const instanceType of instanceTypes) {
      // 패턴 기반 매핑
      const mapping = this.inferSpecsFromName(instanceType);
      if (mapping.confidence > 0.8) {
        results.push({
          instanceType,
          specs: mapping.specs,
          confidence: mapping.confidence,
          needsReview: mapping.confidence < 0.95
        });
      }
    }
    
    return Promise.resolve(results);
  }

  private inferSpecsFromName(instanceType: string) {
    // AWS 패턴: p5d.24xlarge, g5.xlarge
    // Azure 패턴: Standard_ND96amsr_A100_v4
    // GCP 패턴: a3-highgpu-8g
    
    const patterns = {
      aws: {
        p5: { gpuModel: 'H100', interconnect: 'NVSwitch' },
        p4d: { gpuModel: 'A100', interconnect: 'NVSwitch' },
        g5: { gpuModel: 'A10G', interconnect: 'PCIe' }
      },
      azure: {
        'ND.*H100': { gpuModel: 'H100', interconnect: 'InfiniBand' },
        'ND.*A100': { gpuModel: 'A100', interconnect: 'InfiniBand' }
      },
      gcp: {
        'a3': { gpuModel: 'H100', interconnect: 'NVSwitch' },
        'a2': { gpuModel: 'A100', interconnect: 'NVSwitch' }
      }
    };
    
    // 패턴 매칭 로직...
    return { specs: {}, confidence: 0.0 };
  }
}
```

**버전 관리 및 히스토리:**
```typescript
// 스펙 변경 추적
CREATE TABLE spec_change_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_type VARCHAR(50),
    provider_code VARCHAR(20),
    change_type VARCHAR(20), -- added, modified, deprecated
    old_specs JSONB,
    new_specs JSONB,
    change_reason TEXT,
    detected_at TIMESTAMP DEFAULT NOW(),
    verified_by VARCHAR(100), -- manual, auto, api
    confidence_score DECIMAL(3,2)
);
```

#### 정규화 규칙
- `price_per_gpu_hour = on_demand_price_per_instance / gpu_count`
- **통화:** 원 데이터 통화(대개 USD). 환율 테이블로 실시간/일일 변환
- **SKU 문자열 파싱:** 예: ND H100 v5 Standard 8 → GPU 8) + 문서 레퍼런스로 보정

## 4. 데이터베이스 스키마 (Azure Database for PostgreSQL + Prisma)

```sql
-- 프로바이더 테이블
CREATE TABLE providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) UNIQUE NOT NULL, -- aws, azure, gcp, oci, alibaba
    name VARCHAR(100) NOT NULL,
    logo_url VARCHAR(500),
    api_endpoint VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 리전 테이블
CREATE TABLE regions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID REFERENCES providers(id),
    code VARCHAR(50) NOT NULL, -- us-east-1, koreacentral, asia-northeast1
    name VARCHAR(100) NOT NULL, -- US East (N. Virginia)
    country_code VARCHAR(2), -- US, KR, JP
    continent VARCHAR(20), -- north-america, asia, europe
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(provider_id, code)
);

-- GPU 모델 테이블
CREATE TABLE gpu_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor VARCHAR(20) NOT NULL, -- NVIDIA, AMD, Intel
    model VARCHAR(50) NOT NULL, -- H100, A100, L4, MI300X
    architecture VARCHAR(30), -- Hopper, Ampere, Ada Lovelace
    vram_gb INTEGER NOT NULL,
    memory_type VARCHAR(20), -- HBM3, HBM2e, GDDR6
    memory_bandwidth_gbps INTEGER,
    fp16_tflops DECIMAL(8,2),
    bf16_tflops DECIMAL(8,2),
    int8_tops DECIMAL(8,2),
    nvlink_support BOOLEAN DEFAULT false,
    mig_support BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(vendor, model)
);

-- 인스턴스 패밀리 정보 (정적 레퍼런스)
CREATE TABLE instance_families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID REFERENCES providers(id),
    family_code VARCHAR(20) NOT NULL, -- p5, nd_h100_v5, a3-highgpu
    family_name VARCHAR(100),
    gpu_model_id UUID REFERENCES gpu_models(id),
    description TEXT,
    interconnect_type VARCHAR(30), -- NVLink, NVSwitch, InfiniBand
    use_case VARCHAR(50), -- training, inference, hpc
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(provider_id, family_code)
);

-- 인스턴스 타입 테이블
CREATE TABLE instance_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID REFERENCES providers(id),
    region_id UUID REFERENCES regions(id),
    family_id UUID REFERENCES instance_families(id),
    instance_name VARCHAR(50) NOT NULL, -- p5d.24xlarge, Standard_ND96amsr_A100_v4
    gpu_count INTEGER NOT NULL,
    vcpu_count INTEGER NOT NULL,
    ram_gb INTEGER NOT NULL,
    local_ssd_gb INTEGER DEFAULT 0,
    network_performance VARCHAR(50), -- 25 Gigabit, 100 Gigabit
    is_available BOOLEAN DEFAULT true,
    launch_date DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(provider_id, region_id, instance_name)
);

-- 가격 히스토리 테이블
CREATE TABLE price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_type_id UUID REFERENCES instance_types(id),
    purchase_option VARCHAR(20) NOT NULL DEFAULT 'on_demand', -- on_demand, reserved_1yr, reserved_3yr
    unit VARCHAR(10) DEFAULT 'hour', -- hour, month
    currency VARCHAR(3) DEFAULT 'USD',
    price_amount DECIMAL(10,6) NOT NULL,
    price_per_gpu DECIMAL(10,6) GENERATED ALWAYS AS (price_amount / (SELECT gpu_count FROM instance_types WHERE id = instance_type_id)) STORED,
    effective_date DATE NOT NULL,
    source_sku VARCHAR(200),
    raw_response JSONB, -- 원본 API 응답 저장
    data_source VARCHAR(50), -- api, manual, estimated
    created_at TIMESTAMP DEFAULT NOW(),
    INDEX(instance_type_id, effective_date DESC),
    INDEX(currency, effective_date DESC),
    UNIQUE(instance_type_id, purchase_option, currency, effective_date)
);

-- 현재 활성 가격 뷰 (성능 최적화)
CREATE VIEW current_prices AS
SELECT DISTINCT ON (instance_type_id, purchase_option, currency)
    ph.*,
    it.instance_name,
    it.gpu_count,
    p.code as provider_code,
    r.code as region_code
FROM price_history ph
JOIN instance_types it ON ph.instance_type_id = it.id
JOIN providers p ON it.provider_id = p.id
JOIN regions r ON it.region_id = r.id
WHERE ph.effective_date <= CURRENT_DATE
ORDER BY instance_type_id, purchase_option, currency, effective_date DESC;

-- 환율 테이블
CREATE TABLE exchange_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base_currency VARCHAR(3) DEFAULT 'USD',
    target_currency VARCHAR(3) NOT NULL,
    rate DECIMAL(10,6) NOT NULL,
    rate_date DATE NOT NULL,
    source VARCHAR(50), -- ecb, koreanbank, fixer
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(base_currency, target_currency, rate_date)
);

-- 데이터 수집 로그 테이블
CREATE TABLE etl_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_code VARCHAR(20),
    job_type VARCHAR(50), -- price_sync, spec_sync, fx_sync
    status VARCHAR(20), -- running, success, failed
    records_processed INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    execution_time_ms INTEGER
);

-- 사용자 선호 설정 (향후 확장)
CREATE TABLE user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(100),
    preferred_currency VARCHAR(3) DEFAULT 'USD',
    preferred_regions UUID[], -- 배열로 즐겨찾기 리전 저장
    include_vat BOOLEAN DEFAULT false,
    vat_rate DECIMAL(4,2) DEFAULT 0.10, -- 10%
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

**주요 인덱스 전략:**
```sql
-- 성능 최적화 인덱스
CREATE INDEX idx_instance_types_provider_region ON instance_types(provider_id, region_id, is_available);
CREATE INDEX idx_price_history_lookup ON price_history(instance_type_id, purchase_option, currency, effective_date DESC);
CREATE INDEX idx_current_prices_filter ON price_history(effective_date, currency) WHERE effective_date <= CURRENT_DATE;
CREATE INDEX idx_gpu_models_vendor_model ON gpu_models(vendor, model);
```

## 5. 백엔드 API (Next.js App Router 예시)

```
GET /api/instances?provider=aws&region=ap-northeast-2&gpu=H100
GET /api/compare?ids=i-aws-p5d.24xlarge,i-azure-ndh100v5-8,i-gcp-a3-mega-8
GET /api/prices?purchase=on_demand&currency=KRW
GET /api/alerts  # 프리미엄: 임계가 알림, 향후 Spot/약정 반영
```

## 6. 프런트엔드 UX (한눈에 보기)

### 상단 필터 바
- Provider(멀티), Region(멀티), GPU Model, Purchase(온디맨드), Currency, VAT toggle(10%)

### 핵심 테이블 컬럼
- Provider / Region / InstanceType
- GPU(Model × Count / VRAM)
- vCPU / RAM
- On-Demand $/h | $/GPU·h | (선택) 메모리 GB당 $/h
- (배지) NVLink/NVSwitch, MIG 지원 등

### 기타 기능
- **정렬 기준:** 기본 $/GPU·h 오름차순
- **비교 바구니:** 2~4개 선택 → 비교 모달(스펙/요금 나란히)
- **(옵션) 간단 그래프:** 리전별 H100 $/GPU·h 분포

## 7. 개선된 기술 스택 아키텍처

### 7.1 통합 아키텍처 개요
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   사용자 브라우저   │────│  Azure Static     │────│  Azure Container │
│                 │    │  Web Apps        │    │  Apps (API)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │                         │
                              │                         │
                       ┌──────────────────┐    ┌─────────────────┐
                       │  Azure CDN       │    │  Azure Database │
                       │  (Assets)        │    │  for PostgreSQL│
                       └──────────────────┘    └─────────────────┘
                                                       │
                              ┌─────────────────────────────┐
                              │     Azure Functions         │
                              │   (ETL + Scheduled Jobs)    │
                              └─────────────────────────────┘
```

### 7.2 핵심 기술 스택

#### **프론트엔드**
- **프레임워크:** Next.js 14 (App Router) + TypeScript
- **스타일링:** Tailwind CSS + shadcn/ui 
- **상태관리:** Zustand (가벼운 클라이언트 상태)
- **데이터 페칭:** TanStack Query v5 (서버 상태 관리)
- **차트/그래프:** Recharts (가격 비교 차트)
- **배포:** Azure Static Web Apps

#### **백엔드 API**
- **런타임:** Next.js API Routes (Azure Container Apps에서 실행)
- **ORM:** Prisma v5 + PostgreSQL
- **검증:** Zod schemas (요청/응답 검증)
- **인증:** NextAuth.js (향후 사용자 기능용)
- **캐싱:** Redis (Azure Cache for Redis)
- **Rate Limiting:** @upstash/ratelimit

#### **데이터베이스**
- **주 DB:** Azure Database for PostgreSQL (Flexible Server)
- **캐시:** Azure Cache for Redis
- **파일 스토리지:** Azure Blob Storage

#### **데이터 수집 (ETL)**
- **스케줄러:** Azure Functions (Timer Trigger)
- **HTTP 클라이언트:** Axios + Retry logic
- **데이터 검증:** Zod schemas
- **로깅:** Azure Application Insights

#### **모니터링 & 운영**
- **APM:** Azure Application Insights
- **로그 수집:** Azure Monitor Logs
- **메트릭:** Azure Monitor Metrics  
- **알림:** Azure Monitor Alerts

### 7.3 환경별 구성

#### **개발 환경**
```yaml
Database: Local PostgreSQL (Docker)
Cache: Local Redis (Docker)
API: Next.js dev server (localhost:3000)
ETL: Local Azure Functions Core Tools
```

#### **스테이징 환경**
```yaml
Database: Azure PostgreSQL (Basic tier)
Cache: Azure Redis (Basic tier)
API: Azure Container Apps (1 replica)
ETL: Azure Functions (Consumption plan)
```

#### **프로덕션 환경**
```yaml
Database: Azure PostgreSQL (General Purpose tier)
Cache: Azure Redis (Standard tier)
API: Azure Container Apps (auto-scaling)
ETL: Azure Functions (Premium plan)
CDN: Azure Front Door
```

## 8. 개선된 API 통합 전략

### 8.1 에러 처리 및 재시도 전략

```typescript
// 공통 API 클라이언트 (Azure Functions)
import axios, { AxiosRequestConfig } from 'axios';
import { z } from 'zod';

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
}

class CSPApiClient {
  private readonly retryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2
  };

  async fetchWithRetry<T>(
    config: AxiosRequestConfig,
    schema: z.ZodSchema<T>,
    retries = 0
  ): Promise<T> {
    try {
      const response = await axios(config);
      return schema.parse(response.data);
    } catch (error) {
      if (retries < this.retryConfig.maxRetries) {
        const delay = Math.min(
          this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffFactor, retries),
          this.retryConfig.maxDelay
        );
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.fetchWithRetry(config, schema, retries + 1);
      }
      throw error;
    }
  }
}
```

### 8.2 CSP별 데이터 수집 구현

#### **AWS Price List API**
```typescript
// AWS 가격 수집 (Azure Function)
import { PricingClient, GetProductsCommand } from '@aws-sdk/client-pricing';

const awsPriceSchema = z.object({
  PriceList: z.array(z.object({
    terms: z.object({
      OnDemand: z.record(z.object({
        priceDimensions: z.record(z.object({
          pricePerUnit: z.object({
            USD: z.string()
          })
        }))
      }))
    }),
    product: z.object({
      attributes: z.object({
        instanceType: z.string(),
        location: z.string(),
        operatingSystem: z.string(),
        tenancy: z.string()
      })
    })
  }))
});

export async function fetchAWSPrices(region: string) {
  const client = new PricingClient({ region: 'us-east-1' }); // Pricing API는 us-east-1만 지원
  
  const command = new GetProductsCommand({
    ServiceCode: 'AmazonEC2',
    Filters: [
      { Type: 'TERM_MATCH', Field: 'productFamily', Value: 'Compute Instance' },
      { Type: 'TERM_MATCH', Field: 'location', Value: getLocationName(region) },
      { Type: 'TERM_MATCH', Field: 'operatingSystem', Value: 'Linux' },
      { Type: 'TERM_MATCH', Field: 'tenancy', Value: 'Shared' },
      { Type: 'TERM_MATCH', Field: 'capacitystatus', Value: 'Used' }
    ],
    MaxResults: 100
  });

  const response = await client.send(command);
  return awsPriceSchema.parse(response);
}

// 리전 코드 → 위치 이름 매핑
function getLocationName(regionCode: string): string {
  const mapping: Record<string, string> = {
    'us-east-1': 'US East (N. Virginia)',
    'ap-northeast-2': 'Asia Pacific (Seoul)',
    'us-west-2': 'US West (Oregon)'
  };
  return mapping[regionCode] || regionCode;
}
```

#### **Azure Retail Prices API**
```typescript
const azurePriceSchema = z.object({
  Items: z.array(z.object({
    armSkuName: z.string(),
    productName: z.string(),
    skuName: z.string(),
    armRegionName: z.string(),
    retailPrice: z.number(),
    unitOfMeasure: z.string(),
    currencyCode: z.string(),
    effectiveStartDate: z.string()
  })),
  NextPageLink: z.string().optional()
});

export async function fetchAzurePrices(region: string) {
  const baseUrl = 'https://prices.azure.com/api/retail/prices';
  const filter = `serviceName eq 'Virtual Machines' and armRegionName eq '${region}' and priceType eq 'Consumption'`;
  
  let allItems: any[] = [];
  let nextUrl = `${baseUrl}?$filter=${encodeURIComponent(filter)}`;
  
  while (nextUrl) {
    const response = await apiClient.fetchWithRetry(
      { method: 'GET', url: nextUrl },
      azurePriceSchema
    );
    
    allItems = allItems.concat(response.Items);
    nextUrl = response.NextPageLink || '';
    
    // Rate limiting 준수 (Azure는 초당 10 요청 제한)
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return allItems;
}
```

#### **Google Cloud Billing Catalog API**
```typescript
const gcpPriceSchema = z.object({
  services: z.array(z.object({
    serviceId: z.string(),
    displayName: z.string()
  }))
});

export async function fetchGCPPrices() {
  // 1. Compute Engine 서비스 ID 조회
  const servicesResponse = await apiClient.fetchWithRetry(
    {
      method: 'GET',
      url: 'https://cloudbilling.googleapis.com/v1/services',
      headers: {
        'Authorization': `Bearer ${await getGCPAccessToken()}`
      }
    },
    gcpPriceSchema
  );
  
  const computeService = servicesResponse.services.find(
    s => s.displayName === 'Compute Engine'
  );
  
  if (!computeService) throw new Error('Compute Engine service not found');
  
  // 2. SKUs 조회
  const skusUrl = `https://cloudbilling.googleapis.com/v1/services/${computeService.serviceId}/skus`;
  // ... SKU 파싱 로직
}
```

### 8.3 데이터 정규화 파이프라인

```typescript
interface NormalizedInstanceData {
  provider: string;
  region: string;
  instanceType: string;
  gpuModel: string;
  gpuCount: number;
  vcpu: number;
  ramGB: number;
  pricePerHour: number;
  currency: string;
  effectiveDate: string;
}

export class DataNormalizer {
  async normalizeAWSData(rawData: any): Promise<NormalizedInstanceData[]> {
    const results: NormalizedInstanceData[] = [];
    
    for (const item of rawData.PriceList) {
      const instanceType = item.product.attributes.instanceType;
      const specs = await this.getInstanceSpecs('aws', instanceType);
      
      if (!specs || !specs.gpuCount) continue; // GPU 인스턴스만 처리
      
      const pricePerHour = this.extractPrice(item.terms.OnDemand);
      
      results.push({
        provider: 'aws',
        region: this.normalizeRegion('aws', item.product.attributes.location),
        instanceType,
        gpuModel: specs.gpuModel,
        gpuCount: specs.gpuCount,
        vcpu: specs.vcpu,
        ramGB: specs.ramGB,
        pricePerHour,
        currency: 'USD',
        effectiveDate: new Date().toISOString().split('T')[0]
      });
    }
    
    return results;
  }

  private async getInstanceSpecs(provider: string, instanceType: string) {
    // 정적 매핑 테이블에서 조회 (Redis 캐시 활용)
    const cacheKey = `specs:${provider}:${instanceType}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) return JSON.parse(cached);
    
    // DB에서 조회
    const specs = await prisma.instanceFamilies.findFirst({
      where: {
        provider: { code: provider },
        // instanceType parsing logic
      },
      include: {
        gpuModel: true
      }
    });
    
    if (specs) {
      await redis.setex(cacheKey, 3600, JSON.stringify(specs)); // 1시간 캐시
    }
    
    return specs;
  }
}
```

### 8.4 실패 처리 및 모니터링

```typescript
export async function runETLPipeline() {
  const jobId = uuidv4();
  
  try {
    await prisma.etlLogs.create({
      data: {
        id: jobId,
        jobType: 'price_sync',
        status: 'running',
        startedAt: new Date()
      }
    });

    const results = await Promise.allSettled([
      fetchAWSPrices('ap-northeast-2'),
      fetchAzurePrices('koreacentral'),
      fetchGCPPrices()
    ]);

    let totalProcessed = 0;
    const errors: string[] = [];

    for (const [index, result] of results.entries()) {
      if (result.status === 'fulfilled') {
        totalProcessed += result.value.length;
      } else {
        errors.push(`Provider ${index} failed: ${result.reason.message}`);
      }
    }

    await prisma.etlLogs.update({
      where: { id: jobId },
      data: {
        status: errors.length > 0 ? 'partial_success' : 'success',
        recordsProcessed: totalProcessed,
        errorMessage: errors.join('; '),
        completedAt: new Date(),
        executionTimeMs: Date.now() - startTime
      }
    });

  } catch (error) {
    await prisma.etlLogs.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        errorMessage: error.message,
        completedAt: new Date()
      }
    });
    
    // Azure Application Insights로 에러 전송
    throw error;
  }
}
```

## 9. 파생 지표 & 정렬식

- **$/GPU·h** = 인스턴스 시간당 요금 ÷ GPU 수
- **(선택) $/TFLOP·h** = 시간당 요금 ÷ 추정 TFLOPS (GPU 스펙 표준치 테이블 필요)
- **(선택) $/GB-HBM·h** = 시간당 요금 ÷ (GPU HBM 용량 합계)

## 10. 현실적 개발 로드맵 (재정의)

### **MVP Phase 1 (2~3주) - 핵심 기능 구현**

#### **Week 1: 기반 인프라 구축**
- ✅ **환경 설정:**
  - Next.js 14 + TypeScript 프로젝트 초기화
  - Azure Database for PostgreSQL 설정 (Basic tier)
  - Prisma 스키마 구현 및 마이그레이션
  - 기본 shadcn/ui 컴포넌트 설정

- ✅ **정적 데이터 준비:**
  - 인스턴스 스펙 JSON 파일 작성 (AWS P5d, Azure ND H100 v5 등 주요 10개 인스턴스)
  - GPU 모델 기본 데이터 시딩 (H100, A100, L4)
  - 3개 리전 데이터 (Seoul, Tokyo, Oregon)

#### **Week 2: 기본 UI 및 백엔드**
- ✅ **프론트엔드:**
  - 인스턴스 목록 테이블 컴포넌트
  - 기본 필터링 (Provider, Region, GPU Model)
  - 가격 정렬 기능
  - 반응형 디자인

- ✅ **백엔드 API:**
  - `/api/instances` - 인스턴스 목록 조회
  - `/api/instances/compare` - 2~4개 인스턴스 비교
  - 기본 페이지네이션 및 필터링

#### **Week 3: 데이터 수집 및 완성도**
- ✅ **ETL 파이프라인 (단순화):**
  - 수동 가격 업데이트 도구 (관리자용)
  - AWS Price List API 연동 (Seoul 리전만)
  - 기본 환율 변환 (USD → KRW)

- ✅ **배포 및 테스트:**
  - Azure Static Web Apps 배포
  - 기본 모니터링 설정
  - 사용자 테스트 및 피드백

### **Phase 2 (3~4주) - 확장 및 자동화**

#### **고도화 기능:**
- 🔄 **자동화된 ETL:**
  - Azure Functions으로 일일 가격 동기화
  - 3개 CSP 모든 API 연동
  - 에러 핸들링 및 재시도 로직

- 🔄 **사용자 경험 개선:**
  - 가격 히스토리 차트
  - 즐겨찾기 기능 (로컬 스토리지)
  - 공유 가능한 비교 링크
  - 가격 알림 (선택사항)

#### **확장 영역:**
- 5개 리전 추가 (US-East, EU-West, 등)
- L40S, MI300X 등 추가 GPU 모델
- 기본 성능 지표 (TFLOPS) 추가

### **Phase 3 (4주+) - 고급 기능**

#### **프리미엄 기능:**
- 💡 **워크로드 견적 도구:**
  - 간단한 훈련/추론 템플릿
  - 시간 기반 비용 계산
  - 배치 크기별 권장사항

- 💡 **고급 분석:**
  - 가격 트렌드 분석
  - 지역별 가격 비교 차트
  - 성능 대비 가격 효율성 지표

#### **확장성 개선:**
- Azure Container Apps 마이그레이션
- Redis 캐싱 고도화
- API Rate Limiting 구현

### **기술적 제약사항 완화 전략**

#### **1. API 복잡성 대응**
```typescript
// 단계적 API 연동 전략
const apiIntegrationPlan = {
  phase1: ['aws-pricing-list'], // 가장 안정적
  phase2: ['azure-retail-prices'], // 중간 복잡도
  phase3: ['gcp-billing-catalog'], // 가장 복잡함
  fallback: 'manual-data-entry' // 백업 계획
};
```

#### **2. 데이터 품질 보장**
```typescript
// 데이터 검증 파이프라인
const dataValidation = {
  priceValidation: 'range-check + outlier-detection',
  specValidation: 'static-mapping + manual-review',
  currencyValidation: 'multi-source-fx-rates',
  freshnessCheck: 'max-age-24h'
};
```

#### **3. 성능 최적화**
```typescript
// 성능 전략
const performanceStrategy = {
  database: 'proper-indexing + query-optimization',
  api: 'response-caching + pagination',
  frontend: 'virtual-scrolling + lazy-loading',
  etl: 'incremental-updates + batch-processing'
};
```

### **성공 지표 및 목표**

#### **Phase 1 목표:**
- ⭐ 10개 주요 GPU 인스턴스 커버
- ⭐ 3개 리전 데이터 정확도 95%+
- ⭐ 페이지 로딩 속도 < 2초
- ⭐ 모바일 반응형 지원

#### **Phase 2 목표:**
- ⭐ 일일 자동 가격 업데이트
- ⭐ 50+ 인스턴스 타입 지원
- ⭐ 사용자 만족도 4.0+/5.0
- ⭐ 월 1,000+ 활성 사용자

#### **Phase 3 목표:**
- ⭐ 5개 CSP 완전 지원
- ⭐ 고급 분석 도구 제공
- ⭐ B2B 파트너십 1개 이상

## 11. 라이선스/주의사항

- 가격은 "예고 없이 변경 가능" 고지(각 CSP 문구에 준함)
- 로고 사용 가이드 준수(브랜드 가이드 확인)
- 상업 서비스 시 각 API 쿼터·ToS 준수(특히 Azure Prices API 페이징/속도 제한)

---

**생성일:** 2024년
**버전:** 1.0
**담당자:** GPU 브로커리지 개발팀
