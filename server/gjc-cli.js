import os from 'node:os';
import path from 'node:path';

import crossSpawn from 'cross-spawn';

import { providerAuthService } from './modules/providers/services/provider-auth.service.js';
import { notifyRunFailed, notifyRunStopped } from './services/notification-orchestrator.js';
import { createCompleteMessage, createNormalizedMessage } from './shared/utils.js';

// cross-spawn resolves .cmd shims/PATHEXT on Windows and delegates to
// child_process.spawn everywhere else. Mirrors opencode-cli.js.
const spawnFunction = crossSpawn;

const PROVIDER = 'gjc';

// sessionId -> child process. Keyed by the gjc session id once the header event
// announces it (falls back to a synthetic key until then). Mirrors
// activeOpenCodeProcesses.
const activeGjcProcesses = new Map();

// Default scratch directory for session storage. Passing `--session-dir` keeps
// live runs from writing into the real `~/.gjc/agent/sessions` store; auth and
// config are still read from the real home (we deliberately do NOT set
// GJC_CODING_AGENT_DIR, which would isolate credentials too and break the
// default model).
const DEFAULT_SESSION_DIR = path.join(os.tmpdir(), 'gjc-live-sessions');

/**
 * Reads the gjc session id from the NDJSON header event.
 *
 * gjc puts the session id at the top level of the `session` event
 * (`{ type: 'session', id, cwd, timestamp }`) — unlike per-message events whose
 * `id` is an entry id, so this must only be called for the header event.
 */
function readGjcSessionId(event) {
  if (!event || typeof event !== 'object') {
    return null;
  }

  return event.id || event.sessionId || event.sessionID || null;
}

/**
 * Normalizes a gjc `message.content` field into an array of content parts.
 */
function normalizeGjcContent(content) {
  if (Array.isArray(content)) {
    return content;
  }
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }
  return [];
}

/**
 * Reads the textual body of a gjc `text`/`thinking` content part. gjc uses
 * `thinking` for reasoning parts, but history/older builds use `text`; accept
 * either (matches the read-only gjc-sessions provider).
 */
function readGjcPartText(part) {
  if (typeof part.text === 'string') {
    return part.text;
  }
  if (typeof part.thinking === 'string') {
    return part.thinking;
  }
  return '';
}

/**
 * Flattens a gjc tool-result payload (string, content-part array, or object)
 * into a display string.
 */
function stringifyGjcToolOutput(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (value == null) {
    return '';
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry;
        }
        if (entry && typeof entry === 'object' && typeof entry.text === 'string') {
          return entry.text;
        }
        return '';
      })
      .filter(Boolean)
      .join('');
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Spawns `gjc -p --mode json` for a single non-interactive run and streams its
 * NDJSON output to the writer as normalized messages.
 *
 * Mirrors spawnOpenCode: same Map-based lifecycle, stdout line buffering,
 * session-created handshake, terminal `complete`, and error handling. The
 * gjc-specific bits are the argv/stdin contract and the NDJSON event mapping.
 */
async function spawnGjc(message, options = {}, writer) {
  return new Promise((resolve, reject) => {
    const { sessionId, projectPath, cwd, model, sessionDir, sessionSummary } = options;
    const workingDir = cwd || projectPath || process.cwd();
    const resolvedSessionDir = sessionDir || DEFAULT_SESSION_DIR;
    const processKey = sessionId || Date.now().toString();

    let capturedSessionId = sessionId || null;
    let sessionCreatedSent = false;
    let stdoutLineBuffer = '';
    let terminalNotificationSent = false;
    let completeSent = false;
    let gjcProcess = null;

    // Assistant text arrives as monotonically growing snapshots (gjc emits the
    // accumulated partial message on every streaming update). The frontend
    // `stream_delta` contract expects *deltas* that it appends, so we track how
    // much text has been emitted and forward only the new suffix.
    let streamedText = '';
    let streamActive = false;
    // Dedupe non-streamed emissions (thinking / tool_use / tool_result / error),
    // which repeat across message_end and turn_end for the same logical message.
    const emittedKeys = new Set();

    const sendNormalized = (fields) => {
      writer.send(createNormalizedMessage({
        sessionId: capturedSessionId || sessionId || null,
        provider: PROVIDER,
        ...fields,
      }));
    };

    const emitOnce = (key, emit) => {
      if (emittedKeys.has(key)) {
        return;
      }
      emittedKeys.add(key);
      emit();
    };

    const notifyTerminalState = ({ code = null, error = null } = {}) => {
      if (terminalNotificationSent) {
        return;
      }

      terminalNotificationSent = true;
      const finalSessionId = capturedSessionId || sessionId || processKey;
      if (code === 0 && !error) {
        notifyRunStopped({
          userId: writer?.userId || null,
          provider: PROVIDER,
          sessionId: finalSessionId,
          sessionName: sessionSummary,
          stopReason: 'completed',
        });
        return;
      }

      notifyRunFailed({
        userId: writer?.userId || null,
        provider: PROVIDER,
        sessionId: finalSessionId,
        sessionName: sessionSummary,
        error: error || `gjc CLI exited with code ${code}`,
      });
    };

    const registerSession = (nextSessionId) => {
      if (!nextSessionId || capturedSessionId === nextSessionId) {
        return;
      }

      capturedSessionId = nextSessionId;
      if (processKey !== capturedSessionId && gjcProcess) {
        activeGjcProcesses.delete(processKey);
        activeGjcProcesses.set(capturedSessionId, gjcProcess);
      }
      if (gjcProcess) {
        gjcProcess.sessionId = capturedSessionId;
      }

      if (writer.setSessionId && typeof writer.setSessionId === 'function') {
        writer.setSessionId(capturedSessionId);
      }

      if (!sessionId && !sessionCreatedSent) {
        sessionCreatedSent = true;
        writer.send(createNormalizedMessage({
          kind: 'session_created',
          newSessionId: capturedSessionId,
          sessionId: capturedSessionId,
          provider: PROVIDER,
        }));
      }
    };

    const finalizeStream = () => {
      if (streamActive) {
        sendNormalized({ kind: 'stream_end' });
        streamActive = false;
      }
    };

    // Emit the new suffix of the accumulated assistant text as a stream_delta.
    // A fresh stream starts whenever no stream is currently open, so each
    // assistant turn accumulates independently.
    const streamAssistantText = (content) => {
      if (!streamActive) {
        streamedText = '';
      }

      const fullText = content
        .filter((part) => part && part.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text)
        .join('');

      if (fullText.length > streamedText.length && fullText.startsWith(streamedText)) {
        const delta = fullText.slice(streamedText.length);
        streamedText = fullText;
        streamActive = true;
        sendNormalized({ kind: 'stream_delta', content: delta });
      }
    };

    const emitGjcAssistantError = (msg) => {
      const detail = typeof msg.errorMessage === 'string' && msg.errorMessage.trim()
        ? msg.errorMessage.trim()
        : 'gjc run failed';
      const status = typeof msg.errorStatus === 'number' ? ` (status ${msg.errorStatus})` : '';
      emitOnce(`error:${detail}${status}`, () => {
        sendNormalized({ kind: 'error', content: `${detail}${status}` });
      });
    };

    const emitGjcToolCallPart = (part) => {
      const toolId = part.id || part.toolCallId || part.callId || '';
      const toolInput = part.arguments ?? part.toolInput ?? part.input;
      const key = `tool_use:${toolId || stringifyGjcToolOutput(toolInput)}`;
      emitOnce(key, () => {
        sendNormalized({
          kind: 'tool_use',
          toolName: part.name || part.toolName || 'Unknown',
          toolInput,
          toolId,
        });
      });
    };

    const emitGjcToolResult = (toolId, output, isError) => {
      emitOnce(`tool_result:${toolId}`, () => {
        sendNormalized({
          kind: 'tool_result',
          toolId,
          content: stringifyGjcToolOutput(output),
          isError: Boolean(isError),
        });
      });
    };

    // A gjc tool result arrives as its own message (role: 'toolResult'). The
    // output lives on the message content; history/older builds fold it into a
    // `toolResult` content part — handle both.
    const emitGjcToolResultMessage = (msg) => {
      const parts = normalizeGjcContent(msg.content);
      const resultPart = parts.find((part) => part && part.type === 'toolResult');
      if (resultPart) {
        const toolId = msg.toolCallId || resultPart.toolCallId || resultPart.id || resultPart.callId || '';
        emitGjcToolResult(
          toolId,
          resultPart.output ?? resultPart.content ?? resultPart.result,
          msg.isError || resultPart.isError,
        );
        return;
      }

      const toolId = msg.toolCallId || msg.toolId || '';
      emitGjcToolResult(toolId, msg.content, msg.isError);
    };

    const handleGjcMessage = (msg, { streamText, final }) => {
      if (!msg || typeof msg !== 'object') {
        return;
      }

      // Volatile/custom context messages (e.g. project-context injections) are
      // flagged display:false and must not surface in the chat transcript.
      if (msg.display === false) {
        return;
      }

      const role = typeof msg.role === 'string' ? msg.role : 'assistant';

      // User prompts are echoed optimistically by the client; internal roles
      // (custom, developer, hookMessage, ...) are not chat content.
      if (role !== 'assistant' && role !== 'toolResult') {
        return;
      }

      if (role === 'toolResult') {
        if (final) {
          emitGjcToolResultMessage(msg);
        }
        return;
      }

      // role === 'assistant'
      if (msg.stopReason === 'aborted') {
        // The websocket abort handler emits the terminal complete on this run's
        // behalf; just close any open stream.
        if (final) {
          finalizeStream();
        }
        return;
      }

      const content = normalizeGjcContent(msg.content);

      if (streamText && msg.stopReason !== 'error') {
        streamAssistantText(content);
      }

      if (!final) {
        return;
      }

      finalizeStream();

      if (msg.stopReason === 'error') {
        emitGjcAssistantError(msg);
        return;
      }

      for (const part of content) {
        if (!part || typeof part !== 'object') {
          continue;
        }
        if (part.type === 'thinking') {
          const text = readGjcPartText(part);
          if (text.trim()) {
            emitOnce(`thinking:${text}`, () => {
              sendNormalized({ kind: 'thinking', content: text });
            });
          }
        } else if (part.type === 'toolCall') {
          emitGjcToolCallPart(part);
        } else if (part.type === 'toolResult') {
          // Defensive: some builds fold tool output into an assistant content part.
          const toolId = part.toolCallId || part.id || part.callId || '';
          emitGjcToolResult(toolId, part.output ?? part.content ?? part.result, part.isError);
        }
      }
    };

    const processGjcOutputLine = (line) => {
      if (!line || !line.trim()) {
        return;
      }

      let event;
      try {
        event = JSON.parse(line);
      } catch {
        // Malformed / partial NDJSON line — skip it (do not surface to the UI).
        return;
      }

      if (!event || typeof event !== 'object') {
        return;
      }

      switch (event.type) {
        case 'session':
          registerSession(readGjcSessionId(event));
          return;
        case 'message_start':
        case 'message_update':
          handleGjcMessage(event.message, { streamText: true, final: false });
          return;
        case 'message_end':
          handleGjcMessage(event.message, { streamText: true, final: true });
          return;
        case 'turn_end':
          // message_end already streamed/finalized this turn's assistant text;
          // turn_end carries the same message, so only reconcile discrete parts.
          handleGjcMessage(event.message, { streamText: false, final: true });
          return;
        case 'agent_end': {
          // Crash paths surface the failing assistant message only via agent_end.
          const messages = Array.isArray(event.messages) ? event.messages : [];
          for (const finalMessage of messages) {
            if (
              finalMessage
              && typeof finalMessage === 'object'
              && finalMessage.role === 'assistant'
              && finalMessage.stopReason === 'error'
            ) {
              emitGjcAssistantError(finalMessage);
            }
          }
          return;
        }
        default:
          // agent_start, turn_start, tool_execution_*, model_change, custom, ...
          // carry no directly renderable content.
          return;
      }
    };

    // gjc reads the prompt from stdin when stdin is piped (Bun reports
    // isTTY === false), so the user prompt never enters argv — safe for prompts
    // that start with `-`.
    const args = ['-p', '--mode', 'json', '--session-dir', resolvedSessionDir];
    if (sessionId) {
      args.push('-r', sessionId);
    }
    if (model) {
      args.push('--model', model);
    }
    // gjc -p reads the prompt as a positional arg (it does NOT read piped stdin in
    // print mode). cross-spawn passes argv without a shell, so this is injection-safe.
    args.push(String(message ?? ''));

    gjcProcess = spawnFunction('gjc', args, {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      // GJC_NOTIFICATIONS=0 is an authoritative opt-out for the ephemeral harness.
      env: { ...process.env, GJC_NOTIFICATIONS: '0' },
    });

    activeGjcProcesses.set(processKey, gjcProcess);
    gjcProcess.sessionId = processKey;

    // Prompt is passed as an argv positional (gjc -p ignores piped stdin), so just
    // close stdin right away so gjc doesn't block waiting on it.
    if (gjcProcess.stdin) {
      gjcProcess.stdin.on('error', () => {});
      gjcProcess.stdin.end();
    }

    gjcProcess.stdout.on('data', (data) => {
      stdoutLineBuffer += data.toString();
      const completeLines = stdoutLineBuffer.split(/\r?\n/);
      stdoutLineBuffer = completeLines.pop() || '';

      completeLines.forEach((line) => {
        processGjcOutputLine(line.trim());
      });
    });

    gjcProcess.stderr.on('data', (data) => {
      const stderrText = data.toString();
      if (!stderrText.trim()) {
        return;
      }

      // gjc uses stderr for diagnostics; real run failures come through stdout
      // as `stopReason: 'error'`. Log, don't surface as chat errors.
      console.error(`[gjc] ${stderrText.trimEnd()}`);
    });

    gjcProcess.on('close', async (code) => {
      const finalSessionId = capturedSessionId || sessionId || processKey;
      activeGjcProcesses.delete(finalSessionId);
      activeGjcProcesses.delete(processKey);

      if (stdoutLineBuffer.trim()) {
        processGjcOutputLine(stdoutLineBuffer.trim());
        stdoutLineBuffer = '';
      }

      // Flush any stream left open by an abrupt exit (the terminal complete also
      // finalizes streaming on the client, so this is belt-and-suspenders).
      finalizeStream();

      // Terminal complete — skipped for aborted runs (the websocket abort
      // handler already sent the aborted complete on this run's behalf).
      if (!completeSent && !gjcProcess.aborted) {
        completeSent = true;
        writer.send(createCompleteMessage({ provider: PROVIDER, sessionId: finalSessionId, exitCode: code }));
      }

      if (code === 0) {
        notifyTerminalState({ code });
        resolve();
        return;
      }

      if (code === 127 || code === null) {
        const installed = await providerAuthService.isProviderInstalled(PROVIDER);
        if (!installed) {
          writer.send(createNormalizedMessage({
            kind: 'error',
            content: 'gjc CLI is not installed. Ensure the `gjc` command is available on PATH.',
            sessionId: finalSessionId,
            provider: PROVIDER,
          }));
        }
      }

      notifyTerminalState({ code });
      reject(new Error(code === null ? 'gjc CLI process was terminated' : `gjc CLI exited with code ${code}`));
    });

    gjcProcess.on('error', async (error) => {
      const finalSessionId = capturedSessionId || sessionId || processKey;
      activeGjcProcesses.delete(finalSessionId);
      activeGjcProcesses.delete(processKey);

      const installed = await providerAuthService.isProviderInstalled(PROVIDER);
      const errorContent = !installed
        ? 'gjc CLI is not installed. Ensure the `gjc` command is available on PATH.'
        : error.message;

      writer.send(createNormalizedMessage({
        kind: 'error',
        content: errorContent,
        sessionId: finalSessionId,
        provider: PROVIDER,
      }));
      if (!completeSent && !gjcProcess.aborted) {
        completeSent = true;
        writer.send(createCompleteMessage({ provider: PROVIDER, sessionId: finalSessionId, exitCode: 1 }));
      }
      notifyTerminalState({ error });
      reject(error);
    });
  });
}

function abortGjcSession(sessionId) {
  const gjcProcess = activeGjcProcesses.get(sessionId);
  if (!gjcProcess) {
    return false;
  }

  // The websocket abort handler sends the terminal complete (aborted: true);
  // flag the process so its close handler does not emit a second one.
  gjcProcess.aborted = true;
  gjcProcess.kill('SIGTERM');
  activeGjcProcesses.delete(sessionId);
  return true;
}

function isGjcSessionActive(sessionId) {
  return activeGjcProcesses.has(sessionId);
}

function getActiveGjcSessions() {
  return Array.from(activeGjcProcesses.keys());
}

export {
  spawnGjc,
  abortGjcSession,
  isGjcSessionActive,
  getActiveGjcSessions,
};
