import assert from 'node:assert/strict';
import test from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { Project, ProjectSession } from '../../../../types/app';

import SidebarLiveSection from './SidebarLiveSection';

const noop = () => {};

function makeProjects(): Project[] {
  return [
    {
      projectId: 'p1',
      displayName: 'Proj One',
      sessions: [
        { id: 's-live', summary: 'Live conversation', provider: 'gjc' },
        { id: 's-idle', summary: 'Idle conversation', provider: 'gjc' },
      ],
    },
  ] as unknown as Project[];
}

test('SidebarLiveSection lists only live sessions with a LIVE badge + project name', () => {
  const html = renderToStaticMarkup(
    createElement(SidebarLiveSection, {
      projects: makeProjects(),
      liveSessionIds: new Set(['s-live']),
      selectedSession: null,
      onSessionSelect: noop as unknown as (session: ProjectSession, projectName: string) => void,
    }),
  );
  assert.ok(html.includes('Live conversation'), 'shows the live session');
  assert.ok(!html.includes('Idle conversation'), 'omits non-live sessions');
  assert.ok(html.includes('LIVE'), 'renders a LIVE badge');
  assert.ok(html.includes('Proj One'), 'shows the project name');
});

test('SidebarLiveSection renders nothing when no session is live', () => {
  const html = renderToStaticMarkup(
    createElement(SidebarLiveSection, {
      projects: makeProjects(),
      liveSessionIds: new Set<string>(),
      selectedSession: null,
      onSessionSelect: noop as unknown as (session: ProjectSession, projectName: string) => void,
    }),
  );
  assert.equal(html, '');
});
