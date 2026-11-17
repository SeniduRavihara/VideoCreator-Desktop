import { ipcRenderer, contextBridge } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  startRender: (data: { config: any; imageBuffers: ArrayBuffer[]; audioBuffer?: ArrayBuffer | null }) =>
    ipcRenderer.invoke('start-render', data),
  cancelRender: () => ipcRenderer.invoke('cancel-render'),
  getRenderedVideo: (id: string) => ipcRenderer.invoke('get-rendered-video', id),
  onRenderProgress: (callback: (event: any) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('render-progress', handler);
    return () => ipcRenderer.off('render-progress', handler);
  },
  saveVideo: async (buffer: ArrayBuffer, defaultName = 'story.mp4') => {
    return ipcRenderer.invoke('save-video', buffer, defaultName);
  },
  platform: process.platform,
});

contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args;
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args));
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args;
    return ipcRenderer.off(channel, ...omit);
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args;
    return ipcRenderer.send(channel, ...omit);
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args;
    return ipcRenderer.invoke(channel, ...omit);
  },
});
