<script lang="ts">
  import { ipcRenderer } from "electron";
  import { Minimize, Maximize, Close, Corner } from "Icons";
  import { ButtonWindow } from "Common/Buttons";
  import { tabs, isMenuOpen } from "../store";

  function clickMenu() {
    if ($isMenuOpen) {
      return;
    }

    ipcRenderer.send("openMainMenu");
    isMenuOpen.toggle();
  }

  function closeHandler() {
    ipcRenderer.send("windowClose", $tabs);
  }
</script>

<div class="panel-right">
  <ButtonWindow isActive={$isMenuOpen} onButtonClick={clickMenu}>
    <Corner size="14" />
  </ButtonWindow>
  <ButtonWindow onButtonClick={() => ipcRenderer.send("windowMinimize")}>
    <Minimize size="16" />
  </ButtonWindow>
  <ButtonWindow onButtonClick={() => ipcRenderer.send("windowMaximize")}>
    <Maximize size="16" />
  </ButtonWindow>
  <ButtonWindow hoverBgColor={"var(--bg-window-close)"} onButtonClick={closeHandler}>
    <Close size="16" />
  </ButtonWindow>
</div>

<style>
  .panel-right {
    display: flex;
    align-items: stretch;
    gap: var(--window-control-spacing, 0px);
    padding-right: 4px;
    -webkit-app-region: no-drag;
  }

  .panel-right :global(button) {
    width: var(--window-control-size, 40px);
    height: var(--window-control-size, 40px);
    border-radius: var(--window-control-radius, 0px);
  }
</style>
