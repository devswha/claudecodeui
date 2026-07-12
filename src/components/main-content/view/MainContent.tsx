import React, { useCallback, useEffect, useState } from 'react';
import { Menu, SquareTerminal, X } from 'lucide-react';

import ChatInterface from '../../chat/view/ChatInterface';
import LiveRelayComposer from '../../chat/view/subcomponents/LiveRelayComposer';
import { composerKey } from '../../app/idleTransition';
import PluginTabContent from '../../plugins/view/PluginTabContent';
import StandaloneShell from '../../standalone-shell/view/StandaloneShell';
import { BrowserUsePanel } from '../../browser-use';
import type { MainContentProps } from '../types/types';
import { useTaskMaster } from '../../../contexts/TaskMasterContext';
import { usePaletteOpsRegister } from '../../../contexts/PaletteOpsContext';
import { useTasksSettings } from '../../../contexts/TasksSettingsContext';
import { useUiPreferences } from '../../../hooks/useUiPreferences';
import { useFileOpenResolver } from '../../../hooks/useFileOpenResolver';
import { authenticatedFetch } from '../../../utils/api';
import { useEditorSidebar } from '../../code-editor/hooks/useEditorSidebar';
import EditorSidebar from '../../code-editor/view/EditorSidebar';
import type { Project } from '../../../types/app';
import { TaskMasterPanel } from '../../task-master';

import MainContentHeader from './subcomponents/MainContentHeader';
import MainContentStateView from './subcomponents/MainContentStateView';
import FilesPanel from './subcomponents/FilesPanel';
import ErrorBoundary from './ErrorBoundary';

type TaskMasterContextValue = {
  currentProject?: Project | null;
  setCurrentProject?: ((project: Project) => void) | null;
};

type TasksSettingsContextValue = {
  tasksEnabled: boolean;
  isTaskMasterInstalled: boolean | null;
  isTaskMasterReady: boolean | null;
};

function MainContent({
  selectedProject,
  selectedSession,
  isSessionReadOnly,
  liveSessionTmuxName,
  liveSessionTmuxId,
  liveSessionModel,
  activeTab,
  setActiveTab,
  ws,
  sendMessage,
  isMobile,
  onMenuClick,
  isLoading,
  onInputFocusChange,
  onSessionProcessing,
  onSessionIdle,
  processingSessions,
  onNavigateToSession,
  onSessionEstablished,
  onShowSettings,
  externalMessageUpdate,
  newSessionTrigger,
  externalTerminal,
  onExternalTerminalClose,
  idleTarget,
  onIdleClose,
  resolvingTimedOut,
  idleAmbiguous,
}: MainContentProps) {
  const { preferences } = useUiPreferences();
  const { showRawParameters, showThinking, sendByCtrlEnter } = preferences;

  const { currentProject, setCurrentProject } = useTaskMaster() as TaskMasterContextValue;
  const { tasksEnabled, isTaskMasterInstalled } = useTasksSettings() as TasksSettingsContextValue;
  const [browserUseEnabled, setBrowserUseEnabled] = useState(false);
  const [filesPanelOpen, setFilesPanelOpen] = useState(() => {
    try {
      return localStorage.getItem('files-panel-open') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('files-panel-open', String(filesPanelOpen));
    } catch {
      // storage errors are non-fatal
    }
  }, [filesPanelOpen]);

  const shouldShowTasksTab = Boolean(tasksEnabled && isTaskMasterInstalled);
  const shouldShowBrowserTab = browserUseEnabled;

  const {
    editingFile,
    editorWidth,
    editorExpanded,
    hasManualWidth,
    resizeHandleRef,
    handleFileOpen,
    handleCloseEditor,
    handleToggleEditorExpand,
    handleResizeStart,
  } = useEditorSidebar({
    selectedProject,
    isMobile,
  });

  // Resolves bare/partial file references (e.g. links inside chat messages) to
  // real project files before opening them in the in-app editor.
  const resolvedFileOpen = useFileOpenResolver(selectedProject, handleFileOpen);

  useEffect(() => {
    // Identify projects by DB `projectId`; the TaskMaster context uses the
    // same identifier to key its internal maps.
    const selectedProjectId = selectedProject?.projectId;
    const currentProjectId = currentProject?.projectId;

    if (selectedProject && selectedProjectId !== currentProjectId) {
      setCurrentProject?.(selectedProject);
    }
  }, [selectedProject, currentProject?.projectId, setCurrentProject]);

  useEffect(() => {
    if (!shouldShowTasksTab && activeTab === 'tasks') {
      setActiveTab('chat');
    }
  }, [shouldShowTasksTab, activeTab, setActiveTab]);

  useEffect(() => {
    // Shell/Git/Files tabs were removed; a persisted selection would render a
    // blank main area, so bounce it back to chat (Files lives in FilesPanel).
    if (activeTab === 'shell' || activeTab === 'git' || activeTab === 'files') {
      setActiveTab('chat');
    }
  }, [activeTab, setActiveTab]);

  const loadBrowserUseSettings = useCallback(async () => {
    try {
      const response = await authenticatedFetch('/api/browser-use/settings');
      const data = await response.json();
      setBrowserUseEnabled(Boolean(response.ok && data?.success !== false && data?.data?.settings?.enabled));
    } catch {
      setBrowserUseEnabled(false);
    }
  }, []);

  useEffect(() => {
    void loadBrowserUseSettings();
    window.addEventListener('browserUseSettingsChanged', loadBrowserUseSettings);
    return () => window.removeEventListener('browserUseSettingsChanged', loadBrowserUseSettings);
  }, [loadBrowserUseSettings]);

  useEffect(() => {
    if (!shouldShowBrowserTab && activeTab === 'browser') {
      setActiveTab('chat');
    }
  }, [shouldShowBrowserTab, activeTab, setActiveTab]);

  usePaletteOpsRegister({
    openFile: (filePath: string) => {
      setActiveTab('files');
      handleFileOpen(filePath);
    },
    // Opens the editor side panel in place, keeping the current tab (e.g. chat).
    openFileInEditor: (filePath: string) => {
      resolvedFileOpen(filePath);
    },
  });

  if (isLoading) {
    return <MainContentStateView mode="loading" isMobile={isMobile} onMenuClick={onMenuClick} />;
  }

  // External CLI (claude/codex) tmux terminal takes over the whole main area —
  // same footprint as a gjc session. Rendered before the no-project empty state
  // because the target carries its own project (PTY cwd only).
  if (externalTerminal) {
    const safeName = /^[A-Za-z0-9._-]{1,64}$/.test(externalTerminal.tmuxName) ? externalTerminal.tmuxName : null;
    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border/50 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            {isMobile && (
              <button
                type="button"
                onClick={onMenuClick}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                aria-label="Open sidebar"
              >
                <Menu className="h-4 w-4" />
              </button>
            )}
            <SquareTerminal className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
            <span className="truncate text-sm font-semibold text-foreground">tmux: {externalTerminal.tmuxName}</span>
            <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
              {externalTerminal.kind} · 분리(detach): Ctrl+B → D
            </span>
          </div>
          <button
            type="button"
            onClick={onExternalTerminalClose}
            title="터미널 닫기"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {safeName && (
            <StandaloneShell
              // key: switching targets must remount the Shell — its websocket
              // does NOT reconnect when only initialCommand changes, so without
              // this the previous session's terminal keeps showing (stock→test).
              key={safeName}
              project={externalTerminal.project}
              command={`tmux attach-session -t '=${safeName}'`}
              isActive
              // minimal: drop the Shell's own status bar ("New Session" +
              // Disconnect/Restart) — our header above already names the
              // target and closes the view; minimal also auto-connects.
              minimal
              onComplete={() => onExternalTerminalClose()}
            />
          )}
        </div>
      </div>
    );
  }
  if (idleTarget) {
    const safeName = /^[A-Za-z0-9._-]{1,64}$/.test(idleTarget.tmuxName) ? idleTarget.tmuxName : null;
    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border/50 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            {isMobile && (
              <button
                type="button"
                onClick={onMenuClick}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                aria-label="Open sidebar"
              >
                <Menu className="h-4 w-4" />
              </button>
            )}
            <SquareTerminal className="h-4 w-4 shrink-0 text-blue-500" aria-hidden />
            <span className="shrink-0 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400">대기</span>
            <span className="truncate text-sm font-semibold text-foreground">tmux:{idleTarget.tmuxName}</span>
          </div>
          <button
            type="button"
            onClick={onIdleClose}
            title="대기 뷰 닫기"
            aria-label="idle 대기 뷰 닫기"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto px-6 py-8">
          <div className="max-w-md space-y-3 text-center">
            <SquareTerminal className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
            <h2 className="text-base font-semibold text-foreground">아직 대화가 없습니다</h2>
            <p className="text-sm text-muted-foreground">첫 메시지를 보내면 대화가 시작됩니다.</p>
            {resolvingTimedOut && (
              <p role="status" className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                대화를 불러오는 중… 오래 걸리면 사이드바에서 직접 열 수 있습니다
              </p>
            )}
            {idleAmbiguous && (
              <p role="alert" className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                이 tmux 세션에 대화 후보가 여럿 감지됨 — 사이드바 목록에서 직접 선택하세요
              </p>
            )}
          </div>
        </div>
        {safeName && (
          <LiveRelayComposer
            key={composerKey(idleTarget.tmuxName, idleTarget.tmuxId)}
            tmuxName={idleTarget.tmuxName}
            tmuxId={idleTarget.tmuxId}
            model={null}
          />
        )}
      </div>
    );
  }

  if (!selectedProject) {
    return <MainContentStateView mode="empty" isMobile={isMobile} onMenuClick={onMenuClick} />;
  }

  return (
    <div className="flex h-full flex-col">
      <MainContentHeader
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        selectedProject={selectedProject}
        selectedSession={selectedSession}
        shouldShowTasksTab={shouldShowTasksTab}
        shouldShowBrowserTab={shouldShowBrowserTab}
        isMobile={isMobile}
        onMenuClick={onMenuClick}
        filesPanelOpen={filesPanelOpen}
        onToggleFilesPanel={() => setFilesPanelOpen((previous) => !previous)}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className={`flex min-h-0 min-w-[200px] flex-col overflow-hidden ${editorExpanded ? 'hidden' : ''} flex-1`}>
          <div className={`h-full ${activeTab === 'chat' ? 'block' : 'hidden'}`}>
            <ErrorBoundary showDetails>
              <ChatInterface
                selectedProject={selectedProject}
                selectedSession={selectedSession}
                isSessionReadOnly={isSessionReadOnly}
                liveSessionTmuxName={liveSessionTmuxName}
                liveSessionTmuxId={liveSessionTmuxId}
                liveSessionModel={liveSessionModel}
                ws={ws}
                sendMessage={sendMessage}
                onFileOpen={handleFileOpen}
                onInputFocusChange={onInputFocusChange}
                onSessionProcessing={onSessionProcessing}
                onSessionIdle={onSessionIdle}
                processingSessions={processingSessions}
                onNavigateToSession={onNavigateToSession}
                onSessionEstablished={onSessionEstablished}
                onShowSettings={onShowSettings}
                showRawParameters={showRawParameters}
                showThinking={showThinking}
                sendByCtrlEnter={sendByCtrlEnter}
                externalMessageUpdate={externalMessageUpdate}
                newSessionTrigger={newSessionTrigger}
                onShowAllTasks={tasksEnabled ? () => setActiveTab('tasks') : null}
              />
            </ErrorBoundary>
          </div>


          {shouldShowTasksTab && <TaskMasterPanel isVisible={activeTab === 'tasks'} />}

          {shouldShowBrowserTab && activeTab === 'browser' && (
            <div className="h-full overflow-hidden">
              <BrowserUsePanel isVisible={activeTab === 'browser'} onShowSettings={onShowSettings} />
            </div>
          )}

          {activeTab.startsWith('plugin:') && (
            <div className="h-full overflow-hidden">
              <PluginTabContent
                pluginName={activeTab.replace('plugin:', '')}
                selectedProject={selectedProject}
                selectedSession={selectedSession}
              />
            </div>
          )}
        </div>

        {filesPanelOpen && (
          <div className="w-80 max-w-[85vw] flex-shrink-0 border-l border-border/60 bg-background md:w-72">
            <FilesPanel
              onFileOpen={(filePath, projectId) => handleFileOpen(filePath, null, { projectId })}
              onClose={() => setFilesPanelOpen(false)}
            />
          </div>
        )}

        <EditorSidebar
          editingFile={editingFile}
          isMobile={isMobile}
          editorExpanded={editorExpanded}
          editorWidth={editorWidth}
          hasManualWidth={hasManualWidth}
          resizeHandleRef={resizeHandleRef}
          onResizeStart={handleResizeStart}
          onCloseEditor={handleCloseEditor}
          onToggleEditorExpand={handleToggleEditorExpand}
          projectPath={selectedProject.path}
          fillSpace={false}
        />
      </div>
    </div>
  );
}

export default React.memo(MainContent);
