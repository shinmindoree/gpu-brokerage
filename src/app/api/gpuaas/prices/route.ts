import { NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

export async function GET() {
  try {
    const dataPath = path.join(process.cwd(), 'data', 'gpuaas-prices.json')
    const text = await fs.readFile(dataPath, 'utf-8')
    const json = JSON.parse(text)
    return NextResponse.json({ success: true, data: json })
  } catch (error) {
    console.error('Failed to read gpuaas prices:', error)
    return NextResponse.json({ success: false, error: 'Failed to load GPUaaS prices' }, { status: 500 })
  }
}




