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
      selectedSession: null,
      onSessionSelect,
    }),
  );
  assert.equal(html, '');
});
