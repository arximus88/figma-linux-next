<script lang="ts">
  import { ButtonTool, Trash, Flex, FlexItem } from "Common";
  import { InputText } from "Common/Input";

  let { item, onItemRemoveClick = () => {} } = $props();
</script>

<div>
  <FlexItem grow={1}>
    <InputText value={item.switch} onValue={(v) => (item.switch = v)} />
  </FlexItem>
  <Flex width="20px" />
  <FlexItem grow={1}>
    <InputText value={item.value} onValue={(v) => (item.value = v)} />
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
