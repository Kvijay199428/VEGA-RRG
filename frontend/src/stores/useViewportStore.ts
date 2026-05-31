import { create } from 'zustand';
import type { DataBounds } from '../core/math';

type ViewportState = {
  // Target Fit Camera
  targetFitZoom: number;
  targetFitOffsetX: number;
  targetFitOffsetY: number;

  // Target Interaction Camera
  targetInteractionZoom: number;
  targetInteractionOffsetX: number;
  targetInteractionOffsetY: number;

  contentBounds: DataBounds | null;

  viewportWidth: number;
  viewportHeight: number;
  plotWidth: number;
  plotHeight: number;

  isDragging: boolean;
  dragStartX: number;
  dragStartY: number;

  setDimensions: (vWidth: number, vHeight: number, pWidth: number, pHeight: number) => void;
  setContentBounds: (bounds: DataBounds) => void;
  
  // Interaction Controls
  zoomBy: (deltaY: number, mouseX: number, mouseY: number) => void;
  panBy: (dx: number, dy: number) => void;
  startDrag: (x: number, y: number) => void;
  updateDrag: (x: number, y: number) => void;
  endDrag: () => void;
  resetToFit: () => void;

  // Utilities
  screenToWorld: (screenX: number, screenY: number, renderFitZoom: number, renderFitOffsetX: number, renderFitOffsetY: number, renderInteractionZoom: number, renderInteractionOffsetX: number, renderInteractionOffsetY: number) => { x: number, y: number };
};

export const useViewportStore = create<ViewportState>((set, get) => ({
  targetFitZoom: 1,
  targetFitOffsetX: 0,
  targetFitOffsetY: 0,

  targetInteractionZoom: 1,
  targetInteractionOffsetX: 0,
  targetInteractionOffsetY: 0,

  contentBounds: null,

  viewportWidth: 800,
  viewportHeight: 600,
  plotWidth: 800,
  plotHeight: 600,

  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,

  setDimensions: (vWidth, vHeight, pWidth, pHeight) => {
    set({ viewportWidth: vWidth, viewportHeight: vHeight, plotWidth: pWidth, plotHeight: pHeight });
  },

  setContentBounds: (bounds) => {
    const state = get();
    // Deadzone check: only recompute if bounds changed significantly (e.g. 5%)
    const prev = state.contentBounds;
    if (prev) {
      const deltaW = Math.abs(bounds.domainWidth - prev.domainWidth) / prev.domainWidth;
      const deltaH = Math.abs(bounds.domainHeight - prev.domainHeight) / prev.domainHeight;
      if (deltaW < 0.05 && deltaH < 0.05) {
        return; // Dead zone
      }
    }

    const { plotWidth, plotHeight } = state;
    
    if (
      plotWidth <= 0 ||
      plotHeight <= 0 ||
      !Number.isFinite(plotWidth) ||
      !Number.isFinite(plotHeight)
    ) {
      return;
    }

    set({
      contentBounds: bounds,
      targetFitZoom: 1,
      targetFitOffsetX: 0,
      targetFitOffsetY: 0
    });
  },

  zoomBy: (deltaY, mouseX, mouseY) => {
    const state = get();
    // Exponential zoom interaction
    const sensitivity = 0.0015;
    const factor = Math.exp(-deltaY * sensitivity);
    
    let newInteractionZoom = state.targetInteractionZoom * factor;
    // Zoom-To-Fit constraint
    newInteractionZoom = Math.max(1, newInteractionZoom);

    const { targetFitZoom, targetFitOffsetX, targetFitOffsetY, targetInteractionZoom, targetInteractionOffsetX, targetInteractionOffsetY } = state;

    const fitX = (mouseX - targetFitOffsetX) / targetFitZoom;
    const fitY = (mouseY - targetFitOffsetY) / targetFitZoom;

    const worldX = (fitX - targetInteractionOffsetX) / targetInteractionZoom;
    const worldY = (fitY - targetInteractionOffsetY) / targetInteractionZoom;

    let newInteractionOffsetX = fitX - worldX * newInteractionZoom;
    let newInteractionOffsetY = fitY - worldY * newInteractionZoom;

    if (newInteractionZoom === 1) {
      newInteractionOffsetX = 0;
      newInteractionOffsetY = 0;
    }

    set({ 
      targetInteractionZoom: newInteractionZoom,
      targetInteractionOffsetX: newInteractionOffsetX,
      targetInteractionOffsetY: newInteractionOffsetY
    });
  },

  panBy: (dx, dy) => {
    const state = get();
    // dx and dy are in screen space. We need to pan the interaction offset.
    // screenX = (worldX * intZoom + intOffset) * fitZoom + fitOffset
    // A shift of dx in screenX corresponds to dx / fitZoom shift in intOffset
    let newOffsetX = state.targetInteractionOffsetX + (dx / state.targetFitZoom);
    let newOffsetY = state.targetInteractionOffsetY + (dy / state.targetFitZoom);

    set({ targetInteractionOffsetX: newOffsetX, targetInteractionOffsetY: newOffsetY });
  },

  startDrag: (x, y) => {
    set({ isDragging: true, dragStartX: x, dragStartY: y });
  },

  updateDrag: (x, y) => {
    const state = get();
    if (!state.isDragging) return;

    const dx = x - state.dragStartX;
    const dy = y - state.dragStartY;

    let newOffsetX = state.targetInteractionOffsetX + (dx / state.targetFitZoom);
    let newOffsetY = state.targetInteractionOffsetY + (dy / state.targetFitZoom);

    set({ 
      targetInteractionOffsetX: newOffsetX, 
      targetInteractionOffsetY: newOffsetY, 
      dragStartX: x, 
      dragStartY: y 
    });
  },

  endDrag: () => {
    set({ isDragging: false });
  },

  resetToFit: () => {
    set({ targetInteractionZoom: 1, targetInteractionOffsetX: 0, targetInteractionOffsetY: 0 });
  },

  screenToWorld: (screenX, screenY, fitZoom, fitOffsetX, fitOffsetY, intZoom, intOffsetX, intOffsetY) => {
    // screenX = (worldX * intZoom + intOffsetX) * fitZoom + fitOffsetX
    const fitX = (screenX - fitOffsetX) / fitZoom;
    const worldX = (fitX - intOffsetX) / intZoom;

    const fitY = (screenY - fitOffsetY) / fitZoom;
    const worldY = (fitY - intOffsetY) / intZoom;

    return { x: worldX, y: worldY };
  }
}));
