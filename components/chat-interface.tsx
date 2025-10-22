"use client"

import React, { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/use-toast"
import { supabase } from "@/lib/supabaseClient"
import { AuthModal } from "@/components/auth-modal"
import { Send, Image as ImageIcon, Download, Eye, X, Upload, Trash2, LogOut, User, Settings, Sparkles, Zap, Crown, MessageSquare, ImagePlus, Palette, Wand2, Bot, Loader2 } from "lucide-react"
import { User as SupabaseUser } from "@supabase/supabase-js"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"

interface Message {
  id: string
  content: string
  isUser: boolean
  timestamp: Date
  images?: Array<{ data: string; mimeType: string }>
}

interface UserProfile {
  id: string
  email: string
  credits: number
  subscription_tier: 'free' | 'pro' | 'premium'
  avatar_url?: string
  display_name?: string
}

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

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [imageMode, setImageMode] = useState(false)
  const [uploadedImages, setUploadedImages] = useState<File[]>([])
  const [aspectRatio, setAspectRatio] = useState<string>("")
  const [previewImage, setPreviewImage] = useState<{ data: string; mimeType: string; index: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [showMessageLimitDialog, setShowMessageLimitDialog] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Load user session and profile
  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        setUser(session.user)
        await loadUserProfile(session.user.id)
        await loadUserMessages(session.user.id)
      }
    }
    getSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user)
        await loadUserProfile(session.user.id)
        await loadUserMessages(session.user.id)
        setShowAuthModal(false)
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        setUserProfile(null)
        setMessages([])
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const loadUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single()
      
      if (error && error.code !== 'PGRST116') {
        console.error('Error loading user profile:', error)
        return
      }
      
      if (data) {
        setUserProfile(data)
      } else {
        // Create default profile if it doesn't exist
        const { data: newProfile, error: createError } = await supabase
          .from('user_profiles')
          .insert({
            id: userId,
            email: user?.email || '',
            credits: 10,
            subscription_tier: 'free'
          })
          .select()
          .single()
        
        if (createError) {
          console.error('Error creating user profile:', createError)
        } else {
          setUserProfile(newProfile)
        }
      }
    } catch (error) {
      console.error('Error in loadUserProfile:', error)
    }
  }

  const loadUserMessages = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(50)
      
      if (error) {
        console.error('Error loading messages:', error)
        return
      }
      
      if (data) {
        const formattedMessages: Message[] = data.map(msg => ({
          id: msg.id,
          content: msg.content,
          isUser: msg.is_user,
          timestamp: new Date(msg.created_at),
          images: msg.images ? JSON.parse(msg.images) : undefined
        }))
        setMessages(formattedMessages)
      }
    } catch (error) {
      console.error('Error in loadUserMessages:', error)
    }
  }

  const saveMessage = async (message: Message, userId: string) => {
    try {
      await supabase
        .from('chat_messages')
        .insert({
          id: message.id,
          user_id: userId,
          content: message.content,
          is_user: message.isUser,
          images: message.images ? JSON.stringify(message.images) : null,
          created_at: message.timestamp.toISOString()
        })
    } catch (error) {
      console.error('Error saving message:', error)
    }
  }

  const checkCredits = () => {
    if (!user) {
      setShowAuthModal(true)
      setAuthMode('login')
      return false
    }
    
    if (!userProfile || userProfile.credits <= 0) {
      setShowMessageLimitDialog(true)
      return false
    }
    
    return true
  }

  const handleSend = async () => {
    if (!input.trim() && uploadedImages.length === 0) return
    if (!checkCredits()) return

    const messageId = Date.now().toString()
    const userMessage: Message = {
      id: messageId,
      content: input,
      isUser: true,
      timestamp: new Date(),
      images: uploadedImages.length > 0 ? await Promise.all(
        uploadedImages.map(async (file) => ({
          data: await toBase64(file),
          mimeType: file.type
        }))
      ) : undefined
    }

    setMessages(prev => [...prev, userMessage])
    setInput("")
    setUploadedImages([])
    setIsLoading(true)
    setIsTyping(true)

    if (user) {
      await saveMessage(userMessage, user.id)
    }

    try {
      const requestBody = {
        prompt: input,
        images: userMessage.images,
        responseType: imageMode ? "IMAGE" : "TEXT",
        aspectRatio: imageMode && aspectRatio ? aspectRatio : undefined
      }

      const response = await fetch(imageMode ? "/api/gemini/image" : "/api/gemini/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to get response")
      }

      const botMessageId = (Date.now() + 1).toString()
      const botMessage: Message = {
        id: botMessageId,
        content: data.text || "Generated image",
        isUser: false,
        timestamp: new Date(),
        images: data.images || undefined
      }

      setMessages(prev => [...prev, botMessage])
      
      if (user) {
        await saveMessage(botMessage, user.id)
        
        // Log generation to decrement credits
        await supabase
          .from("generations")
          .insert({ 
            user_id: user.id, 
            prompt: input, 
            image_url: data.images?.[0]?.data || null 
          })
        
        // Refresh user profile to get updated credits
        await loadUserProfile(user.id)
      }

      toast({
        title: "Message sent!",
        description: imageMode ? "Image generated successfully" : "Response received",
      })
    } catch (error) {
      console.error("Error:", error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `Error: ${error instanceof Error ? error.message : "Something went wrong"}",
        isUser: false,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
      
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
      setIsTyping(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setUploadedImages(prev => [...prev, ...files])
  }

  const removeUploadedImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index))
  }

  const downloadImage = (img: { data: string; mimeType: string }, messageIndex: number, imageIndex: number) => {
    const link = document.createElement("a")
    link.href = `data:${img.mimeType};base64,${img.data}`
    const ext = img.mimeType.split("/")[1] || "png"
    const rand = Math.floor(100000 + Math.random() * 900000)
    link.download = `lumio-chat-image-${rand}.${ext}`
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

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    toast({
      title: "Signed out",
      description: "You have been successfully signed out."
    })
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const files = Array.from(e.dataTransfer.files).filter(file => 
      file.type.startsWith('image/')
    )
    
    if (files.length > 0) {
      setUploadedImages(prev => [...prev, ...files])
      setImageMode(true)
    }
  }

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case 'premium': return <Crown className="h-4 w-4 text-yellow-500" />
      case 'pro': return <Zap className="h-4 w-4 text-blue-500" />
      default: return <Sparkles className="h-4 w-4 text-gray-500" />
    }
  }

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'premium': return 'bg-gradient-to-r from-yellow-400 to-orange-500'
      case 'pro': return 'bg-gradient-to-r from-blue-400 to-purple-500'
      default: return 'bg-gradient-to-r from-gray-400 to-gray-600'
    }
  }

  return (
    <div 
      className="flex h-screen flex-col bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Message Limit Dialog */}
      <Dialog open={showMessageLimitDialog} onOpenChange={setShowMessageLimitDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              Message Limit Reached
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You've used all your free messages. Upgrade to continue chatting with Lumio AI.
            </p>
            <div className="grid gap-3">
              <Card className="p-4 border-blue-200 bg-blue-50">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-blue-900">Pro Plan</h4>
                    <p className="text-sm text-blue-700">100 messages/month</p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-blue-900">$9.99</div>
                    <div className="text-xs text-blue-600">/month</div>
                  </div>
                </div>
              </Card>
              <Card className="p-4 border-yellow-200 bg-yellow-50">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-yellow-900">Premium Plan</h4>
                    <p className="text-sm text-yellow-700">Unlimited messages</p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-yellow-900">$19.99</div>
                    <div className="text-xs text-yellow-600">/month</div>
                  </div>
                </div>
              </Card>
            </div>
            <Button className="w-full" onClick={() => setShowMessageLimitDialog(false)}>
              Upgrade Now
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm dark:bg-slate-900/80">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Lumio AI
              </h1>
            </div>
            <Badge variant="secondary" className="text-xs">
              <div className="h-2 w-2 rounded-full bg-green-500 mr-1 animate-pulse" />
              Online
            </Badge>
          </div>
          
          <div className="flex items-center gap-3">
            {user ? (
              <>
                {userProfile && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn("text-white border-0", getTierColor(userProfile.subscription_tier))}>
                      {getTierIcon(userProfile.subscription_tier)}
                      <span className="ml-1 capitalize">{userProfile.subscription_tier}</span>
                    </Badge>
                    <Badge variant="secondary">
                      <Zap className="h-3 w-3 mr-1" />
                      {userProfile.credits} credits
                    </Badge>
                  </div>
                )}
                <Avatar className="h-8 w-8">
                  <AvatarImage src={userProfile?.avatar_url} />
                  <AvatarFallback>
                    {userProfile?.display_name?.[0] || user.email?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <Button variant="ghost" size="sm" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <div className="flex gap-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => { setAuthMode('login'); setShowAuthModal(true) }}
                >
                  <User className="h-4 w-4 mr-2" />
                  Login
                </Button>
                <Button 
                  size="sm" 
                  onClick={() => { setAuthMode('signup'); setShowAuthModal(true) }}
                >
                  Sign Up
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Global Drag Overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-blue-500/20 backdrop-blur-sm flex items-center justify-center"
          >
            <div className="bg-white dark:bg-slate-800 rounded-lg p-8 shadow-xl border-2 border-dashed border-blue-500">
              <div className="text-center">
                <Upload className="h-12 w-12 text-blue-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Drop Images Here</h3>
                <p className="text-sm text-muted-foreground">Release to upload and switch to image mode</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <AnimatePresence>
          {messages.map((message, index) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className={cn(
                "flex gap-3",
                message.isUser ? "justify-end" : "justify-start"
              )}
            >
              {!message.isUser && (
                <Avatar className="h-8 w-8 mt-1">
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                    <Bot className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              )}
              
              <div className={cn(
                "max-w-[70%] space-y-2",
                message.isUser ? "items-end" : "items-start"
              )}>
                <Card className={cn(
                  "p-4",
                  message.isUser 
                    ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0" 
                    : "bg-white dark:bg-slate-800 border shadow-sm"
                )}>
                  <CardContent className="p-0">
                    {message.content && (
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    )}
                    
                    {message.images && message.images.length > 0 && (
                      <div className="mt-3 grid gap-2 grid-cols-1 sm:grid-cols-2">
                        {message.images.map((img, imgIndex) => (
                          <div key={imgIndex} className="group relative overflow-hidden rounded-lg border bg-white">
                            <img 
                              src={`data:${img.mimeType};base64,${img.data}`} 
                              alt={`Generated ${imgIndex + 1}`} 
                              className="h-auto w-full block cursor-pointer hover:scale-105 transition-transform duration-200" 
                              onClick={() => openPreview(img, imgIndex)}
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300 pointer-events-none">
                              <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-auto">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="h-7 w-7 p-0 bg-white/90 hover:bg-white shadow-lg backdrop-blur-sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    openPreview(img, imgIndex)
                                  }}
                                  title="Full Preview"
                                >
                                  <Eye className="h-3 w-3 text-gray-700" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="h-7 w-7 p-0 bg-white/90 hover:bg-white shadow-lg backdrop-blur-sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    downloadImage(img, index, imgIndex)
                                  }}
                                  title="Download"
                                >
                                  <Download className="h-3 w-3 text-gray-700" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
                
                <div className={cn(
                  "flex items-center gap-2 text-xs text-muted-foreground",
                  message.isUser ? "justify-end" : "justify-start"
                )}>
                  <span>{message.timestamp.toLocaleTimeString()}</span>
                </div>
              </div>
              
              {message.isUser && user && (
                <Avatar className="h-8 w-8 mt-1">
                  <AvatarImage src={userProfile?.avatar_url} />
                  <AvatarFallback>
                    {userProfile?.display_name?.[0] || user.email?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        
        {/* Typing Indicator */}
        <AnimatePresence>
          {isTyping && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex gap-3 justify-start"
            >
              <Avatar className="h-8 w-8 mt-1">
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                  <Bot className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <Card className="p-4 bg-white dark:bg-slate-800 border shadow-sm">
                <CardContent className="p-0">
                  <div className="flex items-center gap-1">
                    <div className="flex gap-1">
                      <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" />
                    </div>
                    <span className="text-xs text-muted-foreground ml-2">Lumio is thinking...</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
        
        <div ref={messagesEndRef} />
      </div>

      {/* Image Preview Modal */}
      <AnimatePresence>
        {previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
            onClick={closePreview}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-lg bg-white"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute right-2 top-2 z-10 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 w-8 p-0"
                  onClick={() => downloadImage(previewImage, 0, previewImage.index)}
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
                alt={`Preview ${previewImage.index + 1}`}
                className="max-h-[90vh] max-w-[90vw] object-contain"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input Area */}
      <div className="border-t bg-white/80 backdrop-blur-sm dark:bg-slate-900/80 p-6">
        <div className="mx-auto max-w-4xl space-y-4">
          {/* Mode Toggle */}
          <Tabs value={imageMode ? "image" : "text"} onValueChange={(value) => setImageMode(value === "image")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="text" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Text Chat
              </TabsTrigger>
              <TabsTrigger value="image" className="flex items-center gap-2">
                <ImagePlus className="h-4 w-4" />
                Image Generation
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Image Mode Controls */}
          <AnimatePresence>
            {imageMode && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-3"
              >
                <div className="flex items-center gap-3">
                  <Select value={aspectRatio} onValueChange={setAspectRatio}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Aspect ratio (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1:1">1:1 (Square)</SelectItem>
                      <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                      <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                      <SelectItem value="4:5">4:5 (Portrait)</SelectItem>
                      <SelectItem value="5:4">5:4 (Landscape)</SelectItem>
                      <SelectItem value="4:3">4:3 (Landscape)</SelectItem>
                      <SelectItem value="3:2">3:2 (Landscape)</SelectItem>
                      <SelectItem value="2:3">2:3 (Portrait)</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    Upload Images
                  </Button>
                </div>

                {/* Uploaded Images Preview */}
                {uploadedImages.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {uploadedImages.map((file, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={URL.createObjectURL(file)}
                          alt={`Upload ${index + 1}`}
                          className="h-16 w-16 rounded-lg object-cover border"
                        />
                        <Button
                          size="sm"
                          variant="destructive"
                          className="absolute -top-2 -right-2 h-6 w-6 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => removeUploadedImage(index)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input */}
          <div className="flex gap-3">
            <div className="flex-1">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={imageMode ? "Describe the image you want to generate or edit..." : "Type your message..."}
                className="min-h-[60px] resize-none"
                disabled={isLoading}
              />
            </div>
            <Button
              onClick={handleSend}
              disabled={isLoading || (!input.trim() && uploadedImages.length === 0)}
              size="lg"
              className="px-6"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : imageMode ? (
                <Wand2 className="h-4 w-4" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      </div>

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        mode={authMode}
        onModeChange={setAuthMode}
      />
    </div>
  )
}