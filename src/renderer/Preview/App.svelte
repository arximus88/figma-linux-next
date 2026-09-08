<script lang="ts">
  import TabIcon from "../Panel/Components/TabIcon.svelte";

  /**
   * The tab hover card. Lives in its own WebContentsView (Main/Ui/TabPreviewView)
   * and only ever renders what main sends: title, trimmed URL, the tab's last
   * thumbnail (none for the active tab — it is already on screen), plus the
   * frame and theme to dress like the panel above it.
   */
  import { relativeTime } from "Utils/Common/tabPreviewData";

  let data = $state<Types.TabPreviewPayload | null>(null);
  // Figma's thumbnail URL is signed and expires; when it fails to load the
  // card falls back to the screenshot, if there is one.
  let previewBroken = $state(false);

  window.figmaApi.on("tabPreviewData", (payload: Types.TabPreviewPayload) => {
    if (payload.preview?.thumbnailUrl !== data?.preview?.thumbnailUrl) previewBroken = false;
    data = payload;
    document.documentElement.setAttribute("data-theme", payload.theme);
  });

  const meta = $derived.by(() => {
    const edited = data?.preview?.editedAt ? relativeTime(data.preview.editedAt) : "";
    return edited ? `Edited ${edited}` : (data?.url ?? "");
  });
  const showPreview = $derived(!!data?.preview && !previewBroken);
</script>

{#if data}
  {#key data.id}
    <div class="card" data-frame={data.frame} data-tab-id={data.id}>
      <div class="head">
        <span class="icon">
          <TabIcon
            editorType={data.editorType}
            isLibrary={data.isLibrary}
            title={data.title}
            active={true}
            size="16"
          />
        </span>
        <div class="text">
          <span class="title">{data.title || "Untitled"}</span>
          {#if meta}
            <span class="url">{meta}</span>
          {/if}
        </div>
      </div>
      {#if showPreview && data.preview}
        <div class="shot preview" style:background={data.preview.backgroundColor ?? "transparent"}>
          <img
            src={data.preview.thumbnailUrl}
            class:cover={data.preview.fullWidth}
            alt=""
            draggable="false"
            onerror={() => (previewBroken = true)}
          />
        </div>
      {:else if data.image}
        <img class="shot" src={data.image} alt="" draggable="false" />
      {/if}
    </div>
  {/key}
{/if}

<style>
  :global(html),
  :global(body) {
    margin: 0;
    background: transparent;
    overflow: hidden;
  }
  :global(body) {
    /* Matches CARD_PAD_* in Utils/Main/tabPreview.ts: room for the shadow. */
    padding: 4px 12px 16px;
    font-family: system-ui, -apple-system, "Segoe UI", "Adwaita Sans", Cantarell, Ubuntu, Roboto, sans-serif;
    user-select: none;
  }

  .card {
    width: 280px;
    box-sizing: border-box;
    overflow: hidden;
    background: var(--bg-panel);
    color: var(--text);
    border: 1px solid var(--borders);
    border-radius: 12px;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.28);
    animation: card-in 120ms cubic-bezier(0.215, 0.61, 0.355, 1);
  }
  /* Breeze tooltips are square-ish with a thin frame; the Windows chrome is softer. */
  .card[data-frame="kde"] {
    border-radius: 3px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  }
  .card[data-frame="windows"],
  .card[data-frame="macos"] {
    border-radius: 8px;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 56px;
    box-sizing: border-box;
    padding: 0 12px;
  }
  .icon {
    display: flex;
    flex-shrink: 0;
  }
  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 2px;
  }
  .title,
  .url {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .title {
    font-size: 13px;
    font-weight: 600;
  }
  .url {
    font-size: 11px;
    color: var(--text-disabled);
  }

  .shot {
    display: block;
    width: 100%;
    height: 158px;
    object-fit: cover;
    object-position: center;
    border-top: 1px solid var(--borders);
  }
  /* Figma's thumbnail is a fitted render of the page: letterbox it on the
     file's own background, as the file browser does; `fullWidth` ones crop. */
  .preview {
    box-sizing: border-box;
  }
  .preview img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: center;
  }
  .preview img.cover {
    object-fit: cover;
  }

  @keyframes card-in {
    from {
      opacity: 0;
      transform: translateY(-2px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .card {
      animation: none;
    }
  }
</style>
