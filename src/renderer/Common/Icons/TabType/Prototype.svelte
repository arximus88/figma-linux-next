<script lang="ts">
  let { active = false, size = "16" } = $props<{ active?: boolean; size?: string }>();
  const color = $derived(active ? "#34D399" : "#E6E6E7");
</script>

<svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path
    d="M4 3.5V12.5C4 13.2877 4.86395 13.7691 5.53273 13.3543L12.7903 8.85428C13.4258 8.46006 13.4258 7.53994 12.7903 7.14572L5.53273 2.6457C4.86395 2.23087 4 2.7123 4 3.5Z"
    stroke={color}
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
