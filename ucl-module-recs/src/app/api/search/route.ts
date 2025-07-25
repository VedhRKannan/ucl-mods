import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { db } from '../firebase'
import fs from 'fs/promises'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

type Module = {
  slug: string
  title: string
  outline: string
  [key: string]: any
}

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json()
    await db.collection('searchQueries').add({
        query,
        timestamp: new Date().toISOString()
      })
      
    if (!query) {
      return NextResponse.json({ error: 'Missing query' }, { status: 400 })
    }

    const filePath = path.join(process.cwd(), 'public/ucl_modules_structured.json')
    const file = await fs.readFile(filePath, 'utf-8')
    const data: Module[] = JSON.parse(file)

    const prompt = `
You are a helpful UCL module selection assistant. A student said:

"${query}"

Here are some modules:

${data.slice(0, 40).map(m => `- ${m.title} (${m.slug}): ${m.outline}`).join('\n')}

Remember:
-FHEQ Level 4 = Year 1
-FHEQ Level 5 = Year 2
-FHEQ Levels 5/6 = Year 3
-Level 7 modules can also be taken by Year 3 students
-Always respect module restrictions and prerequisites. Students studying streams like biomed and maths can't do chemistry modules while those in chemistry can't always to statistics etc. This is very important.

Prioritise modules where at least 3 of the following keys strongly match the student’s query: "subject", "level", "outline", "restrictions".  
If fewer than 3 match, fall back to modules where *2 keys match strongly. If fewer than 2, include only modules where 1 key (preferably "subject", "title", or "outline") matches well.
Respond ONLY with a JSON array of slugs that match (e.g. ["basic-organic-chemistry-CHEM0008", ...])
`.trim()

const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

const result = await model.generateContent({
  contents: [{ role: "user", parts: [{ text: prompt }] }],
  generationConfig: {
    temperature: 0.0  // Lower = more deterministic
  }
})

const text = result.response.text()
console.log('[Gemini raw response]', text)

    const jsonMatch = text.match(/\[[\s\S]*?\]/)

if (!jsonMatch) {
  console.error('[Parse error] No JSON array found in Gemini output')
  return NextResponse.json({
    error: 'Gemini response did not include a valid JSON array',
    raw: text
  }, { status: 500 })
}


    let slugs: string[]
    try {
      slugs = JSON.parse(jsonMatch[0])
    } catch (e) {
      console.error('[JSON.parse error]', e)
      return NextResponse.json({
        error: 'Failed to parse slugs JSON array',
        raw: text
      }, { status: 500 })
    }

    const results = data.filter((m) => slugs.includes(m.slug))
    return NextResponse.json({ results })

  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Unknown error'
    console.error('[Fatal Gemini error]', error)
    return NextResponse.json({ error }, { status: 500 })
  }
}
