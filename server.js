#!/usr/bin/env node
/**
 * VansRouter + Memory Adapter for Render
 * Combined server: AI router on main port, memory endpoints at /memory/*
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT, 10) || 10000;
const DATA_DIR = process.env.VANSROUTER_DATA_DIR || path.join(__dirname, 'data');
const MEMORY_FILE = path.join(DATA_DIR, 'memory-store.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// Memory Adapter (embedded)
// ═══════════════════════════════════════════════════════════════════════════

function loadMemory() {
  try { return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); }
  catch { return { facts: [], conversations: [], preferences: {} }; }
}

function saveMemory(data) {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2));
}

function searchMemory(query, limit = 5) {
  const mem = loadMemory();
  const q = query.toLowerCase();
  return mem.facts
    .filter(f => f.text.toLowerCase().includes(q) || (f.tags || []).some(t => t.toLowerCase().includes(q)))
    .sort((a, b) => (b.importance || 5) - (a.importance || 5))
    .slice(0, limit);
}

function buildContextPrompt() {
  const mem = loadMemory();
  if (mem.facts.length === 0) return '';
  const recent = mem.facts.slice(-20);
  return '\n[MEMORIA DO USUARIO]\n' + recent.map(f => `- ${f.text}`).join('\n') + '\n[/MEMORIA]\n';
}

// ═══════════════════════════════════════════════════════════════════════════
// VansRouter (launches as child process)
// ═══════════════════════════════════════════════════════════════════════════

const VANSROUTER_PORT = PORT + 1; // Internal port for VansRouter
let vansrouterProcess = null;
let vansrouterReady = false;

function startVansRouter() {
  const vansrouterApp = path.join(__dirname, 'node_modules', 'vansrouter', 'app');

  if (!fs.existsSync(vansrouterApp)) {
    console.error('VansRouter app directory not found at:', vansrouterApp);
    return;
  }

  const env = {
    ...process.env,
    PORT: VANSROUTER_PORT.toString(),
    HOSTNAME: '0.0.0.0',
    NODE_ENV: 'production',
    VANSROUTER_DATA_DIR: DATA_DIR,
  };

  // Use custom-server.js if available, otherwise server.js
  const serverFile = fs.existsSync(path.join(vansrouterApp, 'custom-server.js'))
    ? path.join(vansrouterApp, 'custom-server.js')
    : path.join(vansrouterApp, 'server.js');

  console.log(`Starting VansRouter on port ${VANSROUTER_PORT}...`);

  const { spawn } = require('child_process');
  vansrouterProcess = spawn('node', [serverFile], {
    env,
    cwd: vansrouterApp,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  vansrouterProcess.stdout.on('data', (data) => {
    const msg = data.toString();
    console.log(`[VansRouter] ${msg.trim()}`);
    if (msg.includes('listening') || msg.includes('ready') || msg.includes('started')) {
      vansrouterReady = true;
    }
  });

  vansrouterProcess.stderr.on('data', (data) => {
    console.error(`[VansRouter ERROR] ${data.toString().trim()}`);
  });

  vansrouterProcess.on('error', (err) => {
    console.error('Failed to start VansRouter:', err.message);
  });

  vansrouterProcess.on('exit', (code) => {
    console.log(`VansRouter exited with code ${code}`);
    vansrouterReady = false;
    // Restart after 5 seconds
    setTimeout(startVansRouter, 5000);
  });

  // Mark as ready after 10 seconds (Next.js needs time to start)
  setTimeout(() => { vansrouterReady = true; }, 10000);
}

// ═══════════════════════════════════════════════════════════════════════════
// Proxy to VansRouter
// ═══════════════════════════════════════════════════════════════════════════

function proxyToVansRouter(req, res) {
  if (!vansrouterReady || !vansrouterProcess) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'VansRouter starting up...' }));
  }

  const options = {
    hostname: '127.0.0.1',
    port: VANSROUTER_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${VANSROUTER_PORT}` },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'VansRouter unavailable' }));
  });

  req.pipe(proxyReq);
}

// ═══════════════════════════════════════════════════════════════════════════
// Main HTTP Server
// ═══════════════════════════════════════════════════════════════════════════

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    const mem = loadMemory();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: true,
      service: 'vansrouter-render',
      memory_facts: mem.facts.length,
      vansrouter_ready: vansrouterReady,
    }));
  }

  // Memory endpoints
  if (req.url?.startsWith('/memory')) {
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'GET' && req.url === '/memory/context') {
      return res.end(JSON.stringify({ prompt: buildContextPrompt() }));
    }

    if (req.method === 'POST' && req.url === '/memory') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const mem = loadMemory();
          mem.facts.push({
            text: data.text,
            tags: data.tags || [],
            importance: data.importance || 5,
            ts: Date.now(),
          });
          if (mem.facts.length > 500) mem.facts = mem.facts.slice(-300);
          saveMemory(mem);
          res.end(JSON.stringify({ ok: true, count: mem.facts.length }));
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/memory/search') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const { query, limit } = JSON.parse(body);
          res.end(JSON.stringify({ results: searchMemory(query, limit) }));
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    if (req.method === 'DELETE' && req.url?.startsWith('/memory/')) {
      const idx = parseInt(req.url.split('/')[2]);
      const mem = loadMemory();
      if (idx >= 0 && idx < mem.facts.length) {
        mem.facts.splice(idx, 1);
        saveMemory(mem);
      }
      return res.end(JSON.stringify({ ok: true }));
    }
  }

  // Proxy everything else to VansRouter
  proxyToVansRouter(req, res);
});

// ═══════════════════════════════════════════════════════════════════════════
// Start
// ═══════════════════════════════════════════════════════════════════════════

// Start main server first
server.listen(PORT, '0.0.0.0', () => {
  console.log(`VansRouter Render running on port ${PORT}`);
  console.log(`Memory adapter at /memory/*`);
  console.log(`Proxying AI requests to VansRouter on port ${VANSROUTER_PORT}`);

  // Start VansRouter after main server is ready
  setTimeout(() => {
    try {
      startVansRouter();
    } catch (err) {
      console.error('Failed to start VansRouter:', err.message);
    }
  }, 2000);
});
