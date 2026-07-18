import { chmod, lstat, mkdir } from "node:fs/promises";

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

export async function ensurePrivateDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  const information = await lstat(path);
  if (!information.isDirectory() || information.isSymbolicLink()) {
    throw new Error(`Vizhi refuses to use ${path} because it is not a private directory.`);
  }
  assertOwnedByCurrentUser(path, information.uid);
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
