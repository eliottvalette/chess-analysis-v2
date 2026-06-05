import { NextResponse } from 'next/server';

import { fetchArchives, fetchRecentGames, toGameSummary } from '@/lib/chesscom';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username')?.trim().toLowerCase() ?? '';
  const timeClass = searchParams.get('timeClass')?.trim().toLowerCase() || 'blitz';
  const count = Math.max(1, Math.min(10, Number.parseInt(searchParams.get('count') ?? '10', 10) || 10));
  const offset = Math.max(0, Number.parseInt(searchParams.get('offset') ?? '0', 10) || 0);
  const cursor = searchParams.get('cursor')?.trim() || null;

  if (!username) {
    return NextResponse.json({ error: 'Missing username.' }, { status: 400 });
  }

  try {
    const archives = await fetchArchives(username);
    const page = await fetchRecentGames({
      username,
      archives,
      count,
      offset,
      cursor,
      timeClass,
    });
    const games = page.games.slice(0, count);

    return NextResponse.json({
      username,
      games: games.map(game => toGameSummary(game, username)),
      hasMore: page.hasMore || page.games.length > count,
      nextCursor: page.nextCursor,
      nextOffset: page.nextOffset,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to fetch Chess.com games.',
      },
      { status: 500 },
    );
  }
}
