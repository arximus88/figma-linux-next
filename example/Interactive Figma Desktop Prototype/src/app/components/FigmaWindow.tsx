import React, { useState, useRef, useCallback, useEffect } from "react";
import svgPaths from "../../imports/svg-dla6ez465t";
import imgInnerFigmaPlaceholder from "figma:asset/7cf2f9c024faf3d9fb487e8f4b85891dd694cbb1.png";

// ─── Icon primitives (exact Figma SVG paths) ────────────────────────────────

function IconFigmaLogo() {
  return (
    <div className="h-[16px] relative w-[11px]">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 11 16">
        <path d={svgPaths.p2e834100} fill="#6D6D6F" />
      </svg>
    </div>
  );
}

function IconNewTab() {
  return (
    <div className="h-[16.001px] relative w-[16px]">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16.0006">
        <path d={svgPaths.p26572e00} fill="#E6E6E7" />
        <path d={svgPaths.p11986480} fill="#E6E6E7" />
      </svg>
    </div>
  );
}

function IconThreeDots() {
  return (
    <div className="relative size-[16px]">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <path d={svgPaths.p15860280} fill="#E6E6E7" />
      </svg>
    </div>
  );
}

function IconClose() {
  return (
    <div className="absolute bottom-1/4 left-[24.98%] right-1/4 top-1/4">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 8.00352 8">
        <path d={svgPaths.p204802f0} fill="#E6E6E7" />
      </svg>
    </div>
  );
}

function IconMinimize() {
  return (
    <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
      <path d={svgPaths.pb4190f0} fill="#88888A" />
    </svg>
  );
}

function IconMaximize() {
  return (
    <>
      <div className="absolute inset-[0_0.01%_0_-0.01%]">
        <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 32 32" />
      </div>
      <div className="absolute inset-[24.95%_25.01%_24.98%_24.92%]">
        <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 8.01172 8.01172">
          <path d={svgPaths.p3870dc00} fill="#88888A" />
        </svg>
      </div>
    </>
  );
}

// ─── Window controller button (minimize / maximize / close) ──────────────────

function WinCtrl({ onClick, children, title }: { onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="relative shrink-0 size-[24px] cursor-default group"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0 bg-[rgba(255,255,255,0.06)] group-hover:bg-[rgba(255,255,255,0.14)] rounded-[20px] transition-colors" />
      <div className="absolute inset-[16.67%] overflow-clip">
        {children}
      </div>
    </button>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface Tab {
  id: string;
  label: string;
}

interface Props {
  containerRef: React.RefObject<HTMLDivElement | null>;
  minimized: boolean;
  closed: boolean;
  onMinimize: () => void;
  onClose: () => void;
}

const MIN_W = 520;
const MIN_H = 380;

// ─── Main component ──────────────────────────────────────────────────────────

export function FigmaWindow({ containerRef, minimized, closed, onMinimize, onClose }: Props) {
  const [pos, setPos] = useState({ x: 100, y: 48 });
  const [size, setSize] = useState({ w: 1060, h: 720 });
  const [maximized, setMaximized] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tabs, setTabs] = useState<Tab[]>([
    { id: "1", label: "Active Tab" },
    { id: "2", label: "Unactive Tab" },
    { id: "3", label: "Unactive Tab" },
  ]);
  const [activeTabId, setActiveTabId] = useState("1");

  const prevSnapshot = useRef({ x: 100, y: 48, w: 1060, h: 720 });

  // Drag
  const drag = useRef({ on: false, sx: 0, sy: 0, ox: 0, oy: 0 });
  // Resize
  const rsz = useRef({ on: false, dir: "", sx: 0, sy: 0, ox: 0, oy: 0, ow: 0, oh: 0 });

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (drag.current.on && !maximized) {
      setPos({ x: drag.current.ox + e.clientX - drag.current.sx, y: drag.current.oy + e.clientY - drag.current.sy });
    }
    if (rsz.current.on) {
      const dx = e.clientX - rsz.current.sx;
      const dy = e.clientY - rsz.current.sy;
      const d = rsz.current.dir;
      const nw = d.includes("e") ? Math.max(MIN_W, rsz.current.ow + dx)
        : d.includes("w") ? Math.max(MIN_W, rsz.current.ow - dx) : rsz.current.ow;
      const nh = d.includes("s") ? Math.max(MIN_H, rsz.current.oh + dy)
        : d.includes("n") ? Math.max(MIN_H, rsz.current.oh - dy) : rsz.current.oh;
      setSize({ w: nw, h: nh });
      setPos((p) => ({
        x: d.includes("w") ? rsz.current.ox + (rsz.current.ow - nw) : p.x,
        y: d.includes("n") ? rsz.current.oy + (rsz.current.oh - nh) : p.y,
      }));
    }
  }, [maximized]);

  const onMouseUp = useCallback(() => {
    drag.current.on = false;
    rsz.current.on = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp); };
  }, [onMouseMove, onMouseUp]);

  const startDrag = (e: React.MouseEvent) => {
    if (maximized) return;
    const target = e.target as HTMLElement;
    // Don't drag when clicking on buttons or the tabs area
    if (target.closest("button") || target.closest("[data-no-drag]")) return;
    e.preventDefault();
    drag.current = { on: true, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
    document.body.style.userSelect = "none";
  };

  const startResize = (e: React.MouseEvent, dir: string) => {
    e.preventDefault(); e.stopPropagation();
    rsz.current = { on: true, dir, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, ow: size.w, oh: size.h };
    const cur: Record<string, string> = { n: "n-resize", s: "s-resize", e: "e-resize", w: "w-resize", ne: "ne-resize", nw: "nw-resize", se: "se-resize", sw: "sw-resize" };
    document.body.style.cursor = cur[dir];
    document.body.style.userSelect = "none";
  };

  const handleMaximize = () => {
    if (maximized) {
      setPos({ x: prevSnapshot.current.x, y: prevSnapshot.current.y });
      setSize({ w: prevSnapshot.current.w, h: prevSnapshot.current.h });
      setMaximized(false);
    } else {
      prevSnapshot.current = { x: pos.x, y: pos.y, w: size.w, h: size.h };
      const r = containerRef.current?.getBoundingClientRect();
      if (r) { setPos({ x: 0, y: 0 }); setSize({ w: r.width, h: r.height }); }
      setMaximized(true);
    }
  };

  const addTab = (e: React.MouseEvent) => {
    e.stopPropagation();
    const id = Date.now().toString();
    setTabs((prev) => [...prev, { id, label: "New Tab" }]);
    setActiveTabId(id);
  };

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length <= 1) return;
    const idx = tabs.findIndex((t) => t.id === id);
    const next = tabs.filter((t) => t.id !== id);
    setTabs(next);
    if (activeTabId === id) setActiveTabId(next[Math.max(0, idx - 1)].id);
  };

  if (closed || minimized) return null;

  const winStyle: React.CSSProperties = maximized
    ? { position: "absolute", inset: 0, borderRadius: 0 }
    : { position: "absolute", top: pos.y, left: pos.x, width: size.w, height: size.h, borderRadius: 12 };

  return (
    <div style={{ ...winStyle, zIndex: 100 }} className="flex flex-col bg-[#242424] isolate overflow-hidden">

      {/* ── Resize handles ───────────────────────────────────────────────── */}
      {!maximized && (
        <div className="absolute inset-0 pointer-events-none z-50">
          {/* Edges */}
          <div className="absolute top-0 left-3 right-3 h-[4px] cursor-n-resize pointer-events-auto" onMouseDown={(e) => startResize(e, "n")} />
          <div className="absolute bottom-0 left-3 right-3 h-[4px] cursor-s-resize pointer-events-auto" onMouseDown={(e) => startResize(e, "s")} />
          <div className="absolute left-0 top-3 bottom-3 w-[4px] cursor-w-resize pointer-events-auto" onMouseDown={(e) => startResize(e, "w")} />
          <div className="absolute right-0 top-3 bottom-3 w-[4px] cursor-e-resize pointer-events-auto" onMouseDown={(e) => startResize(e, "e")} />
          {/* Corners */}
          <div className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize pointer-events-auto" onMouseDown={(e) => startResize(e, "nw")} />
          <div className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize pointer-events-auto" onMouseDown={(e) => startResize(e, "ne")} />
          <div className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize pointer-events-auto" onMouseDown={(e) => startResize(e, "sw")} />
          <div className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize pointer-events-auto" onMouseDown={(e) => startResize(e, "se")} />
        </div>
      )}

      {/* ── Header bar ───────────────────────────────────────────────────── */}
      <div
        className="bg-[#2e2e32] h-[46px] relative shrink-0 w-full z-[2] select-none cursor-default"
        style={{ boxShadow: "0px 1px 2px 0px rgba(0,0,0,0.24)" }}
        onMouseDown={startDrag}
        onDoubleClick={handleMaximize}
      >
        <div className="flex flex-row items-center overflow-clip size-full">
          <div className="flex gap-[12px] items-center p-[9px] size-full">

            {/* LEFT: Figma logo btn + New-tab btn */}
            <div className="flex gap-[12px] items-center opacity-40 shrink-0">
              {/* Figma home button */}
              <button
                className="bg-transparent hover:bg-[#3d3d40] relative rounded-[9px] shrink-0 size-[34px] transition-colors cursor-default"
                title="Figma Home"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="absolute left-1/2 top-1/2 overflow-clip size-[16px]" style={{ transform: "translate(-50%,-50%)" }}>
                  <div className="absolute flex h-[16px] items-center justify-center w-[11px]" style={{ transform: "translate(-50%,-50%) scaleY(-1)", left: "calc(50% + 0.5px)", top: "50%" }}>
                    <div className="flex-none">
                      <IconFigmaLogo />
                    </div>
                  </div>
                </div>
              </button>

              {/* New tab button */}
              <button
                onClick={addTab}
                className="bg-transparent hover:bg-[#3d3d40] relative rounded-[9px] shrink-0 size-[34px] transition-colors cursor-default"
                title="New tab"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="absolute h-[16px] left-1/2 top-1/2 w-[16.001px]" style={{ transform: "translate(-50%,-50%)" }}>
                  <div className="absolute flex h-[16px] items-center justify-center left-1/2 top-1/2 w-[16.001px]" style={{ transform: "translate(-50%,-50%)" }}>
                    <div className="flex-none rotate-90">
                      <IconNewTab />
                    </div>
                  </div>
                </div>
              </button>
            </div>

            {/* TABS (middle, flex-1) */}
            <div
              className="flex flex-1 gap-[2px] items-center min-h-px min-w-px overflow-x-auto overflow-y-visible"
              style={{ scrollbarWidth: "none" }}
              data-no-drag="true"
            >
              {tabs.map((tab, i) => {
                const isActive = tab.id === activeTabId;
                const prevIsActive = i > 0 && tabs[i - 1].id === activeTabId;

                return (
                  <React.Fragment key={tab.id}>
                    {/* Divider */}
                    {i > 0 && (
                      <div
                        className="h-[28px] shrink-0 w-px transition-colors"
                        style={{ background: isActive || prevIsActive ? "rgba(79,79,79,0)" : "#4f4f4f" }}
                      />
                    )}

                    {/* Tab */}
                    <div
                      onClick={() => setActiveTabId(tab.id)}
                      className={`group relative flex gap-[10px] h-[34px] items-center justify-center px-[34px] py-[9px] rounded-[8px] shrink-0 cursor-default transition-colors ${
                        isActive ? "bg-[#3d3d40]" : "bg-transparent hover:bg-[rgba(61,61,64,0.6)]"
                      }`}
                    >
                      <p
                        className="font-semibold leading-[1.2] not-italic relative shrink-0 text-[13px] text-[rgba(255,255,255,0.8)]"
                        style={{ fontFamily: "Inter, sans-serif" }}
                      >
                        {tab.label}
                      </p>

                      {/* Tab close controller */}
                      <button
                        onClick={(e) => closeTab(tab.id, e)}
                        className={`-translate-y-1/2 absolute right-[5px] top-1/2 size-[24px] cursor-default transition-opacity ${
                          isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        }`}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <div className="absolute inset-0 bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.14)] rounded-[20px] transition-colors" />
                        <div className="absolute inset-[16.67%] overflow-clip">
                          <IconClose />
                        </div>
                      </button>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>

            {/* RIGHT: 3-dots + window controls */}
            <div className="flex gap-[12px] items-center shrink-0">
              {/* 3-dots menu button */}
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className={`bg-transparent hover:bg-[#3d3d40] relative rounded-[9px] shrink-0 size-[34px] transition-colors cursor-default ${menuOpen ? "bg-[#3d3d40]" : ""}`}
                  title="Main menu"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="absolute h-[16px] left-1/2 top-1/2 w-[16.001px]" style={{ transform: "translate(-50%,-50%)" }}>
                    <div className="absolute flex items-center justify-center left-1/2 top-1/2 size-[16px]" style={{ transform: "translate(-50%,-50%)" }}>
                      <div className="-rotate-90 flex-none">
                        <IconThreeDots />
                      </div>
                    </div>
                  </div>
                </button>

                {/* Dropdown menu */}
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                    <div
                      className="absolute right-0 top-full mt-[6px] w-52 rounded-xl overflow-hidden z-50 py-1"
                      style={{
                        background: "#2e2e32",
                        border: "1px solid rgba(255,255,255,0.1)",
                        boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
                      }}
                    >
                      {([
                        "New design file",
                        "New FigJam file",
                        "Open file…",
                        null,
                        "Save to version history",
                        "Show version history",
                        null,
                        "Export…",
                        null,
                        "Preferences",
                        "Keyboard shortcuts",
                        null,
                        "Help and account",
                      ] as (string | null)[]).map((item, idx) =>
                        item === null ? (
                          <div key={idx} className="mx-3 my-1 h-px bg-white/10" />
                        ) : (
                          <button
                            key={idx}
                            onClick={() => setMenuOpen(false)}
                            className="w-full text-left px-4 py-[7px] text-[13px] text-[rgba(255,255,255,0.8)] hover:bg-white/8 cursor-default transition-colors"
                            style={{ fontFamily: "Inter, sans-serif" }}
                          >
                            {item}
                          </button>
                        )
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Window controls group */}
              <div className="flex gap-[12px] items-center shrink-0">
                {/* Minimize */}
                <WinCtrl onClick={onMinimize} title="Minimize">
                  <IconMinimize />
                </WinCtrl>

                {/* Maximize */}
                <WinCtrl onClick={handleMaximize} title={maximized ? "Restore" : "Maximize"}>
                  <div className="absolute inset-0 overflow-clip">
                    <IconMaximize />
                  </div>
                </WinCtrl>

                {/* Close */}
                <WinCtrl onClick={onClose} title="Close">
                  <IconClose />
                </WinCtrl>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── Inner content (placeholder) ───────────────────────────────────── */}
      <div className="relative flex-1 z-[1] overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 overflow-hidden">
            <img
              alt=""
              className="absolute left-0 max-w-none w-full"
              style={{ height: "104.95%", top: "-4.95%" }}
              src={imgInnerFigmaPlaceholder}
              draggable={false}
            />
          </div>
          <div className="absolute inset-0 bg-[rgba(255,255,255,0.82)]" />
        </div>
      </div>

      {/* ── Outer border overlay ─────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          borderRadius: maximized ? 0 : 12,
          border: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "0px 0px 20px 0px rgba(0,0,0,0.25)",
        }}
      />
    </div>
  );
}
