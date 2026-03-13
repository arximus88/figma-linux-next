<script lang="ts">
  import Left from "./Left.svelte";
  import Right from "./Right.svelte";
  import Tabs from "./Tabs.svelte";

  let { zoom = 1 } = $props<{ zoom?: number }>();
</script>

<div id="panel" data-frame="gnome" style:zoom>
  <Left />
  <Tabs />
  <Right />
</div>

<style>
  #panel {
    display: flex;
    height: 40px;
    background: #2e2e32;
    padding-top: 0;
    padding-bottom: 0;
    padding-left: 3px;
    padding-right: 8px;
    gap: 12px;
    align-items: center;
    box-shadow: 0 -1px 0px #424242 inset;
    -webkit-app-region: drag;
    width: 100%;
    box-sizing: border-box;
  }

  :global(html),
  :global(body) {
    margin: 0;
    padding: 0;
    border: none;
    --text-size-tab: 13px;
    --text-size-tab-view: 13px;
    --text-size-popup: 13px;
    font-family: "Inter", sans-serif;
    font-size: var(--fontSize);
    font-weight: 400;
  }
</style>
