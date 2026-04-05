import { NextResponse } from 'next/server';

import type { AnalyzeRequest } from '@/lib/analysis-types';
import { getStockfishSession } from '@/lib/stockfish-session';

export const runtime = 'nodejs';

const MAX_BATCH_POSITIONS = 160;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      positions?: AnalyzeRequest[];
      depth?: number;
    };
    const positions = Array.isArray(body.positions) ? body.positions : [];

    if (positions.length > MAX_BATCH_POSITIONS) {
      return NextResponse.json(
        { error: `Too many positions. Max batch size is ${MAX_BATCH_POSITIONS}.` },
        { status: 400 },
      );
    }

    const session = await getStockfishSession();
    const analyses = [];

    for (const position of positions) {
      analyses.push(await session.analyze({ ...position, depth: body.depth }));
    }

    return NextResponse.json({ analyses });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown analysis error' },
      { status: 500 },
    );
  }
}
