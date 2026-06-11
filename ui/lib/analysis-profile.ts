import type { AnalyzeRequest } from './analysis-types';

export const DETERMINISTIC_ANALYSIS_PROFILE = {
  version: 4,
  depth: 17,
  multipv: 3,
  movetimeMs: null,
} as const;

export function buildDeterministicAnalyzeRequest(
  request: AnalyzeRequest,
  options?: {
    multipv?: number;
    depth?: number;
  },
): AnalyzeRequest {
  return {
    ...request,
    depth: options?.depth ?? DETERMINISTIC_ANALYSIS_PROFILE.depth,
    multipv: options?.multipv ?? DETERMINISTIC_ANALYSIS_PROFILE.multipv,
  };
}

export function getDeterministicAnalysisCacheKey({
  fen,
  initialFen,
  moves,
  multipv,
  depth,
}: AnalyzeRequest) {
  return [
    `analysis:v${DETERMINISTIC_ANALYSIS_PROFILE.version}`,
    initialFen ?? 'startpos',
    fen ?? '',
    (moves ?? []).join(' '),
    depth ?? DETERMINISTIC_ANALYSIS_PROFILE.depth,
    multipv ?? DETERMINISTIC_ANALYSIS_PROFILE.multipv,
  ].join('|');
}
