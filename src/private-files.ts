import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const PRIVATE_DIRECTORY_MODE = 0o700;
export const PRIVATE_FILE_MODE = 0o600;

function currentUserId(): number | undefined {
  return typeof process.getuid === "function" ? process.getuid() : undefined;
}

function assertOwnedByCurrentUser(path: string, ownerId: number): void {
  const userId = currentUserId();
  if (process.platform !== "win32" && userId !== undefined && ownerId !== userId) {
    throw new Error(`Vizhi refuses to use ${path} because it is owned by another user.`);
  }
}

async function ensureOwnedDirectory(path: string, message: string): Promise<void> {
  const information = await lstat(path);
  if (!information.isDirectory() || information.isSymbolicLink()) {
    throw new Error(`Vizhi refuses to use ${path} because it is not ${message}.`);
  }
  assertOwnedByCurrentUser(path, information.uid);
  if (process.platform !== "win32" && (information.mode & 0o022) !== 0) {
    throw new Error(`Vizhi refuses to use ${path} because it is writable by group or other users.`);
  }
}

async function ensurePrivateFileParent(path: string): Promise<void> {
  try {
    await ensureOwnedDirectory(path, "a directory");
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  await mkdir(path, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  await ensureOwnedDirectory(path, "a directory");
}

export async function ensurePrivateDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  await ensureOwnedDirectory(path, "a private directory");
  await chmod(path, PRIVATE_DIRECTORY_MODE);
}

export async function ensurePrivateFile(path: string): Promise<void> {
  const information = await lstat(path);
  if (!information.isFile() || information.isSymbolicLink()) {
    throw new Error(`Vizhi refuses to use ${path} because it is not a regular file.`);
  }
  assertOwnedByCurrentUser(path, information.uid);
  await chmod(path, PRIVATE_FILE_MODE);
}

export async function writePrivateJsonAtomically(path: string, value: unknown): Promise<void> {
  await ensurePrivateFileParent(dirname(path));
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode: PRIVATE_FILE_MODE,
      flag: "wx",
    });
    await rename(temporaryPath, path);
    await ensurePrivateFile(path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}
