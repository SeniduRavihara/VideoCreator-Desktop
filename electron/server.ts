import http from 'node:http';
import { Readable } from 'node:stream';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { renderVideo, validateConfig, renderRoot } from '../src/lib/native-render';
import sirv from 'sirv';

export interface ServerOptions {
  staticDir?: string;
  preferredPort?: number;
}

export function startInternalServer(options: ServerOptions = {}): Promise<{ port: number; server: http.Server }> {
  return new Promise((resolve, reject) => {
    let staticHandler: ((req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => void) | null = null;
    if (options.staticDir) {
      staticHandler = sirv(options.staticDir, {
        single: true, // SPA fallback to index.html
        dev: false,
        setHeaders(res) {
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        },
      });
    }

    const server = http.createServer(async (req, res) => {
      // Security & WASM headers for all responses
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);

      // Route: POST /api/render
      if (req.method === 'POST' && url.pathname === '/api/render') {
        const abort = new AbortController();
        res.on('close', () => {
          if (!res.writableFinished) {
            abort.abort();
          }
        });

        try {
          const webReq = new Request(url.toString(), {
            method: 'POST',
            headers: req.headers as HeadersInit,
            body: Readable.toWeb(req) as ReadableStream<Uint8Array>,
            // @ts-expect-error duplex is required in node fetch
            duplex: 'half',
          });

          const form = await webReq.formData();
          const config = validateConfig(JSON.parse(String(form.get('config'))));
          const images = form.getAll('strip');
          const audio = form.get('audio');

          if (
            images.length !== config.strips.length ||
            images.some((img) => !(img instanceof File)) ||
            (audio !== null && !(audio instanceof File))
          ) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing export images or invalid audio.' }));
            return;
          }

          const files = images as File[];

          res.writeHead(200, {
            'Content-Type': 'application/x-ndjson',
            'Cache-Control': 'no-store',
            'X-Accel-Buffering': 'no',
            'Transfer-Encoding': 'chunked',
          });

          const emit = (event: object) => {
            if (!abort.signal.aborted && res.writable) {
              res.write(JSON.stringify(event) + '\n');
            }
          };

          emit({ progress: 0, stage: 'Starting FFmpeg' });

          await renderVideo(config, files, audio as File | null, abort.signal, emit);

          if (!res.writableEnded) {
            res.end();
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Export failed.';
          if (res.headersSent) {
            res.write(JSON.stringify({ error: message }) + '\n');
            res.end();
          } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: message }));
          }
        }
        return;
      }

      // Route: GET /api/render/:id
      if (req.method === 'GET' && url.pathname.startsWith('/api/render/')) {
        const id = url.pathname.slice('/api/render/'.length).trim();
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
          return;
        }

        const file = join(renderRoot, id, 'video.mp4');
        try {
          const info = await stat(file);
          res.writeHead(200, {
            'Content-Type': 'video/mp4',
            'Content-Length': String(info.size),
            'Cache-Control': 'no-store',
            'Content-Disposition': 'attachment; filename="story.mp4"',
          });
          createReadStream(file).pipe(res);
        } catch {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Export expired. Please export again.');
        }
        return;
      }

      // Production static file handler
      if (staticHandler) {
        staticHandler(req, res, () => {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
        });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    });

    const portToTry = options.preferredPort ?? 0;

    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && portToTry !== 0) {
        console.warn(`Port ${portToTry} in use, falling back to random available port...`);
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          const actualPort = typeof addr === 'object' && addr ? addr.port : 0;
          resolve({ port: actualPort, server });
        });
        return;
      }
      reject(err);
    });

    server.listen(portToTry, '127.0.0.1', () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : portToTry;
      resolve({ port: actualPort, server });
    });
  });
}
