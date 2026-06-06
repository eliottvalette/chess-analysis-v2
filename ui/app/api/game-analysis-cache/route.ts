import { NextResponse } from 'next/server';

import type { AnalysisResult } from '@/lib/analysis-types';
import { createAdminClient } from '@/utils/supabase/admin';

export const runtime = 'nodejs';

type CachedAnalysisPayload = {
  quality?: 'refined';
  preMoveAnalyses?: AnalysisResult[];
  timelineAnalyses?: AnalysisResult[];
  updatedAt?: string;
};

type CacheRow = {
  cache_key: string;
  analysis_data: CachedAnalysisPayload;
  updated_at: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cacheKey = normalizeCacheKey(searchParams.get('key'));

  if (!cacheKey) {
    return NextResponse.json({ analysis: null });
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('game_analysis_cache')
      .select('cache_key, analysis_data, updated_at')
      .eq('cache_key', cacheKey)
      .maybeSingle<CacheRow>();

    if (error || !data?.analysis_data) {
      return NextResponse.json({ analysis: null });
    }

    return NextResponse.json({
      analysis: {
        ...data.analysis_data,
        updatedAt: data.updated_at,
      },
    });
  } catch {
    return NextResponse.json({ analysis: null });
  }
}

export async function POST(request: Request) {
  let body: {
    key?: string;
    pgnHash?: string;
    gameLink?: string;
    analysis?: CachedAnalysisPayload;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ saved: false }, { status: 400 });
  }

  const cacheKey = normalizeCacheKey(body.key);
  const analysis = normalizeAnalysis(body.analysis);

  if (!cacheKey || !analysis) {
    return NextResponse.json({ saved: false }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from('game_analysis_cache').upsert(
      {
        cache_key: cacheKey,
        game_link: body.gameLink ?? null,
        pgn_hash: body.pgnHash ?? null,
        analysis_data: analysis,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'cache_key' },
    );

    return NextResponse.json({ saved: !error });
  } catch {
    return NextResponse.json({ saved: false });
  }
}

function normalizeCacheKey(value: string | null | undefined) {
  const key = value?.trim();
  return key && key.length <= 512 ? key : null;
}

function normalizeAnalysis(analysis: CachedAnalysisPayload | null | undefined) {
  if (!analysis || !Array.isArray(analysis.preMoveAnalyses) || !Array.isArray(analysis.timelineAnalyses)) {
    return null;
  }

  return {
    quality: 'refined',
    preMoveAnalyses: analysis.preMoveAnalyses,
    timelineAnalyses: analysis.timelineAnalyses,
    updatedAt: new Date().toISOString(),
  } satisfies CachedAnalysisPayload;
}
