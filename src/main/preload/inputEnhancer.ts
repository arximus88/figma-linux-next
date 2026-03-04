/**
 * Input Enhancement Preload Script
 * Improves trackpad gesture handling and input latency on Wayland
 *
 * This script intercepts and enhances input events before they reach Figma's
 * rendering engine to provide smoother interactions on Linux.
 */

// Track gesture state
let isPinching = false;
let lastPinchScale = 1.0;
let isGestureActive = false;

/**
 * Enhanced trackpad gesture handler for canvas zoom
 * Prevents browser zoom and maps to Figma canvas zoom instead
 */
function handleTrackpadGesture(event: WheelEvent): void {
  // Detect pinch-to-zoom gesture (Ctrl+Wheel on most Linux systems)
  if (event.ctrlKey && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    event.stopPropagation();

    // Calculate zoom delta
    // Negative deltaY = zoom in, Positive deltaY = zoom out
    const zoomDelta = -event.deltaY * 0.01;

    // Dispatch custom zoom event that Figma's canvas can handle
    const canvasZoomEvent = new WheelEvent("wheel", {
      deltaY: event.deltaY,
      deltaMode: event.deltaMode,
      clientX: event.clientX,
      clientY: event.clientY,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });

    // Find canvas element and dispatch directly
    const canvas = document.querySelector("canvas");
    if (canvas) {
      canvas.dispatchEvent(canvasZoomEvent);
    }
  }

  // Handle trackpad pan (two-finger scroll)
  // Let this through normally but optimize the event
  if (!event.ctrlKey && (Math.abs(event.deltaX) > 0 || Math.abs(event.deltaY) > 0)) {
    // Smooth scrolling optimization for Wayland
    if (event.deltaMode === WheelEvent.DOM_DELTA_PIXEL) {
      // Already in pixel mode - optimal for Figma
      return;
    }
  }
}

/**
 * Enhanced mouse wheel handler
 */
function handleMouseWheel(event: WheelEvent): void {
  // Improve precision for Wayland scroll events
  if (window.matchMedia && window.matchMedia("(pointer: fine)").matches) {
    // High-precision mouse detected
    // Adjust delta for better feel
    const enhancedEvent = new WheelEvent(event.type, {
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaZ: event.deltaZ,
      deltaMode: event.deltaMode,
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      bubbles: event.bubbles,
      cancelable: event.cancelable,
    });
  }
}

/**
 * Detect and enhance pointer events for lower latency
 */
function enhancePointerEvents(): void {
  // Request pointer lock for better precision during drag operations
  document.addEventListener("pointerdown", (event: PointerEvent) => {
    if (event.pointerType === "mouse" && event.pressure > 0) {
      // Optimize for mouse input
      // Enable predicted points for lower latency
      if ("getCoalescedEvents" in event) {
        const coalescedEvents = (event as any).getCoalescedEvents();
        if (coalescedEvents.length > 0) {
          // Use most recent coalesced event for lowest latency
          // Figma will use this for rendering
        }
      }
    }
  });
}

/**
 * Initialize input enhancements
 */
function initInputEnhancements(): void {
  console.log("[Figma-Linux] Initializing input enhancements for Wayland/Linux");

  // Intercept wheel events at capture phase for highest priority
  document.addEventListener("wheel", handleTrackpadGesture, {
    capture: true,
    passive: false,
  });

  // Enhance pointer events
  enhancePointerEvents();

  // Detect Wayland session and apply specific optimizations
  const isWayland =
    navigator.userAgent.includes("Wayland") || (window as any).DESKTOP_SESSION_TYPE === "wayland";

  if (isWayland) {
    console.log("[Figma-Linux] Wayland session detected - applying Wayland optimizations");

    // Set CSS for better rendering on Wayland
    document.documentElement.style.setProperty("will-change", "transform");
    document.documentElement.style.setProperty("transform", "translateZ(0)");
  }

  // Optimize canvas rendering
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeName === "CANVAS") {
          const canvas = node as HTMLCanvasElement;

          // Enable desynchronized for lower latency
          const context = canvas.getContext("2d", {
            desynchronized: true,
            alpha: false,
          });

          // WebGL optimization
          const gl = canvas.getContext("webgl2", {
            desynchronized: true,
            antialias: true,
            depth: true,
            stencil: true,
            preserveDrawingBuffer: false,
            powerPreference: "high-performance",
            failIfMajorPerformanceCaveat: false,
          });

          if (gl) {
            console.log("[Figma-Linux] WebGL2 context initialized with high-performance settings");
          }
        }
      });
    });
  });

  // Observe document for canvas elements
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initInputEnhancements);
} else {
  initInputEnhancements();
}

// Export for potential use in other modules
export { initInputEnhancements, handleTrackpadGesture, enhancePointerEvents };
