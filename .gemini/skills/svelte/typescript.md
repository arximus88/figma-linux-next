# Svelte 5 TypeScript Patterns

## Typing Props

```svelte
<script lang="ts">
  // Inline types
  let { name, count = 0 }: { name: string; count?: number } = $props();

  // Interface (preferred for complex props)
  interface Props {
    name: string;
    items: string[];
    onselect?: (item: string) => void;
  }
  let { name, items, onselect }: Props = $props();

  // With rest props
  interface Props {
    variant: 'primary' | 'secondary';
  }
  let { variant, ...rest }: Props & Record<string, unknown> = $props();

  // Generic components
  interface Props<T> {
    items: T[];
    selected?: T;
    onselect?: (item: T) => void;
  }
  let { items, selected, onselect }: Props<T> = $props();
</script>
```

## Typing State

```svelte
<script lang="ts">
  // Primitives (inferred)
  let count = $state(0);

  // Explicit when needed
  let user = $state<User | null>(null);
  let items = $state<string[]>([]);

  // Complex objects
  interface FormState {
    name: string;
    email: string;
    errors: Record<string, string>;
  }
  let form = $state<FormState>({ name: '', email: '', errors: {} });
</script>
```

## Typing Derived

```svelte
<script lang="ts">
  let count = $state(0);

  // Usually inferred
  let doubled = $derived(count * 2);

  // Explicit when needed
  let result = $derived<string | null>(count > 0 ? String(count) : null);

  // Complex derived
  let computed = $derived.by((): ComputedResult => {
    return { value: count, formatted: `Count: ${count}` };
  });
</script>
```

## Typing Bindable Props

```svelte
<script lang="ts">
  // Simple bindable
  let { value = $bindable('') }: { value: string } = $props();

  // Optional bindable
  let { checked = $bindable<boolean>() }: { checked?: boolean } = $props();
</script>
```

## Typing Snippets

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
    header?: Snippet;
    row?: Snippet<[item: Item, index: number]>;  // snippet with params
  }
  let { children, header, row }: Props = $props();
</script>

{@render header?.()}
{#each items as item, i}
  {@render row?.(item, i)}
{/each}
{@render children()}
```

## Typing Event Handlers

```svelte
<script lang="ts">
  // Native events
  function handleClick(e: MouseEvent) { }
  function handleInput(e: Event & { currentTarget: HTMLInputElement }) {
    const value = e.currentTarget.value;
  }

  // Callback props
  interface Props {
    onclick?: (e: MouseEvent) => void;
    onchange?: (value: string) => void;
  }
</script>

<button onclick={handleClick}>Click</button>
<input oninput={e => handleInput(e)} />
```

## Typing Context

```svelte
<script lang="ts" context="module">
  export interface MyContext {
    count: number;
    increment: () => void;
  }
</script>

<script lang="ts">
  import { setContext, getContext } from 'svelte';

  // Setting
  setContext<MyContext>('key', { count: 0, increment: () => {} });

  // Getting
  const ctx = getContext<MyContext>('key');
</script>
```
