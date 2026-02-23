import svgPaths from "./svg-dla6ez465t";
import imgInnerFigmaPlaceholder from "figma:asset/7cf2f9c024faf3d9fb487e8f4b85891dd694cbb1.png";

function NewTabIcon() {
  return (
    <div className="h-[16.001px] relative w-[16px]" data-name="new-tab-icon">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16.0006">
        <g id="new-tab-icon">
          <g id="bound" />
          <path d={svgPaths.p26572e00} fill="var(--fill-0, #E6E6E7)" id="vector-2" />
          <path d={svgPaths.p11986480} fill="var(--fill-0, #E6E6E7)" id="vector" />
        </g>
      </svg>
    </div>
  );
}

function LeftComponent() {
  return (
    <div className="content-stretch flex gap-[12px] items-center opacity-40 relative shrink-0" data-name="left-component">
      <div className="bg-[rgba(61,61,64,0)] relative rounded-[9px] shrink-0 size-[34px]" data-name="button">
        <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 overflow-clip size-[16px] top-1/2" data-name="icons/gnome">
          <div className="-translate-x-1/2 -translate-y-1/2 absolute flex h-[16px] items-center justify-center left-[calc(50%+0.5px)] top-1/2 w-[11px]">
            <div className="-scale-y-100 flex-none">
              <div className="h-[16px] relative w-[11px]" data-name="vector">
                <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 11 16">
                  <path d={svgPaths.p2e834100} fill="var(--fill-0, #6D6D6F)" id="vector" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="bg-[rgba(61,61,64,0)] relative rounded-[9px] shrink-0 size-[34px]" data-name="button">
        <div className="-translate-x-1/2 -translate-y-1/2 absolute h-[16px] left-1/2 top-1/2 w-[16.001px]" data-name="icons/gnome">
          <div className="-translate-x-1/2 -translate-y-1/2 absolute flex h-[16px] items-center justify-center left-1/2 top-1/2 w-[16.001px]" style={{ "--transform-inner-width": "1200", "--transform-inner-height": "18.875" } as React.CSSProperties}>
            <div className="flex-none rotate-90">
              <NewTabIcon />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DivNearActiveTab() {
  return <div className="bg-[rgba(79,79,79,0)] h-[28px] shrink-0 w-px" data-name="div-near-active-tab" />;
}

function Div() {
  return <div className="bg-[#4f4f4f] h-[28px] shrink-0 w-px" data-name="div" />;
}

function TabsComponent() {
  return (
    <div className="content-stretch flex flex-[1_0_0] gap-[2px] items-center min-h-px min-w-px relative" data-name="tabs-component">
      <div className="bg-[#3d3d40] content-stretch flex gap-[10px] h-[34px] items-center justify-center px-[34px] py-[9px] relative rounded-[8px] shrink-0" data-name="tab">
        <p className="font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[1.2] not-italic relative shrink-0 text-[13px] text-[rgba(255,255,255,0.8)]">Active Tab</p>
        <div className="-translate-y-1/2 absolute right-[5px] size-[24px] top-1/2" data-name="controller">
          <div className="-translate-y-1/2 absolute bg-[rgba(255,255,255,0.06)] right-0 rounded-[20px] size-[24px] top-1/2" data-name="BG" />
          <div className="absolute inset-[16.67%] overflow-clip" data-name="icons/gnome">
            <div className="absolute bottom-1/4 left-[24.98%] right-1/4 top-1/4" data-name="Vector">
              <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 8.00352 8">
                <path d={svgPaths.p204802f0} fill="var(--fill-0, #E6E6E7)" id="Vector" />
              </svg>
            </div>
          </div>
        </div>
      </div>
      <DivNearActiveTab />
      <div className="bg-[rgba(61,61,64,0)] content-stretch flex gap-[10px] h-[34px] items-center justify-center px-[34px] py-[9px] relative rounded-[8px] shrink-0" data-name="tab">
        <p className="font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[1.2] not-italic relative shrink-0 text-[13px] text-[rgba(255,255,255,0.8)]">Unactive Tab</p>
        <div className="-translate-y-1/2 absolute opacity-0 right-[5px] size-[24px] top-1/2" data-name="controller">
          <div className="-translate-y-1/2 absolute bg-[rgba(255,255,255,0.06)] right-0 rounded-[20px] size-[24px] top-1/2" data-name="BG" />
          <div className="absolute inset-[16.67%] overflow-clip" data-name="icons/gnome">
            <div className="absolute bottom-1/4 left-[24.98%] right-1/4 top-1/4" data-name="Vector">
              <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 8.00352 8">
                <path d={svgPaths.p204802f0} fill="var(--fill-0, #E6E6E7)" id="Vector" />
              </svg>
            </div>
          </div>
        </div>
      </div>
      <Div />
      <div className="bg-[rgba(61,61,64,0)] content-stretch flex gap-[10px] h-[34px] items-center justify-center px-[34px] py-[9px] relative rounded-[8px] shrink-0" data-name="tab">
        <p className="font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[1.2] not-italic relative shrink-0 text-[13px] text-[rgba(255,255,255,0.8)]">Unactive Tab</p>
        <div className="-translate-y-1/2 absolute opacity-0 right-[5px] size-[24px] top-1/2" data-name="controller">
          <div className="-translate-y-1/2 absolute bg-[rgba(255,255,255,0.06)] right-0 rounded-[20px] size-[24px] top-1/2" data-name="BG" />
          <div className="absolute inset-[16.67%] overflow-clip" data-name="icons/gnome">
            <div className="absolute bottom-1/4 left-[24.98%] right-1/4 top-1/4" data-name="Vector">
              <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 8.00352 8">
                <path d={svgPaths.p204802f0} fill="var(--fill-0, #E6E6E7)" id="Vector" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Component3DotsIcon() {
  return (
    <div className="relative size-[16px]" data-name="3-dots-icon">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g id="3-dots-icon">
          <g id="bound" />
          <path d={svgPaths.p15860280} fill="var(--fill-0, #E6E6E7)" id="vector" />
        </g>
      </svg>
    </div>
  );
}

function CloseGroup() {
  return (
    <div className="content-stretch flex gap-[12px] items-center relative shrink-0" data-name="close-group">
      <div className="relative shrink-0 size-[24px]" data-name="controller">
        <div className="-translate-y-1/2 absolute bg-[rgba(255,255,255,0.06)] right-0 rounded-[20px] size-[24px] top-1/2" data-name="BG" />
        <div className="absolute inset-[16.67%]" data-name="icons/gnome">
          <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
            <g id="minimize-icon">
              <g id="bound" />
              <path d={svgPaths.pb4190f0} fill="var(--fill-0, #88888A)" id="vector" />
            </g>
          </svg>
        </div>
      </div>
      <div className="relative shrink-0 size-[24px]" data-name="controller">
        <div className="-translate-y-1/2 absolute bg-[rgba(255,255,255,0.06)] right-0 rounded-[20px] size-[24px] top-1/2" data-name="BG" />
        <div className="absolute inset-[16.67%] overflow-clip" data-name="icons/gnome">
          <div className="absolute inset-[0_0.01%_0_-0.01%]" data-name="bound">
            <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 32 32">
              <g id="bound" />
            </svg>
          </div>
          <div className="absolute inset-[24.95%_25.01%_24.98%_24.92%]" data-name="vector">
            <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 8.01172 8.01172">
              <path d={svgPaths.p3870dc00} fill="var(--fill-0, #88888A)" id="vector" />
            </svg>
          </div>
        </div>
      </div>
      <div className="relative shrink-0 size-[24px]" data-name="controller">
        <div className="-translate-y-1/2 absolute bg-[rgba(255,255,255,0.06)] right-0 rounded-[20px] size-[24px] top-1/2" data-name="BG" />
        <div className="absolute inset-[16.67%] overflow-clip" data-name="icons/gnome">
          <div className="absolute bottom-1/4 left-[24.98%] right-1/4 top-1/4" data-name="Vector">
            <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 8.00352 8">
              <path d={svgPaths.p204802f0} fill="var(--fill-0, #E6E6E7)" id="Vector" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function RightComponent() {
  return (
    <div className="content-stretch flex gap-[12px] items-center relative shrink-0" data-name="right-component">
      <div className="bg-[rgba(61,61,64,0)] relative rounded-[9px] shrink-0 size-[34px]" data-name="button">
        <div className="-translate-x-1/2 -translate-y-1/2 absolute h-[16px] left-1/2 top-1/2 w-[16.001px]" data-name="icons/gnome">
          <div className="-translate-x-1/2 -translate-y-1/2 absolute flex items-center justify-center left-1/2 size-[16px] top-1/2" style={{ "--transform-inner-width": "1200", "--transform-inner-height": "18.875" } as React.CSSProperties}>
            <div className="-rotate-90 flex-none">
              <Component3DotsIcon />
            </div>
          </div>
        </div>
      </div>
      <CloseGroup />
    </div>
  );
}

function HeaderFrame() {
  return (
    <div className="bg-[#2e2e32] h-[46px] relative shadow-[0px_1px_2px_0px_rgba(0,0,0,0.24)] shrink-0 w-full z-[2]" data-name="header-frame">
      <div className="flex flex-row items-center overflow-clip rounded-[inherit] size-full">
        <div className="content-stretch flex gap-[12px] items-center p-[9px] relative size-full">
          <LeftComponent />
          <TabsComponent />
          <RightComponent />
        </div>
      </div>
    </div>
  );
}

export default function GnomeStyleWindow() {
  return (
    <div className="bg-[#242424] relative rounded-[12px] size-full" data-name="Gnome-style-window">
      <div className="content-stretch flex flex-col isolate items-start overflow-clip relative rounded-[inherit] size-full">
        <HeaderFrame />
        <div className="h-[808px] relative shrink-0 w-[1245px] z-[1]" data-name="inner-figma-placeholder">
          <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 overflow-hidden">
              <img alt="" className="absolute h-[104.95%] left-0 max-w-none top-[-4.95%] w-full" src={imgInnerFigmaPlaceholder} />
            </div>
            <div className="absolute bg-[rgba(255,255,255,0.82)] inset-0" />
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="absolute border border-[rgba(255,255,255,0.06)] border-solid inset-0 pointer-events-none rounded-[12px] shadow-[0px_0px_20px_0px_rgba(0,0,0,0.25)]" />
    </div>
  );
}