import fsSync from 'node:fs';
import readline from 'node:readline';

import { sessionsDb } from '@/modules/database/index.js';
import type { IProviderSessions } from '@/shared/interfaces.js';
import type { AnyRecord, FetchHistoryOptions, FetchHistoryResult, NormalizedMessage } from '@/shared/types.js';
import { createNormalizedMessage, generateMessageId, readObjectRecord, sliceTailPage } from '@/shared/utils.js';

const PROVIDER = 'gjc';

type GjcHistoryResult = {
  messages: AnyRecord[];
  tokenUsage?: unknown;
};

/**
 * Reads the text body of a gjc content part (`text` or `thinking`).
 */
function extractGjcPartText(part: AnyRecord): string {
  if (typeof part.text === 'string') {
    return part.text;
  }
  if (typeof part.thinking === 'string') {
    return part.thinking;
  }
  return '';
}

/**
 * Reads a gjc JSONL transcript and flattens `type:"message"` lines into the
 * compact intermediate shape consumed by `normalizeHistoryEntry`.
 *
 * Only message lines are processed; header (`type:"session"`) and control
 * events (`model_change`, `thinking_level_change`, `custom`, ...) are ignored.
 * Each `message.content[]` part becomes its own intermediate record with a
 * unique id so multi-part turns never collide.
 */
async function getGjcSessionMessages(sessionId: string): Promise<GjcHistoryResult> {
  try {
    const sessionFilePath = sessionsDb.getSessionById(sessionId)?.jsonl_path;

    if (!sessionFilePath) {
      console.warn(`gjc session file not found for session ${sessionId}`);
      return { messages: [] };
    }

    const messages: AnyRecord[] = [];
    const fileStream = fsSync.createReadStream(sessionFilePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line.trim()) {
        continue;
      }

      try {
        const entry = JSON.parse(line) as AnyRecord;
        if (entry.type !== 'message') {
          continue;
        }

        const message = entry.message as AnyRecord | undefined;
        if (!message) {
          continue;
        }

        const role = typeof message.role === 'string' ? message.role : 'assistant';
        const timestamp = entry.timestamp;
        const entryId = typeof entry.id === 'string'
          ? entry.id
          : (typeof entry.timestamp === 'string' ? entry.timestamp : generateMessageId(PROVIDER));

        const content = Array.isArray(message.content)
          ? message.content
          : (typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : []);

        let partIndex = 0;
        for (const rawPart of content) {
          if (!rawPart || typeof rawPart !== 'object') {
            continue;
          }

          const part = rawPart as AnyRecord;
          const partId = `${entryId}:${partIndex}`;
          partIndex += 1;

          switch (part.type) {
            case 'text': {
              const text = typeof part.text === 'string' ? part.text : '';
              if (!text.trim()) {
                break;
              }
              messages.push({
                uuid: `${partId}:text`,
                timestamp,
                message: {
                  role: role === 'assistant' ? 'assistant' : 'user',
                  content: text,
                },
              });
              break;
            }
            case 'thinking': {
              const text = extractGjcPartText(part);
              if (!text.trim()) {
                break;
              }
              messages.push({
                uuid: `${partId}:thinking`,
                type: 'thinking',
                timestamp,
                message: {
                  role: 'assistant',
                  content: text,
                },
              });
              break;
            }
            case 'toolCall': {
              messages.push({
                uuid: `${partId}:toolcall`,
                type: 'tool_use',
                timestamp,
                toolName: part.toolName ?? part.name ?? 'Unknown',
                toolInput: part.toolInput ?? part.input ?? part.arguments,
                toolCallId: part.toolCallId ?? part.id ?? part.callId,
              });
              break;
            }
            case 'toolResult': {
              messages.push({
                uuid: `${partId}:toolresult`,
                type: 'tool_result',
                timestamp,
                toolCallId: part.toolCallId ?? part.id ?? part.callId,
                output: part.output ?? part.content ?? part.result ?? '',
                isError: Boolean(part.isError),
              });
              break;
            }
            default:
              break;
          }
        }
      } catch {
        // Skip malformed lines.
      }
    }

    messages.sort(
      (a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime(),
    );

    return { messages, tokenUsage: null };
  } catch (error) {
    console.error(`Error reading gjc session messages for ${sessionId}:`, error);
    return { messages: [] };
  }
}

export class GjcSessionsProvider implements IProviderSessions {
  /**
   * Normalizes one flattened gjc content-part record into the shared envelope.
   */
  private normalizeHistoryEntry(raw: AnyRecord, sessionId: string | null): NormalizedMessage[] {
    const ts = raw.timestamp || new Date().toISOString();
    const baseId = raw.uuid || generateMessageId(PROVIDER);

    if (raw.type === 'thinking') {
      const thinkingContent = typeof raw.message?.content === 'string'
        ? raw.message.content
        : '';
      if (!thinkingContent.trim()) {
        return [];
      }
      return [createNormalizedMessage({
        id: baseId,
        sessionId,
        timestamp: ts,
        provider: PROVIDER,
        kind: 'thinking',
        content: thinkingContent,
      })];
    }

    if (raw.message?.role === 'user') {
      const content = typeof raw.message.content === 'string' ? raw.message.content : '';
      if (!content.trim()) {
        return [];
      }
      return [createNormalizedMessage({
        id: baseId,
        sessionId,
        timestamp: ts,
        provider: PROVIDER,
        kind: 'text',
        role: 'user',
        content,
      })];
    }

    if (raw.message?.role === 'assistant') {
      const content = typeof raw.message.content === 'string' ? raw.message.content : '';
      if (!content.trim()) {
        return [];
      }
      return [createNormalizedMessage({
        id: baseId,
        sessionId,
        timestamp: ts,
        provider: PROVIDER,
        kind: 'text',
        role: 'assistant',
        content,
      })];
    }

    if (raw.type === 'tool_use' || raw.toolName) {
      return [createNormalizedMessage({
        id: baseId,
        sessionId,
        timestamp: ts,
        provider: PROVIDER,
        kind: 'tool_use',
        toolName: raw.toolName || 'Unknown',
        toolInput: raw.toolInput,
        toolId: raw.toolCallId || baseId,
      })];
    }

    if (raw.type === 'tool_result') {
      const rawOutput = raw.output;
      const content = typeof rawOutput === 'string'
        ? rawOutput
        : rawOutput == null ? '' : JSON.stringify(rawOutput);
      return [createNormalizedMessage({
        id: baseId,
        sessionId,
        timestamp: ts,
        provider: PROVIDER,
        kind: 'tool_result',
        toolId: raw.toolCallId || '',
        content,
        isError: Boolean(raw.isError),
      })];
    }

    return [];
  }

  /**
   * Normalizes a persisted gjc history record. gjc has no live SDK event path
   * in the read-only integration, so history and (future) live events share the
   * same content-part normalization.
   */
  normalizeMessage(rawMessage: unknown, sessionId: string | null): NormalizedMessage[] {
    const raw = readObjectRecord(rawMessage);
    if (!raw) {
      return [];
    }

    return this.normalizeHistoryEntry(raw, sessionId);
  }

  /**
   * Loads gjc JSONL history and folds tool results into their tool calls.
   */
  async fetchHistory(
    sessionId: string,
    options: FetchHistoryOptions = {},
  ): Promise<FetchHistoryResult> {
    const { limit = null, offset = 0 } = options;

    let result: GjcHistoryResult;
    try {
      result = await getGjcSessionMessages(sessionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[GjcProvider] Failed to load session ${sessionId}:`, message);
      return { messages: [], total: 0, hasMore: false, offset: 0, limit: null };
    }

    const rawMessages = result.messages;
    const tokenUsage = result.tokenUsage;

    const normalized: NormalizedMessage[] = [];
    for (const raw of rawMessages) {
      normalized.push(...this.normalizeHistoryEntry(raw, sessionId));
    }

    const toolResultMap = new Map<string, NormalizedMessage>();
    for (const msg of normalized) {
      if (msg.kind === 'tool_result' && msg.toolId) {
        toolResultMap.set(msg.toolId, msg);
      }
    }
    for (const msg of normalized) {
      if (msg.kind === 'tool_use' && msg.toolId && toolResultMap.has(msg.toolId)) {
        const toolResult = toolResultMap.get(msg.toolId);
        if (toolResult) {
          msg.toolResult = { content: toolResult.content, isError: toolResult.isError };
        }
      }
    }

    let total = 0;
    for (const msg of normalized) {
      if (msg.kind !== 'tool_result') {
        total += 1;
      }
    }
    const normalizedOffset = Math.max(0, offset);
    const normalizedLimit = limit === null ? null : Math.max(0, limit);
    const { page, hasMore } = sliceTailPage(normalized, normalizedLimit, normalizedOffset);

    return {
      messages: page,
      total,
      hasMore,
      offset: normalizedOffset,
      limit: normalizedLimit,
      tokenUsage,
    };
  }
}
