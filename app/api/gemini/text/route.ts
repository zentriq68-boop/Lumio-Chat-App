import { NextRequest, NextResponse } from "next/server"
import { getAI, TEXT_MODEL } from "@/lib/gemini"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const prompt: string | undefined = body?.prompt
    const files: Array<{ data: string; mimeType?: string }> | undefined = body?.files
    const history: any[] | undefined = body?.history

    const contents: any[] = Array.isArray(history) ? [...history] : []
    if (prompt && typeof prompt === "string") {
      contents.push({ role: "user", parts: [{ text: prompt }] })
    }

    if (Array.isArray(files) && files.length > 0) {
      const inlineParts = files.map((f) => ({
        inlineData: {
          data: f.data,
          mimeType: f.mimeType || "image/png",
        },
      }))
      // Attach files to the last user message or create a new one
      if (contents.length > 0 && contents[contents.length - 1]?.role === "user") {
        contents[contents.length - 1].parts.push(...inlineParts)
      } else {
        contents.push({ role: "user", parts: inlineParts })
      }
    }

    if (contents.length === 0) {
      return NextResponse.json({ error: "Provide a prompt or files" }, { status: 400 })
    }

    const ai = getAI()
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents,
    })

    const parts = response?.candidates?.[0]?.content?.parts || []
    const text = parts.filter((p: any) => p.text).map((p: any) => p.text).join("\n")

    return NextResponse.json({ text })
  } catch (err: any) {
    console.error("/api/gemini/text error:", err)
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}