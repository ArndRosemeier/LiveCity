// All audio is synthesized locally. Nothing is downloaded or recorded.
export class CityAudio {
  context: AudioContext | null = null;
  master: GainNode | null = null;
  enabled = false;
  private ambient: AudioBufferSourceNode | null = null;
  private lastStep = 0;
  async toggle() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.context.destination);
      const buffer = this.context.createBuffer(
        1,
        this.context.sampleRate * 4,
        this.context.sampleRate,
      );
      const samples = buffer.getChannelData(0);
      let prev = 0;
      for (let i = 0; i < samples.length; i++) {
        prev = (prev + (Math.random() * 2 - 1) * 0.035) / 1.035;
        samples[i] = prev * 2;
      }
      const noise = this.context.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const filter = this.context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 430;
      const gain = this.context.createGain();
      gain.gain.value = 0.13;
      noise.connect(filter).connect(gain).connect(this.master);
      noise.start();
      this.ambient = noise;
    }
    await this.context.resume();
    this.enabled = !this.enabled;
    this.master!.gain.setTargetAtTime(
      this.enabled ? 0.45 : 0,
      this.context.currentTime,
      0.25,
    );
    return this.enabled;
  }
  impact(power: number) {
    if (!this.enabled || !this.context || !this.master) return;
    const ctx = this.context,
      buffer = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate),
      data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] =
        (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.18));
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = power > 1 ? 650 : 1500;
    const gain = ctx.createGain();
    gain.gain.value = power > 1 ? 0.8 : 0.25;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    const osc = ctx.createOscillator(),
      bass = ctx.createGain();
    osc.frequency.setValueAtTime(power > 1 ? 65 : 110, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(25, ctx.currentTime + 0.35);
    bass.gain.setValueAtTime(0.6, ctx.currentTime);
    bass.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(bass).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  }
  step(time: number) {
    if (
      time - this.lastStep < 0.38 ||
      !this.enabled ||
      !this.context ||
      !this.master
    )
      return;
    this.lastStep = time;
    const osc = this.context.createOscillator(),
      gain = this.context.createGain();
    osc.type = "triangle";
    osc.frequency.value = 95;
    gain.gain.setValueAtTime(0.025, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      this.context.currentTime + 0.07,
    );
    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(this.context.currentTime + 0.08);
  }
}
