import React, { useRef, useState, useEffect } from 'react';
import { AppState } from '@/lib/types';
import { Music, Upload, Play, Pause, Square, Trash2, ArrowRight, ArrowLeft } from 'lucide-react';

interface Props {
  state: AppState;
  updateState: (updates: Partial<AppState>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step2Audio({ state, updateState, onNext, onBack }: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const drawWaveform = async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const channelData = audioBuffer.getChannelData(0);
      
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      
      ctx.clearRect(0, 0, width, height);
      
      const step = Math.ceil(channelData.length / width);
      const amp = height / 2;
      
      ctx.fillStyle = '#a855f7'; // purple-500
      
      for (let i = 0; i < width; i++) {
        let min = 1.0;
        let max = -1.0;
        for (let j = 0; j < step; j++) {
          const datum = channelData[i * step + j];
          if (datum < min) min = datum;
          if (datum > max) max = datum;
        }
        
        const y = (1 + min) * amp;
        const h = Math.max(1, (max - min) * amp);
        
        ctx.fillRect(i, y, 1, h);
      }
    } catch (e) {
      console.error("Error generating waveform:", e);
    }
  };

  useEffect(() => {
    if (state.audioFile) {
      drawWaveform(state.audioFile);
      if (audioRef.current) {
        audioRef.current.src = URL.createObjectURL(state.audioFile);
      }
    }
  }, [state.audioFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && (file.type === 'audio/mpeg' || file.type === 'audio/wav')) {
      updateState({ audioFile: file });
    } else {
      alert('Please select a valid .mp3 or .wav file.');
    }
  };

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      setProgress(0);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const current = audioRef.current.currentTime;
      const total = audioRef.current.duration;
      if (total > 0) {
        setProgress((current / total) * 100);
      }
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (audioRef.current && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, x / rect.width));
      audioRef.current.currentTime = percentage * audioRef.current.duration;
      setProgress(percentage * 100);
    }
  };

  const removeAudio = () => {
    updateState({ audioFile: null });
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setIsPlaying(false);
    setProgress(0);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="glass p-4 md:p-8 rounded-2xl space-y-6 md:space-y-8 text-center">
        <div className="mx-auto w-12 h-12 md:w-16 md:h-16 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center shadow-lg shadow-purple-500/30">
          <Music className="w-6 h-6 md:w-8 md:h-8 text-white" />
        </div>
        
        <div>
          <h2 className="text-2xl md:text-3xl font-bold mb-2 font-orbitron">Audio Integration</h2>
          <p className="text-gray-400 text-sm md:text-base max-w-md mx-auto">
            Upload an epic background track to accompany your scrolling text. Supported formats: MP3, WAV.
          </p>
        </div>

        {!state.audioFile ? (
          <div className="relative border-2 border-dashed border-white/20 rounded-xl p-8 md:p-12 hover:border-purple-500/50 transition-colors group cursor-pointer">
            <input
              type="file"
              accept=".mp3, .wav"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div className="flex flex-col items-center gap-4 text-gray-400 group-hover:text-purple-400 transition-colors">
              <Upload className="w-8 h-8 md:w-10 md:h-10" />
              <span className="font-medium text-sm md:text-base">Click or drag audio file here</span>
            </div>
          </div>
        ) : (
          <div className="bg-black/40 border border-white/10 rounded-xl p-4 md:p-6 flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4 w-full sm:w-auto">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-purple-500/20 rounded-lg flex items-center justify-center shrink-0">
                  <Music className="w-5 h-5 md:w-6 h-6 text-purple-400" />
                </div>
                <div className="text-left min-w-0 flex-1">
                  <p className="font-medium text-white truncate max-w-[200px] sm:max-w-xs">
                    {state.audioFile.name}
                  </p>
                  <p className="text-xs md:text-sm text-gray-400">
                    {(state.audioFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 md:gap-3">
                <button
                  onClick={togglePlay}
                  className="p-2.5 md:p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause className="w-4 h-4 md:w-5 md:h-5" /> : <Play className="w-4 h-4 md:w-5 md:h-5" />}
                </button>
                <button
                  onClick={stopAudio}
                  className="p-2.5 md:p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                  title="Stop"
                >
                  <Square className="w-4 h-4 md:w-5 md:h-5" />
                </button>
                <button
                  onClick={removeAudio}
                  className="p-2.5 md:p-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-full transition-colors"
                  title="Remove Audio"
                >
                  <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
                </button>
              </div>
            </div>
            
            <div 
              className="w-full h-24 bg-black/50 rounded-lg border border-white/5 overflow-hidden relative cursor-pointer group"
              onClick={handleSeek}
            >
              <canvas 
                ref={canvasRef} 
                width={800} 
                height={96} 
                className="w-full h-full object-fill opacity-80"
              />
              <div 
                className="absolute top-0 bottom-0 left-0 bg-purple-500/20 border-r border-purple-500 pointer-events-none transition-all duration-75"
                style={{ width: `${progress}%` }}
              />
              <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            </div>
          </div>
        )}

        <audio 
          ref={audioRef} 
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => {
            setIsPlaying(false);
            setProgress(0);
          }} 
        />
      </div>

      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="px-6 py-3 rounded-full font-semibold text-gray-300 hover:text-white hover:bg-white/5 transition-all flex items-center gap-2"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>
        <button
          onClick={onNext}
          className="bg-white text-black px-8 py-3 rounded-full font-semibold hover:bg-gray-200 transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
        >
          Preview & Export
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
