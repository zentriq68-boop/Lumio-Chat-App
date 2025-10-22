# Lumio AI Chat Application

A modern AI chat application built with Next.js, featuring text and image generation capabilities powered by Google's Gemini AI.

## Features

- **AI Text Chat**: Intelligent conversations with Gemini AI
- **Image Generation**: Create images from text descriptions
- **Image Editing**: Edit existing images with AI
- **User Authentication**: Secure login/signup with Supabase
- **Credit System**: Usage tracking and subscription tiers
- **Real-time Chat**: Smooth, responsive chat interface
- **Drag & Drop**: Easy image uploads
- **Dark Mode**: Beautiful UI with theme support

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript
- **UI**: Tailwind CSS, shadcn/ui components
- **Backend**: Supabase (Auth, Database, Storage)
- **AI**: Google Gemini 2.5 Flash API
- **Animations**: Framer Motion
- **Deployment**: Vercel

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables (see `.env.example`)
4. Run the development server: `npm run dev`

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
GEMINI_API_KEY=your_gemini_api_key
```

## License

MIT License