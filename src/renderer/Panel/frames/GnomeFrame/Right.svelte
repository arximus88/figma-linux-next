<script lang="ts">
  import { ButtonWindow } from "Common/Buttons";
  import { GnomeMenu, GnomeMinimize, GnomeMaximize, GnomeClose } from "Icons";
  import { tabs, isMenuOpen } from "../../store";

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
  <div class="menu-btn">
    <ButtonWindow
      padding="0"
      isActive={isMenuOpen.value}
      hoverBgColor="rgba(255,255,255,0.08)"
      activeBgColor="rgba(255,255,255,0.12)"
      onButtonClick={clickMenu}
    >
      <GnomeMenu size="16" />
    </ButtonWindow>
  </div>

  <div class="close-group">
    <ButtonWindow
      padding="0"
      normalBgColor="rgba(255,255,255,0.06)"
      hoverBgColor="rgba(255,255,255,0.12)"
      activeBgColor="rgba(255,255,255,0.18)"
      onButtonClick={() => window.figmaApi.send("windowMinimize")}
    >
      <GnomeMinimize size="24" />
    </ButtonWindow>

    <ButtonWindow
      padding="0"
      normalBgColor="rgba(255,255,255,0.06)"
      hoverBgColor="rgba(255,255,255,0.12)"
      activeBgColor="rgba(255,255,255,0.18)"
      onButtonClick={() => window.figmaApi.send("windowMaximize")}
    >
      <GnomeMaximize size="24" />
    </ButtonWindow>

    <ButtonWindow
      padding="0"
      normalBgColor="rgba(255,255,255,0.06)"
      hoverBgColor="#c01c28"
      activeBgColor="#a01020"
      onButtonClick={closeHandler}
    >
      <GnomeClose size="24" />
    </ButtonWindow>
  </div>
</div>

<style>
  .controls {
    display: flex;
    align-items: center;
    gap: 12px;
    -webkit-app-region: no-drag;
  }

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
