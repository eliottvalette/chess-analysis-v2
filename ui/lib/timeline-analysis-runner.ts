import type { AnalysisResult, AnalyzeRequest } from './analysis-types';

type TimelinePosition = AnalyzeRequest & {
  moves?: string[];
};

type TimelineAnalysisRunnerOptions = {
  positions: TimelinePosition[];
  cache: Map<string, AnalysisResult>;
  positionInFlight: Map<string, Promise<AnalysisResult>>;
  batchInFlight: Map<string, Promise<AnalysisResult[]>>;
  batchSize: number;
  getCacheKey: (position: TimelinePosition) => string;
  buildRequest: (position: TimelinePosition) => AnalyzeRequest;
  analyzeBatch: (positions: AnalyzeRequest[]) => Promise<AnalysisResult[]>;
  onProgress?: (progress: number) => void;
};

export async function runTimelineAnalysisDedupe({
  positions,
  cache,
  positionInFlight,
  batchInFlight,
  batchSize,
  getCacheKey,
  buildRequest,
  analyzeBatch,
  onProgress,
}: TimelineAnalysisRunnerOptions) {
  const sequence: AnalysisResult[] = new Array(positions.length);
  const missing: Array<{
    index: number;
    cacheKey: string;
    position: AnalyzeRequest;
    inFlight?: Promise<AnalysisResult>;
    deferred?: ReturnType<typeof createAnalysisDeferred>;
  }> = [];
  let completed = 0;
  const reportProgress = () => {
    onProgress?.((completed / Math.max(1, positions.length)) * 100);
  };

  reportProgress();

  positions.forEach((position, index) => {
    const cacheKey = getCacheKey(position);
    const cachedAnalysis = cache.get(cacheKey);

    if (cachedAnalysis) {
      sequence[index] = cachedAnalysis;
      completed += 1;
      reportProgress();
      return;
    }

    if (!position.fen) {
      throw new Error('Missing timeline position.');
    }

    const inFlight = positionInFlight.get(cacheKey);
    const deferred = inFlight ? undefined : createAnalysisDeferred();
    const plannedPromise = inFlight ?? deferred?.promise;

    if (plannedPromise && !inFlight) {
      plannedPromise.catch(() => undefined);
      positionInFlight.set(cacheKey, plannedPromise);
    }

    missing.push({
      index,
      cacheKey,
      inFlight: plannedPromise,
      deferred,
      position: buildRequest(position),
    });
  });

  try {
    for (let start = 0; start < missing.length; start += batchSize) {
      const batch = missing.slice(start, start + batchSize);
      const alreadyInFlight = batch.filter(item => item.inFlight && !item.deferred);
      const needsBatchAnalysis = batch.filter(item => item.deferred);

      await Promise.all(
        alreadyInFlight.map(async item => {
          const analysis = await item.inFlight;

          if (!analysis) {
            throw new Error('Missing deep analysis result.');
          }

          cache.set(item.cacheKey, analysis);
          sequence[item.index] = analysis;
          completed += 1;
          reportProgress();
        }),
      );

      if (needsBatchAnalysis.length === 0) {
        continue;
      }

      const batchKey = needsBatchAnalysis.map(item => item.cacheKey).join('|');
      let batchPromise = batchInFlight.get(batchKey);

      if (!batchPromise) {
        batchPromise = analyzeBatch(needsBatchAnalysis.map(item => item.position)).finally(() => {
          if (batchInFlight.get(batchKey) === batchPromise) {
            batchInFlight.delete(batchKey);
          }
        });

        batchInFlight.set(batchKey, batchPromise);
      }

      const analyses = await batchPromise.catch(error => {
        needsBatchAnalysis.forEach(item => {
          item.deferred?.reject(error);
          if (positionInFlight.get(item.cacheKey) === item.deferred?.promise) {
            positionInFlight.delete(item.cacheKey);
          }
        });
        throw error;
      });

      needsBatchAnalysis.forEach((item, index) => {
        const analysis = analyses[index];

        if (!analysis) {
          throw new Error('Missing deep analysis result.');
        }

        cache.set(item.cacheKey, analysis);
        item.deferred?.resolve(analysis);
        if (positionInFlight.get(item.cacheKey) === item.deferred?.promise) {
          positionInFlight.delete(item.cacheKey);
        }
        sequence[item.index] = analysis;
        completed += 1;
        reportProgress();
      });
    }
  } catch (error) {
    missing.forEach(item => {
      item.deferred?.reject(error);
      if (positionInFlight.get(item.cacheKey) === item.deferred?.promise) {
        positionInFlight.delete(item.cacheKey);
      }
    });
    throw error;
  }

  onProgress?.(100);
  return sequence;
}

function createAnalysisDeferred() {
  let resolve!: (analysis: AnalysisResult) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<AnalysisResult>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}
