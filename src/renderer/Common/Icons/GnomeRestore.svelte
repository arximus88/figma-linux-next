<script>
  export let size = "24";
  export let color = "currentColor";
  export let strokeWidth = "2";
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <rect x="7" y="5" width="12" height="12" rx="2" stroke={color} stroke-width={strokeWidth} stroke-opacity="0.5"/>
  <rect x="5" y="7" width="12" height="12" rx="2" stroke={color} stroke-width={strokeWidth} fill="transparent"/>
</svg>
