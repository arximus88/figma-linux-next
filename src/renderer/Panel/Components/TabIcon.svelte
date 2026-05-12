<script lang="ts">
  import Design from "Common/Icons/TabType/Design.svelte";
  import Library from "Common/Icons/TabType/Library.svelte";
  import FigJam from "Common/Icons/TabType/FigJam.svelte";
  import Slides from "Common/Icons/TabType/Slides.svelte";
  import Buzz from "Common/Icons/TabType/Buzz.svelte";
  import Site from "Common/Icons/TabType/Site.svelte";
  import Make from "Common/Icons/TabType/Make.svelte";
  import Prototype from "Common/Icons/TabType/Prototype.svelte";
  import NewFile from "Common/Icons/TabType/NewFile.svelte";
  import { NEW_FILE_TAB_TITLE } from "Const";

  let { editorType, isLibrary = false, active = false, title, size = "16" } = $props<{
    editorType?: Types.EditorType;
    isLibrary?: boolean;
    active?: boolean;
    title?: string;
    size?: string;
  }>();

  const isNewFileTab = $derived(title === NEW_FILE_TAB_TITLE);
</script>

{#if isNewFileTab}
  <NewFile {size} />
{:else if editorType === "prototype"}
  <Prototype {active} {size} />
{:else if editorType === "design" && isLibrary}
  <Library {active} {size} />
{:else if editorType === "design"}
  <Design {active} {size} />
{:else if editorType === "figjam"}
  <FigJam {active} {size} />
{:else if editorType === "slides"}
  <Slides {active} {size} />
{:else if editorType === "buzz"}
  <Buzz {active} {size} />
{:else if editorType === "site"}
  <Site {active} {size} />
{:else if editorType === "make"}
  <Make {active} {size} />
{:else}
  <Design {active} {size} />
{/if}
