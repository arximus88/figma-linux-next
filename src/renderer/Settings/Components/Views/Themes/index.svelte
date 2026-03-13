<script lang="ts">
  let { zIndex, onSetSettingsTabViewIndex } = $props();
  import { themes, settings, modalBounds } from "../../../store";
  import { DropDown, Flex, Grid } from "Common";
  import { DEFAULT_THEME } from "Const";

  import ThemeItem from "./ThemeItem.svelte";


  function onApplyTheme(event: CustomEvent<SvelteEvents.ApplyTheme>) {
    const themeId = event.detail.themeId;
    const theme: Themes.Theme = structuredClone(
      $themes.find((theme) => theme.id === themeId),
    );

    window.figmaApi.send("changeTheme", theme);
    $settings.theme.currentTheme = themeId;
  }

  function onUseColorPalette(event: CustomEvent<SvelteEvents.ApplyTheme>) {
    const themeId = event.detail.themeId;
    // Implementation for palette usage if needed for internal themes
  }

  let zoomViewHeight: number = $state(0);
  $effect(() => {
    if ($modalBounds) {
      zoomViewHeight = $modalBounds.height - 94;
    }
  });
</script>

  <div style={`z-index: ${zIndex}; height: ${zoomViewHeight}px;`}>
  <DropDown
    title="Repository themes"
    isEmpty={$themes.length === 0}
    bind:open={$settings.app.themeDropdownOpen}
  >
    <Grid columns="repeat(auto-fit, minmax(300px, 1fr))" gap="2vmin" padding="12px 0 0 0">
      {#if $themes.length > 0}
        {#each $themes as theme (theme.id)}
          <ThemeItem
            onUseColorPalette={onUseColorPalette}
            onApplyTheme={onApplyTheme}
            {theme}
            bind:currentThemeId={$settings.theme.currentTheme}
          />
        {/each}
        {#if $themes.length < 6}
          {#each Array(6 - $themes.length) as _, i (i)}
            <themeFake></themeFake>
          {/each}
        {/if}
      {/if}
    </Grid>
  </DropDown>
</div>

<style>
  div {
    position: absolute;
    width: -webkit-fill-available;
    background-color: var(--bg-panel);
    overflow: auto;
    padding: 32px 32px 8px 32px;
    user-select: none;
  }
  themeFake {
    display: block;
  }
</style>
