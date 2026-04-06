<script lang="ts">
  import { ButtonTool, Trash, Flex, FlexItem } from "Common";
  import { InputText } from "Common/Input";

  let { item, onItemRemoveClick = () => {} } = $props();

  let sw = $state(item.switch);
  let val = $state(item.value ?? "");

  $effect(() => {
    item.switch = sw;
    item.value = val;
  });
</script>

<div>
  <FlexItem grow={1}>
    <InputText bind:value={sw} />
  </FlexItem>
  <Flex width="20px" />
  <FlexItem grow={1}>
    <InputText bind:value={val} />
  </FlexItem>
  <Flex width="20px" />
  <ButtonTool normalBgColor="tarsparent" onButtonClick={onItemRemoveClick}>
    <Trash color="var(--text)" size="16" />
  </ButtonTool>
  <Flex width="20px" />
</div>

<style>
  div {
    display: flex;
    user-select: none;
    margin-bottom: 10px;
  }
</style>
