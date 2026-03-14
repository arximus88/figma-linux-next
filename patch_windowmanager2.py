import re

with open("src/main/Ui/WindowManager.ts", "r") as f:
    content = f.read()

content = content.replace("public closeSettingsViewForLastWindow() {", "public async closeSettingsViewForLastWindow() {")
content = content.replace("window.closeSettingsView();", "await window.closeSettingsView();")

with open("src/main/Ui/WindowManager.ts", "w") as f:
    f.write(content)
