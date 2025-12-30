<script lang="ts">
  import { Text, Flex, Button } from "Common";

  export let text: string;
  export let disabled: boolean | undefined;
  export let Icon: ConstructorOfATypedSvelteComponent | undefined = undefined;

  export let onItemClick = () => {};

  let color = "var(--fg-overlay)";

  $: {
    color = "var(--fg-overlay)";

    if (typeof disabled === "boolean" && disabled) {
      color = "var(--text-disabled)";
    }
  }
</script>

<Button {disabled} disabledBgColor="transparent" on:buttonClick={onItemClick}>
  <Flex alignItems="center" padding="6px 0" width="100%">
    <Flex width="14px" />
    {#if Icon}
      <Icon {color} />
      <Flex width="8px" />
    {/if}
    <Text size="var(--text-size-popup)" {color} {disabled}>{text}</Text>
    <Flex width="20px" />
  </Flex>
</Button>

<style>
</style>
