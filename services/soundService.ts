
class SoundManager {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  private initCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  isMuted() {
    return this.muted;
  }

  private createGain(duration: number, startVolume: number = 0.1) {
    if (!this.ctx) return null;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(startVolume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
    gain.connect(this.ctx.destination);
    return gain;
  }

  playFire() {
    if (this.muted) return;
    this.initCtx();
    const osc = this.ctx!.createOscillator();
    const gain = this.createGain(0.4, 0.08);
    if (!gain) return;
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(450, this.ctx!.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, this.ctx!.currentTime + 0.4);
    osc.connect(gain);
    osc.start();
    osc.stop(this.ctx!.currentTime + 0.4);
  }

  playVoid() {
    if (this.muted) return;
    this.initCtx();
    const osc = this.ctx!.createOscillator();
    const gain = this.createGain(0.3, 0.06);
    if (!gain) return;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, this.ctx!.currentTime);
    osc.frequency.linearRampToValueAtTime(1400, this.ctx!.currentTime + 0.15);
    osc.frequency.linearRampToValueAtTime(500, this.ctx!.currentTime + 0.3);
    osc.connect(gain);
    osc.start();
    osc.stop(this.ctx!.currentTime + 0.3);
  }

  playEarth() {
    if (this.muted) return;
    this.initCtx();
    const osc = this.ctx!.createOscillator();
    const gain = this.createGain(0.6, 0.15);
    if (!gain) return;
    osc.type = 'square';
    osc.frequency.setValueAtTime(120, this.ctx!.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, this.ctx!.currentTime + 0.6);
    osc.connect(gain);
    osc.start();
    osc.stop(this.ctx!.currentTime + 0.6);
  }

  playThunder() {
    if (this.muted) return;
    this.initCtx();
    const osc = this.ctx!.createOscillator();
    const gain = this.createGain(0.25, 0.12);
    if (!gain) return;
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1200, this.ctx!.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx!.currentTime + 0.25);
    osc.connect(gain);
    osc.start();
    osc.stop(this.ctx!.currentTime + 0.25);
  }

  playCrystal() {
    if (this.muted) return;
    this.initCtx();
    const osc = this.ctx!.createOscillator();
    const gain = this.createGain(0.5, 0.08);
    if (!gain) return;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1800, this.ctx!.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, this.ctx!.currentTime + 0.5);
    osc.connect(gain);
    osc.start();
    osc.stop(this.ctx!.currentTime + 0.5);
  }

  playProjectile() {
    if (this.muted) return;
    this.initCtx();
    const osc = this.ctx!.createOscillator();
    const gain = this.createGain(0.2, 0.05);
    if (!gain) return;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, this.ctx!.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx!.currentTime + 0.2);
    osc.connect(gain);
    osc.start();
    osc.stop(this.ctx!.currentTime + 0.2);
  }

  playDash() {
    if (this.muted) return;
    this.initCtx();
    const osc = this.ctx!.createOscillator();
    const gain = this.createGain(0.15, 0.07);
    if (!gain) return;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, this.ctx!.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1500, this.ctx!.currentTime + 0.15);
    osc.connect(gain);
    osc.start();
    osc.stop(this.ctx!.currentTime + 0.15);
  }

  playImpact() {
    if (this.muted) return;
    this.initCtx();
    const osc = this.ctx!.createOscillator();
    const gain = this.createGain(0.1, 0.08);
    if (!gain) return;
    osc.type = 'square';
    osc.frequency.setValueAtTime(150, this.ctx!.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx!.currentTime + 0.1);
    osc.connect(gain);
    osc.start();
    osc.stop(this.ctx!.currentTime + 0.1);
  }

  playStatusApply() {
    if (this.muted) return;
    this.initCtx();
    const osc = this.ctx!.createOscillator();
    const gain = this.createGain(0.3, 0.05);
    if (!gain) return;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, this.ctx!.currentTime);
    osc.frequency.linearRampToValueAtTime(1200, this.ctx!.currentTime + 0.3);
    osc.connect(gain);
    osc.start();
    osc.stop(this.ctx!.currentTime + 0.3);
  }

  playExplosion(isUlt: boolean = false) {
    if (this.muted) return;
    this.initCtx();
    const duration = isUlt ? 0.9 : 0.45;
    const osc = this.ctx!.createOscillator();
    const gain = this.createGain(duration, isUlt ? 0.35 : 0.18);
    if (!gain) return;
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, this.ctx!.currentTime);
    osc.frequency.exponentialRampToValueAtTime(35, this.ctx!.currentTime + duration);
    osc.connect(gain);
    osc.start();
    osc.stop(this.ctx!.currentTime + duration);
  }

  playUI() {
    if (this.muted) return;
    this.initCtx();
    const osc = this.ctx!.createOscillator();
    const gain = this.createGain(0.1, 0.05);
    if (!gain) return;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1100, this.ctx!.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1600, this.ctx!.currentTime + 0.1);
    osc.connect(gain);
    osc.start();
    osc.stop(this.ctx!.currentTime + 0.1);
  }

  playVictory() {
    if (this.muted) return;
    this.initCtx();
    const melody = [523.25, 659.25, 783.99, 1046.50];
    melody.forEach((freq, i) => {
      setTimeout(() => {
        const osc = this.ctx!.createOscillator();
        const gain = this.createGain(0.6, 0.08);
        if (!gain) return;
        osc.frequency.setValueAtTime(freq, this.ctx!.currentTime);
        osc.connect(gain);
        osc.start();
        osc.stop(this.ctx!.currentTime + 0.6);
      }, i * 180);
    });
  }
}

export const soundService = new SoundManager();
