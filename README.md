# VansRouter for Render

AI Router deployed on Render free tier. Routes requests to free AI providers (Claude, GPT, Gemini, etc.) via 40+ providers.

## Architecture

```
Hermes Gateway → Render (VansRouter) → AI Providers (Free)
```

## Environment Variables

Set in Render dashboard:

- `VANSROUTER_DATA_DIR` - Data directory (default: /app/data)

## Deploy

1. Connect this repo to Render
2. Create a Web Service with Docker runtime
3. The service will build VansRouter from source
4. Note the service URL (e.g., https://vansrouter.onrender.com)

## Health Check

- `GET /health` - Returns service status

## API

VansRouter exposes an OpenAI-compatible API at `/v1/`:
- `POST /v1/chat/completions` - Chat completions
- `GET /v1/models` - List available models

## Default Password

The VansRouter dashboard uses password: `123456`
Dashboard URL: `https://your-service.onrender.com/masuk`
