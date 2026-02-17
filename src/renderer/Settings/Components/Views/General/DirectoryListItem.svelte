<script lang="ts">
  let { text, onItemClick = () => {}, onItemRemoveClick = () => {} } = $props();
  import { ButtonTool, Text, Close, Flex } from "Common";

</script>

<div>
  <ButtonTool normalBgColor="tarsparent" onButtonClick={onItemRemoveClick}>
    <Close color="var(--text)" size="16" />
  </ButtonTool>
  <Flex width="10px" />
  <Text onmouseup={onItemClick}>{text}</Text>
</div>

<style>
  div {
    display: flex;
    user-select: none;
    margin-bottom: 10px;
  }
</style>
