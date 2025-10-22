import { GoogleGenAI } from "@google/genai"

let ai: GoogleGenAI | null = null

export function getAI() {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set in environment")
    }
    ai = new GoogleGenAI({ apiKey })
  }
  return ai
}

export const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "models/gemini-1.5-flash-latest"
export const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "models/gemini-2.5-flash-image"