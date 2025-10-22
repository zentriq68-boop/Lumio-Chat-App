import { NextRequest, NextResponse } from "next/server"
import { getAI, IMAGE_MODEL } from "@/lib/gemini"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const prompt: string = body?.prompt
    const images: Array<{ data: string; mimeType?: string }> | undefined = body?.images
    const aspectRatio: string | undefined = body?.aspectRatio
    const responseType: "IMAGE" | "TEXT" | "BOTH" | undefined = body?.responseType
    const history: any[] | undefined = body?.history

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
    }

    // Build contents array with proper structure for Gemini 2.5 Flash Image
    const contents: any[] = Array.isArray(history) ? [...history] : []

    // Construct a single user message and attach text + inline images
    const userParts: any[] = [{ text: prompt }]

    if (Array.isArray(images) && images.length > 0) {
      const imageParts = images.map((img) => ({
        inlineData: {
          data: img.data,
          mimeType: img.mimeType || "image/png",
        },
      }))
      userParts.push(...imageParts)
    }

    contents.push({ role: "user", parts: userParts })

    // Build config, defaulting to image-only output for generation/editing
    const config: any = {}
    if (responseType) {
      if (responseType === "IMAGE") config.responseModalities = ["IMAGE"]
      else if (responseType === "TEXT") config.responseModalities = ["TEXT"]
      else config.responseModalities = ["IMAGE", "TEXT"]
    } else {
      config.responseModalities = ["IMAGE"]
    }
    if (aspectRatio) {
      config.imageConfig = { aspectRatio }
    }

    const ai = getAI()
    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents,
      config,
    })

    // Support both new and old response shapes
    const parts = (response as any)?.parts?.length
      ? (response as any).parts
      : (response as any)?.candidates?.[0]?.content?.parts || []

    const imagesOut: Array<{ data: string; mimeType: string }> = []
    const textsOut: string[] = []

    for (const part of parts) {
      if (part.inlineData?.data) {
        imagesOut.push({ data: part.inlineData.data, mimeType: part.inlineData.mimeType || "image/png" })
      } else if (part.text) {
        textsOut.push(part.text)
      }
    }

    if (imagesOut.length === 0 && textsOut.length === 0) {
      const finishReason = (response as any)?.candidates?.[0]?.finishReason
      const blockReason = (response as any)?.promptFeedback?.blockReason
      const msg = blockReason
        ? `Request blocked: ${blockReason}`
        : finishReason
        ? `No output returned (finish reason: ${finishReason})`
        : "No output returned"
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    return NextResponse.json({ images: imagesOut, text: textsOut.join("\n") })
  } catch (err: any) {
    console.error("/api/gemini/image error:", err)
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}