import assert from 'node:assert/strict';
import test from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { Project, ProjectSession } from '../../../../types/app';

import SidebarLiveSection from './SidebarLiveSection';

const noop = () => {};
const onSessionSelect = noop as unknown as (session: ProjectSession, projectName: string) => void;

function makeProjects(): Project[] {
  return [
    {
      projectId: 'p1',
      displayName: 'Proj One',
      sessions: [
        { id: 's-live', summary: 'Live conversation title', provider: 'gjc' },
        { id: 's-idle', summary: 'Idle conversation', provider: 'gjc' },
      ],
    },
  ] as unknown as Project[];
}

test('SidebarLiveSection labels rows by tmux session name, title in tooltip', () => {
  const html = renderToStaticMarkup(
    createElement(SidebarLiveSection, {
      projects: makeProjects(),
      liveSessionIds: new Set(['s-live']),
      liveSessionNames: new Map([['s-live', 'omg']]),
      liveSessionLineage: new Set(['s-live']),
      liveSessionTmuxIds: new Map([['s-live', '$1']]),
      selectedSession: null,
      onSessionSelect,
    }),
  );
  assert.ok(html.includes('>omg<'), 'primary label is the tmux session name');
  assert.ok(html.includes('Proj One'), 'shows the project name');
  assert.ok(html.includes('title="Live conversation title"'), 'conversation title is demoted to the tooltip');
  assert.ok(!html.includes('Idle conversation'), 'omits non-live sessions');
});

test('SidebarLiveSection falls back to the conversation title when tmux name is unknown', () => {
  const html = renderToStaticMarkup(
    createElement(SidebarLiveSection, {
      projects: makeProjects(),
      liveSessionIds: new Set(['s-live']),
      liveSessionNames: new Map(),
      liveSessionLineage: new Set<string>(),
      liveSessionTmuxIds: new Map<string, string>(),
      selectedSession: null,
      onSessionSelect,
    }),
  );
  assert.ok(html.includes('Live conversation title'), 'primary label falls back to the title');
});

test('SidebarLiveSection renders nothing when no session is live', () => {
  const html = renderToStaticMarkup(
    createElement(SidebarLiveSection, {
      projects: makeProjects(),
      liveSessionIds: new Set<string>(),
      liveSessionNames: new Map(),
      liveSessionLineage: new Set<string>(),
      liveSessionTmuxIds: new Map<string, string>(),
      selectedSession: null,
      onSessionSelect,
    }),
  );
  assert.equal(html, '');
});

test('SidebarLiveSection renders idle-gjc rows as 대기 (첫 대화 전 gjc pane)', () => {
  const html = renderToStaticMarkup(
    createElement(SidebarLiveSection, {
      projects: makeProjects(),
      liveSessionIds: new Set(['idle-gjc:flask']),
      liveSessionNames: new Map([['idle-gjc:flask', 'flask']]),
      liveSessionLineage: new Set(['idle-gjc:flask']),
      liveSessionTmuxIds: new Map([['idle-gjc:flask', '$9']]),
      selectedSession: null,
      onSessionSelect,
    }),
  );
  assert.ok(html.includes('>flask<'), 'labels the row by tmux session name');
  assert.ok(html.includes('대기'), 'idle rows carry the 대기 badge, not LIVE');
  assert.ok(!html.includes('LIVE'), 'no LIVE badge for a session with no transcript');
  assert.ok(html.includes('프롬프트 대기 중'), 'explains the row is awaiting input, without claiming no conversation exists');
  assert.ok(html.includes('tmux 세션 flask 닫기'), 'lineage-grade idle rows keep the kill control');
  assert.ok(html.includes('첫 메시지 보내기'), 'lineage-grade idle rows offer the inline first-message composer');
});

test('SidebarLiveSection: non-lineage rows never get the first-message composer', () => {
  // A tmuxName without lineage proof must not receive keystrokes (patina 실사고
  // 계약과 동일) — the composer is gated exactly like kill/relay.
  const html = renderToStaticMarkup(
    createElement(SidebarLiveSection, {
      projects: makeProjects(),
      liveSessionIds: new Set(['zz-unmatched-id']),
      liveSessionNames: new Map([['zz-unmatched-id', 'somewhere']]),
      liveSessionLineage: new Set<string>(),
      liveSessionTmuxIds: new Map<string, string>(),
      selectedSession: null,
      onSessionSelect,
    }),
  );
  assert.ok(html.includes('somewhere'), 'row is still visible');
  assert.ok(!html.includes('첫 메시지 보내기'), 'no composer without a lineage claim');
});
