import 'server-only';

import { createRequire } from 'node:module';

import type { AnalysisResult, AnalyzeRequest, PerspectiveWdl, RawWdl, RelativeScore } from '@/lib/analysis-types';

const DEFAULT_DEPTH = 12;
const MAX_DEPTH = 24;
const MIN_DEPTH = 6;
const ENGINE_TIMEOUT_MS = 15_000;

type StockfishEngine = {
  addMessageListener(listener: (line: string) => void): void;
  postMessage(command: string): void;
};

type StockfishFactory = () => Promise<StockfishEngine>;

type PendingRequest = {
  lines: string[];
  predicate: (line: string, lines: string[]) => boolean;
  resolve: (lines: string[]) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const require = createRequire(import.meta.url);
const createStockfish = loadStockfishFactory();

class StockfishSession {
  private readonly engine: StockfishEngine;
  private pending: PendingRequest | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(engine: StockfishEngine) {
    this.engine = engine;
    this.engine.addMessageListener(line => this.handleLine(line));
  }

  private handleLine(rawLine: string) {
    const line = String(rawLine ?? '').trim();

    if (!line || !this.pending) {
      return;
    }

    this.pending.lines.push(line);

    if (this.pending.predicate(line, this.pending.lines)) {
      const current = this.pending;
      this.pending = null;
      clearTimeout(current.timer);
      current.resolve(current.lines);
    }
  }

  private run(
    commands: string[],
    predicate: (line: string, lines: string[]) => boolean,
    timeoutMs = ENGINE_TIMEOUT_MS,
  ) {
    return new Promise<string[]>((resolve, reject) => {
      if (this.pending) {
        reject(new Error('Stockfish is already busy.'));
        return;
      }

      const timer = setTimeout(() => {
        const active = this.pending;
        this.pending = null;
        reject(
          new Error(
            `Stockfish timeout after ${timeoutMs}ms.${active ? ` Last lines: ${active.lines.slice(-6).join(' | ')}` : ''}`,
          ),
        );
      }, timeoutMs);

      this.pending = {
        lines: [],
        predicate,
        resolve,
        reject,
        timer,
      };

      for (const command of commands) {
        this.engine.postMessage(command);
      }
    });
  }

  private enqueue<T>(task: () => Promise<T>) {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => undefined);
    return next;
  }

  async initialize() {
    await this.run(['uci'], line => line === 'uciok');
    await this.run(
      [
        'setoption name Threads value 1',
        'setoption name Hash value 32',
        'setoption name UCI_AnalyseMode value true',
        'setoption name UCI_ShowWDL value true',
        'isready',
      ],
      line => line === 'readyok',
    );
  }

  analyze(request: AnalyzeRequest) {
    return this.enqueue(async () => {
      const depth = sanitizeDepth(request.depth);
      const positionCommand = buildPositionCommand(request);
      const lines = await this.run(
        [positionCommand, `go depth ${depth}`],
        line => line.startsWith('bestmove '),
        30_000,
      );

      return parseAnalysis(lines, request.fen, depth);
    });
  }
}

declare global {
  var __chessAnalysisStockfishSession: Promise<StockfishSession> | undefined;
}

export function getStockfishSession() {
  if (!globalThis.__chessAnalysisStockfishSession) {
    globalThis.__chessAnalysisStockfishSession = createStockfish().then(async engine => {
      const session = new StockfishSession(engine);
      await session.initialize();
      return session;
    });
  }

  return globalThis.__chessAnalysisStockfishSession;
}

function loadStockfishFactory() {
  const originalFetch = Reflect.get(globalThis, 'fetch');

  Reflect.set(globalThis, 'fetch', undefined);

  try {
    return require('stockfish.wasm') as StockfishFactory;
  } finally {
    Reflect.set(globalThis, 'fetch', originalFetch);
  }
}

function sanitizeDepth(depth?: number) {
  const parsed = Number.parseInt(String(depth ?? DEFAULT_DEPTH), 10);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_DEPTH;
  }

  return Math.min(Math.max(parsed, MIN_DEPTH), MAX_DEPTH);
}

function buildPositionCommand({ fen, initialFen, moves }: AnalyzeRequest) {
  if (Array.isArray(moves) && moves.length > 0) {
    if (typeof initialFen === 'string' && initialFen.trim()) {
      return `position fen ${initialFen.trim()} moves ${moves.join(' ')}`;
    }

    return `position startpos moves ${moves.join(' ')}`;
  }

  if (typeof fen === 'string' && fen.trim()) {
    return `position fen ${fen.trim()}`;
  }

  return 'position startpos';
}

function parseAnalysis(lines: string[], fen: string | undefined, depthRequested: number): AnalysisResult {
  const bestMoveLine = [...lines].reverse().find(line => line.startsWith('bestmove '));
  const infoLine = [...lines].reverse().find(line => line.startsWith('info ') && /\bscore (cp|mate) /.test(line));

  const bestMoveMatch = bestMoveLine?.match(/^bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/);
  const scoreMatch = infoLine?.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
  const pvSection = infoLine?.match(/\bpv\s+(.+)$/)?.[1] ?? '';
  const wdlMatch = infoLine?.match(/\bwdl\s+(\d+)\s+(\d+)\s+(\d+)/);
  const depthMatch = infoLine?.match(/\bdepth\s+(\d+)/);
  const seldepthMatch = infoLine?.match(/\bseldepth\s+(\d+)/);
  const timeMatch = infoLine?.match(/\btime\s+(\d+)/);
  const nodesMatch = infoLine?.match(/\bnodes\s+(\d+)/);
  const npsMatch = infoLine?.match(/\bnps\s+(\d+)/);
  const multipvMatch = infoLine?.match(/\bmultipv\s+(\d+)/);

  const turn = fen?.trim().split(/\s+/)[1] === 'b' ? 'b' : 'w';
  const score: RelativeScore | null = scoreMatch
    ? {
        type: scoreMatch[1] as RelativeScore['type'],
        value: Number.parseInt(scoreMatch[2], 10),
        bound: infoLine?.includes(' lowerbound')
          ? 'lowerbound'
          : infoLine?.includes(' upperbound')
            ? 'upperbound'
            : 'exact',
      }
    : null;

  const whitePerspective = score
    ? {
        type: score.type,
        value: turn === 'w' ? score.value : -score.value,
      }
    : null;

  const wdl: RawWdl | null = wdlMatch
    ? {
        win: Number.parseInt(wdlMatch[1], 10),
        draw: Number.parseInt(wdlMatch[2], 10),
        loss: Number.parseInt(wdlMatch[3], 10),
      }
    : null;

  const whitePerspectiveWdl: PerspectiveWdl | null = wdl
    ? turn === 'w'
      ? { white: wdl.win, draw: wdl.draw, black: wdl.loss }
      : { white: wdl.loss, draw: wdl.draw, black: wdl.win }
    : null;

  return {
    bestMove: bestMoveMatch?.[1] ?? null,
    ponder: bestMoveMatch?.[2] ?? null,
    depth: Number.parseInt(depthMatch?.[1] ?? String(depthRequested), 10),
    seldepth: seldepthMatch ? Number.parseInt(seldepthMatch[1], 10) : null,
    timeMs: timeMatch ? Number.parseInt(timeMatch[1], 10) : null,
    nodes: nodesMatch ? Number.parseInt(nodesMatch[1], 10) : null,
    nps: npsMatch ? Number.parseInt(npsMatch[1], 10) : null,
    multipv: multipvMatch ? Number.parseInt(multipvMatch[1], 10) : 1,
    pv: pvSection ? pvSection.split(/\s+/) : [],
    raw: lines,
    score,
    whitePerspective,
    wdl,
    whitePerspectiveWdl,
  };
}
