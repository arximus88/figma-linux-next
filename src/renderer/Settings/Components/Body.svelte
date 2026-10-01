<script lang="ts">
  let { onCloseSettings } = $props();
  import { onMount} from "svelte";
  import { HeaderModal, Button, CloseModal, FlexItem } from "Common";
  import { TabView, TabViewHeaderItem } from "Common/TabView";
  import { General } from "./Views/General";


  import { settings, modalBounds } from "../store";
  import { saveState } from "../autosave.svelte";

  let items: Types.SetingsTabItem[] = $derived.by(() => {
    const list = [
      {
        id: "general",
        text: "Settings",
        itemArgs: {
          padding: "14px 10px",
        },
        item: TabViewHeaderItem,
        bodyComponent: General,
      },
    ];

    return list;
  });

  let currentId = $state("general");
  let currentItem = $derived(items.find((i) => i.id === currentId) || items[0]);

  function onTabItemClick(item: Types.TabItem) {
    currentItem = item as Types.SetingsTabItem;
  }
  function onSetTabViewIndex(event: CustomEvent<SvelteEvents.SetSettingsTabViewIndex>) {
    currentItem = items[event.detail.index];
    currentId = currentItem.id;
  }

  let modal: HTMLElement;
  function getModalBounds() {
    if (!modal) {
      return;
    }
    modalBounds.set(modal.getBoundingClientRect());
  }
  onMount(getModalBounds);
  window.addEventListener("resize", getModalBounds);
</script>

<div bind:this={modal}>
  <HeaderModal bgColor="var(--bg-panel)">
    <FlexItem grow={1}>
      <TabView {items} bind:currentId initItemId={"general"} onItemClick={onTabItemClick} />
    </FlexItem>
    {@const HeaderComponent = currentItem?.headerComponent}
    {#if HeaderComponent}
      <HeaderComponent />
    {/if}
    <Button
      size={32}
      round={3}
      onButtonClick={() => onCloseSettings?.()}
      hoverBgColor="var(--borders)"
    >
      <CloseModal color="var(--text)" />
    </Button>
  </HeaderModal>
  {#if saveState.pendingRestart.length > 0}
    <div class="restart-banner" role="status">
      <span>Restart to apply: {saveState.pendingRestart.join(", ")}</span>
      <button type="button" onclick={() => window.figmaApi.send("restartApp")}>Restart now</button>
    </div>
  {/if}
  <settingsBody>
    {#each items as item (item.id)}
      {@const BodyComponent = item.bodyComponent}
      <BodyComponent
        zIndex={item.id === currentItem.id ? 2 : 0}
        onsetSettingsTabViewIndex={onSetTabViewIndex}
      />
    {/each}
  </settingsBody>
</div>

<style>
  div {
    width: 90vw;
    height: 80vh;
    overflow: hidden;
    background: var(--bg-panel, #2c2c2c);
  }
  .restart-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    height: auto;
    width: auto;
    padding: 8px 16px;
    font-size: 13px;
    color: var(--text);
    background: var(--warning-muted, rgba(255, 171, 0, 0.16));
  }
  .restart-banner button {
    padding: 4px 12px;
    border: 1px solid var(--borders);
    border-radius: 6px;
    background: var(--bg-item, var(--bg-panel));
    color: var(--text);
    font: inherit;
    cursor: pointer;
  }
  settingsBody {
    position: relative;
    display: block;
    scroll-behavior: smooth;
    height: calc(80vh - 46px);
  }
</style>
