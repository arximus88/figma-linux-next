<script lang="ts">
  import { getContext } from "svelte";
  import type { FrameTheme } from "Utils/Render/frameTheme";
  import { ButtonWindow } from "Common/Buttons";
  import { tabs, isMenuOpen } from "../store";

  const theme = getContext<FrameTheme>("frameTheme");
  const config = $derived(theme.config);


  function clickMenu() {
    if (isMenuOpen.value) {
      return;
    }

    window.figmaApi.send("openMainMenu");
    isMenuOpen.toggle();
  }

  function closeHandler() {
    window.figmaApi.send("windowClose", $state.snapshot(tabs.value));
  }
</script>

<div class="panel-right">
  {#if config.right.menu}
    <ButtonWindow isActive={isMenuOpen.value} onButtonClick={clickMenu}>
      <config.right.menu.component size={config.right.menu.size} />
    </ButtonWindow>
  {/if}
  <ButtonWindow onButtonClick={() => window.figmaApi.send("windowMinimize")}>
    <config.right.minimize.component size={config.right.minimize.size} />
  </ButtonWindow>
  <ButtonWindow onButtonClick={() => window.figmaApi.send("windowMaximize")}>
    <config.right.maximize.component size={config.right.maximize.size} />
  </ButtonWindow>
  <ButtonWindow hoverBgColor={"var(--window-close-hover-bg, var(--bg-window-close))"} onButtonClick={closeHandler}>
    <config.right.close.component size={config.right.close.size} />
  </ButtonWindow>
</div>

<style>
  .panel-right {
    display: flex;
    align-items: center;
    gap: var(--window-control-spacing, 0px);
    padding-right: var(--window-control-padding-right, 0px);
    -webkit-app-region: no-drag;
  }

  .panel-right :global(div[role="button"]) {
    width: var(--window-control-size, 40px);
    height: var(--window-control-size, 40px);
    border-radius: var(--window-control-radius, 0px);
  }
</style>
