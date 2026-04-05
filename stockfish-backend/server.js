import express from 'express';
import { createRequire } from 'node:module';

delete globalThis.fetch;

const require = createRequire(import.meta.url);
const createStockfish = require('stockfish.wasm');

const PORT = 5001;
const DEFAULT_DEPTH = 12;
const MAX_BATCH_POSITIONS = 160;
const ENGINE_READY_TIMEOUT_MS = 15_000;

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
});

class StockfishSession {
  constructor(engine) {
    this.engine = engine;
    this.pending = null;
    this.queue = Promise.resolve();
    this.engine.addMessageListener((line) => this.handleLine(line));
  }

  handleLine(rawLine) {
    const line = String(rawLine ?? '').trim();

    if (!line) {
      return;
    }

    if (!this.pending) {
      return;
    }

    this.pending.lines.push(line);

    if (this.pending.predicate(line, this.pending.lines)) {
      const { resolve, timer, lines } = this.pending;
      this.pending = null;
      clearTimeout(timer);
      resolve(lines);
    }
  }

  run(commands, predicate, timeoutMs = ENGINE_READY_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      if (this.pending) {
        reject(new Error('Engine is already processing another command.'));
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
        timer,
      };

      for (const command of commands) {
        this.engine.postMessage(command);
      }
    });
  }

  enqueue(task) {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => {});
    return next;
  }

  async initialize() {
    await this.run(['uci'], (line) => line === 'uciok');
    await this.run(
      [
        'setoption name Threads value 1',
        'setoption name Hash value 32',
        'setoption name UCI_AnalyseMode value true',
        'setoption name UCI_ShowWDL value true',
        'isready',
      ],
      (line) => line === 'readyok',
    );
  }

  analyze(request) {
    return this.enqueue(async () => {
      const positionCommand = buildPositionCommand(request);
      const depth = sanitizeDepth(request.depth);

      const lines = await this.run(
        [positionCommand, `go depth ${depth}`],
        (line) => line.startsWith('bestmove '),
        30_000,
      );

      return parseAnalysis(lines, request.fen, depth);
    });
  }
}

let sessionPromise;

function getSession() {
  if (!sessionPromise) {
    sessionPromise = createStockfish().then(async (engine) => {
      const session = new StockfishSession(engine);
      await session.initialize();
      return session;
    });
  }

  return sessionPromise;
}

function sanitizeDepth(depth) {
  const parsed = Number.parseInt(depth, 10);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_DEPTH;
  }

  return Math.min(Math.max(parsed, 6), 24);
}

function buildPositionCommand({ fen, initialFen, moves }) {
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

function parseAnalysis(lines, fen, depthRequested) {
  const bestMoveLine = [...lines].reverse().find((line) => line.startsWith('bestmove '));
  const infoLine = [...lines].reverse().find((line) => line.startsWith('info ') && /\bscore (cp|mate) /.test(line));

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
  const relativeScore = scoreMatch
    ? {
        type: scoreMatch[1],
        value: Number.parseInt(scoreMatch[2], 10),
        bound: infoLine.includes(' lowerbound')
          ? 'lowerbound'
          : infoLine.includes(' upperbound')
            ? 'upperbound'
            : 'exact',
      }
    : null;

  const whitePerspective = relativeScore
    ? {
        type: relativeScore.type,
        value: turn === 'w' ? relativeScore.value : -relativeScore.value,
      }
    : null;

  const wdl = wdlMatch
    ? {
        win: Number.parseInt(wdlMatch[1], 10),
        draw: Number.parseInt(wdlMatch[2], 10),
        loss: Number.parseInt(wdlMatch[3], 10),
      }
    : null;
  const whitePerspectiveWdl = wdl
    ? turn === 'w'
      ? { white: wdl.win, draw: wdl.draw, black: wdl.loss }
      : { white: wdl.loss, draw: wdl.draw, black: wdl.win }
    : null;

  return {
    bestMove: bestMoveMatch?.[1] ?? null,
    ponder: bestMoveMatch?.[2] ?? null,
    depth: Number.parseInt(depthMatch?.[1] ?? `${depthRequested}`, 10),
    seldepth: seldepthMatch ? Number.parseInt(seldepthMatch[1], 10) : null,
    timeMs: timeMatch ? Number.parseInt(timeMatch[1], 10) : null,
    nodes: nodesMatch ? Number.parseInt(nodesMatch[1], 10) : null,
    nps: npsMatch ? Number.parseInt(npsMatch[1], 10) : null,
    multipv: multipvMatch ? Number.parseInt(multipvMatch[1], 10) : 1,
    pv: pvSection ? pvSection.split(/\s+/) : [],
    raw: lines,
    score: relativeScore,
    whitePerspective,
    wdl,
    whitePerspectiveWdl,
  };
}

app.get('/api/health', async (_req, res) => {
  try {
    await getSession();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.post('/api/analyze-position', async (req, res) => {
  try {
    const session = await getSession();
    const result = await session.analyze(req.body ?? {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

app.post('/api/analyze-game', async (req, res) => {
  try {
    const positions = Array.isArray(req.body?.positions) ? req.body.positions : [];

    if (positions.length > MAX_BATCH_POSITIONS) {
      res.status(400).json({ error: `Too many positions. Max supported batch size is ${MAX_BATCH_POSITIONS}.` });
      return;
    }

    const session = await getSession();
    const depth = sanitizeDepth(req.body?.depth);
    const analyses = [];

    for (const position of positions) {
      analyses.push(await session.analyze({ ...position, depth }));
    }

    res.json({ analyses });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

function getErrorMessage(error) {
  return error instanceof Error ? error.message : 'Unknown Stockfish backend error';
}

app.listen(PORT, () => {
  console.log(`Stockfish backend listening on http://localhost:${PORT}`);
});
