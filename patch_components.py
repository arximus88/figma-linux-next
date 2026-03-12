import re

files_to_patch = [
    'src/renderer/Panel/Components/Left.svelte',
    'src/renderer/Panel/Components/Tabs.svelte',
    'src/renderer/Panel/Components/Right.svelte'
]

for filename in files_to_patch:
    with open(filename, 'r') as f:
        content = f.read()

    # Remove let { frameStyle...
    content = re.sub(r'let \{ frameStyle .*? = \$props\(\);\n', '', content)

    # Replace import { getFrameConfig } ...
    content = re.sub(r'import \{ getFrameConfig \} from "Utils/Render/frameTheme";\n', '', content)

    # Replace const config = $derived(getFrameConfig(frameStyle));
    content = re.sub(r'const config = \$derived\(getFrameConfig\(frameStyle\)\);\n', '', content)

    # Add context extraction
    context_code = """import { getContext } from "svelte";
  import type { FrameTheme } from "Utils/Render/frameTheme";
  const theme = getContext<FrameTheme>("frameTheme");
  const config = $derived(theme.config);\n"""

    # Insert after first import
    content = re.sub(r'(import .*?\n)', r'\1' + context_code, content, count=1)

    with open(filename, 'w') as f:
        f.write(content)
