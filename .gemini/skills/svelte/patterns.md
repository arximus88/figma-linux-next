# Svelte 5 Component Patterns

## Forwarding Props and Events

```svelte
<!-- Button.svelte -->
<script>
  let { children, variant = 'default', ...rest } = $props();
</script>

<button class="btn btn-{variant}" {...rest}>
  {@render children()}
</button>
```

## Controlled Input

```svelte
<!-- TextInput.svelte -->
<script>
  let { value = $bindable(''), oninput, ...rest } = $props();
</script>

<input
  bind:value
  oninput={e => {
    oninput?.(e);
  }}
  {...rest}
/>

<!-- Usage -->
<TextInput bind:value={name} />
```

## Context API

```svelte
<!-- Provider.svelte -->
<script>
  import { setContext } from 'svelte';

  let { children } = $props();
  let count = $state(0);

  setContext('counter', {
    get count() { return count },  // getter for reactive access
    increment: () => count++
  });
</script>

{@render children()}

<!-- Consumer.svelte -->
<script>
  import { getContext } from 'svelte';
  const { count, increment } = getContext('counter');
</script>

<button onclick={increment}>{count}</button>
```

## Reactive Context (Alternative)

```svelte
<!-- Provider.svelte -->
<script>
  import { setContext } from 'svelte';

  let { children } = $props();
  let state = $state({ count: 0, user: null });

  setContext('app', state);  // pass the $state object directly
</script>

<!-- Consumer.svelte -->
<script>
  import { getContext } from 'svelte';
  const state = getContext('app');
</script>

<!-- Reactive because state is a $state proxy -->
<p>{state.count}</p>
```

## Component with Actions

```svelte
<script>
  let { children, onmount } = $props();
  let element;

  $effect(() => {
    if (element && onmount) {
      return onmount(element);  // return cleanup function
    }
  });
</script>

<div bind:this={element}>
  {@render children()}
</div>
```

## Conditional Rendering with Snippets

```svelte
<!-- Modal.svelte -->
<script>
  let { open, onclose, title, children, footer } = $props();
</script>

{#if open}
  <div class="modal-backdrop" onclick={onclose}>
    <div class="modal" onclick={e => e.stopPropagation()}>
      <header>
        {#if typeof title === 'string'}
          <h2>{title}</h2>
        {:else}
          {@render title?.()}
        {/if}
      </header>
      <main>{@render children()}</main>
      {#if footer}
        <footer>{@render footer()}</footer>
      {/if}
    </div>
  </div>
{/if}
```

## List with Selection

```svelte
<script>
  let { items, selected = $bindable(null), onselect } = $props();

  function select(item) {
    selected = item;
    onselect?.(item);
  }
</script>

<ul>
  {#each items as item (item.id)}
    <li>
      <button
        class:selected={selected === item}
        onclick={() => select(item)}
      >
        {item.name}
      </button>
    </li>
  {/each}
</ul>
```

## Async Data Loading

```svelte
<script>
  let { load } = $props();

  let data = $state(null);
  let error = $state(null);
  let loading = $state(true);

  $effect(() => {
    loading = true;
    error = null;

    load()
      .then(result => data = result)
      .catch(e => error = e)
      .finally(() => loading = false);
  });
</script>

{#if loading}
  <p>Loading...</p>
{:else if error}
  <p>Error: {error.message}</p>
{:else}
  <slot {data} />
{/if}
```

## Debounced Input

```svelte
<script>
  let { value = $bindable(''), delay = 300, onchange } = $props();
  let internal = $state(value);
  let timeout;

  $effect(() => {
    internal = value;  // sync from parent
  });

  function handleInput(e) {
    internal = e.target.value;
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      value = internal;
      onchange?.(internal);
    }, delay);
  }
</script>

<input value={internal} oninput={handleInput} />
```
