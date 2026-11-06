/** Uncapped callback timing, kept separate from intentionally capped simulation ticks. */
export interface FramePerformance {
  rawDelta: number;
  sampleElapsed: number;
  samples: number;
  tickDelta: number;
  targetFps: number;
  /** CPU time submitting the current draw, never GPU completion time. */
  renderCpuMs: number | null;
  gpuMs: null;
}

export class FrameSamples {
  private last: number | undefined;
  private elapsed = 0;
  private samples = 0;
  sample(now: number, visible: boolean) {
    const seconds = this.last === undefined ? 0 : (now - this.last) / 1000;
    this.last = now;
    if (!visible || !Number.isFinite(seconds) || seconds <= 0 || seconds > .25) {
      this.elapsed = 0; this.samples = 0;
      return;
    }
    this.elapsed += seconds; this.samples++;
  }
  take(tickDelta: number, targetFps: number): FramePerformance {
    const sample = { rawDelta: this.samples ? this.elapsed / this.samples : 0, sampleElapsed: this.elapsed, samples: this.samples, tickDelta, targetFps, renderCpuMs: null, gpuMs: null };
    this.elapsed = 0; this.samples = 0;
    return sample;
  }
}
