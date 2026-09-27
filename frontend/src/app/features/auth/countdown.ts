import { DestroyRef, computed, inject, signal } from '@angular/core';

/** "14:32" from seconds. */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A per-second countdown signal. Create it in an injection context (it stops itself on destroy). */
export class Countdown {
  private readonly remainingSignal = signal(0);
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly remaining = this.remainingSignal.asReadonly();
  readonly running = computed(() => this.remainingSignal() > 0);
  readonly label = computed(() => formatCountdown(this.remainingSignal()));

  constructor(private readonly onDone?: () => void) {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  start(seconds: number): void {
    this.stop();
    this.remainingSignal.set(Math.max(0, Math.ceil(seconds)));
    if (this.remainingSignal() === 0) {
      this.onDone?.();
      return;
    }
    this.timer = setInterval(() => {
      this.remainingSignal.update((s) => s - 1);
      if (this.remainingSignal() <= 0) {
        this.stop();
        this.onDone?.();
      }
    }, 1000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
