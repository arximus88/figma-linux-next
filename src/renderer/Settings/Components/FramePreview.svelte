<script lang="ts">
  // A miniature of the real tab strip, drawn from the same icon config
  // (Utils/Render/frameTheme) and --frame-* palette (theme.css) the panel uses,
  // so it follows light/dark and stays true when a frame changes. No
  // screenshots: those would go stale with the first frame tweak.
  import { getFrameConfig } from "Utils/Render/frameTheme";

  let { style }: { style: Types.FrameStyle } = $props();

  const cfg = $derived(getFrameConfig(style));
  const Home = $derived(cfg.left.home.component);
  const Plus = $derived(cfg.left.plus.component);
  const Menu = $derived(cfg.right.menu?.component);
  const Min = $derived(cfg.right.minimize.component);
  const Max = $derived(cfg.right.maximize.component);
  const Close = $derived(cfg.right.close.component);

  // Icons are drawn at their panel size × this, to fit a 30px strip.
  const SCALE = 0.7;
  const px = (size: string) => String(Math.round(Number(size) * SCALE));
</script>

<div class="frame-preview" data-frame={style} aria-hidden="true">
  <div class="strip">
    <span class="btn home"><Home size={px(cfg.left.home.size)} color="var(--frame-fg)" /></span>
    <span class="btn"><Plus size={px(cfg.left.plus.size)} color="var(--frame-fg)" /></span>
    <span class="tab active"><span class="dot"></span>Design</span>
    <span class="tab" title="Inactive tab"><span class="dot muted"></span></span>
    <span class="spacer"></span>
    {#if Menu && cfg.right.menu}
      <span class="btn"><Menu size={px(cfg.right.menu.size)} color="var(--frame-fg)" /></span>
    {/if}
    <span class="btn ctl"><Min size={px(cfg.right.minimize.size)} color="var(--frame-fg)" /></span>
    <span class="btn ctl"><Max size={px(cfg.right.maximize.size)} color="var(--frame-fg)" /></span>
    <span class="btn ctl"><Close size={px(cfg.right.close.size)} color="var(--frame-fg)" /></span>
  </div>
  <div class="canvas"></div>
</div>

<style>
  .frame-preview {
    overflow: hidden;
    border: 1px solid var(--borders);
    border-radius: 6px;
    background: var(--frame-bg);
  }
  .strip {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 30px;
    padding: 0 4px;
    color: var(--frame-fg);
    background: var(--frame-bg);
    box-shadow: inset 0 -1px 0 var(--frame-edge);
    font-size: 10px;
    white-space: nowrap;
    overflow: hidden;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 20px;
    flex-shrink: 0;
  }
  .tab {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 100%;
    padding: 0 7px;
    color: var(--frame-fg-muted);
    flex-shrink: 0;
  }
  .tab.active {
    color: var(--frame-fg);
    background: var(--frame-tab-active);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    background: var(--tabicon-design);
    flex-shrink: 0;
  }
  .dot.muted {
    background: var(--frame-fg-muted);
  }
  .spacer {
    flex: 1;
  }
  .canvas {
    height: 46px;
    background: var(--bg-panel);
  }

  /* Adwaita: rounded tabs inset in the bar, window controls on discs. */
  [data-frame="gnome"] .tab {
    height: 22px;
    border-radius: 6px;
  }
  [data-frame="gnome"] .ctl {
    width: 16px;
    min-width: 16px;
    height: 16px;
    margin-left: 3px;
    border-radius: 50%;
    background: var(--frame-btn-normal);
  }

  /* Breeze: square-topped tabs with the accent line on the active one. */
  [data-frame="kde"] .tab {
    border-radius: 3px 3px 0 0;
  }
  [data-frame="kde"] .tab.active {
    box-shadow: inset 0 2px 0 var(--frame-accent);
  }

  /* Legacy Windows: flat everything. */
  [data-frame="windows"] .ctl {
    min-width: 19px;
  }
</style>
