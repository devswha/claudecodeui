import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

function isWithinProjectRoot(projectRootRealPath: string, candidateRealPath: string): boolean {
  return (
    candidateRealPath === projectRootRealPath
    || candidateRealPath.startsWith(`${projectRootRealPath}${path.sep}`)
  );
}

/**
 * Resolves an existing file for reading and rejects symlinks that leave the
 * project's real root. The returned path is canonical so the caller reads the
 * same path that was checked.
 */
export async function resolveProjectFileForRead(
  projectRoot: string,
  filePath: string,
): Promise<string | null> {
  const [projectRootRealPath, fileRealPath] = await Promise.all([
    realpath(projectRoot),
    realpath(filePath),
  ]);

  return isWithinProjectRoot(projectRootRealPath, fileRealPath) ? fileRealPath : null;
}

/**
 * Resolves a file path for writing. Existing files are resolved directly;
 * new files are checked through their canonical parent directory. Dangling
 * symlinks are rejected because writing through them could create a file
 * outside the project.
 */
export async function resolveProjectFileForWrite(
  projectRoot: string,
  filePath: string,
): Promise<string | null> {
  const projectRootRealPath = await realpath(projectRoot);
  let fileRealPath: string;

  try {
    fileRealPath = await realpath(filePath);
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;
    if (fileError.code !== 'ENOENT') {
      throw error;
    }

    try {
      const entry = await lstat(filePath);
      if (entry.isSymbolicLink()) {
        return null;
      }
    } catch (lstatError) {
      const lstatFileError = lstatError as NodeJS.ErrnoException;
      if (lstatFileError.code !== 'ENOENT') {
        throw lstatError;
      }
    }

    const parentRealPath = await realpath(path.dirname(filePath));
    fileRealPath = path.join(parentRealPath, path.basename(filePath));
  }

  return isWithinProjectRoot(projectRootRealPath, fileRealPath) ? fileRealPath : null;
}
