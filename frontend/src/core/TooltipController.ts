import type { TooltipPlacement } from './TooltipPlacementEngine';

export interface TooltipLayerHandle {
  setTransform(x: number, y: number): void;
  setOpacity(opacity: number): void;
  setVisibility(visible: boolean): void;
}

export class TooltipController {
  private static instance: TooltipController;
  
  private handle: TooltipLayerHandle | null = null;
  
  private currentX: number = 0;
  private currentY: number = 0;
  private currentOpacity: number = 0;
  private targetOpacity: number = 0;
  
  // Placement State for Hysteresis
  public previousPlacement: TooltipPlacement | undefined = undefined;

  // Caching tooltips size
  private tooltipWidth = 180;
  private tooltipHeight = 130;
  private readonly tooltipMargin = 12; // SAFE_MARGIN

  private constructor() {}

  public static getInstance(): TooltipController {
    if (!TooltipController.instance) {
      TooltipController.instance = new TooltipController();
    }
    return TooltipController.instance;
  }

  public registerHandle(handle: TooltipLayerHandle) {
    this.handle = handle;
  }

  public unregisterHandle() {
    this.handle = null;
  }
  
  public setSize(width: number, height: number) {
    this.tooltipWidth = width;
    this.tooltipHeight = height;
  }
  
  public getBounds() {
    return {
      width: this.tooltipWidth,
      height: this.tooltipHeight,
      margin: this.tooltipMargin
    };
  }
  
  public show() {
    this.targetOpacity = 1;
    if (this.handle) {
      this.handle.setVisibility(true);
    }
  }
  
  public hide() {
    this.targetOpacity = 0;
    this.previousPlacement = undefined;
  }

  /**
   * Called by HoverEngine RAF loop every frame.
   */
  public tick(deltaTime: number, targetPlacement: TooltipPlacement | null) {
    if (!this.handle) return;

    if (targetPlacement) {
      this.previousPlacement = targetPlacement;
      
      // Calculate delta-time scaled lerp alpha
      // alpha = 1 - exp(-speed * deltaTime)
      // speed = 0.015 gives nice snappy animation matching ~0.3 at 16ms
      const speed = 0.015;
      const alpha = 1 - Math.exp(-speed * deltaTime);

      this.currentX += (targetPlacement.x - this.currentX) * alpha;
      this.currentY += (targetPlacement.y - this.currentY) * alpha;
    }

    // Opacity lerp (faster than movement)
    const opacityAlpha = 1 - Math.exp(-0.02 * deltaTime);
    this.currentOpacity += (this.targetOpacity - this.currentOpacity) * opacityAlpha;
    
    // Snap opacity if close to zero to hide completely
    if (this.currentOpacity < 0.01) {
      this.currentOpacity = 0;
      this.handle.setVisibility(false);
    }

    // Update DOM (Check diff to prevent useless style recalc)
    const roundX = Math.round(this.currentX);
    const roundY = Math.round(this.currentY);
    
    // We only update if changed by >= 0.5px. We keep track of the last applied values locally to avoid reading from DOM.
    if (Math.abs(roundX - this.lastAppliedX) >= 0.5 || Math.abs(roundY - this.lastAppliedY) >= 0.5) {
      this.handle.setTransform(roundX, roundY);
      this.lastAppliedX = roundX;
      this.lastAppliedY = roundY;
    }
    
    // Update Opacity
    const roundOpacity = Math.round(this.currentOpacity * 100) / 100;
    if (Math.abs(roundOpacity - this.lastAppliedOpacity) >= 0.02) {
      this.handle.setOpacity(roundOpacity);
      this.lastAppliedOpacity = roundOpacity;
    }
    
    // Fast path to jump to position on first show
    if (targetPlacement && this.lastAppliedOpacity <= 0 && this.targetOpacity > 0) {
      this.currentX = targetPlacement.x;
      this.currentY = targetPlacement.y;
      this.handle.setTransform(targetPlacement.x, targetPlacement.y);
      this.lastAppliedX = targetPlacement.x;
      this.lastAppliedY = targetPlacement.y;
    }
  }

  private lastAppliedX = 0;
  private lastAppliedY = 0;
  private lastAppliedOpacity = -1;
}

export const tooltipController = TooltipController.getInstance();
