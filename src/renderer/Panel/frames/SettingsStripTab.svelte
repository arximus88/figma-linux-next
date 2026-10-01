<script lang="ts">
  // The Settings tab, the way a browser shows its settings page: after the
  // file tabs, one per window. It reuses the frame's tab classes so it looks
  // like its neighbours in every style, but lives outside List — it is not in
  // `tabs`, so it never drags, groups, previews or gets saved with the session.
  import { ButtonTool } from "Common/Buttons";
  import { Settings } from "Icons";
  import { getFrameConfig } from "Utils/Render/frameTheme";
  import { currentTab } from "../store";
  import { tabSlide } from "../Components/motion";

  let { style }: { style: Types.FrameStyle } = $props();

  const p = $derived(style === "gnome" ? "g" : style === "kde" ? "k" : "w");
  const cfg = $derived(getFrameConfig(style));
  const CloseIcon = $derived(cfg.tabs.closeIcon.component);
  const active = $derived(currentTab.value === "settingsTab");

  function onTitleUp(event: MouseEvent) {
    if (event.button === 0) window.figmaApi.send("openSettingsView");
    else if (event.button === 1) window.figmaApi.send("closeSettingsView");
  }
</script>

<div class="{p}-tab-wrapper settings-strip-tab" transition:tabSlide>
  <div class="{p}-tab {active ? `${p}-tab--active` : ''}">
    <div
      role="tab"
      tabindex="0"
      aria-selected={active}
      class="{p}-tab-text"
      onmouseup={onTitleUp}
      onkeydown={(e) => {
        if (e.key === "Enter" || e.key === " ") window.figmaApi.send("openSettingsView");
      }}
      ondblclick={(e) => e.stopPropagation()}
    >
      <Settings size="16" color="currentColor" />
      <span>Settings</span>
    </div>
    <ButtonTool
      padding="0"
      normalBgColor="transparent"
      hoverBgColor="transparent"
      ariaLabel="Close Settings"
      onButtonClick={() => window.figmaApi.send("closeSettingsView")}
    >
      <CloseIcon size={cfg.tabs.closeIcon.size} />
    </ButtonTool>
  </div>
</div>
