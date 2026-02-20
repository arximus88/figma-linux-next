<script lang="ts">
  import { Flex, Button, Sync, Spiner } from "Common";

  import { themesLoaded } from "../../../store";

  function onThemeSync(event: CustomEvent) {
    window.figmaApi.send("syncThemes");
    themesLoaded.set(false);
  }
</script>

<Flex>
  <Button
    onButtonClick={onThemeSync}
    size={32}
    round={3}
    margin={"0 4px 0 0"}
    hoverBgColor="var(--borders)"
  >
    <Spiner spin={!$themesLoaded}>
      <Sync color="var(--text)" />
    </Spiner>
  </Button>
  <Flex width="10px" />
</Flex>

<style>
</style>
