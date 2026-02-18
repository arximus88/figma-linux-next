<script lang="ts">
  let { onCloseSettings } = $props();
  import { onMount} from "svelte";
  import { HeaderModal, Button, CloseModal, FlexItem } from "Common";
  import { TabView, TabViewHeaderItem } from "Common/TabView";
  import { General } from "./Views/General";


  import { settings, modalBounds } from "../store";

  let items: Types.SetingsTabItem[] = $derived.by(() => {
    const list = [
      {
        id: "general",
        text: "General",
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
  settingsBody {
    position: relative;
    display: block;
    scroll-behavior: smooth;
    height: calc(80vh - 46px);
  }
</style>
