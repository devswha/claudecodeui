import assert from 'node:assert/strict';
import test from 'node:test';

import { projectsDb, sessionsDb } from '@/modules/database/index.js';
import { getProjectsWithSessions } from '@/modules/projects/services/projects-with-sessions-fetch.service.js';

type Stubs = {
  getProjectPaths: typeof projectsDb.getProjectPaths;
  getSessionsByProjectPathPage: typeof sessionsDb.getSessionsByProjectPathPage;
  countSessionsByProjectPath: typeof sessionsDb.countSessionsByProjectPath;
};

function withStubs(total: number, run: (captured: { limit?: number }) => Promise<void>): Promise<void> {
  const original: Stubs = {
    getProjectPaths: projectsDb.getProjectPaths,
    getSessionsByProjectPathPage: sessionsDb.getSessionsByProjectPathPage,
    countSessionsByProjectPath: sessionsDb.countSessionsByProjectPath,
  };
  const captured: { limit?: number } = {};
  // custom_project_name is set so getProjectsWithSessions skips filesystem displayName derivation.
  (projectsDb as unknown as { getProjectPaths: () => unknown }).getProjectPaths = () => [
    { project_id: 'p1', project_path: '/ws/p1', custom_project_name: 'p1', isStarred: 0 },
  ];
  (sessionsDb as unknown as { getSessionsByProjectPathPage: (p: string, l: number, o: number) => unknown[] })
    .getSessionsByProjectPathPage = (_p, limit) => { captured.limit = limit; return []; };
  (sessionsDb as unknown as { countSessionsByProjectPath: () => number }).countSessionsByProjectPath = () => total;

  return run(captured).finally(() => {
    projectsDb.getProjectPaths = original.getProjectPaths;
    sessionsDb.getSessionsByProjectPathPage = original.getSessionsByProjectPathPage;
    sessionsDb.countSessionsByProjectPath = original.countSessionsByProjectPath;
  });
}

test('getProjectsWithSessions caps the initial eager session slice at 5 when no limit is given', async () => {
  await withStubs(42, async (captured) => {
    const projects = await getProjectsWithSessions({ skipSynchronization: true });
    assert.equal(captured.limit, 5, 'eager per-project session slice must default to 5');
    assert.equal(projects.length, 1);
    assert.equal(projects[0].sessionMeta.total, 42, 'total reflects the full session count for lazy-load');
    assert.equal(projects[0].sessionMeta.hasMore, true, 'hasMore lets the frontend lazy-load the rest');
  });
});

test('getProjectsWithSessions respects an explicit sessionsLimit (no forced cap)', async () => {
  await withStubs(42, async (captured) => {
    await getProjectsWithSessions({ skipSynchronization: true, sessionsLimit: 12 });
    assert.equal(captured.limit, 12, 'an explicit sessionsLimit overrides the small default');
  });
});
