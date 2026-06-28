import { useEffect, useRef, useCallback } from 'react';
import { useCommandBarStore } from '../stores/useCommandBarStore';
import { useRrgStore } from '../stores/useRrgStore';
import { useLiveStore } from '../stores/useLiveStore';
import type { PatchMessage } from '../stores/useLiveStore';

const WS_URL = 'ws://localhost:8080/ws/rrg/live';
const PING_INTERVAL_MS = 15_000;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000]; // Exponential backoff

/**
 * WebSocket client hook for live RRG streaming.
 *
 * Connects when liveStreamingEnabled = true.
 * Handles SUBSCRIBE, VISIBILITY_UPDATE, SNAPSHOT, PATCH, FALLBACK.
 * Auto-reconnect with exponential backoff.
 * Frame coalescing via requestAnimationFrame flush.
 */
export function useWebSocket() {
  const liveStreamingEnabled = useCommandBarStore(s => (s as any).liveStreamingEnabled);
  const timeframe = useCommandBarStore(s => s.timeframe);

  const watchlist = useRrgStore(s => s.watchlist);
  const enabledSectors = watchlist.filter(w => w.enabled).map(w => w.symbol);

  const { onSnapshot, onPatch, onFallback, flushPendingPatches, setConnectionStatus, clearLiveData } = useLiveStore.getState();

  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  // Frame coalescing: flush pending patches on every animation frame
  const startFrameCoalescing = useCallback(() => {
    const loop = () => {
      flushPendingPatches();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [flushPendingPatches]);

  const stopFrameCoalescing = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // Send message to server
  const send = useCallback((msg: object) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // Send SUBSCRIBE message
  const sendSubscribe = useCallback(() => {
    send({
      type: 'SUBSCRIBE',
      timeframes: [timeframe],
      benchmark: 'NSE_INDEX_Nifty 50',
      visibleSectors: enabledSectors,
    });
  }, [send, timeframe, enabledSectors]);

  // Connect WebSocket
  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    setConnectionStatus('RECONNECTING');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[LiveWS] Connected');
      reconnectAttemptRef.current = 0;
      setConnectionStatus('CONNECTED');
      sendSubscribe();
      startFrameCoalescing();

      // Start ping interval
      pingIntervalRef.current = setInterval(() => {
        send({ type: 'PING' });
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case 'SNAPSHOT':
            onSnapshot(msg.timeframe, msg.points || []);
            break;

          case 'PATCH':
            onPatch(msg as PatchMessage);
            break;

          case 'HEARTBEAT':
            // Health metrics — could display in UI
            break;

          case 'PONG':
            // Keepalive acknowledged
            break;

          case 'FALLBACK':
            console.warn('[LiveWS] Circuit breaker: ', msg.reason);
            onFallback(msg.reason);
            // Disable live streaming — user must re-enable
            break;

          case 'ERROR':
            console.error('[LiveWS] Server error:', msg.message);
            break;

          default:
            console.warn('[LiveWS] Unknown message type:', msg.type);
        }
      } catch (e) {
        console.error('[LiveWS] Failed to parse message:', e);
      }
    };

    ws.onclose = (event) => {
      console.log('[LiveWS] Disconnected:', event.code, event.reason);
      cleanup();

      if (liveStreamingEnabled && event.code !== 1000) {
        // Auto-reconnect with exponential backoff
        const delay = RECONNECT_DELAYS[
          Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS.length - 1)
        ];
        reconnectAttemptRef.current++;
        setConnectionStatus('RECONNECTING');

        console.log(`[LiveWS] Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current})`);
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      } else {
        setConnectionStatus('DISCONNECTED');
      }
    };

    ws.onerror = (error) => {
      console.error('[LiveWS] Error:', error);
    };
  }, [liveStreamingEnabled, sendSubscribe, startFrameCoalescing, send, onSnapshot, onPatch, onFallback, setConnectionStatus]);

  // Cleanup helper
  const cleanup = useCallback(() => {
    stopFrameCoalescing();

    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, [stopFrameCoalescing]);

  // Disconnect helper
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'User disabled live mode');
      wsRef.current = null;
    }

    cleanup();
    clearLiveData();
    setConnectionStatus('DISCONNECTED');
  }, [cleanup, clearLiveData, setConnectionStatus]);

  // Connect/disconnect when live mode toggles
  useEffect(() => {
    if (liveStreamingEnabled) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [liveStreamingEnabled]);

  // Re-subscribe when timeframe or sectors change
  useEffect(() => {
    if (liveStreamingEnabled && wsRef.current?.readyState === WebSocket.OPEN) {
      sendSubscribe();
    }
  }, [timeframe, enabledSectors.join(',')]);

  // Send visibility update when sectors change (correction #9)
  useEffect(() => {
    if (liveStreamingEnabled && wsRef.current?.readyState === WebSocket.OPEN) {
      send({
        type: 'VISIBILITY_UPDATE',
        visibleSectors: enabledSectors,
      });
    }
  }, [enabledSectors.join(',')]);
}
