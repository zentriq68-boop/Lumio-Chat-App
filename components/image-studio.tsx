"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Download, Eye, X } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(",")[1] || result
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function ImageStudio() {
  const [prompt, setPrompt] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [imagesOut, setImagesOut] = useState<Array<{ data: string; mimeType: string }>>([])
  const [textOut, setTextOut] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [aspectRatio, setAspectRatio] = useState<string>("")
  const [previewImage, setPreviewImage] = useState<{ data: string; mimeType: string; index: number } | null>(null)

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || [])
    // Append newly selected files to the existing selection instead of replacing
    setFiles((prev) => [...prev, ...list])
  }

  const send = async (useEdit: boolean) => {
    if (!prompt.trim()) return
    setLoading(true)
    // Removed clearing the existing images to preserve previous results
    // setImagesOut([])
    setTextOut("")
    try {
      const images = useEdit
        ? await Promise.all(
            files.map(async (f) => ({
              data: await toBase64(f),
              mimeType: f.type || "image/png",
            })),
          )
        : undefined

      const res = await fetch("/api/gemini/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, images, aspectRatio: aspectRatio || undefined, responseType: "IMAGE" }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Request failed")
      // Append new images to the existing gallery instead of replacing
      setImagesOut((prev) => [...prev, ...(json?.images || [])])
      setTextOut(json?.text || "")

      // Log generation to Supabase to decrement credits via trigger
      try {
        const { data: userData } = await supabase.auth.getUser()
        const userId = userData?.user?.id
        if (userId) {
          await supabase
            .from("generations")
            .insert({ user_id: userId, prompt, image_url: null })
        }
      } catch (e) {
        console.warn("Failed to log generation:", e)
      }
    } catch (err: any) {
      setTextOut(err?.message || "Unexpected error")
    } finally {
      setLoading(false)
    }
  }

  const downloadImage = (img: { data: string; mimeType: string }, index: number) => {
    const link = document.createElement("a")
    link.href = `data:${img.mimeType};base64,${img.data}`
    const ext = img.mimeType.split("/")[1] || "png"
    const rand = Math.floor(100000 + Math.random() * 900000)
    link.download = `lumiosa.xyz image ${rand}.${ext}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const openPreview = (img: { data: string; mimeType: string }, index: number) => {
    setPreviewImage({ ...img, index })
  }

  const closePreview = () => {
    setPreviewImage(null)
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">Gemini Image Studio</h1>
      <p className="mb-6 text-sm text-muted-foreground">Generate or edit images using Gemini 2.5 Flash Image.</p>

      <div className="space-y-4">
        <textarea
          className="w-full rounded-lg border border-gray-200 p-3 text-sm outline-none"
          rows={4}
          placeholder="Describe the image you want, or describe the edit to apply"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />

        <div className="flex items-center gap-3">
          <input type="file" multiple accept="image/*" onChange={onFileChange} />
          <select
            className="rounded-md border border-gray-200 p-2 text-sm"
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value)}
          >
            <option value="">Aspect ratio (optional)</option>
            <option value="1:1">1:1</option>
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
            <option value="4:5">4:5</option>
            <option value="5:4">5:4</option>
            <option value="4:3">4:3</option>
            <option value="3:2">3:2</option>
            <option value="2:3">2:3</option>
          </select>
        </div>

        <div className="flex gap-3">
          <Button onClick={() => send(false)} disabled={loading || !prompt.trim()}>
            {loading ? "Generating..." : "Generate Image"}
          </Button>
          <Button variant="secondary" onClick={() => send(true)} disabled={loading || !prompt.trim() || files.length === 0}>
            {loading ? "Editing..." : "Edit Selected Images"}
          </Button>
        </div>
      </div>

      {textOut && <div className="mt-4 text-sm text-muted-foreground">{textOut}</div>}

      {imagesOut.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {imagesOut.map((img, idx) => (
            <div key={idx} className="group relative overflow-hidden rounded-lg border border-gray-200 bg-white">
              <img src={`data:${img.mimeType};base64,${img.data}`} alt={`Generated ${idx + 1}`} className="h-auto w-full block" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300 pointer-events-none">
                <div className="absolute bottom-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-auto">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 w-8 p-0 bg-white/90 hover:bg-white shadow-lg backdrop-blur-sm"
                    onClick={() => openPreview(img, idx)}
                    title="Full Preview"
                  >
                    <Eye className="h-4 w-4 text-gray-700" />
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 w-8 p-0 bg-white/90 hover:bg-white shadow-lg backdrop-blur-sm"
                    onClick={() => downloadImage(img, idx)}
                    title="Download"
                  >
                    <Download className="h-4 w-4 text-gray-700" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Full Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4">
          <div className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-lg bg-white">
            <div className="absolute right-2 top-2 z-10 flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="h-8 w-8 p-0"
                onClick={() => downloadImage(previewImage, previewImage.index)}
                title="Download"
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="h-8 w-8 p-0"
                onClick={closePreview}
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <img
              src={`data:${previewImage.mimeType};base64,${previewImage.data}`}
              alt={`Generated ${previewImage.index + 1} - Full Preview`}
              className="max-h-[90vh] max-w-[90vw] object-contain"
            />
          </div>
        </div>
      )}
    </div>
  )
}