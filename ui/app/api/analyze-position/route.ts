import { NextResponse } from 'next/server';

import type { AnalyzeRequest } from '@/lib/analysis-types';
import { getStockfishSession } from '@/lib/stockfish-session';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AnalyzeRequest;
    const session = await getStockfishSession();
    const analysis = await session.analyze(body);

    return NextResponse.json(analysis);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown analysis error' },
      { status: 500 },
    );
  }
}
