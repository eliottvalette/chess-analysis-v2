import { NextResponse } from 'next/server';

import { fetchArchives, fetchRecentGames, toGameSummary } from '@/lib/chesscom';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username')?.trim().toLowerCase() ?? '';
  const timeClass = searchParams.get('timeClass')?.trim().toLowerCase() || 'blitz';
  const count = Math.max(1, Math.min(12, Number.parseInt(searchParams.get('count') ?? '6', 10) || 6));

  if (!username) {
    return NextResponse.json({ error: 'Missing username.' }, { status: 400 });
  }

  try {
    const archives = await fetchArchives(username);
    const games = await fetchRecentGames({
      username,
      archives,
      count,
      timeClass,
    });

    return NextResponse.json({
      username,
      games: games.map(game => toGameSummary(game, username)),
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
