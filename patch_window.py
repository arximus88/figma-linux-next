import re

with open("src/main/Ui/Window.ts", "r") as f:
    content = f.read()

content = content.replace("public closeSettingsView() {", "public async closeSettingsView() {")
content = content.replace("this.settingsView.postClose();", "await this.settingsView.postClose();")

with open("src/main/Ui/Window.ts", "w") as f:
    f.write(content)
