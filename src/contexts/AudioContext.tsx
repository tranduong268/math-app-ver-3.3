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
  playPromptAndWait: (keys: SoundKey[]) => Promise<void>;
  cancelPrompt: () => void;
  isPromptPlaying: boolean;
  isAudioUnlocked: boolean; // Is the audio context active?
  unlockAudio: () => Promise<void>; // Function to activate audio
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
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);

  useEffect(() => {
    audioService.setMutedState(isMuted);
  }, [isMuted]);

  useEffect(() => {
    audioService.setCallbacks({
      onPromptStart: () => setIsPromptPlaying(true),
      onPromptEnd: () => setIsPromptPlaying(false),
    });
    
    return () => {
      audioService.setCallbacks({});
    }
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        audioService.wakeupAudio();
      } else {
        audioService.stopLowTimeWarning();
        audioService.cancelPrompt();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
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

  const unlockAudio = useCallback(async () => {
    const success = await audioService.unlockAudio();
    // Always set unlocked to true to allow the app to start,
    // even if the audio context failed to initialize.
    // The app can then run silently.
    setIsAudioUnlocked(true);
    if (!success) {
        console.warn("Audio failed to unlock. The app will run silently.");
        // If not already muted, mute the app to prevent further errors.
        if (!isMuted) {
            toggleMute();
        }
    }
  }, [isMuted, toggleMute]);

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

  const playPrompt = useCallback((keys: SoundKey[]) => {
    audioService.playPrompt(keys);
  }, []);
  
  const playPromptAndWait = useCallback(async (keys: SoundKey[]): Promise<void> => {
    await audioService.playPromptAndWait(keys);
  }, []);

  const cancelPrompt = useCallback(() => {
    audioService.cancelPrompt();
  }, []);

  const value = { 
    playSound, 
    playMusic, 
    stopMusic, 
    playLowTimeWarning, 
    stopLowTimeWarning, 
    toggleMute, 
    isMuted, 
    playPrompt, 
    playPromptAndWait, 
    cancelPrompt, 
    isPromptPlaying,
    isAudioUnlocked,
    unlockAudio
  };

  return (
    <AudioContext.Provider value={value}>
      {children}
    </AudioContext.Provider>
  );
};