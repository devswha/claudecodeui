import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  resolveProjectFileForRead,
  resolveProjectFileForWrite,
} from '@/shared/project-file-containment.js';

test('project file containment rejects symlink escapes while allowing canonical project paths', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'project-file-containment-'));
  const projectRoot = path.join(tempDir, 'project');
  const projectRootLink = path.join(tempDir, 'decoy-project');
  const outsideRoot = path.join(tempDir, 'outside');
  const insideFile = path.join(projectRoot, 'inside.txt');
  const outsideFile = path.join(outsideRoot, 'secret.txt');

  try {
    await Promise.all([mkdir(projectRoot), mkdir(outsideRoot)]);
    await Promise.all([
      writeFile(insideFile, 'inside'),
      writeFile(outsideFile, 'secret'),
      symlink(projectRoot, projectRootLink, 'dir'),
      symlink(outsideFile, path.join(projectRoot, 'escaped.txt'), 'file'),
      symlink(outsideRoot, path.join(projectRoot, 'escaped-dir'), 'dir'),
    ]);

    assert.equal(
      await resolveProjectFileForRead(projectRootLink, path.join(projectRootLink, 'inside.txt')),
      insideFile,
    );

    const newFilePath = await resolveProjectFileForWrite(projectRootLink, path.join(projectRootLink, 'new.txt'));
    assert.equal(newFilePath, path.join(projectRoot, 'new.txt'));
    await writeFile(newFilePath!, 'new');

    assert.equal(
      await resolveProjectFileForRead(projectRootLink, path.join(projectRootLink, 'escaped.txt')),
      null,
    );
    assert.equal(
      await resolveProjectFileForWrite(projectRootLink, path.join(projectRootLink, 'escaped.txt')),
      null,
    );
    assert.equal(
      await resolveProjectFileForWrite(projectRootLink, path.join(projectRootLink, 'escaped-dir', 'new.txt')),
      null,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
