import React, { useEffect, useRef, useState } from 'react';
import { AppState } from '@/lib/types';
import { Settings, Type, Palette, MonitorPlay, Wand2, Play, Pause, RotateCcw } from 'lucide-react';
import { ScrollingTextEngine } from '@/lib/canvas-engine';

import { TiptapEditor } from './TiptapEditor';

interface Props {
  state: AppState;
  updateState: (updates: Partial<AppState>) => void;
  onNext: () => void;
}

export function Step1Design({ state, updateState, onNext }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ScrollingTextEngine | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [estimatedDuration, setEstimatedDuration] = useState(0);

  // Initialize engine
  useEffect(() => {
    if (canvasRef.current && !engineRef.current) {
      engineRef.current = new ScrollingTextEngine(canvasRef.current, state);
      setEstimatedDuration(engineRef.current.getDuration());
      if (isPlaying) {
        engineRef.current.play();
      }
      engineRef.current.onProgress = (p) => {
        setProgress(p);
      };
      engineRef.current.onComplete = () => {
        engineRef.current?.reset();
        engineRef.current?.play();
      };
    }
    return () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  // Update engine when state changes
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.updateConfig(state).then(() => {
        if (engineRef.current) {
          setEstimatedDuration(engineRef.current.getDuration());
        }
      });
    }
  }, [state]);

  const togglePlay = () => {
    if (engineRef.current) {
      if (isPlaying) {
        engineRef.current.pause();
      } else {
        engineRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleSeek = (p: number) => {
    if (engineRef.current) {
      engineRef.current.pause();
      setIsPlaying(false);
      engineRef.current.setProgress(p);
      setProgress(p);
    }
  };

  const handleReset = () => {
    if (engineRef.current) {
      engineRef.current.reset();
      engineRef.current.play();
      setIsPlaying(true);
      setProgress(0);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
        {/* Left Side: Forms */}
        <div className="flex-1 space-y-4 md:space-y-6">
          <div className="glass p-4 md:p-6 rounded-2xl space-y-4 md:space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold flex items-center gap-2 font-orbitron text-yellow-500">
                <Type className="w-6 h-6" />
                Design Setup
              </h2>

            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Title</label>
                <input
                  type="text"
                  value={state.title}
                  onChange={(e) => updateState({ title: e.target.value })}
                  className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50 transition-all font-orbitron"
                  placeholder="Enter your title..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Story Text (Rich Content)</label>
                <div className="min-h-[250px] md:min-h-[auto]">
                  <TiptapEditor 
                    content={state.content} 
                    onChange={(content) => updateState({ content })}
                    placeholder="Write your cinematic story here... Use Bold, Italics, and add Images!"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass p-6 rounded-2xl space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2 text-blue-400">
                <Settings className="w-5 h-5" />
                Engine Settings
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Scroll Speed ({state.speed.toFixed(2)}x)
                  </label>
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    value={state.speed}
                    onChange={(e) => updateState({ speed: parseFloat(e.target.value) })}
                    className="w-full accent-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Resolution</label>
                  <select
                    value={state.resolution}
                    onChange={(e) => updateState({ resolution: e.target.value as '720p' | '1080p' })}
                    className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value="720p">720p (720x1280)</option>
                    <option value="1080p">1080p (1080x1920)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Title Size ({state.titleFontSize}px)
                    </label>
                    <input
                      type="range"
                      min="20"
                      max="200"
                      step="5"
                      value={state.titleFontSize}
                      onChange={(e) => updateState({ titleFontSize: parseInt(e.target.value) })}
                      className="w-full accent-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Content Size ({state.contentFontSize}px)
                    </label>
                    <input
                      type="range"
                      min="14"
                      max="100"
                      step="2"
                      value={state.contentFontSize}
                      onChange={(e) => updateState({ contentFontSize: parseInt(e.target.value) })}
                      className="w-full accent-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="glass p-6 rounded-2xl space-y-6">
              <h3 className="text-lg font-semibold flex items-center gap-2 text-pink-400">
                <Palette className="w-5 h-5" />
                Appearance
              </h3>
              
              <div className="space-y-6">
                {/* Font Section */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] border-b border-white/5 pb-2">Font Families</h4>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-gray-400 ml-1">Title Typography</label>
                      <select
                        value={state.fontTitle}
                        onChange={(e) => updateState({ fontTitle: e.target.value })}
                        className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:ring-2 focus:ring-pink-500/50 text-sm appearance-none cursor-pointer hover:bg-black/60 transition-all font-medium"
                      >
                        <optgroup label="Sinhala Unicode">
                          <option value="Abhaya">Abhaya (Regular)</option>
                          <option value="Abhaya Bold">Abhaya (Bold)</option>
                          <option value="Arjuna">Arjuna</option>
                          <option value="Baron">Baron</option>
                          <option value="Basuru">Basuru</option>
                          <option value="Siri">Siri</option>
                          <option value="Samantha">Samantha</option>
                          <option value="Malithi">Malithi</option>
                        </optgroup>
                        <optgroup label="English Modern">
                          <option value="Orbitron">Orbitron</option>
                          <option value="Inter">Inter</option>
                          <option value="Roboto">Roboto</option>
                          <option value="Poppins">Poppins</option>
                          <option value="Serif">Serif</option>
                        </optgroup>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-gray-400 ml-1">Content Typography</label>
                      <select
                        value={state.fontContent}
                        onChange={(e) => updateState({ fontContent: e.target.value })}
                        className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:ring-2 focus:ring-pink-500/50 text-sm appearance-none cursor-pointer hover:bg-black/60 transition-all font-medium"
                      >
                        <optgroup label="Sinhala Unicode">
                          <option value="Abhaya">Abhaya (Regular)</option>
                          <option value="Abhaya Bold">Abhaya (Bold)</option>
                          <option value="Arjuna">Arjuna</option>
                          <option value="Baron">Baron</option>
                          <option value="Basuru">Basuru</option>
                          <option value="Siri">Siri</option>
                          <option value="Samantha">Samantha</option>
                          <option value="Malithi">Malithi</option>
                        </optgroup>
                        <optgroup label="English Modern">
                          <option value="Inter">Inter</option>
                          <option value="Orbitron">Orbitron</option>
                          <option value="Roboto">Roboto</option>
                          <option value="Poppins">Poppins</option>
                          <option value="Serif">Serif</option>
                        </optgroup>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Color Section */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] border-b border-white/5 pb-2">Color Palette</h4>
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 hover:border-pink-500/30 transition-all">
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-gray-200">Title Color</span>
                        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">{state.titleColor}</span>
                      </div>
                      <input
                        type="color"
                        value={state.titleColor}
                        onChange={(e) => updateState({ titleColor: e.target.value })}
                        className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0 p-0 overflow-hidden shadow-2xl"
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 hover:border-pink-500/30 transition-all">
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-gray-200">Content Color</span>
                        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">{state.contentColor}</span>
                      </div>
                      <input
                        type="color"
                        value={state.contentColor}
                        onChange={(e) => updateState({ contentColor: e.target.value })}
                        className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0 p-0 overflow-hidden shadow-2xl"
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 hover:border-pink-500/30 transition-all">
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-gray-200">Background Color</span>
                        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">{state.bgColor}</span>
                      </div>
                      <input
                        type="color"
                        value={state.bgColor}
                        onChange={(e) => updateState({ bgColor: e.target.value })}
                        className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0 p-0 overflow-hidden shadow-2xl"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Live Preview (9:16 Aspect Ratio) */}
        <div className="w-full lg:w-80 xl:w-96 shrink-0 lg:order-last order-first">
          <div className="glass p-3 md:p-4 rounded-2xl sticky top-4 lg:top-8 space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-gray-400 uppercase tracking-widest">
              <Wand2 className="w-4 h-4" />
              Live Preview
            </h3>
            
            <div 
              className="w-full aspect-[9/16] max-h-[50vh] lg:max-h-none rounded-xl border border-white/20 overflow-hidden shadow-2xl relative bg-black shadow-yellow-500/5 group flex flex-col"
            >
              <div className="flex-1 relative flex items-center justify-center overflow-hidden">
                <canvas
                  ref={canvasRef}
                  className="w-full h-full object-contain"
                />
                
                {/* Overlay Controls */}
                <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 space-y-3">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={togglePlay}
                      className="p-2 bg-yellow-500 rounded-full text-black hover:bg-yellow-400 transition-colors"
                    >
                      {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button 
                      onClick={handleReset}
                      className="p-2 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    
                    <input 
                      type="range"
                      min="0"
                      max="1"
                      step="0.001"
                      value={progress}
                      onChange={(e) => handleSeek(parseFloat(e.target.value))}
                      className="flex-1 accent-yellow-500"
                    />
                  </div>
                </div>
              </div>
              
              <div className="bg-black/60 p-2 border-t border-white/5 pointer-events-none backdrop-blur-sm">
                <div className="flex items-center justify-between px-2">
                  <div className="text-[8px] font-bold text-white/40 uppercase tracking-[0.2em]">
                    Engine Render • {state.resolution}
                  </div>
                  <div className="text-[9px] font-bold text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full border border-yellow-500/20">
                    EST. {Math.floor(estimatedDuration / 60)}:{(estimatedDuration % 60).toFixed(0).padStart(2, '0')}
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={onNext}
              className="w-full bg-white text-black py-4 rounded-xl font-bold hover:bg-gray-200 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3 mt-4"
            >
              Proceed to Audio
              <MonitorPlay className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
