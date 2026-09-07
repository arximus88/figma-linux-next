<script lang="ts">
  import { ButtonWindow } from "Common/Buttons";
  import { getFrameConfig } from "Utils/Render/frameTheme";
  import { isMenuOpen, tabs, windowControls } from "../store";

  let { style }: { style: Types.FrameStyle } = $props();

  const cfg = $derived(getFrameConfig(style));
  // Gnome groups the window controls in .menu-btn/.close-group wrappers;
  // Windows and KDE lay them out flat in .controls (KDE rounds them via CSS).
  const grouped = $derived(style === "gnome");

  const Menu = $derived(cfg.right.menu?.component);
  const Min = $derived(cfg.right.minimize.component);
  const Max = $derived(cfg.right.maximize.component);
  const Close = $derived(cfg.right.close.component);

  // All colours resolve through the --frame-* palette (theme.css) so the
  // controls follow light/dark. Gnome's min/max/close sit on a faint disc
  // (--frame-btn-normal); the flat frames have no resting background.
  const flatNormal = $derived(grouped ? "var(--frame-btn-normal)" : "transparent");

  function clickMenu() {
    if (isMenuOpen.value) return;
    window.figmaApi.send("openMainMenu");
    isMenuOpen.toggle();
  }

  function closeHandler() {
    window.figmaApi.send("windowClose", $state.snapshot(tabs.value));
  }
</script>

{#snippet menuButton()}
  {#if Menu}
    <ButtonWindow
      padding="0"
      isActive={isMenuOpen.value}
      hoverBgColor="var(--frame-btn-hover)"
      activeBgColor="var(--frame-btn-active)"
      onButtonClick={clickMenu}
    >
      <Menu size={cfg.right.menu?.size} color="currentColor" />
    </ButtonWindow>
  {/if}
{/snippet}

{#snippet windowButtons()}
  {#if !windowControls.hideMinMax}
    <ButtonWindow
      padding="0"
      normalBgColor={flatNormal}
      hoverBgColor="var(--frame-btn-hover)"
      activeBgColor="var(--frame-btn-active)"
      onButtonClick={() => window.figmaApi.send("windowMinimize")}
    >
      <Min size={cfg.right.minimize.size} color="currentColor" />
    </ButtonWindow>

    <ButtonWindow
      padding="0"
      normalBgColor={flatNormal}
      hoverBgColor="var(--frame-btn-hover)"
      activeBgColor="var(--frame-btn-active)"
      onButtonClick={() => window.figmaApi.send("windowMaximize")}
    >
      <Max size={cfg.right.maximize.size} color="currentColor" />
    </ButtonWindow>
  {/if}

  <span class="close-btn">
    <ButtonWindow
      padding="0"
      normalBgColor={flatNormal}
      hoverBgColor="var(--frame-close-hover)"
      activeBgColor="var(--frame-close-active)"
      onButtonClick={closeHandler}
    >
      <Close size={cfg.right.close.size} color="currentColor" />
    </ButtonWindow>
  </span>
{/snippet}

<div class="controls">
  {#if grouped}
    <div class="menu-btn">
      {@render menuButton()}
    </div>
    <div class="close-group">
      {@render windowButtons()}
    </div>
  {:else}
    {@render menuButton()}
    {@render windowButtons()}
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
  :global([data-frame="kde"]) .controls {
    align-items: center;
    gap: 4px;
  }

  /* The close glyph flips to the on-red colour while hovered/pressed. */
  .close-btn {
    display: contents;
  }
  .close-btn :global(div[role="button"]:hover),
  .close-btn :global(div[role="button"].button__active) {
    color: var(--frame-close-fg);
  }

  /* Windows: uniform flat buttons */
  :global([data-frame="windows"]) .controls :global(div[role="button"]) {
    width: 40px;
    height: 40px;
    border-radius: 0px;
  }

  /* KDE / Breeze: circular hover halo behind each control */
  :global([data-frame="kde"]) .controls :global(div[role="button"]) {
    width: 32px;
    height: 32px;
    border-radius: 50%;
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
