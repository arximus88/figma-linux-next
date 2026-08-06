import { process } from "../Process";

export class ZenityDialogs implements ProviderDialog {
  public showMessageBox = async (options: Dialogs.MessageBoxOptions) => {
    // --width instead of --ellipsize: the latter keeps the window small by
    // truncating the text with an ellipsis, which cut the detail line off
    // mid-sentence. A fixed width wraps it instead.
    const cmd = [`zenity --${options.type} --width=460`];

    if (options.title) {
      cmd.push(`--title="${options.title}"`);
    }
    // Guarding this on `detail` dropped --text entirely for detail-less
    // dialogs, leaving zenity to render an empty body.
    const text = options.detail ? `${options.message}\n${options.detail}` : options.message;
    cmd.push(`--text="${text}"`);
    if (options.textOkButton) {
      cmd.push(`--ok-label="${options.textOkButton}"`);
    }
    if (options.type === "question") {
      // zenity labels a question's reject button "No"; the native provider says
      // "Cancel". Default to the native wording so the two match.
      cmd.push(`--cancel-label="${options.textCancelButton ?? "Cancel"}"`);
      if (options.defaultFocusedButton === "Cancel") {
        cmd.push(`--default-cancel`);
      }
    }

    try {
      await process.exec(cmd.join(" "));
      return 0;
    } catch {
      return 1;
    }
  };
  public showMessageBoxSync = (options: Dialogs.MessageBoxOptions) => {
    // --width instead of --ellipsize: the latter keeps the window small by
    // truncating the text with an ellipsis, which cut the detail line off
    // mid-sentence. A fixed width wraps it instead.
    const cmd = [`zenity --${options.type} --width=460`];

    if (options.title) {
      cmd.push(`--title="${options.title}"`);
    }
    // Guarding this on `detail` dropped --text entirely for detail-less
    // dialogs, leaving zenity to render an empty body.
    const text = options.detail ? `${options.message}\n${options.detail}` : options.message;
    cmd.push(`--text="${text}"`);
    if (options.textOkButton) {
      cmd.push(`--ok-label="${options.textOkButton}"`);
    }
    if (options.type === "question") {
      // zenity labels a question's reject button "No"; the native provider says
      // "Cancel". Default to the native wording so the two match.
      cmd.push(`--cancel-label="${options.textCancelButton ?? "Cancel"}"`);
      if (options.defaultFocusedButton === "Cancel") {
        cmd.push(`--default-cancel`);
      }
    }

    try {
      process.execSync(cmd.join(" "));
      return 0;
    } catch {
      return 1;
    }
  };

  public showOpenDialog = async (options: Dialogs.OpenOptions) => {
    const cmd = ["zenity --file-selection"];

    if (options.defaultPath) {
      cmd.push(`--filename="${options.defaultPath}"`);
    }
    if (Array.isArray(options.properties) && options.properties.length > 0) {
      for (const prop of options.properties) {
        switch (prop) {
          case "openDirectory": {
            cmd.push(`--directory`);
            break;
          }
          case "multiSelections": {
            cmd.push(`--multiple`);
            break;
          }
        }
      }
    }

    let result: string[] | undefined;
    try {
      const stdout = await process.exec(cmd.join(" "));
      result = stdout.replace(/\n/, "").split("|");
    } catch {
      return null;
    }

    return result;
  };
  public showOpenDialogSync = (options: Dialogs.OpenOptions) => {
    const cmd = ["zenity --file-selection"];

    if (options.defaultPath) {
      cmd.push(`--filename="${options.defaultPath}"`);
    }
    if (Array.isArray(options.properties) && options.properties.length > 0) {
      for (const prop of options.properties) {
        switch (prop) {
          case "openDirectory": {
            cmd.push(`--directory`);
            break;
          }
          case "multiSelections": {
            cmd.push(`--multiple`);
            break;
          }
        }
      }
    }

    let result: string[] | undefined;
    try {
      const stdout = process.execSync(cmd.join(" "));
      result = stdout.replace(/\n/, "").split("|");
    } catch {
      return null;
    }

    return result;
  };

  public showSaveDialog = async (options: Dialogs.SaveOptions) => {
    const cmd = ["zenity --file-selection --save --confirm-overwrite"];

    if (options.defaultPath) {
      cmd.push(`--filename="${options.defaultPath}"`);
    }

    let result: string | undefined;
    try {
      result = await process.exec(cmd.join(" "));
      result = result.replace(/\n/, "");
    } catch {
      return null;
    }

    return result;
  };
  public showSaveDialogSync = (options: Dialogs.SaveOptions) => {
    const cmd = ["zenity --file-selection --save --confirm-overwrite"];

    if (options.defaultPath) {
      cmd.push(`--filename="${options.defaultPath}"`);
    }

    let result: string | undefined;
    try {
      result = process.execSync(cmd.join(" "));
      result = result.replace(/\n/, "");
    } catch {
      return null;
    }

    return result;
  };
}
