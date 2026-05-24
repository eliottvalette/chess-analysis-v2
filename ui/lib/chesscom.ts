export type ChessComRecentGameSummary = {
  url: string;
  link: string;
  endTime: number | null;
  utcDate: string | null;
  utcTime: string | null;
  playerColor: 'white' | 'black' | 'unknown';
  playerUsername: string | null;
  playerRating: number | null;
  opponentUsername: string | null;
  opponentRating: number | null;
  result: string | null;
  termination: string | null;
  eco: string | null;
  timeControl: string | null;
  pgn: string;
};

type RawChessComPlayer = {
  username?: string;
  rating?: number;
  result?: string;
};

type RawChessComGame = {
  url?: string;
  pgn?: string;
  end_time?: number;
  time_class?: string;
  time_control?: string;
  white?: RawChessComPlayer;
  black?: RawChessComPlayer;
};

export async function fetchArchives(username: string) {
  const response = await fetchJson(`https://api.chess.com/pub/player/${username}/games/archives`);
  const archives = Array.isArray(response.archives) ? response.archives : [];

  if (archives.length === 0) {
    throw new Error(`No public archives found for Chess.com user "${username}".`);
  }

  return archives as string[];
}

export async function fetchRecentGames({
  username,
  archives,
  count,
  timeClass,
}: {
  username: string;
  archives: string[];
  count: number;
  timeClass: string;
}) {
  const selected: RawChessComGame[] = [];

  for (const archiveUrl of [...archives].reverse()) {
    const response = await fetchJson(archiveUrl);
    const games = Array.isArray(response.games) ? response.games : [];

    const matchingGames = (games as RawChessComGame[])
      .filter(game => game?.time_class === timeClass)
      .filter(game => isPlayerInGame(username, game))
      .sort((left, right) => Number(right.end_time ?? 0) - Number(left.end_time ?? 0));

    selected.push(...matchingGames);

    if (selected.length >= count) {
      break;
    }
  }

  return selected
    .sort((left, right) => Number(right.end_time ?? 0) - Number(left.end_time ?? 0))
    .slice(0, count);
}

export function toGameSummary(game: RawChessComGame, username: string): ChessComRecentGameSummary {
  const playerColor =
    game.white?.username?.toLowerCase() === game.black?.username?.toLowerCase() ? 'unknown' : inferPlayerColor(game, username);
  const player = playerColor === 'white' ? game.white : game.black;
  const opponent = playerColor === 'white' ? game.black : game.white;

  return {
    url: String(game.url),
    link: extractTag(game.pgn, 'Link') ?? String(game.url),
    endTime: typeof game.end_time === 'number' ? game.end_time : null,
    utcDate: extractTag(game.pgn, 'UTCDate'),
    utcTime: extractTag(game.pgn, 'UTCTime'),
    playerColor,
    playerUsername: player?.username ?? null,
    playerRating: typeof player?.rating === 'number' ? player.rating : null,
    opponentUsername: opponent?.username ?? null,
    opponentRating: typeof opponent?.rating === 'number' ? opponent.rating : null,
    result: extractTag(game.pgn, 'Result'),
    termination: extractTag(game.pgn, 'Termination'),
    eco: extractTag(game.pgn, 'ECO'),
    timeControl: typeof game.time_control === 'string' ? game.time_control : null,
    pgn: typeof game.pgn === 'string' ? game.pgn : '',
  };
}

export function extractTag(pgn: string | null | undefined, tagName: string) {
  if (typeof pgn !== 'string') {
    return null;
  }

  const match = pgn.match(new RegExp(`\\[${tagName} "([^"]+)"\\]`));
  return match?.[1] ?? null;
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'chess-analysis-v2/1.0',
    },
    next: {
      revalidate: 300,
    },
  });

  if (!response.ok) {
    throw new Error(`Chess.com request failed for ${url}: HTTP ${response.status}`);
  }

  return response.json();
}

function isPlayerInGame(username: string, game: RawChessComGame) {
  const normalized = username.toLowerCase();
  return game?.white?.username?.toLowerCase() === normalized || game?.black?.username?.toLowerCase() === normalized;
}

function inferPlayerColor(game: RawChessComGame, username: string): 'white' | 'black' {
  return game.white?.username?.toLowerCase() === username.toLowerCase() ? 'white' : 'black';
}
