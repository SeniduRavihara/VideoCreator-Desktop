import React, { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { Scissors, Crop, Download, Loader2, Play, Pause, RefreshCw, CheckCircle2 } from 'lucide-react';

interface Props {
  blob: Blob;
  onClose: () => void;
}

export function VideoStudio({ blob, onClose }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [ffmpeg] = useState(() => new FFmpeg());
  const videoRef = useRef<HTMLVideoElement>(null);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [aspectRatio, setAspectRatio] = useState<'original' | '1:1' | '16:9'>('original');
  const [editedBlob, setEditedBlob] = useState<Blob | null>(null);

  useEffect(() => {
    const load = async () => {
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      setLoaded(true);
    };
    load();
  }, [ffmpeg]);

  useEffect(() => {
    if (videoRef.current) {
      const video = videoRef.current;
      const handleMetadata = () => {
        if (video.duration === Infinity) {
          // Trick to fix Infinity duration on Chrome for WebM blobs
          video.currentTime = 1e101;
          const onTimeUpdate = () => {
            video.removeEventListener('timeupdate', onTimeUpdate);
            if (video.duration !== Infinity && !isNaN(video.duration)) {
              setDuration(video.duration);
              setEndTime(video.duration);
            }
            video.currentTime = 0;
          };
          video.addEventListener('timeupdate', onTimeUpdate);
        } else if (!isNaN(video.duration)) {
          setDuration(video.duration || 0);
          setEndTime(video.duration || 0);
        }
      };

      video.addEventListener('loadedmetadata', handleMetadata);
      if (video.readyState >= 1) handleMetadata(); // Already loaded
      
      return () => video.removeEventListener('loadedmetadata', handleMetadata);
    }
  }, [blob]);

  const handleProcess = async () => {
    if (!loaded) return;
    setProcessing(true);
    try {
      const inputName = 'input.webm';
      const outputName = 'output.mp4';
      
      await ffmpeg.writeFile(inputName, await fetchFile(blob));

      const args = ['-i', inputName];
      
      // Trimming
      args.push('-ss', startTime.toString());
      args.push('-to', endTime.toString());

      // Cropping
      if (aspectRatio === '1:1') {
        // Assume portrait input (9:16), crop to center square
        // crop=w:h:x:y -> crop=ih:ih:(iw-ih)/2:0
        args.push('-vf', 'crop=ih:ih:(iw-ih)/2:0');
      } else if (aspectRatio === '16:9') {
        // Landscape crop from portrait (not ideal but possible)
        args.push('-vf', 'crop=iw:iw*9/16:0:(ih-iw*9/16)/2');
      }

      args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', outputName);

      await ffmpeg.exec(args);

      const data = await ffmpeg.readFile(outputName);
      const resultBlob = new Blob([(data as any).buffer], { type: 'video/mp4' });
      setEditedBlob(resultBlob);
    } catch (error) {
      console.error('Processing failed:', error);
      alert('Video processing failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const download = () => {
    if (!editedBlob) return;
    const url = URL.createObjectURL(editedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `edited-video-${Date.now()}.mp4`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="glass w-full max-w-5xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
          <h2 className="text-xl font-bold font-orbitron flex items-center gap-3">
            <Scissors className="w-6 h-6 text-yellow-500" />
            Video Studio
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col lg:flex-row gap-8">
          {/* Video Preview Side */}
          <div className="flex-1 space-y-4">
            <div className="relative aspect-[9/16] bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/5 max-h-[600px] mx-auto">
              <video 
                ref={videoRef}
                src={URL.createObjectURL(blob)}
                className="w-full h-full object-contain"
                controls
              />
              {processing && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-4 z-10 backdrop-blur-sm">
                  <Loader2 className="w-12 h-12 text-yellow-500 animate-spin" />
                  <p className="text-sm font-bold tracking-widest text-yellow-500 animate-pulse uppercase">Processing Studio Magic...</p>
                </div>
              )}
            </div>
            
            <div className="glass p-4 rounded-xl space-y-3">
              <div className="flex justify-between text-xs font-mono text-gray-400 uppercase tracking-tighter">
                <span>Trim range: {startTime.toFixed(1)}s - {endTime.toFixed(1)}s</span>
                <span className="text-yellow-500">Total: {(endTime - startTime).toFixed(1)}s</span>
              </div>
              <div className="relative h-2 bg-white/10 rounded-full overflow-hidden">
                <input 
                  type="range" 
                  min={0} 
                  max={duration} 
                  step={0.1}
                  value={startTime}
                  onChange={(e) => setStartTime(Math.min(parseFloat(e.target.value), endTime - 0.5))}
                  className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer pointer-events-auto"
                />
                <input 
                  type="range" 
                  min={0} 
                  max={duration} 
                  step={0.1}
                  value={endTime}
                  onChange={(e) => setEndTime(Math.max(parseFloat(e.target.value), startTime + 0.5))}
                  className="absolute inset-0 w-full h-full opacity-0 z-20 cursor-pointer pointer-events-auto"
                />
                <div 
                  className="absolute h-full bg-yellow-500/50 border-x-2 border-yellow-500" 
                  style={{ 
                    left: `${(startTime / duration) * 100}%`, 
                    right: `${100 - (endTime / duration) * 100}%` 
                  }}
                />
              </div>
              <p className="text-[10px] text-gray-500 text-center italic">Drag to trim start and end points</p>
            </div>
          </div>

          {/* Controls Side */}
          <div className="w-full lg:w-80 space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <Crop className="w-4 h-4" />
                Spatial Crop
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'original', label: '9:16', icon: '📱' },
                  { id: '1:1', label: '1:1', icon: '⏹' },
                  { id: '16:9', label: '16:9', icon: '📺' }
                ].map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => setAspectRatio(preset.id as any)}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${
                      aspectRatio === preset.id 
                        ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500' 
                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                    }`}
                  >
                    <span className="text-xl mb-1">{preset.icon}</span>
                    <span className="text-[10px] font-bold">{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <Download className="w-4 h-4" />
                Export
              </h3>
              {!editedBlob ? (
                <button
                  onClick={handleProcess}
                  disabled={!loaded || processing}
                  className="w-full bg-yellow-500 text-black py-4 rounded-xl font-bold hover:bg-yellow-400 transition-all flex items-center justify-center gap-3 disabled:opacity-50 shadow-lg shadow-yellow-500/20"
                >
                  {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                  Generate MP4
                </button>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={download}
                    className="w-full bg-green-500 text-black py-4 rounded-xl font-bold hover:bg-green-400 transition-all flex items-center justify-center gap-3 shadow-lg shadow-green-500/20"
                  >
                    <Download className="w-5 h-5" />
                    Download Edited Video
                  </button>
                  <button
                    onClick={() => setEditedBlob(null)}
                    className="w-full bg-white/5 text-gray-400 py-2 rounded-lg text-sm hover:bg-white/10 transition-all"
                  >
                    Edit Again
                  </button>
                </div>
              )}
            </div>

            <div className="glass p-4 rounded-xl border border-white/5 space-y-2">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span>FFmpeg.wasm Version 0.12</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span>Multi-threaded (WebWorker)</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span>H.264 / AAC Encoding</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
