import { promisify } from "node:util";
import { execFile as cp_execFile, execFileSync } from "node:child_process";

import { logger } from "./Logger";

const execFileAsync = promisify(cp_execFile);

// Arguments go to the program as-is, without a shell: a file name with a quote, `$` or a
// backtick used to break the command line, or run what followed.
export class Process {
  // A failure is a non-zero exit (execFile rejects on it), not output on stderr. zenity 4
  // warns there about deprecated flags such as --confirm-overwrite and still exits 0 with
  // the chosen path; treating that as an error cancelled every Zenity export (#56).
  public exec = async (file: string, args: string[]): Promise<string> => {
    const { stdout, stderr } = await execFileAsync(file, args);

    if (stderr !== "") {
      logger.warn(`Exec ${file}: stderr: `, stderr);
    }

    return stdout;
  };

  public execSync = (file: string, args: string[]): string => {
    return execFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  };
}

export const process = new Process();
