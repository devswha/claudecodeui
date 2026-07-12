import type { IdleGjcTarget } from '../../types/app';

/** 현재 맵에서 (동명+lineage+동일 tmuxId) 적격 실 세션 id 전체. synthetic 제외. */
function eligibleSessionIds(tmuxName: string, tmuxId: string,
  names: ReadonlyMap<string, string>, lineage: ReadonlySet<string>,
  tmuxIds: ReadonlyMap<string, string>): string[] {
  const out: string[] = [];
  for (const [id, name] of names) {
    if (id.startsWith('idle-gjc:')) continue;
    if (name !== tmuxName) continue;
    if (!lineage.has(id)) continue;
    if (tmuxIds.get(id) !== tmuxId) continue;   // missing/mismatch=제외(fail-closed)[P1-1]
    out.push(id);
  }
  return out;
}

/** 진입점에서 호출 — 현재 맵으로 tmuxName/tmuxId 도출 + 오픈 시점 적격자를 excluded로 캡처. [P1-C] */
export function buildIdleTarget(id: string,
  names: ReadonlyMap<string, string>, lineage: ReadonlySet<string>,
  tmuxIds: ReadonlyMap<string, string>): IdleGjcTarget | null {
  const tmuxName = names.get(id); const tmuxId = tmuxIds.get(id);
  if (!id.startsWith('idle-gjc:') || !tmuxName || !tmuxId || !lineage.has(id)) return null;
  return { kind: 'idle-gjc', tmuxName, tmuxId,
    excludedSessionIds: eligibleSessionIds(tmuxName, tmuxId, names, lineage, tmuxIds) };
}

/** excluded 제외한 **신규 관측** 적격 후보. [P1-C] */
export function newEligibleSessionIds(target: IdleGjcTarget,
  names: ReadonlyMap<string, string>, lineage: ReadonlySet<string>,
  tmuxIds: ReadonlyMap<string, string>): string[] {
  const excluded = new Set(target.excludedSessionIds);
  return eligibleSessionIds(target.tmuxName, target.tmuxId, names, lineage, tmuxIds)
    .filter((id) => !excluded.has(id));
}

/** 무효화는 동명 live row의 관측된 세대 교체에만. 단순 소멸(undefined)은 정상 전환 수반이므로 false. [P1-A] */
export function isGenerationReplaced(target: IdleGjcTarget,
  names: ReadonlyMap<string, string>, lineage: ReadonlySet<string>,
  tmuxIds: ReadonlyMap<string, string>): boolean {
  for (const [id, name] of names) {
    if (name !== target.tmuxName || !lineage.has(id)) continue;
    const tmuxId = tmuxIds.get(id);
    if (typeof tmuxId === 'string' && tmuxId !== target.tmuxId) return true;
  }
  return false;
}

export type IdleStep =
  | { type: 'invalidate' }                  // 세대 교체 관측 → takeover 해제
  | { type: 'idle' }                        // 신규 후보 0 → idle 무기한 유지
  | { type: 'ambiguous' }                   // 신규 후보 ≥2 → 배너, 자동전환 안 함 [P1-C]
  | { type: 'resolving'; targetId: string } // 신규 후보 1, owner 미로드
  | { type: 'navigate'; targetId: string }; // 신규 후보 1 + owner 로드

export function computeIdleStep(target: IdleGjcTarget,
  names: ReadonlyMap<string, string>, lineage: ReadonlySet<string>,
  tmuxIds: ReadonlyMap<string, string>, ownerLoaded: (id: string) => boolean): IdleStep {
  if (isGenerationReplaced(target, names, lineage, tmuxIds)) return { type: 'invalidate' };
  const cands = newEligibleSessionIds(target, names, lineage, tmuxIds);
  if (cands.length === 0) return { type: 'idle' };
  if (cands.length > 1) return { type: 'ambiguous' };       // 다중 transcript 정상 구성 → 자동전환 거부[P1-C]
  const targetId = cands[0];
  return ownerLoaded(targetId) ? { type: 'navigate', targetId } : { type: 'resolving', targetId };
}

export function composerKey(name: string, tmuxId: string): string {
  return `${name}:${tmuxId}`;
}

export type ResolvingState = {
  targetId: string;
  startedAt: number;
  timedOut: boolean;
};

/**
 * Keeps a resolving timer only while it tracks the same candidate. Supplying
 * startedAt makes target replacement deterministic for tests.
 */
export function nextResolvingOnStep(
  prev: ResolvingState | null,
  step: IdleStep,
  startedAt = Date.now(),
): ResolvingState | null {
  if (step.type !== 'resolving') return null;
  if (prev?.targetId === step.targetId) return prev;
  return { targetId: step.targetId, startedAt, timedOut: false };
}
