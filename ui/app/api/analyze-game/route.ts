import { NextResponse } from 'next/server';

import type { AnalyzeRequest } from '@/lib/analysis-types';
import { getStockfishSessionPool } from '@/lib/stockfish-session';

export const runtime = 'nodejs';

const MAX_BATCH_POSITIONS = 160;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      positions?: AnalyzeRequest[];
      depth?: number;
      movetimeMs?: number;
    };
    const positions = Array.isArray(body.positions) ? body.positions : [];

    if (positions.length > MAX_BATCH_POSITIONS) {
      return NextResponse.json(
        { error: `Too many positions. Max batch size is ${MAX_BATCH_POSITIONS}.` },
        { status: 400 },
      );
    }

    const sessions = await getStockfishSessionPool(Math.min(positions.length || 1, 4));
    const analyses = await Promise.all(
      positions.map((position, index) =>
        sessions[index % sessions.length].analyze({ ...position, depth: body.depth, movetimeMs: body.movetimeMs }),
      ),
    );

    return NextResponse.json({ analyses });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown analysis error' },
      { status: 500 },
    );
  }
}
