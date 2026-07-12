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
      onIdleSessionOpen: noop,
    }),
  );
  assert.ok(html.includes('>omg<'), 'primary label is the tmux session name');
  assert.ok(html.includes('Proj One'), 'shows the project name');
  assert.ok(html.includes('title="Live conversation title"'), 'conversation title is demoted to the tooltip');
  assert.ok(!html.includes('Idle conversation'), 'omits non-live sessions');
});

test('SidebarLiveSection hides sessions with no tmux name (non-tmux gjc는 이 목록에서 제외)', () => {
  const html = renderToStaticMarkup(
    createElement(SidebarLiveSection, {
      projects: makeProjects(),
      liveSessionIds: new Set(['s-live']),
      liveSessionNames: new Map(),
      liveSessionLineage: new Set<string>(),
      liveSessionTmuxIds: new Map<string, string>(),
      selectedSession: null,
      onSessionSelect,
      onIdleSessionOpen: noop,
    }),
  );
  assert.equal(html, '', 'a live session without a tmux name renders no row at all');
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
      onIdleSessionOpen: noop,
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
      onIdleSessionOpen: noop,
    }),
  );
  assert.ok(html.includes('>flask<'), 'labels the row by tmux session name');
  assert.ok(html.includes('대기'), 'idle rows carry the 대기 badge, not LIVE');
  assert.ok(!html.includes('LIVE'), 'no LIVE badge for a session with no transcript');
  assert.ok(html.includes('클릭하면 메인 영역에서 첫 메시지를 보낼 수 있습니다'), 'explainer lives in the tooltip, not a per-row subtitle');
  assert.ok(!html.includes('프롬프트 대기 중'), 'no repeated subtitle scaffolding under idle rows');
  assert.ok(!html.includes('tmux 안에서 도는'), 'footer disclaimer removed');
  assert.ok(html.includes('tmux 세션 flask 닫기'), 'lineage-grade idle rows keep the kill control');
  assert.ok(html.includes('aria-label="flask 대기 세션 열기"'), 'lineage-grade idle rows open the main waiting view');
});

test('SidebarLiveSection: non-lineage idle rows cannot open the waiting view', () => {
  const html = renderToStaticMarkup(
    createElement(SidebarLiveSection, {
      projects: makeProjects(),
      liveSessionIds: new Set(['idle-gjc:somewhere']),
      liveSessionNames: new Map([['idle-gjc:somewhere', 'somewhere']]),
      liveSessionLineage: new Set<string>(),
      liveSessionTmuxIds: new Map([['idle-gjc:somewhere', '$10']]),
      selectedSession: null,
      onSessionSelect,
      onIdleSessionOpen: noop,
    }),
  );
  assert.ok(html.includes('somewhere'), 'row is still visible');
  assert.ok(!html.includes('대기 세션 열기'), 'no waiting-view button without a lineage claim');
});

test('SidebarLiveSection: idle rows without a tmux generation cannot open the waiting view', () => {
  const html = renderToStaticMarkup(
    createElement(SidebarLiveSection, {
      projects: makeProjects(),
      liveSessionIds: new Set(['idle-gjc:somewhere']),
      liveSessionNames: new Map([['idle-gjc:somewhere', 'somewhere']]),
      liveSessionLineage: new Set(['idle-gjc:somewhere']),
      liveSessionTmuxIds: new Map<string, string>(),
      selectedSession: null,
      onSessionSelect,
      onIdleSessionOpen: noop,
    }),
  );
  assert.ok(html.includes('somewhere'), 'row is still visible');
  assert.ok(!html.includes('대기 세션 열기'), 'no waiting-view button without a tmux generation');
});
