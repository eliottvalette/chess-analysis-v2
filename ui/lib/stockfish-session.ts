import 'server-only';

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { Chess } from 'chess.js';

import type {
  AnalysisLine,
  AnalysisResult,
  AnalyzeRequest,
  PerspectiveWdl,
  RawWdl,
  RelativeScore,
} from '@/lib/analysis-types';

const DEFAULT_DEPTH = 12;
const MAX_DEPTH = 24;
const MIN_DEPTH = 6;
const DEFAULT_MULTIPV = 1;
const MAX_MULTIPV = 3;
const ENGINE_TIMEOUT_MS = 15_000;
const DEFAULT_STOCKFISH_PATHS = ['/opt/homebrew/bin/stockfish', '/usr/local/bin/stockfish', 'stockfish'];

type StockfishEngine = {
  addMessageListener(listener: (line: string) => void): void;
  postMessage(command: string): void;
  dispose(): void;
};

type PendingRequest = {
  lines: string[];
  predicate: (line: string, lines: string[]) => boolean;
  resolve: (lines: string[]) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

class NativeStockfishEngine implements StockfishEngine {
  private readonly listeners = new Set<(line: string) => void>();
  private bufferedOutput = '';

  private constructor(private readonly process: ChildProcessWithoutNullStreams) {
    this.process.stdout.setEncoding('utf8');
    this.process.stderr.setEncoding('utf8');
    this.process.stdout.on('data', chunk => this.handleOutput(String(chunk)));
    this.process.stderr.on('data', chunk => this.handleOutput(String(chunk)));
  }

  static async create() {
    const configuredPath = process.env.STOCKFISH_PATH?.trim();
    const candidates = configuredPath ? [configuredPath, ...DEFAULT_STOCKFISH_PATHS] : DEFAULT_STOCKFISH_PATHS;
    const uniqueCandidates = [...new Set(candidates)];
    const errors: string[] = [];

    for (const candidate of uniqueCandidates) {
      try {
        const engine = await NativeStockfishEngine.tryCreate(candidate);
        return engine;
      } catch (error) {
        errors.push(`${candidate}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    throw new Error(`Unable to start Stockfish. Tried ${errors.join(' | ')}`);
  }

  private static tryCreate(command: string) {
    return new Promise<NativeStockfishEngine>((resolve, reject) => {
      const child = spawn(command, [], { stdio: 'pipe' });

      child.once('spawn', () => resolve(new NativeStockfishEngine(child)));
      child.once('error', reject);
      child.once('exit', code => {
        if (code !== null) {
          reject(new Error(`exited with code ${code}`));
        }
      });
    });
  }

  addMessageListener(listener: (line: string) => void) {
    this.listeners.add(listener);
  }

  postMessage(command: string) {
    this.process.stdin.write(`${command}\n`);
  }

  dispose() {
    this.listeners.clear();

    if (!this.process.killed) {
      this.process.kill();
    }
  }

  private handleOutput(output: string) {
    this.bufferedOutput += output;
    const lines = this.bufferedOutput.split(/\r?\n/);
    this.bufferedOutput = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed) {
        continue;
      }

      for (const listener of this.listeners) {
        listener(trimmed);
      }
    }
  }
}

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
      const multipv = sanitizeMultiPv(request.multipv);
      const positionCommand = buildPositionCommand(request);
      const analysisFen = getAnalysisFen(request);
      const lines = await this.run(
        ['setoption name Clear Hash', `setoption name MultiPV value ${multipv}`, positionCommand, `go depth ${depth}`],
        line => line.startsWith('bestmove '),
        30_000,
      );

      return parseAnalysis(lines, analysisFen, depth);
    });
  }
}

declare global {
  var __chessAnalysisStockfishSession: Promise<StockfishSession> | undefined;
}

if (process.env.NODE_ENV !== 'production') {
  globalThis.__chessAnalysisStockfishSession = undefined;
}

export function getStockfishSession() {
  if (!globalThis.__chessAnalysisStockfishSession) {
    const sessionPromise = NativeStockfishEngine.create()
      .then(async engine => {
        const session = new StockfishSession(engine);
        await session.initialize();
        return session;
      })
      .catch(error => {
        globalThis.__chessAnalysisStockfishSession = undefined;
        throw error;
      });

    globalThis.__chessAnalysisStockfishSession = sessionPromise;
  }

  return globalThis.__chessAnalysisStockfishSession;
}

function sanitizeDepth(depth?: number) {
  const parsed = Number.parseInt(String(depth ?? DEFAULT_DEPTH), 10);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_DEPTH;
  }

  return Math.min(Math.max(parsed, MIN_DEPTH), MAX_DEPTH);
}

function sanitizeMultiPv(multipv?: number) {
  const parsed = Number.parseInt(String(multipv ?? DEFAULT_MULTIPV), 10);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_MULTIPV;
  }

  return Math.min(Math.max(parsed, DEFAULT_MULTIPV), MAX_MULTIPV);
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

function getAnalysisFen({ fen, initialFen, moves }: AnalyzeRequest) {
  if (typeof fen === 'string' && fen.trim()) {
    return fen.trim();
  }

  try {
    const chess = initialFen?.trim() ? new Chess(initialFen.trim()) : new Chess();

    for (const move of moves ?? []) {
      chess.move({
        from: move.slice(0, 2),
        to: move.slice(2, 4),
        ...(move.length > 4 ? { promotion: move[4] } : {}),
      });
    }

    return chess.fen();
  } catch {
    return fen;
  }
}

function parseAnalysis(lines: string[], fen: string | undefined, depthRequested: number): AnalysisResult {
  const bestMoveLine = [...lines].reverse().find(line => line.startsWith('bestmove '));
  const parsedLines = parseAnalysisLines(lines, fen, depthRequested);
  const primaryLine = parsedLines.find(line => line.multipv === 1) ?? parsedLines[0] ?? null;
  const infoLine = findBestInfoLine(lines, 1) ?? findBestInfoLine(lines);

  const bestMoveMatch = bestMoveLine?.match(/^bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/);
  const wdlMatch = infoLine?.match(/\bwdl\s+(\d+)\s+(\d+)\s+(\d+)/);
  const depthMatch = infoLine?.match(/\bdepth\s+(\d+)/);
  const seldepthMatch = infoLine?.match(/\bseldepth\s+(\d+)/);
  const timeMatch = infoLine?.match(/\btime\s+(\d+)/);
  const nodesMatch = infoLine?.match(/\bnodes\s+(\d+)/);
  const npsMatch = infoLine?.match(/\bnps\s+(\d+)/);

  const turn = fen?.trim().split(/\s+/)[1] === 'b' ? 'b' : 'w';
  const terminalPerspective = inferTerminalPerspective(fen);
  const score = primaryLine?.score ?? null;
  const whitePerspective =
    primaryLine?.whitePerspective ??
    (terminalPerspective
      ? {
          type: terminalPerspective.whiteScore === 0 ? 'cp' : 'mate',
          value: terminalPerspective.whiteScore,
        }
      : null);

  const wdl: RawWdl | null =
    wdlMatch
    ? {
        win: Number.parseInt(wdlMatch[1], 10),
        draw: Number.parseInt(wdlMatch[2], 10),
        loss: Number.parseInt(wdlMatch[3], 10),
      }
    : terminalPerspective?.rawWdl ?? null;

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
    multipv: primaryLine?.multipv ?? 1,
    pv: primaryLine?.pv ?? [],
    raw: lines,
    score,
    whitePerspective,
    wdl,
    whitePerspectiveWdl,
    lines: parsedLines.length > 0 ? parsedLines : primaryLine ? [primaryLine] : [],
  };
}

function parseAnalysisLines(lines: string[], fen: string | undefined, depthRequested: number) {
  const byMultiPv = new Map<number, AnalysisLine>();

  for (const line of lines) {
    if (!line.startsWith('info ') || !/\bscore (cp|mate) /.test(line)) {
      continue;
    }

    const parsed = parseInfoLine(line, fen, depthRequested);

    if (!parsed) {
      continue;
    }

    const previous = byMultiPv.get(parsed.multipv);

    if (!previous || parsed.depth >= previous.depth) {
      byMultiPv.set(parsed.multipv, parsed);
    }
  }

  return [...byMultiPv.values()].sort((left, right) => left.multipv - right.multipv);
}

function parseInfoLine(line: string, fen: string | undefined, depthRequested: number): AnalysisLine | null {
  const scoreMatch = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
  const pvSection = line.match(/\bpv\s+(.+)$/)?.[1] ?? '';

  if (!scoreMatch) {
    return null;
  }

  const turn = fen?.trim().split(/\s+/)[1] === 'b' ? 'b' : 'w';
  const terminalPerspective = inferTerminalPerspective(fen);
  const score: RelativeScore = {
    type: scoreMatch[1] as RelativeScore['type'],
    value: Number.parseInt(scoreMatch[2], 10),
    bound: line.includes(' lowerbound') ? 'lowerbound' : line.includes(' upperbound') ? 'upperbound' : 'exact',
  };
  const whitePerspective = {
    type: score.type,
    value:
      score.type === 'mate' && score.value === 0 && terminalPerspective
        ? terminalPerspective.whiteScore
        : turn === 'w'
          ? score.value
          : -score.value,
  };
  const pv = pvSection ? pvSection.split(/\s+/) : [];

  return {
    multipv: Number.parseInt(line.match(/\bmultipv\s+(\d+)/)?.[1] ?? '1', 10),
    bestMove: pv[0] ?? null,
    depth: Number.parseInt(line.match(/\bdepth\s+(\d+)/)?.[1] ?? String(depthRequested), 10),
    pv,
    score,
    whitePerspective,
  };
}

function findBestInfoLine(lines: string[], multipv?: number) {
  const candidates = [...lines].reverse().filter(line => line.startsWith('info ') && /\bscore (cp|mate) /.test(line));

  if (multipv == null) {
    return candidates[0];
  }

  return candidates.find(line => Number.parseInt(line.match(/\bmultipv\s+(\d+)/)?.[1] ?? '1', 10) === multipv);
}

function inferTerminalPerspective(fen: string | undefined) {
  if (!fen?.trim()) {
    return null;
  }

  try {
    const chess = new Chess(fen.trim());

    if (chess.isCheckmate()) {
      return {
        whiteScore: chess.turn() === 'b' ? 1 : -1,
        rawWdl: {
          win: 0,
          draw: 0,
          loss: 1000,
        } satisfies RawWdl,
      };
    }

    if (chess.isDraw()) {
      return {
        whiteScore: 0,
        rawWdl: {
          win: 0,
          draw: 1000,
          loss: 0,
        } satisfies RawWdl,
      };
    }
  } catch {
    return null;
  }

  return null;
}
