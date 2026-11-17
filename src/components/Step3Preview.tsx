'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AppState } from '@/lib/types';
import { ScrollingTextEngine } from '@/lib/canvas-engine';
import { Play, Pause, RotateCcw, Video, Download, ArrowLeft, Scissors, Loader2 } from 'lucide-react';
import { VideoStudio } from './VideoStudio';

interface Props {
  state: AppState;
  onBack: () => void;
}

function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  return `${hours ? `${hours}:` : ''}${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function Step3Preview({ state, onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ScrollingTextEngine | null>(null);
  const exportAbort = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [exportedBlob, setExportedBlob] = useState<Blob | null>(null);
  const [progress, setProgress] = useState(0);
  const [showStudio, setShowStudio] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStage, setExportStage] = useState('');
  const [exportError, setExportError] = useState('');
  const [encoderName, setEncoderName] = useState('');
  const exportStartedAt = useRef(0);
  const renderStartedAt = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [estimatedRenderEndMs, setEstimatedRenderEndMs] = useState<number | null>(null);

  useEffect(() => {
    if (!isExporting) return;
    const timer = setInterval(() => setElapsedMs(performance.now() - exportStartedAt.current), 250);
    return () => clearInterval(timer);
  }, [isExporting]);


  useEffect(() => {
    if (state.audioFile) {
      const url = URL.createObjectURL(state.audioFile);
      const audio = new Audio(url);
      audio.loop = true;
      audioRef.current = audio;
      return () => {
        audio.pause();
        audioRef.current = null;
        URL.revokeObjectURL(url);
      };
    } else {
      audioRef.current = null;
    }
  }, [state.audioFile]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new ScrollingTextEngine(canvasRef.current, state);
    engineRef.current = engine;
    engine.onProgress = p => setProgress(Math.round(p * 100));
    engine.onComplete = () => {
      setIsPlaying(false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
    return () => {
      exportAbort.current?.abort();
      engine.destroy();
      audioRef.current?.pause();
    };
  }, [state]);

  const togglePlay = () => {
    if (engineRef.current) {
      if (isPlaying) {
        engineRef.current.pause();
        audioRef.current?.pause();
      } else {
        engineRef.current.play();
        if (audioRef.current && audioRef.current.duration) {
          const totalDuration = engineRef.current.getDuration();
          if (totalDuration > 0) {
            audioRef.current.currentTime = ((progress / 100) * totalDuration) % audioRef.current.duration;
          }
          audioRef.current.play().catch(() => {});
        }
      }
      setIsPlaying(!isPlaying);
    }
  };

  const reset = () => {
    if (engineRef.current) {
      engineRef.current.reset();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setIsPlaying(false);
      setProgress(0);
    }
  };

  const startExport = async () => {
    const engine = engineRef.current;
    if (!engine || exportAbort.current) return;
    const abort = new AbortController();
    exportAbort.current = abort;
    exportStartedAt.current = performance.now();
    renderStartedAt.current = null;
    setElapsedMs(0);
    setEstimatedRenderEndMs(null);
    engine.pause();
    audioRef.current?.pause();
    setIsPlaying(false);
    setIsExporting(true);
    setExportedBlob(null);
    setExportError('');
    setEncoderName('');
    setExportProgress(0);
    setExportStage('Preparing story artwork');
    try {
      if ((window as any).electronAPI?.startRender) {
        // Native Electron IPC Path: Direct in-memory buffer transfer (No localhost HTTP upload)
        const { config, imageBuffers } = await engine.prepareExportData(abort.signal, value => setExportProgress(Math.round(value * 0.1)));
        abort.signal.throwIfAborted();
        const audioBuffer = state.audioFile ? await state.audioFile.arrayBuffer() : null;
        abort.signal.throwIfAborted();

        let resultId: string | undefined;

        const unsubscribe = (window as any).electronAPI.onRenderProgress((event: any) => {
          if (event.error) {
            setExportError(event.error);
            return;
          }
          if (event.encoder) setEncoderName(event.encoder);
          if (event.restarted) {
            setEncoderName('Switching to CPU…');
            renderStartedAt.current = null;
            setEstimatedRenderEndMs(null);
          }
          setExportProgress(10 + Math.round(event.progress * 0.85));
          setExportStage(event.stage);
          const now = performance.now();
          if (event.stage === 'Starting FFmpeg') renderStartedAt.current = now;
          if (event.stage === 'Rendering video' && renderStartedAt.current !== null && event.progress >= 2) {
            const renderElapsed = now - renderStartedAt.current;
            if (renderElapsed >= 2000) {
              setEstimatedRenderEndMs(now - exportStartedAt.current + renderElapsed * (94 - event.progress) / event.progress);
            }
          } else if (event.stage !== 'Rendering video') {
            setEstimatedRenderEndMs(null);
          }
          if (event.id) resultId = event.id;
        });

        try {
          await (window as any).electronAPI.startRender({ config, imageBuffers, audioBuffer });
        } finally {
          unsubscribe?.();
        }

        if (!resultId) throw new Error('Export ended before the video was ready.');
        setExportStage('Finishing MP4');
        const videoBuffer = await (window as any).electronAPI.getRenderedVideo(resultId);
        const blob = new Blob([videoBuffer], { type: 'video/mp4' });
        abort.signal.throwIfAborted();
        setExportedBlob(blob);
        setExportProgress(100);
        setExportStage('MP4 ready');
      } else {
        const form = await engine.prepareExport(abort.signal, value => setExportProgress(Math.round(value * 0.1)));
        abort.signal.throwIfAborted();
        if (state.audioFile) form.append('audio', state.audioFile);
        setExportStage('Uploading artwork');
        const response = await fetch('/api/render', { method: 'POST', body: form, signal: abort.signal });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Could not start export.');
        }
        if (!response.body) throw new Error('No export response.');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let pending = '';
        let resultId: string | undefined;
        while (true) {
          const { value, done } = await reader.read();
          pending += decoder.decode(value, { stream: !done });
          const lines = pending.split('\n');
          pending = lines.pop() || '';
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line);
            if (event.error) throw new Error(event.error);
            if (event.encoder) setEncoderName(event.encoder);
            if (event.restarted) {
              setEncoderName('Switching to CPU…');
              renderStartedAt.current = null;
              setEstimatedRenderEndMs(null);
            }
            setExportProgress(10 + Math.round(event.progress * 0.85));
            setExportStage(event.stage);
            const now = performance.now();
            if (event.stage === 'Starting FFmpeg') renderStartedAt.current = now;
            // Estimate from actual rendered frames, not the weighted upload/download progress.
            if (event.stage === 'Rendering video' && renderStartedAt.current !== null && event.progress >= 2) {
              const renderElapsed = now - renderStartedAt.current;
              if (renderElapsed >= 2000) {
                setEstimatedRenderEndMs(now - exportStartedAt.current + renderElapsed * (94 - event.progress) / event.progress);
              }
            } else if (event.stage !== 'Rendering video') {
              setEstimatedRenderEndMs(null);
            }
            if (event.id) resultId = event.id;
          }
          if (done) break;
        }
        if (!resultId) throw new Error('Export ended before the video was ready.');
        setExportStage('Receiving MP4');
        const video = await fetch(`/api/render/${resultId}`, { signal: abort.signal });
        if (!video.ok) throw new Error('Could not download the rendered video. Please export again.');
        const blob = await video.blob();
        abort.signal.throwIfAborted();
        setExportedBlob(blob);
        setExportProgress(100);
        setExportStage('MP4 ready');
      }
    } catch (error) {
      if (!abort.signal.aborted) setExportError(error instanceof Error ? error.message : 'Export failed.');
    } finally {
      if (exportAbort.current === abort) {
        exportAbort.current = null;
        setElapsedMs(performance.now() - exportStartedAt.current);
        setIsExporting(false);
      }
    }
  };

  const downloadVideo = async () => {
    if (exportedBlob) {
      const extension = exportedBlob.type.includes('mp4') ? 'mp4' : 'webm';
      const defaultName = `cinematic-scroll-${Date.now()}.${extension}`;
      if (typeof window !== 'undefined' && (window as any).electronAPI?.saveVideo) {
        const buffer = await exportedBlob.arrayBuffer();
        await (window as any).electronAPI.saveVideo(buffer, defaultName);
        return;
      }
      const url = URL.createObjectURL(exportedBlob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = defaultName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
        {/* Left Side: Video Preview */}
        <div className="flex-1 w-full lg:order-first order-first">
          <div className="glass p-3 md:p-4 rounded-2xl sticky top-4 lg:top-8 bg-black/20">
            <div className="w-full aspect-[9/16] max-h-[50vh] lg:max-h-[85vh] rounded-xl border border-white/20 overflow-hidden shadow-2xl relative bg-black shadow-yellow-500/5 group">
              <canvas
                ref={canvasRef}
                className="w-full h-full object-contain"
              />
              {isExporting && (
                <div className="absolute top-4 right-4 flex items-center gap-2 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-full border border-red-500/30">
                  <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-xs font-bold text-red-500 tracking-wider">RENDERING</span>
                </div>
              )}
              
              {/* Seek Slider Overlay (Not recorded) */}
              {!isExporting && (
                <div className="absolute inset-x-0 bottom-0 p-4 md:p-6 bg-gradient-to-t from-black/90 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300">
                  <div className="flex items-center gap-4">
                    <input 
                      type="range"
                      min="0"
                      max="1"
                      step="0.001"
                      value={progress / 100}
                      onChange={(e) => {
                        const p = parseFloat(e.target.value);
                        engineRef.current?.pause();
                        audioRef.current?.pause();
                        setIsPlaying(false);
                        engineRef.current?.setProgress(p);
                        setProgress(Math.round(p * 100));
                        if (audioRef.current && audioRef.current.duration) {
                          const totalDuration = engineRef.current?.getDuration() || 0;
                          if (totalDuration > 0) {
                            audioRef.current.currentTime = (p * totalDuration) % audioRef.current.duration;
                          }
                        }
                      }}
                      className="flex-1 accent-yellow-400 h-1.5 cursor-pointer"
                    />
                    <span className="text-[10px] font-mono text-yellow-500 w-8">{progress}%</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Controls & Info */}
        <div className="w-full lg:w-80 xl:w-96 space-y-4 md:space-y-6">
          <div className="glass p-4 md:p-6 rounded-2xl space-y-6">
            <h3 className="text-xl font-bold font-orbitron flex items-center gap-2">
              <Video className="w-5 h-5 text-green-400" />
              Controls
            </h3>

            <div className="space-y-4">
              <p className="text-sm text-gray-400">Export directly to MP4 without playing through the video. Rendering speed depends on the server.</p>

              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={togglePlay}
                  disabled={isExporting}
                  className="flex flex-col items-center justify-center gap-2 p-3 md:p-4 bg-white/5 hover:bg-white/10 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPlaying ? <Pause className="w-5 h-5 md:w-6 h-6" /> : <Play className="w-5 h-5 md:w-6 h-6" />}
                  <span className="text-[10px] md:text-xs font-medium">{isPlaying ? 'Pause' : 'Play'}</span>
                </button>
                <button
                  onClick={reset}
                  disabled={isExporting}
                  className="flex flex-col items-center justify-center gap-2 p-3 md:p-4 bg-white/5 hover:bg-white/10 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RotateCcw className="w-5 h-5 md:w-6 h-6" />
                  <span className="text-[10px] md:text-xs font-medium">Reset</span>
                </button>
                <button
                  onClick={startExport}
                  disabled={isExporting}
                  className={`flex flex-col items-center justify-center gap-2 p-3 md:p-4 rounded-xl transition-all ${
                    isExporting
                      ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/50' 
                      : 'bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-600/20'
                  } ${isExporting ? 'opacity-50' : ''}`}
                >
                  {isExporting ? (
                    <Loader2 className="w-5 h-5 md:w-6 h-6 animate-spin" />
                  ) : (
                    <div className={`w-5 h-5 md:w-6 h-6 rounded-full border-2 ${isExporting ? 'border-red-400 bg-red-400/20' : 'border-white bg-white/20'}`} />
                  )}
                  <span className="text-[10px] md:text-xs font-bold tracking-wide">
                    {isExporting ? 'Rendering' : 'Export'}
                  </span>
                </button>
              </div>
            </div>

            {isExporting && (
              <div className="pt-4 space-y-2 animate-in fade-in">
                <div className="flex justify-between text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                  <span>{exportStage}</span>
                  <span>{exportProgress}%</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-yellow-500 h-full transition-all duration-300 ease-out"
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
              </div>
            )}

            {(isExporting || exportedBlob) && (
              <div className="space-y-2 text-sm text-gray-400 tabular-nums">
                <div className="flex justify-between gap-4">
                  <span>{isExporting ? 'Elapsed export time' : 'Total export time'}</span>
                  <span className="text-white font-mono">{formatDuration(elapsedMs)}</span>
                </div>
                {encoderName && <div className="flex justify-between gap-4"><span>Rendering with</span><span className="text-white">{encoderName}</span></div>}
                {isExporting && (
                  <div className="flex justify-between gap-4">
                    <span>Est. render remaining</span>
                    <span className="text-white font-mono">
                      {exportStage === 'Rendering video'
                        ? estimatedRenderEndMs === null ? 'Estimating…'
                          : estimatedRenderEndMs <= elapsedMs ? 'Finishing…'
                            : `~${formatDuration(estimatedRenderEndMs - elapsedMs + 999)}`
                        : exportStage === 'Adding audio and finishing MP4' || exportStage === 'Ready' || exportStage === 'Receiving MP4'
                          ? 'Finishing…' : 'Preparing…'}
                    </span>
                  </div>
                )}
                {isExporting && <p className="text-xs text-gray-500">The estimate updates as rendering progresses. Audio processing and download take additional time.</p>}
              </div>
            )}

            {isExporting && (
              <button
                onClick={() => {
                  exportAbort.current?.abort();
                  (window as any).electronAPI?.cancelRender?.();
                }}
                className="text-sm text-red-400 hover:text-red-300"
              >
                Cancel export
              </button>
            )}
            {exportError && <p role="alert" className="text-sm text-red-400 break-words">{exportError}</p>}

            {exportedBlob && (
              <div className="pt-4 border-t border-white/10 animate-in fade-in space-y-3">
                <button
                  onClick={() => setShowStudio(true)}
                  className="w-full bg-gradient-to-r from-yellow-500 to-orange-600 text-black px-6 py-4 rounded-xl font-bold hover:from-yellow-400 hover:to-orange-500 transition-all flex items-center justify-center gap-3 shadow-lg shadow-yellow-500/20 hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Scissors className="w-5 h-5" />
                  Open Video Studio
                </button>

                <button
                  onClick={downloadVideo}
                  className="w-full bg-white/5 border border-white/10 text-white px-6 py-4 rounded-xl font-bold hover:bg-white/10 transition-all flex items-center justify-center gap-3"
                >
                  <Download className="w-5 h-5" />
                  Download Video ({exportedBlob.type.includes('mp4') ? 'MP4' : 'WebM'})
                </button>
              </div>
            )}
          </div>

          {showStudio && exportedBlob && (
            <VideoStudio 
              blob={exportedBlob}
              onClose={() => setShowStudio(false)} 
            />
          )}

          <div className="glass p-6 rounded-2xl space-y-4">
            <h4 className="font-semibold text-gray-300">Export Settings</h4>
            <div className="space-y-2 text-sm text-gray-400">
              <div className="flex justify-between">
                <span>Resolution</span>
                <span className="text-white font-medium">{state.resolution}</span>
              </div>
              <div className="flex justify-between">
                <span>Format</span>
                <span className="text-white font-medium">MP4 (H.264)</span>
              </div>
              <div className="flex justify-between">
                <span>Audio</span>
                <span className="text-white font-medium">{state.audioFile ? 'Voice track' : 'None'}</span>
              </div>
              <div className="flex justify-between">
                <span>Framerate</span>
                <span className="text-white font-medium">30 FPS</span>
              </div>
            </div>
            {state.audioFile && <p className="text-xs text-gray-500">Audio follows the story duration. Shorter audio loops until the video ends; longer audio is trimmed.</p>}
          </div>
        </div>
      </div>

      <div className="flex justify-start pt-4">
        <button
          onClick={onBack}
          disabled={isExporting}
          className="px-6 py-3 rounded-full font-semibold text-gray-300 hover:text-white hover:bg-white/5 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Audio
        </button>
      </div>
    </div>
  );
}
