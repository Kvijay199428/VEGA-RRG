export type TooltipSide = 'RIGHT' | 'LEFT' | 'TOP' | 'BOTTOM';

export interface TooltipBounds {
  width: number;
  height: number;
  margin: number;
}

export interface ViewportBounds {
  width: number;
  height: number;
}

export interface TooltipPointer {
  x: number;
  y: number;
  direction: TooltipSide;
}

export interface TooltipPlacement {
  side: TooltipSide;
  x: number;
  y: number;
  pointer: TooltipPointer;
}

export class TooltipPlacementEngine {
  private static readonly HYSTERESIS_THRESHOLD = 30;

  public static calculatePlacement(
    pointX: number,
    pointY: number,
    tooltip: TooltipBounds,
    viewport: ViewportBounds,
    previousPlacement?: TooltipPlacement
  ): TooltipPlacement {
    // 1. Calculate available space in each direction
    const availableSpace = {
      RIGHT: viewport.width - pointX,
      LEFT: pointX,
      BOTTOM: viewport.height - pointY,
      TOP: pointY
    };

    // 2. Determine best side (Largest space + Hysteresis)
    let bestSide: TooltipSide = 'RIGHT';
    let maxSpace = availableSpace.RIGHT;

    const sides: TooltipSide[] = ['LEFT', 'BOTTOM', 'TOP'];
    for (const side of sides) {
      let space = availableSpace[side];
      
      if (previousPlacement && previousPlacement.side === side) {
        space += this.HYSTERESIS_THRESHOLD;
      }
      
      if (space > maxSpace) {
        maxSpace = space;
        bestSide = side;
      }
    }
    
    if (previousPlacement && previousPlacement.side === 'RIGHT') {
       if (availableSpace.RIGHT + this.HYSTERESIS_THRESHOLD > maxSpace) {
          bestSide = 'RIGHT';
       }
    }

    // 3. Calculate ideal coordinates based on chosen side
    let idealX = 0;
    let idealY = 0;
    
    const offset = tooltip.margin;

    switch (bestSide) {
      case 'RIGHT':
        idealX = pointX + offset;
        idealY = pointY - (tooltip.height / 2);
        break;
      case 'LEFT':
        idealX = pointX - tooltip.width - offset;
        idealY = pointY - (tooltip.height / 2);
        break;
      case 'TOP':
        idealX = pointX - (tooltip.width / 2);
        idealY = pointY - tooltip.height - offset;
        break;
      case 'BOTTOM':
        idealX = pointX - (tooltip.width / 2);
        idealY = pointY + offset;
        break;
    }

    // 4. Viewport clamping (ensuring it doesn't clip off screen)
    const viewportPad = 4;
    const clampedX = Math.max(viewportPad, Math.min(idealX, viewport.width - tooltip.width - viewportPad));
    const clampedY = Math.max(viewportPad, Math.min(idealY, viewport.height - tooltip.height - viewportPad));

    // 5. Calculate Pointer Geometry (Arrow)
    let pointerX = 0;
    let pointerY = 0;

    switch (bestSide) {
      case 'RIGHT':
      case 'LEFT':
        pointerX = bestSide === 'RIGHT' ? 0 : tooltip.width;
        pointerY = Math.max(8, Math.min(pointY - clampedY, tooltip.height - 8));
        break;
      case 'TOP':
      case 'BOTTOM':
        pointerY = bestSide === 'BOTTOM' ? 0 : tooltip.height;
        pointerX = Math.max(8, Math.min(pointX - clampedX, tooltip.width - 8));
        break;
    }

    // 6. Round everything to nearest pixel to guarantee crisp font rendering
    return {
      side: bestSide,
      x: Math.round(clampedX),
      y: Math.round(clampedY),
      pointer: {
        x: Math.round(pointerX),
        y: Math.round(pointerY),
        direction: bestSide
      }
    };
  }
}
