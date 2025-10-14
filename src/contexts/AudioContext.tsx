import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import { audioService } from '../services/audioService';
import { SoundKey } from '../audio/audioAssets';

interface AudioContextType {
  playSound: (key: SoundKey) => void;
  playMusic: (key: SoundKey) => void;
  stopMusic: () => void;
  playLowTimeWarning: () => void;
  stopLowTimeWarning: () => void;
  toggleMute: () => void;
  isMuted: boolean;
  playPrompt: (keys: SoundKey[]) => void;
  playPromptAndWait: (keys: SoundKey[]) => Promise<void>; // New async function
  cancelPrompt: () => void;
  isPromptPlaying: boolean; // New state to track if a prompt is active
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const useAudio = (): AudioContextType => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
};

const AUDIO_MUTED_KEY = 'toanHocThongMinh_isMuted';

export const AudioProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    try {
      const savedState = localStorage.getItem(AUDIO_MUTED_KEY);
      return savedState ? JSON.parse(savedState) : false;
    } catch {
      return false;
    }
  });
  
  const [isPromptPlaying, setIsPromptPlaying] = useState(false);

  useEffect(() => {
    audioService.setMutedState(isMuted);
  }, [isMuted]);

  useEffect(() => {
    // Set up callbacks for the audio service to update our React state
    audioService.setCallbacks({
      onPromptStart: () => setIsPromptPlaying(true),
      onPromptEnd: () => setIsPromptPlaying(false),
    });
    
    return () => {
      // Clean up callbacks when the provider unmounts
      audioService.setCallbacks({});
    }
  }, []);

  // Effect to handle browser tab visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        audioService.wakeupAudio();
      } else {
        audioService.cancelPrompt();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);


  const playSound = useCallback((key: SoundKey) => {
    audioService.playSound(key);
  }, []);

  const playMusic = useCallback((key: SoundKey) => {
    audioService.playMusic(key);
  }, []);
  
  const stopMusic = useCallback(() => {
    audioService.stopMusic();
  }, []);

  const playLowTimeWarning = useCallback(() => {
    audioService.playLowTimeWarning();
  }, []);

  const stopLowTimeWarning = useCallback(() => {
    audioService.stopLowTimeWarning();
  }, []);

  const toggleMute = useCallback(() => {
    const newMutedState = audioService.toggleMute();
    setIsMuted(newMutedState);
    try {
      localStorage.setItem(AUDIO_MUTED_KEY, JSON.stringify(newMutedState));
    } catch (e) {
      console.error("Failed to save mute state to localStorage", e);
    }
  }, []);

  const playPrompt = useCallback((keys: SoundKey[]) => {
    audioService.playPrompt(keys);
  }, []);
  
  const playPromptAndWait = useCallback(async (keys: SoundKey[]): Promise<void> => {
    await audioService.playPromptAndWait(keys);
  }, []);

  const cancelPrompt = useCallback(() => {
    audioService.cancelPrompt();
  }, []);

  const value = { playSound, playMusic, stopMusic, playLowTimeWarning, stopLowTimeWarning, toggleMute, isMuted, playPrompt, playPromptAndWait, cancelPrompt, isPromptPlaying };

  return (
    <AudioContext.Provider value={value}>
      {children}
    </AudioContext.Provider>
  );
};