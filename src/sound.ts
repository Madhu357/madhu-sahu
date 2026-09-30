/**
 * Retro 8-bit sound generator using Web Audio API
 * No external sound files or dependencies required
 */

class SoundController {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private thrusterNode: AudioBufferSourceNode | null = null;
  private thrusterGain: GainNode | null = null;
  private thrusterFilter: BiquadFilterNode | null = null;
  private isThrusting: boolean = false;
  private lastAlarmTime: number = 0;

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted && this.thrusterGain && this.ctx) {
      this.thrusterGain.gain.setValueAtTime(0, this.ctx.currentTime);
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  private createNoiseBuffer(): AudioBuffer | null {
    if (!this.ctx) return null;
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  public startThruster() {
    if (this.isThrusting) return;
    this.initContext();
    if (!this.ctx || this.isMuted) return;

    try {
      const buffer = this.createNoiseBuffer();
      if (!buffer) return;

      this.thrusterNode = this.ctx.createBufferSource();
      this.thrusterNode.buffer = buffer;
      this.thrusterNode.loop = true;

      // Filter to deep rumble
      this.thrusterFilter = this.ctx.createBiquadFilter();
      this.thrusterFilter.type = 'lowpass';
      this.thrusterFilter.frequency.setValueAtTime(260, this.ctx.currentTime);

      this.thrusterGain = this.ctx.createGain();
      this.thrusterGain.gain.setValueAtTime(0.01, this.ctx.currentTime);
      this.thrusterGain.gain.linearRampToValueAtTime(0.25, this.ctx.currentTime + 0.08);

      this.thrusterNode.connect(this.thrusterFilter);
      this.thrusterFilter.connect(this.thrusterGain);
      this.thrusterGain.connect(this.ctx.destination);

      this.thrusterNode.start();
      this.isThrusting = true;
    } catch {
      // Audio error handling
    }
  }

  public stopThruster() {
    if (!this.isThrusting) return;
    this.isThrusting = false;

    if (this.thrusterGain && this.ctx) {
      try {
        this.thrusterGain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
        setTimeout(() => {
          if (!this.isThrusting && this.thrusterNode) {
            try {
              this.thrusterNode.stop();
              this.thrusterNode.disconnect();
              this.thrusterNode = null;
            } catch {
              // Ignore cleanup errors
            }
          }
        }, 90);
      } catch {
        // Audio error handling
      }
    }
  }

  public playRcs() {
    this.initContext();
    if (!this.ctx || this.isMuted) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.05);

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.05);
    } catch {
      // Ignore audio error
    }
  }

  public playLowFuelAlarm() {
    this.initContext();
    if (!this.ctx || this.isMuted) return;

    const now = Date.now();
    if (now - this.lastAlarmTime < 400) return;
    this.lastAlarmTime = now;

    try {
      const audioTime = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(880, audioTime);

      gain.gain.setValueAtTime(0.08, audioTime);
      gain.gain.setValueAtTime(0, audioTime + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(audioTime);
      osc.stop(audioTime + 0.09);
    } catch {
      // Ignore
    }
  }

  public playTouchdown() {
    this.stopThruster();
    this.initContext();
    if (!this.ctx || this.isMuted) return;

    try {
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      const now = this.ctx.currentTime;

      notes.forEach((freq, index) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + index * 0.1);

        gain.gain.setValueAtTime(0, now + index * 0.1);
        gain.gain.linearRampToValueAtTime(0.18, now + index * 0.1 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.1 + 0.25);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(now + index * 0.1);
        osc.stop(now + index * 0.1 + 0.28);
      });
    } catch {
      // Ignore
    }
  }

  public playCrash() {
    this.stopThruster();
    this.initContext();
    if (!this.ctx || this.isMuted) return;

    try {
      const now = this.ctx.currentTime;
      const buffer = this.createNoiseBuffer();
      if (!buffer) return;

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, now);
      filter.frequency.exponentialRampToValueAtTime(60, now + 1.2);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

      // Low rumble sub-oscillator
      const subOsc = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      subOsc.type = 'sawtooth';
      subOsc.frequency.setValueAtTime(110, now);
      subOsc.frequency.exponentialRampToValueAtTime(25, now + 1.2);
      subGain.gain.setValueAtTime(0.3, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

      subOsc.connect(subGain);
      subGain.connect(this.ctx.destination);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      noise.start(now);
      noise.stop(now + 1.3);

      subOsc.start(now);
      subOsc.stop(now + 1.3);
    } catch {
      // Ignore
    }
  }
}

export const sound = new SoundController();
