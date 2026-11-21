import { useCallback, useEffect, useRef, useState } from 'react';

interface ScreenProtectionState {
  isPrivacyShieldActive: boolean;
  shieldReason: string;
  dismissShield: () => void;
}

let authPopupInFlight = false;

export function setAuthPopupActive(active: boolean): void {
  authPopupInFlight = active;
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

/**
 * Global anti-screenshot, anti-screen-recording, and anti-print protection
 * active immediately after opening the app.
 */
const NEUTRAL_SHIELD_TEXT = 'নিরাপত্তার কারণে বিষয়বস্তু অস্থায়ীভাবে গোপন করা হয়েছে।';

export function useScreenProtection(
  enabled: boolean,
  onWarn?: (message: string) => void
): ScreenProtectionState {
  const [isPrivacyShieldActive, setIsPrivacyShieldActive] = useState(false);
  const [shieldReason, setShieldReason] = useState(NEUTRAL_SHIELD_TEXT);
  const lockUntilRef = useRef<number>(0);
  const autoClearTimerRef = useRef<number | null>(null);

  const triggerShield = useCallback(
    (reason: string, minLockMs = 0) => {
      if (autoClearTimerRef.current !== null) {
        window.clearTimeout(autoClearTimerRef.current);
        autoClearTimerRef.current = null;
      }
      if (minLockMs > 0) {
        lockUntilRef.current = Math.max(lockUntilRef.current, Date.now() + minLockMs);
      }
      setShieldReason(reason);
      setIsPrivacyShieldActive(true);
    },
    []
  );

  const dismissShield = useCallback(() => {
    if (Date.now() < lockUntilRef.current) return;
    setIsPrivacyShieldActive(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setIsPrivacyShieldActive(false);
      document.body.classList.remove('app-protected');
      return;
    }

    document.body.classList.add('app-protected');

    const handleVisibilityChange = () => {
      if (authPopupInFlight) return;
      if (document.hidden) {
        triggerShield(NEUTRAL_SHIELD_TEXT);
      } else {
        const remaining = lockUntilRef.current - Date.now();
        if (remaining <= 0) {
          autoClearTimerRef.current = window.setTimeout(() => {
            if (!document.hidden) {
              setIsPrivacyShieldActive(false);
            }
          }, 100);
        }
      }
    };

    const handlePageShow = () => {
      if (!document.hidden && Date.now() >= lockUntilRef.current) {
        setIsPrivacyShieldActive(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key?.toLowerCase() || '';
      const mod = e.ctrlKey || e.metaKey;
      const isPrintScreenKey =
        e.key === 'PrintScreen' || e.code === 'PrintScreen' || e.keyCode === 44;

      // PrintScreen key
      if (isPrintScreenKey) {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard?.writeText?.('').catch(() => {});
        triggerShield(NEUTRAL_SHIELD_TEXT, 2500);
        return;
      }

      // Windows Snipping Tool (Win+Shift+S) / Game Bar Recorder (Win+G / Win+Alt+R) / macOS Screenshot & Recorder (Cmd+Shift+3/4/5/6/S/R) / Firefox Screenshot (Ctrl+Shift+S)
      if (
        (e.metaKey && e.shiftKey && ['s', 'r', '3', '4', '5', '6', 'shift'].includes(key)) ||
        (e.metaKey && (key === 'g' || (e.altKey && key === 'r'))) ||
        (e.ctrlKey && e.shiftKey && key === 's')
      ) {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard?.writeText?.('').catch(() => {});
        triggerShield(NEUTRAL_SHIELD_TEXT, 2500);
        return;
      }

      // Block Print (Ctrl/Cmd+P), Save (Ctrl/Cmd+S), View Source (Ctrl/Cmd+U)
      if (mod && (key === 'p' || key === 's' || key === 'u')) {
        e.preventDefault();
        e.stopPropagation();
        if (key === 'p') {
          triggerShield('প্রিন্ট বা PDF সেভ করা বন্ধ রাখা হয়েছে।', 1800);
        }
        onWarn?.('নিরাপত্তার কারণে প্রিন্ট বা সেভ করা বন্ধ রাখা হয়েছে।');
        return;
      }

      // Block DevTools & Context Menu shortcuts
      if (
        e.key === 'F12' ||
        (e.shiftKey && e.key === 'F10') ||
        (mod && e.shiftKey && (key === 'i' || key === 'j' || key === 'c' || key === 'k'))
      ) {
        e.preventDefault();
        e.stopPropagation();
        onWarn?.('নিরাপত্তার কারণে এই অ্যাকশনটি বন্ধ রাখা হয়েছে।');
        return;
      }

      // Block Copy / Cut / Select All outside form inputs
      if (mod && (key === 'c' || key === 'x' || key === 'a') && !isEditableElement(e.target)) {
        e.preventDefault();
        e.stopPropagation();
        onWarn?.('নোটস কপি করা বন্ধ রাখা হয়েছে।');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen' || e.code === 'PrintScreen' || e.keyCode === 44) {
        navigator.clipboard?.writeText?.('').catch(() => {});
        triggerShield(NEUTRAL_SHIELD_TEXT, 2500);
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (!isEditableElement(e.target)) {
        e.preventDefault();
      }
    };

    const handleCopyOrCut = (e: ClipboardEvent) => {
      if (!isEditableElement(e.target)) {
        e.preventDefault();
        onWarn?.('নোটস কপি করা বন্ধ রাখা হয়েছে।');
      }
    };

    const handleDragStart = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleBeforePrint = () => {
      triggerShield('প্রিন্ট বা PDF এক্সপোর্ট বন্ধ রাখা হয়েছে।', 3000);
    };

    // Block in-browser screen recording APIs (getDisplayMedia & screen-capture getUserMedia constraints)
    let originalGetDisplayMedia:
      | ((constraints?: DisplayMediaStreamOptions) => Promise<MediaStream>)
      | undefined;
    let originalGetUserMedia:
      | ((constraints?: MediaStreamConstraints) => Promise<MediaStream>)
      | undefined;
    const mediaDevices = navigator.mediaDevices as
      | (MediaDevices & {
          getDisplayMedia?: (constraints?: DisplayMediaStreamOptions) => Promise<MediaStream>;
        })
      | undefined;

    if (mediaDevices && typeof mediaDevices.getDisplayMedia === 'function') {
      originalGetDisplayMedia = mediaDevices.getDisplayMedia.bind(mediaDevices);
      try {
        Object.defineProperty(mediaDevices, 'getDisplayMedia', {
          configurable: true,
          writable: true,
          value: async () => {
            triggerShield(NEUTRAL_SHIELD_TEXT, 3000);
            throw new DOMException('Display capture is disabled in this app.', 'NotAllowedError');
          },
        });
      } catch {
        // Ignore if browser marks mediaDevices.getDisplayMedia non-configurable
      }
    }

    if (mediaDevices && typeof mediaDevices.getUserMedia === 'function') {
      originalGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
      try {
        Object.defineProperty(mediaDevices, 'getUserMedia', {
          configurable: true,
          writable: true,
          value: async (constraints?: MediaStreamConstraints) => {
            const raw = JSON.stringify(constraints || {}).toLowerCase();
            if (
              raw.includes('desktop') ||
              raw.includes('screen') ||
              raw.includes('window') ||
              raw.includes('tab')
            ) {
              triggerShield(NEUTRAL_SHIELD_TEXT, 3000);
              throw new DOMException('Display capture is disabled in this app.', 'NotAllowedError');
            }
            return originalGetUserMedia!(constraints);
          },
        });
      } catch {
        // Ignore if browser marks mediaDevices.getUserMedia non-configurable
      }
    }

    const mediaDevicesProto = (
      typeof MediaDevices !== 'undefined' ? MediaDevices.prototype : undefined
    ) as
      | (MediaDevices & {
          getDisplayMedia?: (constraints?: DisplayMediaStreamOptions) => Promise<MediaStream>;
        })
      | undefined;
    let originalProtoGetDisplayMedia:
      | ((constraints?: DisplayMediaStreamOptions) => Promise<MediaStream>)
      | undefined;

    if (mediaDevicesProto && typeof mediaDevicesProto.getDisplayMedia === 'function') {
      originalProtoGetDisplayMedia = mediaDevicesProto.getDisplayMedia;
      try {
        Object.defineProperty(mediaDevicesProto, 'getDisplayMedia', {
          configurable: true,
          writable: true,
          value: async () => {
            triggerShield(NEUTRAL_SHIELD_TEXT, 3000);
            throw new DOMException('Display capture is disabled in this app.', 'NotAllowedError');
          },
        });
      } catch {
        // Ignore non-configurable prototype property
      }
    }

    const canvasProto = HTMLCanvasElement.prototype as HTMLCanvasElement & {
      captureStream?: (frameRequestRate?: number) => MediaStream;
    };
    const originalCanvasCaptureStream =
      typeof canvasProto.captureStream === 'function' ? canvasProto.captureStream : undefined;

    if (originalCanvasCaptureStream) {
      try {
        Object.defineProperty(canvasProto, 'captureStream', {
          configurable: true,
          writable: true,
          value: () => {
            triggerShield(NEUTRAL_SHIELD_TEXT, 3000);
            throw new DOMException('Capture stream is disabled in this app.', 'NotAllowedError');
          },
        });
      } catch {
        // Ignore non-configurable property
      }
    }

    const videoProto = HTMLVideoElement.prototype as HTMLVideoElement & {
      captureStream?: (frameRequestRate?: number) => MediaStream;
    };
    const originalVideoCaptureStream =
      typeof videoProto.captureStream === 'function' ? videoProto.captureStream : undefined;

    if (originalVideoCaptureStream) {
      try {
        Object.defineProperty(videoProto, 'captureStream', {
          configurable: true,
          writable: true,
          value: () => {
            triggerShield(NEUTRAL_SHIELD_TEXT, 3000);
            throw new DOMException('Capture stream is disabled in this app.', 'NotAllowedError');
          },
        });
      } catch {
        // Ignore non-configurable property
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('copy', handleCopyOrCut, true);
    document.addEventListener('cut', handleCopyOrCut, true);
    document.addEventListener('dragstart', handleDragStart, true);
    window.addEventListener('beforeprint', handleBeforePrint);

    return () => {
      document.body.classList.remove('app-protected');
      if (autoClearTimerRef.current !== null) {
        window.clearTimeout(autoClearTimerRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('copy', handleCopyOrCut, true);
      document.removeEventListener('cut', handleCopyOrCut, true);
      document.removeEventListener('dragstart', handleDragStart, true);
      window.removeEventListener('beforeprint', handleBeforePrint);

      if (mediaDevices && originalGetDisplayMedia) {
        try {
          Object.defineProperty(mediaDevices, 'getDisplayMedia', {
            configurable: true,
            writable: true,
            value: originalGetDisplayMedia,
          });
        } catch {
          // Ignore restore failure
        }
      }
      if (mediaDevices && originalGetUserMedia) {
        try {
          Object.defineProperty(mediaDevices, 'getUserMedia', {
            configurable: true,
            writable: true,
            value: originalGetUserMedia,
          });
        } catch {
          // Ignore restore failure
        }
      }
      if (mediaDevicesProto && originalProtoGetDisplayMedia) {
        try {
          Object.defineProperty(mediaDevicesProto, 'getDisplayMedia', {
            configurable: true,
            writable: true,
            value: originalProtoGetDisplayMedia,
          });
        } catch {
          // Ignore restore failure
        }
      }
      if (originalCanvasCaptureStream) {
        try {
          Object.defineProperty(canvasProto, 'captureStream', {
            configurable: true,
            writable: true,
            value: originalCanvasCaptureStream,
          });
        } catch {
          // Ignore restore failure
        }
      }
      if (originalVideoCaptureStream) {
        try {
          Object.defineProperty(videoProto, 'captureStream', {
            configurable: true,
            writable: true,
            value: originalVideoCaptureStream,
          });
        } catch {
          // Ignore restore failure
        }
      }
    };
  }, [enabled, onWarn, triggerShield]);

  return {
    isPrivacyShieldActive,
    shieldReason,
    dismissShield,
  };
}
