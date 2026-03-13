# Svelte 5 Gotchas

## Reactivity

### Object/Array Mutation

```svelte
<script>
  let items = $state(['a', 'b']);

  // ✅ These all work (deep reactivity)
  items.push('c');
  items[0] = 'x';
  items.splice(1, 1);

  // ✅ Reassignment also works
  items = [...items, 'c'];
</script>
```

### Primitives Must Be Reassigned

```svelte
<script>
  let count = $state(0);

  // ✅ Correct
  count = count + 1;
  count++;

  // ❌ This does nothing (no mutation possible)
  // Primitives have no methods to mutate
</script>
```

### Derived Cannot Be Assigned

```svelte
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);

  // ❌ Error: doubled is readonly
  doubled = 10;

  // ✅ Change the source instead
  count = 5;  // doubled becomes 10
</script>
```

## Props

### Props Are Readonly by Default

```svelte
<script>
  let { count } = $props();

  // ❌ Error: cannot assign to prop
  count = 5;

  // ✅ Use $bindable for two-way binding
  let { count = $bindable(0) } = $props();
  count = 5;  // Now works
</script>
```

### Destructuring Loses Reactivity

```svelte
<script>
  let { user } = $props();

  // ❌ Not reactive - name is a static copy
  let { name } = user;

  // ✅ Access directly for reactivity
  // In template: {user.name}

  // ✅ Or use $derived
  let name = $derived(user.name);
</script>
```

## Effects

### $effect Runs After Mount

```svelte
<script>
  let el;

  // ❌ el is undefined on first run
  $effect(() => {
    console.log(el.offsetHeight);  // Error!
  });

  // ✅ Guard against undefined
  $effect(() => {
    if (!el) return;
    console.log(el.offsetHeight);
  });
</script>

<div bind:this={el}>Content</div>
```

### $effect Tracks Dependencies Automatically

```svelte
<script>
  let count = $state(0);
  let other = $state(0);

  // Runs when `count` changes (it's read inside)
  $effect(() => {
    console.log(count);
  });

  // ❌ Won't track `other` - not read inside
  $effect(() => {
    console.log(count);
    // `other` not tracked because not accessed
  });

  // ✅ Access dependencies you want to track
  $effect(() => {
    console.log(count, other);
  });
</script>
```

### Avoid Infinite Loops

```svelte
<script>
  let count = $state(0);

  // ❌ Infinite loop: reads and writes same state
  $effect(() => {
    count = count + 1;
  });

  // ✅ Use untrack for writes that shouldn't re-trigger
  import { untrack } from 'svelte';
  $effect(() => {
    const current = count;
    untrack(() => {
      someOtherState = current;
    });
  });
</script>
```

## Events

### No Event Modifiers

```svelte
<!-- ❌ Svelte 4 modifiers don't exist -->
<button on:click|preventDefault|stopPropagation={handler}>

<!-- ✅ Handle in the function -->
<button onclick={e => {
  e.preventDefault();
  e.stopPropagation();
  handler(e);
}}>
```

### Event Types Changed

```svelte
<!-- ❌ on:click -->
<button on:click={handler}>

<!-- ✅ onclick (lowercase, no colon) -->
<button onclick={handler}>

<!-- Same for all events -->
<input oninput={handler} />
<form onsubmit={handler}>
<div onmouseenter={handler}>
```

## Snippets

### Children is a Snippet, Not Slot

```svelte
<script>
  let { children } = $props();
</script>

<!-- ❌ Old slot syntax -->
<slot />

<!-- ✅ Render the children snippet -->
{@render children?.()}
```

### Snippets Can Take Parameters

```svelte
<!-- Parent -->
<List {items}>
  {#snippet item(data, index)}
    <span>{index}: {data.name}</span>
  {/snippet}
</List>

<!-- List.svelte -->
<script>
  let { items, item } = $props();
</script>

{#each items as data, index}
  {@render item(data, index)}
{/each}
```

## Bindings

### bind:this Still Works

```svelte
<script>
  let canvas;

  $effect(() => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
  });
</script>

<canvas bind:this={canvas}></canvas>
```

### bind:value Works with $bindable

```svelte
<!-- Child needs $bindable for parent to bind -->
<script>
  let { value = $bindable('') } = $props();
</script>
<input bind:value />

<!-- Parent can then bind -->
<Child bind:value={name} />
```
