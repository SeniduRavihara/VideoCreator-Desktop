import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { startInternalServer } from './server';
import { renderVideo, validateConfig, renderRoot } from '../src/lib/native-render';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST;

let win: BrowserWindow | null = null;
let serverPort = 41234;
let activeRenderAbort: AbortController | null = null;

async function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 680,
    backgroundColor: '#0c0c0c',
    title: 'Cinematic Scroll Video Creator',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.setMenuBarVisibility(false);

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    // In production, load via the internal localhost server so COOP/COEP headers and WASM work seamlessly
    win.loadURL(`http://127.0.0.1:${serverPort}`);
  }
}

// Direct native IPC render handlers
ipcMain.handle('start-render', async (event, { config, imageBuffers, audioBuffer }) => {
  const abort = new AbortController();
  activeRenderAbort = abort;

  const emit = (renderEvent: any) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send('render-progress', renderEvent);
    }
  };

  emit({ progress: 0, stage: 'Starting FFmpeg' });

  try {
    const validatedConfig = validateConfig(config);
    const files = imageBuffers.map((buf: ArrayBuffer, i: number) => new File([buf], `strip-${i}.png`, { type: 'image/png' }));
    const audio = audioBuffer ? new File([audioBuffer], 'audio.mp3', { type: 'audio/mpeg' }) : null;

    await renderVideo(validatedConfig, files, audio, abort.signal, emit);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Export failed.';
    emit({ error: message });
    throw error;
  } finally {
    if (activeRenderAbort === abort) {
      activeRenderAbort = null;
    }
  }
});

ipcMain.handle('cancel-render', () => {
  if (activeRenderAbort) {
    activeRenderAbort.abort();
    activeRenderAbort = null;
  }
  return { cancelled: true };
});

ipcMain.handle('get-rendered-video', async (_event, id: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
    throw new Error('Invalid render ID');
  }
  const file = path.join(renderRoot, id, 'video.mp4');
  const buffer = await fs.readFile(file);
  return buffer.buffer;
});

// IPC handler to save videos to disk
ipcMain.handle('save-video', async (_event, buffer: ArrayBuffer, defaultName = 'story.mp4') => {
  if (!win) return { success: false };

  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: defaultName,
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
  });

  if (canceled || !filePath) {
    return { success: false };
  }

  try {
    await fs.writeFile(filePath, Buffer.from(buffer));
    return { success: true, filePath };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Save failed' };
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(async () => {
  try {
    const isDev = Boolean(VITE_DEV_SERVER_URL);
    const { port } = await startInternalServer({
      staticDir: isDev ? undefined : RENDERER_DIST,
      preferredPort: 41234,
    });
    serverPort = port;
  } catch (err) {
    console.error('Failed to start internal render server:', err);
  }
  await createWindow();
});
