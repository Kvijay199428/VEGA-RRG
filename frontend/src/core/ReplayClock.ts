/**
 * ReplayClock — controls timing only.
 *
 * Manages frame intervals, speed, pause/resume of the tick timer.
 * Does NOT know about cursors, indexes, or data.
 * Fires tick callbacks at the configured speed.
 *
 * Separated from PlaybackController to enable future variable frame rates,
 * slow motion, and reverse playback without touching transport logic.
 */

export type ReplaySpeed = 1 | 2 | 5 | 10;

export class ReplayClock {
  private _speed: ReplaySpeed = 1;
  private _running = false;
  private _intervalId: number | null = null;
  private _onTick: (() => void) | null = null;

  /**
   * Base interval in ms at 1x speed. Each tick advances one frame.
   * At 2x speed → interval/2, at 5x → interval/5, etc.
   */
  private readonly baseIntervalMs = 500;

  get speed(): ReplaySpeed {
    return this._speed;
  }

  get running(): boolean {
    return this._running;
  }

  get intervalMs(): number {
    return Math.max(50, this.baseIntervalMs / this._speed);
  }

  /**
   * Start the clock. Fires onTick at the configured speed interval.
   * If already running, restarts with current settings.
   */
  start(onTick: () => void): void {
    this.stop();
    this._onTick = onTick;
    this._running = true;
    this._intervalId = window.setInterval(() => {
      if (this._onTick) this._onTick();
    }, this.intervalMs);
  }

  /**
   * Stop the clock. Does not reset speed.
   */
  stop(): void {
    if (this._intervalId !== null) {
      window.clearInterval(this._intervalId);
      this._intervalId = null;
    }
    this._running = false;
    this._onTick = null;
  }

  /**
   * Change playback speed. If currently running, restarts with new interval.
   */
  setSpeed(speed: ReplaySpeed): void {
    this._speed = speed;
    if (this._running && this._onTick) {
      // Restart with new interval
      const callback = this._onTick;
      this.stop();
      this.start(callback);
    }
  }

  /**
   * Destroy the clock. Call on component unmount.
   */
  destroy(): void {
    this.stop();
  }
}
