/**
 * PlaybackController — transport control operating entirely on indexes.
 *
 * Manages play/stop/seek/jump/step operations.
 * cursorIndex is the canonical state — timestamps are only for display.
 *
 * All input paths converge through this controller:
 *   - Autoplay tick → stepForward(1)
 *   - Manual drag → seekToTimestamp() → resolves to index once
 *   - Keyboard ←/→ → stepForward/stepBackward
 *   - Jump buttons → jumpToStart/jumpToEnd
 *
 * There is no separate "manual mode."
 */

import type { ReplayDataset } from './ReplayDataset';
import { nearestIndex } from './ReplayDataset';

export type PlaybackState = 'STOPPED' | 'PLAYING' | 'PAUSED' | 'FINISHED';

export interface PlaybackControllerState {
  cursorIndex: number;
  state: PlaybackState;
  frameCount: number;
  minPlayableIndex: number;
}

export class PlaybackController {
  private _cursorIndex = 0;
  private _state: PlaybackState = 'STOPPED';
  private _frameCount = 0;
  private _minPlayableIndex = 0;

  /** Callback fired whenever cursorIndex or state changes. */
  private _onChange: ((state: PlaybackControllerState) => void) | null = null;

  get cursorIndex(): number {
    return this._cursorIndex;
  }

  get state(): PlaybackState {
    return this._state;
  }

  get frameCount(): number {
    return this._frameCount;
  }

  get minPlayableIndex(): number {
    return this._minPlayableIndex;
  }

  /**
   * Register a change listener. Called whenever cursorIndex or state changes.
   */
  onChange(callback: (state: PlaybackControllerState) => void): void {
    this._onChange = callback;
  }

  /**
   * Initialize the controller for a new dataset.
   * Resets cursor to the first playable index.
   */
  initialize(frameCount: number, trailLength: number): void {
    this._frameCount = frameCount;
    this._minPlayableIndex = Math.min(frameCount - 1, Math.max(0, trailLength - 1));
    this._cursorIndex = this._minPlayableIndex;
    this._state = 'STOPPED';
    this.notify();
  }

  /**
   * Update the minimum playable index when trail length changes.
   * Does NOT trigger a dataset reload — just adjusts playback bounds.
   */
  updateTrailLength(trailLength: number): void {
    this._minPlayableIndex = Math.min(
      this._frameCount - 1,
      Math.max(0, trailLength - 1),
    );
    // Clamp cursor if it's now below the minimum
    if (this._cursorIndex < this._minPlayableIndex) {
      this._cursorIndex = this._minPlayableIndex;
      this.notify();
    }
  }

  // ─── Transport Operations ──────────────────────────────────────────

  play(): void {
    if (this._frameCount === 0) return;
    // If finished, restart from beginning
    if (this._state === 'FINISHED' || this._cursorIndex >= this._frameCount - 1) {
      this._cursorIndex = this._minPlayableIndex;
    }
    this._state = 'PLAYING';
    this.notify();
  }

  pause(): void {
    if (this._state === 'PLAYING') {
      this._state = 'PAUSED';
      this.notify();
    }
  }

  stop(): void {
    this._state = 'STOPPED';
    this._cursorIndex = this._minPlayableIndex;
    this.notify();
  }

  stepForward(n = 1): void {
    if (this._frameCount === 0) return;

    const nextIndex = Math.min(this._frameCount - 1, this._cursorIndex + n);
    const finished = nextIndex >= this._frameCount - 1;

    this._cursorIndex = nextIndex;
    if (finished) {
      this._state = 'FINISHED';
    }
    this.notify();
  }

  stepBackward(n = 1): void {
    if (this._frameCount === 0) return;

    this._cursorIndex = Math.max(this._minPlayableIndex, this._cursorIndex - n);
    // If we were playing, pause on manual step backward
    if (this._state === 'PLAYING') {
      this._state = 'PAUSED';
    }
    this.notify();
  }

  jumpToIndex(index: number): void {
    if (this._frameCount === 0) return;

    this._cursorIndex = Math.max(
      this._minPlayableIndex,
      Math.min(this._frameCount - 1, index),
    );
    
    if (this._state === 'FINISHED' && this._cursorIndex < this._frameCount - 1) {
      this._state = 'STOPPED';
    }
    
    this.notify();
  }

  jumpToStart(): void {
    this._cursorIndex = this._minPlayableIndex;
    this._state = 'STOPPED';
    this.notify();
  }

  jumpToEnd(): void {
    if (this._frameCount === 0) return;
    this._cursorIndex = this._frameCount - 1;
    this._state = 'FINISHED';
    this.notify();
  }

  /**
   * Seek to the nearest index for a given timestamp.
   * Used for manual cursor drag — resolves timestamp to index ONCE,
   * then stays in index space.
   */
  seekToTimestamp(dataset: ReplayDataset, timestamp: number): void {
    const idx = nearestIndex(dataset, timestamp);
    if (idx >= 0) {
      this.jumpToIndex(idx);
    }
  }

  /**
   * Get the timestamp at the current cursor position (for display only).
   */
  getTimestamp(dataset: ReplayDataset): number {
    if (dataset.frameCount === 0) return 0;
    return dataset.timestamps[this._cursorIndex] ?? 0;
  }

  /**
   * Get current state as an immutable snapshot.
   */
  getState(): PlaybackControllerState {
    return {
      cursorIndex: this._cursorIndex,
      state: this._state,
      frameCount: this._frameCount,
      minPlayableIndex: this._minPlayableIndex,
    };
  }

  // ─── Internal ──────────────────────────────────────────────────────

  private notify(): void {
    if (this._onChange) {
      this._onChange(this.getState());
    }
  }
}
