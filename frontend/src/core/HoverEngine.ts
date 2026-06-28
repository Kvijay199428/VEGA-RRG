import { quadtree } from 'd3';
import type { EnrichedRrgPoint } from '../types';
import type { RrgScales } from './scales';
import { useRrgStore } from '../stores/useRrgStore';
import { cleanSectorName } from './math';
import { TooltipPlacementEngine } from './TooltipPlacementEngine';
import { tooltipController } from './TooltipController';

export interface TooltipModel {
  symbol: string;
  name: string;
  ratio: string;
  momentum: string;
  quadrant: string;
  velocity: string;
  heading: string;
  distance: string;
  stale: boolean;
  computedAt: number | undefined;
}

export class HoverEngine {
  private static instance: HoverEngine;
  private qt: any = null;
  private data: EnrichedRrgPoint[] = [];
  private scales: RrgScales | null = null;
  private tooltipCache = new Map<string, TooltipModel>();

  // Imperative DOM refs
  public viewportWidth: number = 800;
  public viewportHeight: number = 600;
  public crosshairXRef: SVGLineElement | null = null;
  public crosshairYRef: SVGLineElement | null = null;
  public crosshairXLabelRef: SVGGElement | null = null;
  public crosshairYLabelRef: SVGGElement | null = null;
  public crosshairXTextRef: SVGTextElement | null = null;
  public crosshairYTextRef: SVGTextElement | null = null;

  private currentHovered: string | null = null;
  private isHovering: boolean = false;
  private lastTime: number = 0;
  
  private mouseScreenX: number = -1000;
  private mouseScreenY: number = -1000;
  
  // Camera state for transforming coords
  private renderState: any = null;
  
  private rafId: number = 0;

  private constructor() {
    this.loop = this.loop.bind(this);
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  public static getInstance(): HoverEngine {
    if (!HoverEngine.instance) {
      HoverEngine.instance = new HoverEngine();
    }
    return HoverEngine.instance;
  }

  public updateData(data: EnrichedRrgPoint[], scales: RrgScales, renderState: any) {
    this.data = data;
    this.scales = scales;
    this.renderState = renderState;

    // 1. Rebuild Quadtree using world coordinates
    this.qt = quadtree<EnrichedRrgPoint>()
      .x(d => scales.xScale(d.x))
      .y(d => scales.yScale(d.y))
      .addAll(data);

    // 2. Precompute Tooltip Cache
    this.tooltipCache.clear();
    for (const d of data) {
      this.tooltipCache.set(d.symbol, {
        symbol: d.symbol,
        name: cleanSectorName(d.symbol),
        ratio: d.x.toFixed(2),
        momentum: d.y.toFixed(2),
        quadrant: d.quadrant,
        velocity: d.velocity?.toFixed(2) || 'N/A',
        heading: d.heading || 'N/A',
        distance: d.distance?.toFixed(2) || 'N/A',
        stale: !!d.stale,
        computedAt: d.computedAt
      });
    }
  }

  public updateCamera(renderState: any, viewportWidth?: number, viewportHeight?: number) {
    this.renderState = renderState;
    if (viewportWidth !== undefined) this.viewportWidth = viewportWidth;
    if (viewportHeight !== undefined) this.viewportHeight = viewportHeight;
  }

  public onMouseMove(screenX: number, screenY: number) {
    this.mouseScreenX = screenX;
    this.mouseScreenY = screenY;
    this.isHovering = true;
    
    // Crosshair movement runs at 60fps immediately via DOM attributes
    if (this.crosshairXRef) {
      this.crosshairXRef.setAttribute('x1', String(screenX));
      this.crosshairXRef.setAttribute('x2', String(screenX));
    }
    if (this.crosshairYRef) {
      this.crosshairYRef.setAttribute('y1', String(screenY));
      this.crosshairYRef.setAttribute('y2', String(screenY));
    }
    
    if (this.crosshairXLabelRef) {
      const yPos = this.scales ? this.scales.yScale.range()[0] : 0;
      this.crosshairXLabelRef.setAttribute('transform', `translate(${screenX}, ${yPos})`);
    }
    if (this.crosshairYLabelRef) {
      this.crosshairYLabelRef.setAttribute('transform', `translate(0, ${screenY})`);
    }
    
    if (this.scales && this.renderState) {
        const world = this.screenToWorld(screenX, screenY);
        const rawX = this.scales.xScale.invert(world.x);
        const rawY = this.scales.yScale.invert(world.y);
        if (this.crosshairXTextRef) this.crosshairXTextRef.textContent = rawX.toFixed(2);
        if (this.crosshairYTextRef) this.crosshairYTextRef.textContent = rawY.toFixed(2);
    }
  }
  
  public onMouseLeave() {
    this.isHovering = false;
    this.setHovered(null);
    
    // Hide crosshairs via style
    if (this.crosshairXRef) this.crosshairXRef.style.visibility = 'hidden';
    if (this.crosshairYRef) this.crosshairYRef.style.visibility = 'hidden';
    if (this.crosshairXLabelRef) this.crosshairXLabelRef.style.visibility = 'hidden';
    if (this.crosshairYLabelRef) this.crosshairYLabelRef.style.visibility = 'hidden';
  }

  public onMouseEnter() {
    if (this.crosshairXRef) this.crosshairXRef.style.visibility = 'visible';
    if (this.crosshairYRef) this.crosshairYRef.style.visibility = 'visible';
    if (this.crosshairXLabelRef) this.crosshairXLabelRef.style.visibility = 'visible';
    if (this.crosshairYLabelRef) this.crosshairYLabelRef.style.visibility = 'visible';
  }

  private setHovered(symbol: string | null) {
    if (this.currentHovered !== symbol) {
      this.currentHovered = symbol;
      
      // Publish change to React (low-frequency)
      useRrgStore.getState().setHoveredSector(symbol);
      
      if (!symbol) {
        tooltipController.hide();
      } else {
        tooltipController.show();
      }
    }
  }
  
  private worldToScreen(worldX: number, worldY: number) {
    if (!this.renderState) return { x: worldX, y: worldY };
    const { fitZoom, fitOffsetX, fitOffsetY, intZoom, intOffsetX, intOffsetY } = this.renderState;
    const intX = worldX * intZoom + intOffsetX;
    const intY = worldY * intZoom + intOffsetY;
    return {
      x: intX * fitZoom + fitOffsetX,
      y: intY * fitZoom + fitOffsetY
    };
  }

  private screenToWorld(screenX: number, screenY: number) {
    if (!this.renderState) return { x: screenX, y: screenY };
    const { fitZoom, fitOffsetX, fitOffsetY, intZoom, intOffsetX, intOffsetY } = this.renderState;
    const fitX = (screenX - fitOffsetX) / fitZoom;
    const fitY = (screenY - fitOffsetY) / fitZoom;
    return {
      x: (fitX - intOffsetX) / intZoom,
      y: (fitY - intOffsetY) / intZoom
    };
  }

  private loop(time: number) {
    const deltaTime = time - this.lastTime;
    this.lastTime = time;

    let targetPlacement = null;

    if (this.isHovering && this.qt && this.scales && this.renderState) {
      // 1. Transform mouse to world coordinates to query quadtree
      const worldMouse = this.screenToWorld(this.mouseScreenX, this.mouseScreenY);
      
      // We want a search radius in world coordinates equivalent to ~50 screen pixels.
      // 50px / (fitZoom * intZoom)
      const totalZoom = this.renderState.fitZoom * this.renderState.intZoom;
      const searchRadiusWorld = 50 / totalZoom;
      
      const nearest = this.qt.find(worldMouse.x, worldMouse.y, searchRadiusWorld);
      
      if (nearest) {
        const nxWorld = this.scales.xScale(nearest.x);
        const nyWorld = this.scales.yScale(nearest.y);
        
        // Calculate screen distance
        const screenNearest = this.worldToScreen(nxWorld, nyWorld);
        const dist = Math.hypot(screenNearest.x - this.mouseScreenX, screenNearest.y - this.mouseScreenY);
        
        // Hysteresis / Cursor Dead Zone
        let currentDist = Infinity;
        if (this.currentHovered) {
          const currentPoint = this.data.find(d => d.symbol === this.currentHovered);
          if (currentPoint) {
            const cxWorld = this.scales.xScale(currentPoint.x);
            const cyWorld = this.scales.yScale(currentPoint.y);
            const screenCurrent = this.worldToScreen(cxWorld, cyWorld);
            currentDist = Math.hypot(screenCurrent.x - this.mouseScreenX, screenCurrent.y - this.mouseScreenY);
          }
        }
        
        // Switch if strictly closer by 8px, or no current hovered
        if (dist < 50 && (dist < currentDist - 8 || !this.currentHovered)) {
          this.setHovered(nearest.symbol);
        } else if (currentDist > 50) {
          this.setHovered(null);
        }

        // Calculate placement if we have a hovered sector
        if (this.currentHovered) {
          const currentPoint = this.data.find(d => d.symbol === this.currentHovered);
          if (currentPoint) {
            const cxWorld = this.scales.xScale(currentPoint.x);
            const cyWorld = this.scales.yScale(currentPoint.y);
            const screenCurrent = this.worldToScreen(cxWorld, cyWorld);
            
            targetPlacement = TooltipPlacementEngine.calculatePlacement(
              screenCurrent.x,
              screenCurrent.y,
              tooltipController.getBounds(),
              { width: this.viewportWidth, height: this.viewportHeight },
              tooltipController.previousPlacement
            );
          }
        }
      } else {
        this.setHovered(null);
      }
    }

    // 2. Delegate animation and DOM updates to the controller
    tooltipController.tick(deltaTime, targetPlacement);

    this.rafId = requestAnimationFrame(this.loop);
  }
  
  public getTooltipData(symbol: string): TooltipModel | undefined {
    return this.tooltipCache.get(symbol);
  }
  
  public dispose() {
    cancelAnimationFrame(this.rafId);
  }
}

export const hoverEngine = HoverEngine.getInstance();
