<script lang="ts">
  import Left from "./Left.svelte";
  import Right from "./Right.svelte";
  import Tabs from "./Tabs.svelte";

  let { zoom = 1 } = $props<{ zoom?: number }>();
</script>

<div id="panel" style:zoom>
  <Left />
  <Tabs />
  <Right />
</div>

<style>
  #panel {
    display: flex;
    height: 46px;
    background: #2e2e32;
    border-bottom: 1px solid rgba(0, 0, 0, 0.24);
    padding: 0 9px;
    gap: 12px;
    align-items: center;
    border-radius: 12px 12px 0 0;
    box-shadow: 0px 1px 2px 0px rgba(0, 0, 0, 0.24);
    -webkit-app-region: drag;
    width: 100%;
    box-sizing: border-box;
  }

  :global(html),
  :global(body) {
    margin: 0;
    padding: 0;
    border: none;
    --text-size-tab: 14px;
    --text-size-tab-view: 14px;
    --text-size-popup: 14px;
    font-family: "Inter", sans-serif;
    font-size: var(--fontSize);
    font-weight: 400;
  }
</style>
