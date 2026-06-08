import { NextResponse } from 'next/server';

import {
  buildOpeningBookPositions,
  resolveOpeningBookBatch,
  type OpeningBookBatchResult,
} from '@/lib/opening-book';

export const runtime = 'nodejs';

type OpeningBookRequestBody = {
  positions?: Array<{ fenBefore?: string; playedUci?: string }>;
  moves?: Array<{ from?: string; to?: string; promotion?: string; uci?: string }>;
  initialFen?: string | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as OpeningBookRequestBody;
    let positions = Array.isArray(body.positions)
      ? body.positions.flatMap(position => {
          const fenBefore = String(position.fenBefore ?? '').trim();
          const playedUci = String(position.playedUci ?? '').trim();

          if (!fenBefore || !playedUci) {
            return [];
          }

          return [{ fenBefore, playedUci }];
        })
      : [];

    if (positions.length === 0 && Array.isArray(body.moves) && body.moves.length > 0) {
      positions = buildOpeningBookPositions(
        body.moves.map(move => ({
          color: 'w',
          from: String(move.from ?? ''),
          to: String(move.to ?? ''),
          san: '',
          uci: String(move.uci ?? `${move.from ?? ''}${move.to ?? ''}${move.promotion ?? ''}`),
          ...(move.promotion ? { promotion: move.promotion } : {}),
        })),
        typeof body.initialFen === 'string' ? body.initialFen : null,
      );
    }

    if (positions.length === 0) {
      return NextResponse.json({ results: [] } satisfies OpeningBookBatchResult);
    }

    if (positions.length > 160) {
      return NextResponse.json({ error: 'Too many opening book positions. Max batch size is 160.' }, { status: 400 });
    }

    const batch = await resolveOpeningBookBatch(positions);
    return NextResponse.json(batch);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to resolve opening book positions.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
