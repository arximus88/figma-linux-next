import re

with open('src/renderer/Panel/App.svelte', 'r') as f:
    content = f.read()

# Replace getFrameStyleVars import with getting all we need from frameTheme
content = content.replace(
    'import { getFrameStyleVars } from "Utils/Render/frameTheme";',
    'import { setContext } from "svelte";\n  import { getFrameStyleVars, getFrameConfig, isValidFrameStyle } from "Utils/Render/frameTheme";'
)

# Replace the frameStyle validation
old_validation = """    if (!frameStyle || !["windows", "gnome", "macos", "kde"].includes(frameStyle)) {
      frameStyle = "gnome";
    }"""
new_validation = """    frameStyle = isValidFrameStyle(frameStyle) ? frameStyle : "gnome";"""
content = content.replace(old_validation, new_validation)

old_validation2 = """    if (!["windows", "gnome", "macos", "kde"].includes(frameStyle)) {
      frameStyle = "gnome";
    }"""
content = content.replace(old_validation2, new_validation)

# Set the context
context_injection = """  let frameStyleVars = $state(getFrameStyleVars("gnome"));

  setContext("frameTheme", {
    get config() { return getFrameConfig(frameStyle); },
    get vars() { return getFrameStyleVars(frameStyle); },
  });"""

content = content.replace('  let frameStyleVars = $state(getFrameStyleVars("gnome"));', context_injection)

# Remove props from child components
content = content.replace('<Left {frameStyle} />', '<Left />')
content = content.replace('<Tabs {frameStyle} />', '<Tabs />')
content = content.replace('<Right {frameStyle} />', '<Right />')

with open('src/renderer/Panel/App.svelte', 'w') as f:
    f.write(content)
