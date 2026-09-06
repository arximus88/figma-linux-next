<script lang="ts">
  import { ButtonTool, ButtonWindow } from "Common/Buttons";
  import { getFrameConfig } from "Utils/Render/frameTheme";
  import { onClickNewProject } from "../Components/utils";

  /**
   * The "+" that opens the New file tab. Rendered either in the left corner
   * (FramedLeft) or right after the last tab (FramedTabs) depending on
   * `app.newTabButtonAfterTabs`; the frame decides its shape.
   */
  let { style }: { style: Types.FrameStyle } = $props();

  const cfg = $derived(getFrameConfig(style));
  const Plus = $derived(cfg.left.plus.component);
  // Gnome's "+" is a round ButtonWindow like its other controls; KDE and
  // Windows use the flat ButtonTool.
  const usesToolPlus = $derived(style !== "gnome");
</script>

<span class="new-tab-btn">
  {#if usesToolPlus}
    <ButtonTool
      padding={style === "kde" ? "0" : "0 10px"}
      normalBgColor={style === "kde" ? "transparent" : "var(--bg-header)"}
      hoverBgColor={style === "kde" ? "var(--frame-btn-hover)" : "var(--bg-tab-hover)"}
      onButtonClick={onClickNewProject}
    >
      <Plus size={cfg.left.plus.size} color="currentColor" />
    </ButtonTool>
  {:else}
    <ButtonWindow padding="0" hoverBgColor="var(--frame-btn-hover)" onButtonClick={onClickNewProject}>
      <Plus size={cfg.left.plus.size} color="currentColor" />
    </ButtonWindow>
  {/if}
</span>

<style>
  .new-tab-btn {
    display: flex;
    align-items: center;
    align-self: stretch;
    -webkit-app-region: no-drag;
  }

  /* Anchored on #panel so these win over the generic per-frame button rules
     of whichever container hosts the button (.left or .tabs). */
  :global(#panel[data-frame="gnome"]) .new-tab-btn :global(div[role="button"]) {
    width: 34px;
    height: 34px;
    border-radius: 9px;
  }
  /* KDE: a round control like the ones on the right. */
  :global(#panel[data-frame="kde"]) .new-tab-btn :global(div[role="button"]) {
    width: 32px;
    height: 32px;
    border-radius: 50%;
  }
  /* Windows: flat, full panel height. */
  :global(#panel[data-frame="windows"]) .new-tab-btn :global(div[role="button"]) {
    width: auto;
    height: 40px;
    border-radius: 0;
  }
</style>
