import { AudioAssets, SoundKey } from "../audio/audioAssets";

const POOL_SIZE = 10; // Number of audio players in the pool

class AudioService {
  private audioCache: Map<string, HTMLAudioElement> = new Map();
  private audioPool: HTMLAudioElement[] = [];
  private poolIndex: number = 0;
  private backgroundMusic: HTMLAudioElement | null = null;
  private lowTimeSound: HTMLAudioElement | null = null;
  private isMuted: boolean = false;
  private masterVolume: number = 1.0;
  private hasInteracted: boolean = false;
  private pendingMusicKey: SoundKey | null = null;

  // --- Properties for Web Audio API based prompt playback ---
  private promptAudioContext: AudioContext | null = null;
  private promptGainNode: GainNode | null = null;
  private promptBufferCache: Map<string, AudioBuffer> = new Map();
  private currentPromptSource: AudioBufferSourceNode | null = null;

  // --- Properties for HTML Audio fallback prompt playback ---
  private promptQueue: HTMLAudioElement[] = [];
  private currentPromptPlayer: HTMLAudioElement | null = null;
  
  public isPromptPlaying: boolean = false;
  private onPromptStartCallback: (() => void) | null = null;
  private onPromptEndCallback: (() => void) | null = null;


  constructor() {
    this.preload();
    this.createAudioPool();
  }

  preload() {
    Object.values(AudioAssets).forEach(asset => {
      if (Array.isArray(asset.path)) {
        asset.path.forEach(p => this.createAndCacheAudioElement(p, asset.loop, asset.volume));
      } else {
        this.createAndCacheAudioElement(asset.path, asset.loop, asset.volume);
      }
    });
  }

  private createAndCacheAudioElement(path: string, loop: boolean, volume?: number) {
      if (this.audioCache.has(path)) return;
      const audio = new Audio(path);
      audio.loop = loop;
      audio.volume = (volume ?? 1.0) * this.masterVolume;
      audio.preload = 'auto';
      this.audioCache.set(path, audio);
      audio.load();
  }

  private createAudioPool() {
    for (let i = 0; i < POOL_SIZE; i++) {
        const audio = new Audio();
        audio.preload = 'auto';
        this.audioPool.push(audio);
    }
  }

  private initPromptAudioContext() {
    if (this.promptAudioContext) return;
    try {
        // We can only create the context after a user gesture, which is handled by unlockAudio.
        this.promptAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.promptGainNode = this.promptAudioContext.createGain();
        this.promptGainNode.gain.value = 2.0; // Boost volume for prompts by 2x
        this.promptGainNode.connect(this.promptAudioContext.destination);
    } catch(e) {
        console.error("Web Audio API is not supported in this browser.", e);
    }
  }
  
  public async unlockAudio(): Promise<boolean> {
    if (this.hasInteracted) return true;
    
    this.initPromptAudioContext();

    try {
      // Resume Web Audio API context if it's suspended. This is crucial for iOS.
      if (this.promptAudioContext && this.promptAudioContext.state === 'suspended') {
        await this.promptAudioContext.resume();
      }
      
      // Play a silent sound using a Data URI, which is more reliable than a file path.
      const silentPlayer = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
      silentPlayer.volume = 0;
      await silentPlayer.play();

      this.hasInteracted = true;

      // If music was requested before interaction, play it now.
      if (this.pendingMusicKey) {
        const keyToPlay = this.pendingMusicKey;
        this.pendingMusicKey = null;
        this.playMusic(keyToPlay);
      }
      return true;

    } catch (error) {
        console.error("Failed to unlock audio context:", error);
        // Critical: mark as interacted to allow the app to proceed without sound,
        // preventing the user from being stuck on the start screen.
        this.hasInteracted = true; 
        this.pendingMusicKey = null; // Clear any pending music on failure.
        return false;
    }
  }

  public wakeupAudio = () => {
    // For Web Audio API context
    if (this.promptAudioContext && this.promptAudioContext.state === 'suspended') {
        this.promptAudioContext.resume().catch(e => console.error("Error resuming audio context on wakeup:", e));
    }
    // For HTML Audio elements, the silent audio trick in unlockAudio is usually enough.
    // This can be called when tab visibility changes.
  }

  public setCallbacks({ onPromptStart, onPromptEnd }: { onPromptStart?: () => void; onPromptEnd?: () => void }) {
    this.onPromptStartCallback = onPromptStart || null;
    this.onPromptEndCallback = onPromptEnd || null;
  }

  playSound(key: SoundKey) {
    if (this.isMuted || !this.hasInteracted) return;
    this.wakeupAudio(); 

    const asset = AudioAssets[key];
    if (!asset) {
      console.warn(`Sound key "${key}" not found.`);
      return;
    }
    
    const nonOverlappingSounds: SoundKey[] = ['BUTTON_CLICK', 'DECISION', 'SEQUENCE_ITEM_POP', 'SEQUENCE_ITEM_SLIDE'];
    if (nonOverlappingSounds.includes(key)) {
        let path: string = Array.isArray(asset.path) ? asset.path[0] : asset.path;
        const audio = this.audioCache.get(path);
        if(audio) {
            audio.currentTime = 0;
            audio.volume = (asset.volume ?? 1.0) * this.masterVolume;
            audio.play().catch(e => { if(e.name !== 'NotAllowedError') console.error(`Error playing simple sound ${path}:`, e)});
        }
        return;
    }
    
    let path: string;
    if (Array.isArray(asset.path)) {
      path = asset.path[Math.floor(Math.random() * asset.path.length)];
    } else {
      path = asset.path;
    }
    
    const originalAudioData = this.audioCache.get(path);
    if (!originalAudioData) {
       console.error(`Audio element for path ${path} not found in cache during playSound.`);
       return;
    }

    this.poolIndex = (this.poolIndex + 1) % POOL_SIZE;
    const player = this.audioPool[this.poolIndex];
    
    player.src = originalAudioData.src;
    player.volume = originalAudioData.volume;
    player.loop = originalAudioData.loop;
    player.currentTime = 0;
    
    player.play().catch(error => {
      if (error.name !== 'NotAllowedError' && error.name !== 'AbortError') {
           console.error(`Error playing pooled sound ${path}:`, error);
      }
    });
  }

  playLowTimeWarning = () => {
    if (this.isMuted || !this.hasInteracted) return;
    this.wakeupAudio();

    const asset = AudioAssets.TIMER_LOW;
    if (!asset || Array.isArray(asset.path)) return;

    const soundPath = asset.path;
    const soundElement = this.audioCache.get(soundPath);

    if (!soundElement) {
        console.error(`Low time warning sound for path ${soundPath} not found in cache.`);
        return;
    }

    this.lowTimeSound = soundElement;

    if (this.lowTimeSound && this.lowTimeSound.paused) {
        this.lowTimeSound.currentTime = 0;
        this.lowTimeSound.play().catch(e => console.error("Error playing low time warning", e));
    }
  }

  stopLowTimeWarning = () => {
    if (this.lowTimeSound && !this.lowTimeSound.paused) {
        this.lowTimeSound.pause();
        this.lowTimeSound.currentTime = 0;
    }
  }

  playMusic(key: SoundKey) {
    if (!this.hasInteracted) {
      this.pendingMusicKey = key;
      return;
    }
    this.wakeupAudio();

    const asset = AudioAssets[key];
    if (!asset || Array.isArray(asset.path)) {
        console.warn(`Music key "${key}" not found or is a sound effect array.`);
        return;
    }
    
    const musicPath = asset.path as string;
    const newMusicElement = this.audioCache.get(musicPath);

    if (!newMusicElement) {
        console.error(`Music element for path ${musicPath} not found in cache.`);
        return;
    }
    
    if (this.backgroundMusic === newMusicElement) {
        if (!this.isMuted && this.backgroundMusic.paused) {
             this.backgroundMusic.play().catch(error => console.error(`Error resuming music ${musicPath}:`, error));
        }
        return;
    }

    if (this.backgroundMusic) {
      this.backgroundMusic.pause();
      this.backgroundMusic.currentTime = 0;
    }
    
    this.backgroundMusic = newMusicElement;
    if (!this.isMuted) {
      this.backgroundMusic.currentTime = 0;
      this.backgroundMusic.play().catch(error => console.error(`Error playing music ${musicPath}:`, error));
    }
  }

  stopMusic() {
    if (this.backgroundMusic) {
      this.backgroundMusic.pause();
      this.backgroundMusic.currentTime = 0;
    }
    this.pendingMusicKey = null;
  }
  
  private onPromptEnd = () => {
    this.isPromptPlaying = false;
    this.currentPromptSource = null;
    this.currentPromptPlayer = null;
    if (this.onPromptEndCallback) {
      this.onPromptEndCallback();
    }
  }

  public playPrompt = async (keys: SoundKey[]) => {
    if (this.isMuted || !this.hasInteracted) return;
    this.wakeupAudio();

    // Use Web Audio API if available for volume boost
    if (this.promptAudioContext && this.promptGainNode) {
        this.cancelPrompt();

        this.isPromptPlaying = true;
        if (this.onPromptStartCallback) this.onPromptStartCallback();

        for (const key of keys) {
            if (!this.isPromptPlaying) break;

            const asset = AudioAssets[key];
            const path = Array.isArray(asset.path) ? asset.path[0] : asset.path;
            
            let audioBuffer = this.promptBufferCache.get(path);
            if (!audioBuffer) {
                try {
                    const response = await fetch(path);
                    const arrayBuffer = await response.arrayBuffer();
                    audioBuffer = await this.promptAudioContext.decodeAudioData(arrayBuffer);
                    this.promptBufferCache.set(path, audioBuffer);
                } catch(e) {
                    console.error(`Failed to load and decode prompt audio: ${path}`, e);
                    continue; 
                }
            }
            
            if (audioBuffer) {
                const source = this.promptAudioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(this.promptGainNode);
                this.currentPromptSource = source;
                
                await new Promise<void>(resolve => {
                    source.onended = () => resolve();
                    source.start(0);
                });
            }
        }
        
        if (this.isPromptPlaying) {
            this.onPromptEnd();
        }
    } else {
        // Fallback to old method if Web Audio API failed
        this.playPromptWithHtmlAudio(keys);
    }
  }

  /**
   * Plays a sequence of prompts and returns a Promise that resolves when playback is complete.
   * This is ideal for situations where an action must wait for an audio cue to finish.
   */
  public async playPromptAndWait(keys: SoundKey[]): Promise<void> {
    if (this.isMuted || !this.hasInteracted || this.isPromptPlaying) {
      return Promise.resolve();
    }
    this.wakeupAudio();
    
    // Set global playing state via callbacks
    this.isPromptPlaying = true;
    if (this.onPromptStartCallback) this.onPromptStartCallback();

    return new Promise(async (resolve) => {
        // Web Audio API path (preferred)
        if (this.promptAudioContext && this.promptGainNode) {
            for (const key of keys) {
                const asset = AudioAssets[key];
                const path = Array.isArray(asset.path) ? asset.path[0] : asset.path;
                let audioBuffer = this.promptBufferCache.get(path);
                 if (!audioBuffer) {
                    try {
                        const response = await fetch(path);
                        const arrayBuffer = await response.arrayBuffer();
                        audioBuffer = await this.promptAudioContext.decodeAudioData(arrayBuffer);
                        this.promptBufferCache.set(path, audioBuffer);
                    } catch(e) {
                        console.error(`Failed to load and decode prompt audio for waiting: ${path}`, e);
                        continue; 
                    }
                }
                
                if (audioBuffer) {
                    await new Promise<void>(soundResolve => {
                        const source = this.promptAudioContext!.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(this.promptGainNode!);
                        source.onended = () => soundResolve();
                        source.start(0);
                    });
                }
            }
        } 
        // HTML Audio fallback path
        else {
            const audioQueue = keys
              .map(key => {
                  const asset = AudioAssets[key];
                  const path = Array.isArray(asset.path) ? asset.path[0] : asset.path;
                  return this.audioCache.get(path);
              })
              .filter((audio): audio is HTMLAudioElement => !!audio);
              
            for (const audio of audioQueue) {
                if (audio) {
                    await new Promise<void>(soundResolve => {
                        const onEnd = () => {
                            audio.removeEventListener('ended', onEnd);
                            soundResolve();
                        };
                        audio.addEventListener('ended', onEnd);
                        audio.currentTime = 0;
                        audio.play().catch(() => soundResolve()); // Resolve on error too
                    });
                }
            }
        }
        
        // Unset global playing state
        this.onPromptEnd();
        resolve();
    });
  }

  private playPromptWithHtmlAudio(keys: SoundKey[]) {
      this.cancelPrompt(); 
      this.promptQueue = keys.map(key => {
        const asset = AudioAssets[key];
        const path = Array.isArray(asset.path) ? asset.path[0] : asset.path;
        return this.audioCache.get(path);
      }).filter((audio): audio is HTMLAudioElement => !!audio); 

      if (this.promptQueue.length > 0) {
        this.isPromptPlaying = true;
        if (this.onPromptStartCallback) this.onPromptStartCallback();
        this.playNextInQueueWithHtmlAudio();
      }
  }

  private playNextInQueueWithHtmlAudio = () => {
    if (this.promptQueue.length === 0) {
      this.onPromptEnd();
      return;
    }
    const player = this.promptQueue.shift();
    if (!player) {
      this.playNextInQueueWithHtmlAudio();
      return;
    }
    this.currentPromptPlayer = player;
    player.currentTime = 0;
    player.onended = this.playNextInQueueWithHtmlAudio;
    player.play().catch(error => {
      console.error("Error playing prompt sound in sequence:", error);
      this.cancelPrompt();
    });
  };

  public cancelPrompt() {
    if (!this.isPromptPlaying) return;

    // New Web Audio cancellation
    if (this.currentPromptSource) {
        this.currentPromptSource.onended = null;
        try { this.currentPromptSource.stop(); } catch(e) {}
    }

    // Old HTML Audio cancellation
    if (this.currentPromptPlayer) {
      this.currentPromptPlayer.pause();
      this.currentPromptPlayer.onended = null;
    }
    this.promptQueue = [];
    this.onPromptEnd();
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    
    if (this.isMuted) {
      if (this.backgroundMusic) this.backgroundMusic.pause();
      if (this.lowTimeSound) this.lowTimeSound.pause();
      this.cancelPrompt();
      this.audioPool.forEach(player => player.pause());
    } else if (this.backgroundMusic && this.backgroundMusic.paused) {
        this.backgroundMusic.play().catch(e => console.error("Error resuming music on unmute:", e));
    }
    return this.isMuted;
  }
  
  getIsMuted() {
    return this.isMuted;
  }

  setMutedState(muted: boolean) {
    this.isMuted = muted;
    if (this.isMuted) {
       if (this.backgroundMusic) this.backgroundMusic.pause();
       if (this.lowTimeSound) this.lowTimeSound.pause();
       this.cancelPrompt();
       this.audioPool.forEach(player => player.pause());
    }
  }
}

export const audioService = new AudioService();