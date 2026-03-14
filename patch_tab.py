import re

with open("src/main/Ui/Tab.ts", "r") as f:
    content = f.read()

# Replace showMessageBoxSync with showMessageBox and make handler async
content = content.replace("private permissionHandler(", "private async permissionHandler(")
content = content.replace("const id = dialogs.showMessageBoxSync({", "const id = await dialogs.showMessageBox({")

with open("src/main/Ui/Tab.ts", "w") as f:
    f.write(content)
