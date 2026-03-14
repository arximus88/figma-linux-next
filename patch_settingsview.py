import re

with open("src/main/Ui/SettingsView.ts", "r") as f:
    content = f.read()

content = content.replace("public postClose() {", "public async postClose() {")
content = content.replace("id = dialogs.showMessageBoxSync({", "id = await dialogs.showMessageBox({")

with open("src/main/Ui/SettingsView.ts", "w") as f:
    f.write(content)
