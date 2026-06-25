import * as fs from "node:fs";

export async function mkdirIfNotExists(path: string) {
  try {
    await fs.promises.mkdir(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "EEXIST") throw error;
  }
}

export async function access(path: string): Promise<boolean> {
  try {
    await fs.promises.access(path);
    return true;
  } catch {
    return false;
  }
}

export function accessSync(path: string): boolean {
  try {
    fs.accessSync(path);

    return true;
  } catch {
    return false;
  }
}

export async function mkPath(path: string) {
  return fs.promises.mkdir(path, { recursive: true });
}
