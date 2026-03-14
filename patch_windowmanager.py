import re

with open("src/main/Ui/WindowManager.ts", "r") as f:
    lines = f.readlines()

new_lines = []
for i, line in enumerate(lines):
    new_lines.append(line)

    m = re.match(r'^(\s*)const window = (this\.windows\.get\(.*?\)|this\.getWindowByWebContentsId\(.*?\));', line)
    if m:
        indent = m.group(1)
        needs_check = True

        # Check up to 2 next lines for existing checks
        for j in range(1, 3):
            if i + j < len(lines):
                next_line = lines[i+j].strip()
                if next_line.startswith('if (window)') or next_line.startswith('if (!window)') or next_line.startswith('window?.'):
                    needs_check = False
                    break
                if next_line != '':
                    break # Stop at first non-empty line

        if needs_check:
            new_lines.append(f"{indent}if (!window) return;\n")

with open("src/main/Ui/WindowManager.ts", "w") as f:
    f.writelines(new_lines)
