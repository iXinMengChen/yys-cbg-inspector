import type { PveSuitScoreSummary, RelicDataset, RelicView } from "@/types";

export type RelicAnalysisStatistics = {
  relicCount: number;
  maxLevelRelicCount: number;
  fullSpeedRelicCount: number;
  fullSpeedCountsByPosition: { position: number; count: number }[];
  relicCountsByPosition: { position: number; count: number }[];
  pveSuitScoreRanking: PveSuitScoreSummary[];
  suiteSpeeds: { suitName: string; speed: number }[];
};

type AnalysisDataset = Pick<RelicDataset, "relicsByPosition">;
type AnalysisWorkerResponse =
  | { type: "result"; statistics: RelicAnalysisStatistics }
  | { type: "error"; message: string };

const analysisCache = new WeakMap<
  RelicDataset,
  Promise<RelicAnalysisStatistics>
>();

async function projectRelicsForAnalysis(
  dataset: RelicDataset,
): Promise<AnalysisDataset> {
  const relicsByPosition: Record<string, RelicView[]> = {};
  for (const [position, relics] of Object.entries(
    dataset.relicsByPosition || {},
  )) {
    const projected: RelicView[] = [];
    for (let offset = 0; offset < relics.length; offset += 500) {
      projected.push(
        ...relics
          .slice(offset, offset + 500)
          .map(
            ({
              id,
              level,
              quality,
              position: relicPosition,
              suit,
              mainAttribute,
              subAttributes,
              setBonusAttribute,
              enhancement,
            }: RelicView) => ({
              id,
              level,
              quality,
              position: relicPosition,
              suit,
              mainAttribute,
              subAttributes,
              setBonusAttribute,
              enhancement,
            }),
          ),
      );
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
    relicsByPosition[position] = projected;
  }
  return { relicsByPosition };
}

export function getRelicAnalysis(
  dataset: RelicDataset,
): Promise<RelicAnalysisStatistics> {
  const cached = analysisCache.get(dataset);
  if (cached) return cached;

  const request = new Promise<RelicAnalysisStatistics>((resolve, reject) => {
    window.setTimeout(() => {
      let worker: Worker;
      try {
        worker = new Worker(
          new URL("./homeAnalysis.worker.ts", import.meta.url),
          { type: "module" },
        );
      } catch (error) {
        reject(error);
        return;
      }
      const finish = (callback: () => void) => {
        worker.terminate();
        callback();
      };

      worker.onmessage = ({ data }: MessageEvent<AnalysisWorkerResponse>) => {
        if (data.type === "result") {
          finish(() => resolve(data.statistics));
        } else {
          finish(() => reject(new Error(data.message)));
        }
      };
      worker.onerror = (event) =>
        finish(() => reject(new Error(event.message || "账号数据统计失败")));
      worker.onmessageerror = () =>
        finish(() => reject(new Error("账号数据统计结果读取失败")));
      void projectRelicsForAnalysis(dataset).then(
        (analysisDataset) => {
          try {
            worker.postMessage({ type: "analyze", dataset: analysisDataset });
          } catch (error) {
            finish(() => reject(error));
          }
        },
        (error: unknown) => finish(() => reject(error)),
      );
    }, 0);
  });

  analysisCache.set(dataset, request);
  void request.catch(() => {
    if (analysisCache.get(dataset) === request) analysisCache.delete(dataset);
  });
  return request;
}
