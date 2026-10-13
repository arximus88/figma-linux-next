import { process } from "../Process";

// Each value is its own argv entry (no shell, see Process), so no quoting here.
const messageBoxArgs = (options: Dialogs.MessageBoxOptions): string[] => {
  // --width instead of --ellipsize: the latter keeps the window small by
  // truncating the text with an ellipsis, which cut the detail line off
  // mid-sentence. A fixed width wraps it instead.
  const args = [`--${options.type}`, "--width=460"];

  if (options.title) {
    args.push(`--title=${options.title}`);
  }
  // Guarding this on `detail` dropped --text entirely for detail-less
  // dialogs, leaving zenity to render an empty body.
  const text = options.detail ? `${options.message}\n${options.detail}` : options.message;
  args.push(`--text=${text}`);
  if (options.textOkButton) {
    args.push(`--ok-label=${options.textOkButton}`);
  }
  if (options.type === "question") {
    // zenity labels a question's reject button "No"; the native provider says
    // "Cancel". Default to the native wording so the two match.
    args.push(`--cancel-label=${options.textCancelButton ?? "Cancel"}`);
    if (options.defaultFocusedButton === "Cancel") {
      args.push("--default-cancel");
    }
  }

  return args;
};

const openDialogArgs = (options: Dialogs.OpenOptions): string[] => {
  const args = ["--file-selection"];

  if (options.defaultPath) {
    args.push(`--filename=${options.defaultPath}`);
  }
  if (Array.isArray(options.properties) && options.properties.length > 0) {
    for (const prop of options.properties) {
      switch (prop) {
        case "openDirectory": {
          args.push("--directory");
          break;
        }
        case "multiSelections": {
          args.push("--multiple");
          break;
        }
      }
    }
  }

  return args;
};

// --confirm-overwrite is deprecated in zenity 4 (the check is on by default there and the
// flag only prints a warning), but zenity 3 needs it to ask before overwriting.
const saveDialogArgs = (options: Dialogs.SaveOptions): string[] => {
  const args = ["--file-selection", "--save", "--confirm-overwrite"];

  if (options.defaultPath) {
    args.push(`--filename=${options.defaultPath}`);
  }

  return args;
};

export class ZenityDialogs implements ProviderDialog {
  public showMessageBox = async (options: Dialogs.MessageBoxOptions) => {
    try {
      await process.exec("zenity", messageBoxArgs(options));
      return 0;
    } catch {
      return 1;
    }
  };
  public showMessageBoxSync = (options: Dialogs.MessageBoxOptions) => {
    try {
      process.execSync("zenity", messageBoxArgs(options));
      return 0;
    } catch {
      return 1;
    }
  };

  public showOpenDialog = async (options: Dialogs.OpenOptions) => {
    let result: string[] | undefined;
    try {
      const stdout = await process.exec("zenity", openDialogArgs(options));
      result = stdout.replace(/\n/, "").split("|");
    } catch {
      return null;
    }

    return result;
  };
  public showOpenDialogSync = (options: Dialogs.OpenOptions) => {
    let result: string[] | undefined;
    try {
      const stdout = process.execSync("zenity", openDialogArgs(options));
      result = stdout.replace(/\n/, "").split("|");
    } catch {
      return null;
    }

    return result;
  };

  public showSaveDialog = async (options: Dialogs.SaveOptions) => {
    let result: string | undefined;
    try {
      result = await process.exec("zenity", saveDialogArgs(options));
      result = result.replace(/\n/, "");
    } catch {
      return null;
    }

    return result;
  };
  public showSaveDialogSync = (options: Dialogs.SaveOptions) => {
    let result: string | undefined;
    try {
      result = process.execSync("zenity", saveDialogArgs(options));
      result = result.replace(/\n/, "");
    } catch {
      return null;
    }

    return result;
  };
}
