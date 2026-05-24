const DEFAULT_COUNT = 5;
const DEFAULT_TIME_CLASS = 'blitz';
const DEFAULT_FORMAT = 'json';

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const username = options.username;

  if (!username) {
    throw new Error('Usage: node scripts/chesscom/fetch-recent-games.mjs --username <chesscom-username> [--count 5] [--time-class blitz] [--format json|pgn]');
  }

  const archives = await fetchArchives(username);
  const games = await fetchRecentGames({
    username,
    archives,
    count: options.count,
    timeClass: options.timeClass,
  });

  if (options.format === 'pgn') {
    console.log(games.map(game => game.pgn).join('\n\n'));
    return;
  }

  console.log(
    JSON.stringify(
      {
        username,
        requested_count: options.count,
        fetched_count: games.length,
        time_class: options.timeClass,
        games: games.map(game => toGameSummary(game, username)),
      },
      null,
      2,
    ),
  );
}

function parseArgs(args) {
  const options = {
    username: '',
    count: DEFAULT_COUNT,
    timeClass: DEFAULT_TIME_CLASS,
    format: DEFAULT_FORMAT,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === '--username' && value) {
      options.username = value.trim().toLowerCase();
      index += 1;
      continue;
    }

    if (arg === '--count' && value) {
      options.count = Math.max(1, Number.parseInt(value, 10) || DEFAULT_COUNT);
      index += 1;
      continue;
    }

    if (arg === '--time-class' && value) {
      options.timeClass = value.trim().toLowerCase();
      index += 1;
      continue;
    }

    if (arg === '--format' && value) {
      const format = value.trim().toLowerCase();

      if (format !== 'json' && format !== 'pgn') {
        throw new Error(`Unsupported format "${value}". Use json or pgn.`);
      }

      options.format = format;
      index += 1;
      continue;
    }
  }

  return options;
}

async function fetchArchives(username) {
  const response = await fetchJson(`https://api.chess.com/pub/player/${username}/games/archives`);
  const archives = Array.isArray(response.archives) ? response.archives : [];

  if (archives.length === 0) {
    throw new Error(`No public archives found for Chess.com user "${username}".`);
  }

  return archives;
}

async function fetchRecentGames({ username, archives, count, timeClass }) {
  const selected = [];

  for (const archiveUrl of [...archives].reverse()) {
    const response = await fetchJson(archiveUrl);
    const games = Array.isArray(response.games) ? response.games : [];

    const matchingGames = games
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

function isPlayerInGame(username, game) {
  const normalized = username.toLowerCase();
  return game?.white?.username?.toLowerCase() === normalized || game?.black?.username?.toLowerCase() === normalized;
}

function toGameSummary(game, username) {
  const playerColor =
    game.white?.username?.toLowerCase() === game.black?.username?.toLowerCase() ? 'unknown' : inferPlayerColor(game, username);
  const player = playerColor === 'white' ? game.white : game.black;
  const opponent = playerColor === 'white' ? game.black : game.white;

  return {
    url: game.url,
    link: game.pgn?.match(/\[Link "([^"]+)"\]/)?.[1] ?? game.url,
    end_time: game.end_time,
    utc_date: extractTag(game.pgn, 'UTCDate'),
    utc_time: extractTag(game.pgn, 'UTCTime'),
    player_color: playerColor,
    player_username: player?.username ?? null,
    player_rating: player?.rating ?? null,
    player_result: player?.result ?? null,
    opponent_username: opponent?.username ?? null,
    opponent_rating: opponent?.rating ?? null,
    result: extractTag(game.pgn, 'Result'),
    termination: extractTag(game.pgn, 'Termination'),
    eco: extractTag(game.pgn, 'ECO'),
    eco_url: game.eco ?? null,
    time_control: game.time_control ?? null,
    accuracies: game.accuracies ?? null,
    pgn: game.pgn,
  };
}

function inferPlayerColor(game, username) {
  return game.white?.username?.toLowerCase() === username.toLowerCase() ? 'white' : 'black';
}

function extractTag(pgn, tagName) {
  if (typeof pgn !== 'string') {
    return null;
  }

  const match = pgn.match(new RegExp(`\\[${tagName} "([^"]+)"\\]`));
  return match?.[1] ?? null;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'chess-analysis-v2/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Chess.com request failed for ${url}: HTTP ${response.status}`);
  }

  return response.json();
}
