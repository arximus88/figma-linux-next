<script lang="ts">
  import { ButtonWindow } from "Common/Buttons";
  import { getFrameConfig } from "Utils/Render/frameTheme";
  import { isMenuOpen, tabs, windowControls } from "../store";

  let { style }: { style: Types.FrameStyle } = $props();

  const cfg = $derived(getFrameConfig(style));
  // Gnome groups the window controls in .menu-btn/.close-group wrappers;
  // Windows lays them out flat in .controls.
  const grouped = $derived(style === "gnome");

  const Menu = $derived(cfg.right.menu?.component);
  const Min = $derived(cfg.right.minimize.component);
  const Max = $derived(cfg.right.maximize.component);
  const Close = $derived(cfg.right.close.component);

  function clickMenu() {
    if (isMenuOpen.value) return;
    window.figmaApi.send("openMainMenu");
    isMenuOpen.toggle();
  }

  function closeHandler() {
    window.figmaApi.send("windowClose", $state.snapshot(tabs.value));
  }
</script>

<div class="controls">
  {#if grouped}
    <div class="menu-btn">
      {#if Menu}
        <ButtonWindow
          padding="0"
          isActive={isMenuOpen.value}
          hoverBgColor="rgba(255,255,255,0.08)"
          activeBgColor="rgba(255,255,255,0.12)"
          onButtonClick={clickMenu}
        >
          <Menu size={cfg.right.menu?.size} />
        </ButtonWindow>
      {/if}
    </div>

    <div class="close-group">
      {#if !windowControls.hideMinMax}
        <ButtonWindow
          padding="0"
          normalBgColor="rgba(255,255,255,0.06)"
          hoverBgColor="rgba(255,255,255,0.12)"
          activeBgColor="rgba(255,255,255,0.18)"
          onButtonClick={() => window.figmaApi.send("windowMinimize")}
        >
          <Min size={cfg.right.minimize.size} />
        </ButtonWindow>

        <ButtonWindow
          padding="0"
          normalBgColor="rgba(255,255,255,0.06)"
          hoverBgColor="rgba(255,255,255,0.12)"
          activeBgColor="rgba(255,255,255,0.18)"
          onButtonClick={() => window.figmaApi.send("windowMaximize")}
        >
          <Max size={cfg.right.maximize.size} />
        </ButtonWindow>
      {/if}

      <ButtonWindow
        padding="0"
        normalBgColor="rgba(255,255,255,0.06)"
        hoverBgColor="#c01c28"
        activeBgColor="#a01020"
        onButtonClick={closeHandler}
      >
        <Close size={cfg.right.close.size} />
      </ButtonWindow>
    </div>
  {:else}
    {#if Menu}
      <ButtonWindow
        padding="0"
        isActive={isMenuOpen.value}
        hoverBgColor="rgba(255,255,255,0.1)"
        activeBgColor="rgba(255,255,255,0.15)"
        onButtonClick={clickMenu}
      >
        <Menu size={cfg.right.menu?.size} />
      </ButtonWindow>
    {/if}

    {#if !windowControls.hideMinMax}
      <ButtonWindow
        padding="0"
        hoverBgColor="rgba(255,255,255,0.1)"
        activeBgColor="rgba(255,255,255,0.15)"
        onButtonClick={() => window.figmaApi.send("windowMinimize")}
      >
        <Min size={cfg.right.minimize.size} />
      </ButtonWindow>

      <ButtonWindow
        padding="0"
        hoverBgColor="rgba(255,255,255,0.1)"
        activeBgColor="rgba(255,255,255,0.15)"
        onButtonClick={() => window.figmaApi.send("windowMaximize")}
      >
        <Max size={cfg.right.maximize.size} />
      </ButtonWindow>
    {/if}

    <ButtonWindow
      padding="0"
      hoverBgColor="#c42b1c"
      activeBgColor="#a01010"
      onButtonClick={closeHandler}
    >
      <Close size={cfg.right.close.size} />
    </ButtonWindow>
  {/if}
</div>

<style>
  .controls {
    display: flex;
    -webkit-app-region: no-drag;
  }

  :global([data-frame="gnome"]) .controls {
    align-items: center;
    gap: 12px;
  }
  :global([data-frame="windows"]) .controls {
    align-items: stretch;
    gap: 0px;
  }

  /* Windows: uniform flat buttons */
  :global([data-frame="windows"]) .controls :global(div[role="button"]) {
    width: 40px;
    height: 40px;
    border-radius: 0px;
  }

  /* Gnome: grouped round buttons */
  .menu-btn :global(div[role="button"]) {
    width: 34px;
    height: 34px;
    border-radius: 9px;
  }

  .close-group {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .close-group :global(div[role="button"]) {
    width: 24px;
    height: 24px;
    border-radius: 20px;
  }
</style>
