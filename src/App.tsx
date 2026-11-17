import React, { useState, useEffect } from 'react';
import { AppState, defaultState } from '@/lib/types';
import { Step1Design } from '@/components/Step1Design';
import { Step2Audio } from '@/components/Step2Audio';
import { Step3Preview } from '@/components/Step3Preview';
import { Film, Sparkles } from 'lucide-react';

export default function App() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [state, setState] = useState<AppState>(defaultState);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load state on mount
  useEffect(() => {
    const saved = localStorage.getItem('cinematic_scroll_state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Discard only the untouched starter saved by older versions; retain user stories.
        const legacyStory = {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'It is a period of civil war.' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Rebel spaceships, striking from a hidden base, have won their first victory against the evil Galactic Empire.' }] },
          ],
        };
        const isLegacyStarter = parsed.title === 'EPISODE IV\nA NEW HOPE'
          && !parsed.text && JSON.stringify(parsed.content) === JSON.stringify(legacyStory);
        setState({ ...defaultState, ...parsed, ...(isLegacyStarter ? {
          title: '', text: '', content: defaultState.content,
        } : {}), audioFile: null });
      } catch (e) {
        console.error('Failed to load state', e);
      }
    }
    setIsLoaded(true);
  }, []);

  // Save state on change
  useEffect(() => {
    if (isLoaded) {
      const { audioFile, ...serializableState } = state;
      localStorage.setItem('cinematic_scroll_state', JSON.stringify(serializableState));
    }
  }, [state, isLoaded]);

  const updateState = (updates: Partial<AppState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  if (!isLoaded) return null;

  return (
    <main className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        
        {/* Header */}
        <header className="mb-8 text-center space-y-4 animate-in fade-in slide-in-from-top-8 duration-700">
          <div className="inline-flex items-center justify-center p-3 bg-white/5 rounded-2xl border border-white/10 shadow-2xl shadow-yellow-500/10 mb-2">
            <Film className="w-8 h-8 text-yellow-500" />
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter font-orbitron bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 to-yellow-600">
            CINEMATIC SCROLL
          </h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto flex items-center justify-center gap-2">
            <Sparkles className="w-5 h-5 text-yellow-500/50" />
            Create epic scrolling text videos for social media
            <Sparkles className="w-5 h-5 text-yellow-500/50" />
          </p>
        </header>

        {/* Progress Bar */}
        <div className="mb-8 max-w-3xl mx-auto">
          <div className="flex items-center justify-between relative">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-white/10 rounded-full -z-10"></div>
            <div 
              className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-gradient-to-r from-yellow-500 to-yellow-400 rounded-full -z-10 transition-all duration-500 ease-out"
              style={{ width: `${((step - 1) / 2) * 100}%` }}
            ></div>
            
            {[1, 2, 3].map((i) => (
              <div 
                key={i}
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${
                  step >= i 
                    ? 'bg-yellow-500 text-black shadow-[0_0_15px_rgba(234,179,8,0.5)] scale-110' 
                    : 'bg-black border-2 border-white/20 text-gray-400'
                }`}
              >
                {i}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-4 text-xs font-medium text-gray-400 uppercase tracking-wider px-2">
            <span className={step >= 1 ? 'text-yellow-500' : ''}>Design</span>
            <span className={step >= 2 ? 'text-yellow-500' : ''}>Audio</span>
            <span className={step >= 3 ? 'text-yellow-500' : ''}>Export</span>
          </div>
        </div>

        {/* Content Area */}
        <div className="relative min-h-[600px]">
          {step === 1 && (
            <Step1Design 
              state={state} 
              updateState={updateState} 
              onNext={() => setStep(2)} 
            />
          )}
          {step === 2 && (
            <Step2Audio 
              state={state} 
              updateState={updateState} 
              onNext={() => setStep(3)} 
              onBack={() => setStep(1)} 
            />
          )}
          {step === 3 && (
            <Step3Preview 
              state={state} 
              onBack={() => setStep(2)} 
            />
          )}
        </div>
      </div>
    </main>
  );
}
