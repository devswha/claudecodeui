import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection, initializeDatabase, sessionsDb } from '@/modules/database/index.js';
import { GjcSessionSynchronizer } from '@/modules/providers/list/gjc/gjc-session-synchronizer.provider.js';
import { GjcSessionsProvider } from '@/modules/providers/list/gjc/gjc-sessions.provider.js';

const patchHomeDir = (nextHomeDir: string) => {
  const original = os.homedir;
  (os as any).homedir = () => nextHomeDir;
  return () => {
    (os as any).homedir = original;
  };
};

async function withIsolatedDatabase(runTest: () => void | Promise<void>): Promise<void> {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'gjc-provider-db-'));
  const databasePath = path.join(tempDirectory, 'auth.db');

  closeConnection();
  process.env.DATABASE_PATH = databasePath;
  await initializeDatabase();

  try {
    await runTest();
  } finally {
    closeConnection();
    if (previousDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

/**
 * Writes one synthetic gjc JSONL transcript.
 *
 * The header line carries the authoritative id/cwd at the top level (unlike
 * Codex which nests them under `payload`). Message lines use gjc's
 * `message.content[]` part shape.
 */
const writeGjcTranscript = async (
  homeDir: string,
  gjcSessionId: string,
  workspacePath: string,
  options: { firstUserMessage?: string; withConversation?: boolean } = {},
): Promise<string> => {
  const sessionsDir = path.join(homeDir, '.gjc', 'agent', 'sessions', '-workspace');
  await mkdir(sessionsDir, { recursive: true });

  const lines: string[] = [
    JSON.stringify({
      type: 'session',
      version: 3,
      id: gjcSessionId,
      timestamp: '2026-07-09T00:00:00.000Z',
      cwd: workspacePath,
    }),
  ];

  if (options.firstUserMessage !== undefined) {
    lines.push(JSON.stringify({
      type: 'message',
      id: 'msg-1',
      parentId: null,
      timestamp: '2026-07-09T00:00:01.000Z',
      message: { role: 'user', content: [{ type: 'text', text: options.firstUserMessage }] },
    }));
  }

  if (options.withConversation) {
    lines.push(JSON.stringify({
      type: 'message',
      id: 'msg-2',
      parentId: 'msg-1',
      timestamp: '2026-07-09T00:00:02.000Z',
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', text: 'Let me think.' },
          { type: 'text', text: 'Here is the answer.' },
          { type: 'toolCall', toolName: 'Bash', toolInput: { command: 'ls' }, toolCallId: 'call-1' },
        ],
      },
    }));
    lines.push(JSON.stringify({
      type: 'message',
      id: 'msg-3',
      parentId: 'msg-2',
      timestamp: '2026-07-09T00:00:03.000Z',
      message: {
        role: 'toolResult',
        content: [{ type: 'toolResult', toolCallId: 'call-1', output: 'file.txt', isError: false }],
      },
    }));
    // Non-message control events must be ignored by both indexer and history reader.
    lines.push(JSON.stringify({ type: 'model_change', timestamp: '2026-07-09T00:00:04.000Z', model: 'x' }));
  }

  const filePath = path.join(sessionsDir, `2026-07-09T00-00-00_${gjcSessionId}.jsonl`);
  await writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');
  return filePath;
};

test('gjc synchronizer indexes sessions and derives the title from the first user message', { concurrency: false }, async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'gjc-session-sync-'));
  const workspacePath = path.join(tempRoot, 'workspace');
  await mkdir(workspacePath, { recursive: true });
  const restoreHomeDir = patchHomeDir(tempRoot);

  try {
    await writeGjcTranscript(tempRoot, 'gjc-1', workspacePath, { firstUserMessage: 'Add a gjc provider' });
    await withIsolatedDatabase(async () => {
      const synchronizer = new GjcSessionSynchronizer();
      const processed = await synchronizer.synchronize();

      assert.equal(processed, 1);
      const indexed = sessionsDb.getSessionById('gjc-1');
      assert.equal(indexed?.provider, 'gjc');
      assert.equal(indexed?.project_path, workspacePath);
      assert.equal(indexed?.custom_name, 'Add a gjc provider');
    });
  } finally {
    restoreHomeDir();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('gjc synchronizer falls back to Untitled when no user message exists', { concurrency: false }, async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'gjc-session-sync-untitled-'));
  const workspacePath = path.join(tempRoot, 'workspace');
  await mkdir(workspacePath, { recursive: true });
  const restoreHomeDir = patchHomeDir(tempRoot);

  try {
    await writeGjcTranscript(tempRoot, 'gjc-empty', workspacePath, {});
    await withIsolatedDatabase(async () => {
      await new GjcSessionSynchronizer().synchronize();
      assert.equal(sessionsDb.getSessionById('gjc-empty')?.custom_name, 'Untitled gjc Session');
    });
  } finally {
    restoreHomeDir();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('gjc sessions provider normalizes message content parts and folds tool results', { concurrency: false }, async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'gjc-session-history-'));
  const workspacePath = path.join(tempRoot, 'workspace');
  await mkdir(workspacePath, { recursive: true });
  const restoreHomeDir = patchHomeDir(tempRoot);

  try {
    await writeGjcTranscript(tempRoot, 'gjc-history', workspacePath, {
      firstUserMessage: 'Question?',
      withConversation: true,
    });
    await withIsolatedDatabase(async () => {
      await new GjcSessionSynchronizer().synchronize();

      const provider = new GjcSessionsProvider();
      const history = await provider.fetchHistory('gjc-history');

      // total counts non-tool_result messages: user text, thinking, assistant text, tool_use.
      assert.equal(history.total, 4);
      assert.equal(history.messages[0]?.kind, 'text');
      assert.equal(history.messages[0]?.role, 'user');
      assert.equal(history.messages[0]?.content, 'Question?');
      assert.equal(history.messages[1]?.kind, 'thinking');
      assert.equal(history.messages[1]?.content, 'Let me think.');
      assert.equal(history.messages[2]?.kind, 'text');
      assert.equal(history.messages[2]?.role, 'assistant');
      assert.equal(history.messages[2]?.content, 'Here is the answer.');
      assert.equal(history.messages[3]?.kind, 'tool_use');
      assert.equal(history.messages[3]?.toolName, 'Bash');
      assert.deepEqual(history.messages[3]?.toolResult, { content: 'file.txt', isError: false });
    });
  } finally {
    restoreHomeDir();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('gjc synchronizer excludes subagent transcripts inside session sidecar dirs', { concurrency: false }, async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'gjc-subagent-'));
  const workspacePath = path.join(tempRoot, 'workspace');
  await mkdir(workspacePath, { recursive: true });
  const restoreHomeDir = patchHomeDir(tempRoot);

  try {
    // Top-level session (depth 2: sessions/<slug>/<file>.jsonl).
    await writeGjcTranscript(tempRoot, 'gjc-parent', workspacePath, { firstUserMessage: 'Parent session' });

    // Subagent transcript inside the session's sidecar dir (depth 3) — e.g. a ralplan
    // pass. It repeats the `type:session` header but must NOT be indexed as a session.
    const sidecar = path.join(
      tempRoot, '.gjc', 'agent', 'sessions', '-workspace', '2026-07-09T00-00-00_gjc-parent',
    );
    await mkdir(sidecar, { recursive: true });
    const subLines = [
      JSON.stringify({ type: 'session', version: 3, id: '2-CriticPass1', timestamp: '2026-07-09T00:00:00.000Z', cwd: workspacePath }),
      JSON.stringify({ type: 'message', id: 'm', timestamp: '2026-07-09T00:00:01.000Z', message: { role: 'user', content: [{ type: 'text', text: 'subagent pass' }] } }),
    ];
    await writeFile(path.join(sidecar, '2-CriticPass1.jsonl'), `${subLines.join('\n')}\n`, 'utf8');

    await withIsolatedDatabase(async () => {
      const processed = await new GjcSessionSynchronizer().synchronize();
      assert.equal(processed, 1); // only the top-level session, not the sidecar subagent
      assert.ok(sessionsDb.getSessionById('gjc-parent'));
      assert.ok(!sessionsDb.getSessionById('2-CriticPass1'));
    });
  } finally {
    restoreHomeDir();
    await rm(tempRoot, { recursive: true, force: true });
  }
});
