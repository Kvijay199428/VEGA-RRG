import type { TimelineTick } from './TimelineTick';

export class TimelineCollisionResolver {
  private static canvasContext: CanvasRenderingContext2D | null = null;

  static resolve(
    ticks: TimelineTick[], 
    containerWidth: number, 
    minSpacingPixels = 12
  ): TimelineTick[] {
    if (ticks.length === 0) return [];
    if (ticks.length === 1) {
      ticks[0].alignment = 'start';
      return ticks;
    }

    if (!this.canvasContext) {
      const canvas = document.createElement('canvas');
      this.canvasContext = canvas.getContext('2d');
      if (this.canvasContext) {
        this.canvasContext.font = '9px ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';
      }
    }

    const keptTicks: TimelineTick[] = [];
    let lastEndPixel = -Infinity;

    for (let i = 0; i < ticks.length; i++) {
      const tick = ticks[i];
      const textWidth = this.canvasContext ? this.canvasContext.measureText(tick.label).width : 30;
      
      let labelStart = tick.pixelX - (textWidth / 2);
      let labelEnd = tick.pixelX + (textWidth / 2);
      tick.alignment = 'center';

      if (labelStart < 0) {
        tick.alignment = 'start';
        labelStart = 0;
        labelEnd = textWidth;
      } else if (labelEnd > containerWidth) {
        tick.alignment = 'end';
        labelStart = containerWidth - textWidth;
        labelEnd = containerWidth;
      }

      if (labelStart >= lastEndPixel) {
        keptTicks.push(tick);
        lastEndPixel = labelEnd + minSpacingPixels;
      }
    }

    return keptTicks;
  }
}
