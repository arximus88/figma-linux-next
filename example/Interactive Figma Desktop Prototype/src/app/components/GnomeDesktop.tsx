import React, { useState, useRef, useEffect } from "react";
import { FigmaWindow } from "./FigmaWindow";

const WALLPAPER = "https://images.unsplash.com/photo-1667316500702-a0b96785f488?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxHTk9NRSUyMGxpbnV4JTIwZGFyayUyMGFic3RyYWN0JTIwZ3JhZGllbnQlMjBkZXNrdG9wJTIwd2FsbHBhcGVyfGVufDF8fHx8MTc3MTY2MjQ3MHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral";

// ─── GNOME Top Panel ─────────────────────────────────────────────────────────

function TopPanel({ time }: { time: string }) {
  return (
    <div
      className="absolute top-0 left-0 right-0 h-[32px] flex items-center px-3 z-50 select-none"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)" }}
    >
      {/* Activities */}
      <button
        className="text-[13px] text-white/90 hover:text-white px-[10px] py-[3px] rounded hover:bg-white/10 transition-colors cursor-default"
        style={{ fontFamily: "Cantarell, sans-serif" }}
      >
        Activities
      </button>

      {/* App menu label */}
      <span
        className="text-[13px] text-white/50 ml-3"
        style={{ fontFamily: "Cantarell, sans-serif" }}
      >
        Figma
      </span>

      {/* Clock — centered absolutely */}
      <div className="absolute left-1/2 -translate-x-1/2">
        <span
          className="text-[13px] text-white/90"
          style={{ fontFamily: "Cantarell, sans-serif" }}
        >
          {time}
        </span>
      </div>

      {/* Right: system tray */}
      <div className="ml-auto flex items-center gap-[14px]">
        {/* Wifi */}
        <svg width="16" height="12" viewBox="0 0 24 18" fill="none">
          <path d="M12 4.5C15.5 4.5 18.7 5.9 21.1 8.1L23 6.2C20 3.5 16.2 1.8 12 1.8C7.8 1.8 4 3.5 1 6.2L2.9 8.1C5.3 5.9 8.5 4.5 12 4.5Z" fill="white" fillOpacity="0.75"/>
          <path d="M12 9C14.4 9 16.6 9.9 18.3 11.4L20.2 9.5C18 7.7 15.1 6.6 12 6.6C8.9 6.6 6 7.7 3.8 9.5L5.7 11.4C7.4 9.9 9.6 9 12 9Z" fill="white" fillOpacity="0.75"/>
          <circle cx="12" cy="16" r="2.5" fill="white" fillOpacity="0.75"/>
        </svg>

        {/* Volume */}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" fill="white" fillOpacity="0.75"/>
        </svg>

        {/* Battery */}
        <div className="flex items-center gap-1">
          <svg width="20" height="12" viewBox="0 0 24 14" fill="none">
            <rect x="0.5" y="0.5" width="20" height="13" rx="2.5" stroke="white" strokeOpacity="0.6"/>
            <rect x="2" y="2" width="16" height="10" rx="1.5" fill="white" fillOpacity="0.75"/>
            <rect x="21" y="4" width="3" height="6" rx="1" fill="white" fillOpacity="0.4"/>
          </svg>
          <span className="text-[12px] text-white/70" style={{ fontFamily: "Cantarell, sans-serif" }}>100%</span>
        </div>

        {/* User/power icon */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="8" r="4" stroke="white" strokeOpacity="0.7" strokeWidth="1.5" fill="none"/>
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="white" strokeOpacity="0.7" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        </svg>
      </div>
    </div>
  );
}

// ─── GNOME Bottom Dock ────────────────────────────────────────────────────────

interface DockProps {
  figmaMinimized: boolean;
  figmaClosed: boolean;
  onFigmaClick: () => void;
}

function BottomDock({ figmaMinimized, figmaClosed, onFigmaClick }: DockProps) {
  const dockApps = [
    {
      name: "Files",
      render: () => (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" fill="#5e81f4" opacity="0.9"/>
        </svg>
      ),
    },
    {
      name: "Firefox",
      render: () => (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" fill="#ff7139" opacity="0.9"/>
          <circle cx="12" cy="12" r="4" fill="#ffcc00" opacity="0.95"/>
        </svg>
      ),
    },
    {
      name: "Terminal",
      render: () => (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="4" fill="#1a1a2e"/>
          <path d="M5 9l4 3-4 3" stroke="#0acf83" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M13 15h6" stroke="#0acf83" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      name: "VS Code",
      render: () => (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path d="M17.5 2L3 9.5l4.5 3.5L17.5 5.5v13l-10-7.5 10 7.5V22L3 14.5 17.5 22z" fill="#0078d4"/>
        </svg>
      ),
    },
    { name: "Figma", isFigma: true },
    {
      name: "Settings",
      render: () => (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="3" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" fill="none"/>
          <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
    },
  ];

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-end gap-[6px] px-3 py-2 z-50" style={{ borderRadius: 18, background: "rgba(18,18,24,0.8)", backdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 6px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)" }}>
      {dockApps.map((app) => {
        const isFigmaApp = app.name === "Figma";
        const isRunning = isFigmaApp && !figmaClosed;

        return (
          <div key={app.name} className="relative group flex flex-col items-center">
            <button
              onClick={isFigmaApp ? onFigmaClick : undefined}
              className="relative w-[52px] h-[52px] rounded-[14px] flex items-center justify-center transition-all duration-150 group-hover:-translate-y-[6px] active:scale-95 cursor-default"
              style={{
                background: isFigmaApp ? "#1e1e26" : "rgba(255,255,255,0.06)",
                border: isFigmaApp ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(255,255,255,0.04)",
                boxShadow: isFigmaApp && isRunning ? "0 0 18px rgba(255,255,255,0.07)" : undefined,
              }}
              title={app.name + (isFigmaApp && figmaMinimized ? " (minimized)" : "")}
            >
              {isFigmaApp ? (
                <svg width="30" height="30" viewBox="0 0 38 57" fill="none">
                  <path d="M19 28.5C19 25.72 20 23.06 21.78 21.09C23.56 19.12 25.98 18 28.5 18C31.02 18 33.44 19.12 35.22 21.09C36.99 23.06 38 25.72 38 28.5C38 31.28 36.99 33.94 35.22 35.91C33.44 37.88 31.02 39 28.5 39C25.98 39 23.56 37.88 21.78 35.91C20 33.94 19 31.28 19 28.5Z" fill="#1ABCFE"/>
                  <path d="M0 47.5C0 44.72 1 42.06 2.78 40.09C4.56 38.12 6.98 37 9.5 37H19V47.5C19 50.28 18 52.94 16.22 54.91C14.44 56.88 12.02 58 9.5 58C6.98 58 4.56 56.88 2.78 54.91C1 52.94 0 50.28 0 47.5Z" fill="#0ACF83"/>
                  <path d="M19 0V19H28.5C31.02 19 33.44 17.88 35.22 15.91C36.99 13.94 38 11.28 38 8.5C38 5.72 36.99 3.06 35.22 1.09C33.44 -0.88 31.02 -2 28.5 -2H19V0Z" fill="#FF7262"/>
                  <path d="M0 8.5C0 11.28 1 13.94 2.78 15.91C4.56 17.88 6.98 19 9.5 19H19V0H9.5C6.98 0 4.56 1.12 2.78 3.09C1 5.06 0 7.72 0 8.5Z" fill="#FF7262"/>
                  <path d="M0 28.5C0 31.28 1 33.94 2.78 35.91C4.56 37.88 6.98 39 9.5 39H19V18H9.5C6.98 18 4.56 19.12 2.78 21.09C1 23.06 0 25.72 0 28.5Z" fill="#A259FF"/>
                </svg>
              ) : (
                app.render?.()
              )}
            </button>

            {/* Running dot indicator */}
            {isRunning && (
              <div
                className="mt-[4px] w-[4px] h-[4px] rounded-full"
                style={{ background: "rgba(255,255,255,0.5)" }}
              />
            )}
            {!isRunning && <div className="mt-[4px] w-[4px] h-[4px]" />}

            {/* Tooltip */}
            <div
              className="absolute -top-[38px] left-1/2 -translate-x-1/2 px-[10px] py-[4px] rounded-[6px] text-[12px] text-white whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity"
              style={{ background: "rgba(0,0,0,0.85)", fontFamily: "Cantarell, sans-serif", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              {app.name}
              {isFigmaApp && figmaMinimized && " (minimized)"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Desktop ─────────────────────────────────────────────────────────────

export function GnomeDesktop() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState("");
  const [figmaMinimized, setFigmaMinimized] = useState(false);
  const [figmaClosed, setFigmaClosed] = useState(false);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const date = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const t = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      setTime(`${date}  ${t}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const handleFigmaDockClick = () => {
    if (figmaClosed) {
      setFigmaClosed(false);
      setFigmaMinimized(false);
    } else if (figmaMinimized) {
      setFigmaMinimized(false);
    }
    // If already visible, clicking dock does nothing (or could focus)
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      style={{ background: "#0d0d14", fontFamily: "Cantarell, Inter, sans-serif" }}
    >
      {/* Wallpaper */}
      <img
        src={WALLPAPER}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        style={{ opacity: 0.45 }}
        draggable={false}
      />

      {/* Subtle vignette overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at 50% 50%, rgba(20,10,40,0.3) 0%, rgba(5,5,15,0.55) 100%)",
        }}
      />

      {/* Top Panel */}
      <TopPanel time={time} />

      {/* Figma Window */}
      <FigmaWindow
        containerRef={containerRef}
        minimized={figmaMinimized}
        closed={figmaClosed}
        onMinimize={() => setFigmaMinimized(true)}
        onClose={() => setFigmaClosed(true)}
      />

      {/* "Window closed" notice */}
      {figmaClosed && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="pointer-events-auto text-center px-8 py-6 rounded-2xl"
            style={{ background: "rgba(20,20,30,0.85)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(16px)" }}
          >
            <p className="text-white/70 text-[14px] mb-3" style={{ fontFamily: "Cantarell, sans-serif" }}>
              Figma was closed
            </p>
            <button
              onClick={() => { setFigmaClosed(false); setFigmaMinimized(false); }}
              className="px-4 py-2 rounded-lg text-[13px] text-white/80 hover:text-white transition-colors cursor-default"
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              Reopen Figma
            </button>
          </div>
        </div>
      )}

      {/* Bottom Dock */}
      <BottomDock
        figmaMinimized={figmaMinimized}
        figmaClosed={figmaClosed}
        onFigmaClick={handleFigmaDockClick}
      />
    </div>
  );
}
