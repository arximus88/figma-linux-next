<script lang="ts">
  let { size = "24" } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <rect x="0" y="0" width={size} height={size} rx="12" fill="#38383C" />
  <g transform="translate(4, 4)">
    <path d="M4 10.0088H12V11.9975H4V10.0088Z" fill="#E6E6E7"/>
  </g>
</svg>
