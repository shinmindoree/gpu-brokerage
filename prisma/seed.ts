import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting database seeding...')

  // 1. GPU 모델 데이터 생성
  console.log('📊 Creating GPU models...')
  const gpuModels = [
    {
      vendor: 'NVIDIA',
      model: 'H100',
      architecture: 'Hopper',
      vramGb: 80,
      memoryType: 'HBM3',
      memoryBandwidthGbps: 3350,
      fp16Tflops: 1979.0,
      bf16Tflops: 1979.0,
      int8Tops: 3958.0,
      nvlinkSupport: true,
      migSupport: true
    },
    {
      vendor: 'NVIDIA',
      model: 'A100',
      architecture: 'Ampere',
      vramGb: 40,
      memoryType: 'HBM2e',
      memoryBandwidthGbps: 1555,
      fp16Tflops: 312.0,
      bf16Tflops: 312.0,
      int8Tops: 624.0,
      nvlinkSupport: true,
      migSupport: true
    },
    {
      vendor: 'NVIDIA',
      model: 'A10G',
      architecture: 'Ampere',
      vramGb: 24,
      memoryType: 'GDDR6',
      memoryBandwidthGbps: 600,
      fp16Tflops: 125.0,
      bf16Tflops: 125.0,
      int8Tops: 250.0,
      nvlinkSupport: false,
      migSupport: false
    },
    {
      vendor: 'NVIDIA',
      model: 'V100',
      architecture: 'Volta',
      vramGb: 32,
      memoryType: 'HBM2',
      memoryBandwidthGbps: 900,
      fp16Tflops: 125.0,
      bf16Tflops: null,
      int8Tops: null,
      nvlinkSupport: true,
      migSupport: false
    },
    {
      vendor: 'NVIDIA',
      model: 'L4',
      architecture: 'Ada Lovelace',
      vramGb: 24,
      memoryType: 'GDDR6',
      memoryBandwidthGbps: 300,
      fp16Tflops: 120.0,
      bf16Tflops: 60.0,
      int8Tops: 485.0,
      nvlinkSupport: false,
      migSupport: false
    }
  ]

  for (const gpu of gpuModels) {
    await prisma.gpuModel.upsert({
      where: { vendor_model: { vendor: gpu.vendor, model: gpu.model } },
      update: {},
      create: gpu
    })
  }

  // 2. 프로바이더 데이터 생성
  console.log('☁️ Creating cloud providers...')
  const providers = [
    {
      code: 'aws',
      name: 'Amazon Web Services',
      logoUrl: '/logos/aws.svg',
      apiEndpoint: 'https://pricing.us-east-1.amazonaws.com'
    },
    {
      code: 'azure',
      name: 'Microsoft Azure',
      logoUrl: '/logos/azure.svg',
      apiEndpoint: 'https://prices.azure.com/api/retail/prices'
    },
    {
      code: 'gcp',
      name: 'Google Cloud Platform',
      logoUrl: '/logos/gcp.svg',
      apiEndpoint: 'https://cloudbilling.googleapis.com/v1'
    }
  ]

  for (const provider of providers) {
    await prisma.provider.upsert({
      where: { code: provider.code },
      update: {},
      create: provider
    })
  }

  // 3. 리전 데이터 생성
  console.log('🌍 Creating regions...')
  const regions = [
    // AWS 리전
    { providerCode: 'aws', code: 'ap-northeast-2', name: 'Asia Pacific (Seoul)', countryCode: 'KR', continent: 'asia' },
    { providerCode: 'aws', code: 'ap-northeast-1', name: 'Asia Pacific (Tokyo)', countryCode: 'JP', continent: 'asia' },
    { providerCode: 'aws', code: 'us-west-2', name: 'US West (Oregon)', countryCode: 'US', continent: 'north-america' },
    
    // Azure 리전
    { providerCode: 'azure', code: 'koreacentral', name: 'Korea Central', countryCode: 'KR', continent: 'asia' },
    { providerCode: 'azure', code: 'japaneast', name: 'Japan East', countryCode: 'JP', continent: 'asia' },
    { providerCode: 'azure', code: 'westus2', name: 'West US 2', countryCode: 'US', continent: 'north-america' },
    
    // GCP 리전
    { providerCode: 'gcp', code: 'asia-northeast3', name: 'Seoul', countryCode: 'KR', continent: 'asia' },
    { providerCode: 'gcp', code: 'asia-northeast1', name: 'Tokyo', countryCode: 'JP', continent: 'asia' },
    { providerCode: 'gcp', code: 'us-west1', name: 'Oregon', countryCode: 'US', continent: 'north-america' }
  ]

  for (const region of regions) {
    const provider = await prisma.provider.findUnique({ where: { code: region.providerCode } })
    if (provider) {
      await prisma.region.upsert({
        where: { 
          providerId_code: { 
            providerId: provider.id, 
            code: region.code 
          } 
        },
        update: {},
        create: {
          providerId: provider.id,
          code: region.code,
          name: region.name,
          countryCode: region.countryCode,
          continent: region.continent
        }
      })
    }
  }

  // 4. 인스턴스 패밀리 생성
  console.log('👨‍👩‍👧‍👦 Creating instance families...')
  const instanceSpecsPath = path.join(__dirname, '../data/instance-specs.json')
  const instanceSpecs = JSON.parse(fs.readFileSync(instanceSpecsPath, 'utf8'))

  for (const [providerCode, instances] of Object.entries(instanceSpecs)) {
    const provider = await prisma.provider.findUnique({ where: { code: providerCode } })
    if (!provider) continue

    // 각 인스턴스의 패밀리별로 그룹화
    const families = new Map()
    
    for (const [instanceName, spec] of Object.entries(instances as any)) {
      const familyCode = spec.family
      if (!families.has(familyCode)) {
        families.set(familyCode, spec)
      }
    }

    // 패밀리 생성
    for (const [familyCode, spec] of families) {
      const gpuModel = await prisma.gpuModel.findUnique({
        where: { vendor_model: { vendor: 'NVIDIA', model: spec.gpuModel } }
      })
      
      if (gpuModel) {
        await prisma.instanceFamily.upsert({
          where: {
            providerId_familyCode: {
              providerId: provider.id,
              familyCode: familyCode
            }
          },
          update: {},
          create: {
            providerId: provider.id,
            familyCode: familyCode,
            familyName: `${spec.gpuModel} ${familyCode.toUpperCase()} Family`,
            gpuModelId: gpuModel.id,
            description: `${spec.gpuModel} GPU instances for ${spec.interconnect === 'NVSwitch' ? 'training' : 'inference'}`,
            interconnectType: spec.interconnect,
            useCase: spec.interconnect === 'NVSwitch' ? 'training' : 'inference'
          }
        })
      }
    }
  }

  // 5. 인스턴스 타입 생성
  console.log('💻 Creating instance types...')
  for (const [providerCode, instances] of Object.entries(instanceSpecs)) {
    const provider = await prisma.provider.findUnique({ where: { code: providerCode } })
    if (!provider) continue

    const regions = await prisma.region.findMany({ where: { providerId: provider.id } })

    for (const [instanceName, spec] of Object.entries(instances as any)) {
      const family = await prisma.instanceFamily.findUnique({
        where: {
          providerId_familyCode: {
            providerId: provider.id,
            familyCode: spec.family
          }
        }
      })

      if (!family) continue

      // 각 리전에 인스턴스 타입 생성
      for (const region of regions) {
        await prisma.instanceType.upsert({
          where: {
            providerId_regionId_instanceName: {
              providerId: provider.id,
              regionId: region.id,
              instanceName: instanceName
            }
          },
          update: {},
          create: {
            providerId: provider.id,
            regionId: region.id,
            familyId: family.id,
            instanceName: instanceName,
            gpuCount: spec.gpuCount,
            vcpuCount: spec.vcpu,
            ramGb: spec.ramGB,
            localSsdGb: spec.localSsdGB || 0,
            networkPerformance: spec.networkPerformance,
            isAvailable: true,
            launchDate: new Date('2024-01-01')
          }
        })
      }
    }
  }

  // 6. 샘플 가격 데이터 생성 (더미 데이터)
  console.log('💰 Creating sample price data...')
  const instanceTypes = await prisma.instanceType.findMany({
    include: {
      provider: true,
      family: {
        include: {
          gpuModel: true
        }
      }
    }
  })

  const basePrices = {
    'H100': 4.5,  // H100 시간당 GPU 단가 ($)
    'A100': 3.2,  // A100 시간당 GPU 단가 ($)
    'A10G': 1.1,  // A10G 시간당 GPU 단가 ($)
    'V100': 2.4,  // V100 시간당 GPU 단가 ($)
    'L4': 0.8     // L4 시간당 GPU 단가 ($)
  }

  for (const instanceType of instanceTypes) {
    const gpuModel = instanceType.family.gpuModel.model
    const basePrice = basePrices[gpuModel as keyof typeof basePrices] || 1.0
    const totalPrice = basePrice * instanceType.gpuCount

    // 리전별 가격 차이 (±15%)
    const regionMultiplier = Math.random() * 0.3 + 0.85 // 0.85 ~ 1.15

    await prisma.priceHistory.create({
      data: {
        instanceTypeId: instanceType.id,
        purchaseOption: 'on_demand',
        unit: 'hour',
        currency: 'USD',
        priceAmount: Math.round(totalPrice * regionMultiplier * 100) / 100,
        effectiveDate: new Date(),
        dataSource: 'manual',
        rawResponse: {
          source: 'seed_data',
          basePrice: basePrice,
          gpuCount: instanceType.gpuCount,
          regionMultiplier: regionMultiplier
        }
      }
    })
  }

  // 7. 환율 데이터 생성
  console.log('💱 Creating exchange rates...')
  await prisma.exchangeRate.create({
    data: {
      baseCurrency: 'USD',
      targetCurrency: 'KRW',
      rate: 1334.50,
      rateDate: new Date(),
      source: 'manual'
    }
  })

  await prisma.exchangeRate.create({
    data: {
      baseCurrency: 'USD',
      targetCurrency: 'JPY',
      rate: 149.82,
      rateDate: new Date(),
      source: 'manual'
    }
  })

  console.log('✅ Database seeding completed successfully!')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('❌ Error during seeding:', e)
    await prisma.$disconnect()
    process.exit(1)
  })

