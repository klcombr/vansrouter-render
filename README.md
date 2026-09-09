# VansRouter Render

AI Router + Memory Adapter deployed on Render.

## Endpoints

- `GET /health` - Health check
- `POST /v1/chat/completions` - OpenAI-compatible chat completions (proxied to VansRouter)
- `GET /v1/models` - List available models
- `GET /memory/context` - Get user memory context
- `POST /memory` - Store a fact
- `POST /memory/search` - Search facts
- `DELETE /memory/:idx` - Delete a fact

## Environment Variables

- `PORT` - Server port (default: 10000, set by Render)
- `VANSROUTER_DATA_DIR` - Data directory for memory store

## Deploy

Connected to Render via GitHub. Auto-deploys on push to main.
