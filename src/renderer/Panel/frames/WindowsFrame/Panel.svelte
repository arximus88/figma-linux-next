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
    height: 40px;
    background-color: var(--bg-header);
    border-bottom: none;
    padding: 0;
    gap: 0px;
    align-items: stretch;
    border-radius: 0;
    box-shadow: none;
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
