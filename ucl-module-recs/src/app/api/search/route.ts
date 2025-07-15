import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs/promises'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json()
    if (!query) {
      return NextResponse.json({ error: 'Missing query' }, { status: 400 })
    }

    const filePath = path.join(process.cwd(), 'public/ucl_modules_structured.json')
    const file = await fs.readFile(filePath, 'utf-8')
    const data = JSON.parse(file)

    const prompt = `
You are a helpful university module assistant. A student said:

"${query}"

Here are some modules:

${data.slice(0, 40).map(m => `- ${m.title} (${m.slug}): ${m.outline}`).join('\n')}

Respond ONLY with a JSON array of slugs that match (e.g. ["basic-organic-chemistry-CHEM0008", ...])
`.trim()

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' })
    const result = await model.generateContent(prompt)

    const text = result.response.text()
    console.log('[Gemini raw response]', text)

    // try matching a JSON array from the response
    const jsonMatch = text.match(/\[.*?\]/s)
    if (!jsonMatch) {
      console.error('[Parse error] No JSON array found in Gemini output')
      return NextResponse.json({
        error: 'Gemini response did not include a valid JSON array',
        raw: text
      }, { status: 500 })
    }

    let slugs: string[] = []
    try {
      slugs = JSON.parse(jsonMatch[0])
    } catch (e) {
      console.error('[JSON.parse error]', e)
      return NextResponse.json({
        error: 'Failed to parse slugs JSON array',
        raw: text
      }, { status: 500 })
    }

    const results = data.filter((m: any) => slugs.includes(m.slug))
    return NextResponse.json({ results })

  } catch (err: any) {
    console.error('[Fatal Gemini error]', err)
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 })
  }
}
