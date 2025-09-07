// 환율 변환 서비스
interface ExchangeRateData {
  baseCurrency: string
  targetCurrency: string
  rate: number
  lastUpdated: string
  source: string
}

interface ExchangeRateResponse {
  success: boolean
  rates?: Record<string, number>
  base?: string
  date?: string
  error?: string
}

export class ExchangeRateService {
  private cache: Map<string, ExchangeRateData> = new Map()
  private cacheExpiry: Map<string, number> = new Map()
  private readonly CACHE_DURATION = 60 * 60 * 1000 // 1시간

  /**
   * USD에서 KRW로 환율 변환
   */
  async getUSDToKRW(): Promise<number> {
    const cacheKey = 'USD_KRW'
    const cached = this.getCachedRate(cacheKey)
    
    if (cached) {
      return cached.rate
    }

    try {
      // 여러 환율 API를 시도 (fallback 방식)
      const rate = await this.fetchExchangeRateWithFallback()
      
      // 캐시에 저장
      this.setCachedRate(cacheKey, {
        baseCurrency: 'USD',
        targetCurrency: 'KRW',
        rate,
        lastUpdated: new Date().toISOString(),
        source: 'api'
      })

      return rate
    } catch (error) {
      console.error('Failed to fetch exchange rate:', error)
      
      // API 실패 시 기본 환율 사용 (대략적인 값)
      const fallbackRate = 1300
      console.log(`Using fallback exchange rate: ${fallbackRate} KRW per USD`)
      
      this.setCachedRate(cacheKey, {
        baseCurrency: 'USD',
        targetCurrency: 'KRW',
        rate: fallbackRate,
        lastUpdated: new Date().toISOString(),
        source: 'fallback'
      })

      return fallbackRate
    }
  }

  /**
   * 여러 환율 API를 시도하여 환율 가져오기
   */
  private async fetchExchangeRateWithFallback(): Promise<number> {
    const apis = [
      this.fetchFromExchangeRateAPI,
      this.fetchFromFixerIO,
      this.fetchFromCurrencyAPI
    ]

    for (const api of apis) {
      try {
        const rate = await api()
        if (rate > 0) {
          console.log(`Successfully fetched exchange rate: ${rate} KRW per USD`)
          return rate
        }
      } catch (error) {
        console.warn(`Exchange rate API failed:`, error)
        continue
      }
    }

    throw new Error('All exchange rate APIs failed')
  }

  /**
   * ExchangeRate-API.com 사용 (무료, 인증 불필요)
   */
  private async fetchFromExchangeRateAPI(): Promise<number> {
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`ExchangeRate-API failed: ${response.status}`)
    }

    const data: ExchangeRateResponse = await response.json()
    
    if (!data.success && !data.rates) {
      throw new Error('Invalid response from ExchangeRate-API')
    }

    const krwRate = data.rates?.['KRW']
    if (!krwRate || krwRate <= 0) {
      throw new Error('Invalid KRW rate from ExchangeRate-API')
    }

    return krwRate
  }

  /**
   * Fixer.io 사용 (API 키 필요하지만 더 정확)
   */
  private async fetchFromFixerIO(): Promise<number> {
    const apiKey = process.env.FIXER_API_KEY
    if (!apiKey) {
      throw new Error('Fixer.io API key not configured')
    }

    const response = await fetch(`http://data.fixer.io/api/latest?access_key=${apiKey}&base=USD&symbols=KRW`, {
      method: 'GET'
    })

    if (!response.ok) {
      throw new Error(`Fixer.io failed: ${response.status}`)
    }

    const data: ExchangeRateResponse = await response.json()
    
    if (!data.success) {
      throw new Error(`Fixer.io error: ${data.error}`)
    }

    const krwRate = data.rates?.['KRW']
    if (!krwRate || krwRate <= 0) {
      throw new Error('Invalid KRW rate from Fixer.io')
    }

    return krwRate
  }

  /**
   * CurrencyAPI.com 사용 (무료, 제한적)
   */
  private async fetchFromCurrencyAPI(): Promise<number> {
    const response = await fetch('https://api.currencyapi.com/v3/latest?apikey=free&currencies=KRW&base_currency=USD', {
      method: 'GET'
    })

    if (!response.ok) {
      throw new Error(`CurrencyAPI failed: ${response.status}`)
    }

    const data = await response.json()
    
    if (!data.data || !data.data.KRW) {
      throw new Error('Invalid response from CurrencyAPI')
    }

    const krwRate = data.data.KRW.value
    if (!krwRate || krwRate <= 0) {
      throw new Error('Invalid KRW rate from CurrencyAPI')
    }

    return krwRate
  }

  /**
   * 캐시된 환율 조회
   */
  private getCachedRate(cacheKey: string): ExchangeRateData | null {
    const expiry = this.cacheExpiry.get(cacheKey)
    if (!expiry || Date.now() > expiry) {
      this.cache.delete(cacheKey)
      this.cacheExpiry.delete(cacheKey)
      return null
    }

    return this.cache.get(cacheKey) || null
  }

  /**
   * 환율을 캐시에 저장
   */
  private setCachedRate(cacheKey: string, rateData: ExchangeRateData): void {
    this.cache.set(cacheKey, rateData)
    this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_DURATION)
  }

  /**
   * 가격을 USD에서 KRW로 변환
   */
  async convertUSDToKRW(usdAmount: number): Promise<number> {
    const rate = await this.getUSDToKRW()
    return usdAmount * rate
  }

  /**
   * 가격을 KRW에서 USD로 변환
   */
  async convertKRWToUSD(krwAmount: number): Promise<number> {
    const rate = await this.getUSDToKRW()
    return krwAmount / rate
  }

  /**
   * 현재 캐시된 환율 정보 조회
   */
  getCachedRateInfo(): ExchangeRateData | null {
    return this.getCachedRate('USD_KRW')
  }

  /**
   * 캐시 초기화
   */
  clearCache(): void {
    this.cache.clear()
    this.cacheExpiry.clear()
  }

  /**
   * 환율 히스토리 (간단한 메모리 기반)
   */
  private rateHistory: Array<{ rate: number; timestamp: string; source: string }> = []

  addToHistory(rate: number, source: string): void {
    this.rateHistory.push({
      rate,
      timestamp: new Date().toISOString(),
      source
    })

    // 최근 100개만 유지
    if (this.rateHistory.length > 100) {
      this.rateHistory = this.rateHistory.slice(-100)
    }
  }

  getRateHistory(): Array<{ rate: number; timestamp: string; source: string }> {
    return [...this.rateHistory]
  }
}

// 싱글톤 인스턴스
export const exchangeRateService = new ExchangeRateService()

// 유틸리티 함수들
export const formatPrice = (amount: number, currency: 'USD' | 'KRW'): string => {
  if (currency === 'USD') {
    return `$${amount.toFixed(3)}`
  } else {
    return `₩${Math.round(amount).toLocaleString()}`
  }
}

export const formatPriceWithCurrency = (amount: number, currency: 'USD' | 'KRW'): string => {
  if (currency === 'USD') {
    return `$${amount.toFixed(3)} USD`
  } else {
    return `₩${Math.round(amount).toLocaleString()} KRW`
  }
}