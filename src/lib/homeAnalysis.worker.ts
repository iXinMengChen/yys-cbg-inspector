import {
  getBestSpeedCombinationForSuit,
  getFullSpeedRelics,
} from "./accountAnalysis";
import { getPveSuitScoreRanking } from "./pveSuitRanking";
import type { RelicAnalysisStatistics } from "./homeAnalysis";
import type { RelicDataset, RelicView } from "@/types";

type AnalysisRequest = {
  type: "analyze";
  dataset: Pick<RelicDataset, "relicsByPosition">;
};
type AnalysisResponse =
  | { type: "result"; statistics: RelicAnalysisStatistics }
  | { type: "error"; message: string };

const workerScope = globalThis as typeof globalThis & {
  onmessage: (event: MessageEvent<AnalysisRequest>) => void;
  postMessage: (value: AnalysisResponse) => void;
};

workerScope.onmessage = ({ data }) => {
  try {
    const { relicsByPosition } = data.dataset;
    const relics: RelicView[] = Object.values(relicsByPosition || {}).flatMap(
      (items) => items,
    );
    const fullSpeedRelics = getFullSpeedRelics(data.dataset);
    const fullSpeedCounts = new Map<number, number>();
    fullSpeedRelics.forEach(({ position }) => {
      if (position !== undefined) {
        fullSpeedCounts.set(position, (fullSpeedCounts.get(position) ?? 0) + 1);
      }
    });

    const suiteNames = new Set(
      relics
        .filter(
          (relic) =>
            relic.suit && !relic.suit.isTwoPieceSet && !relic.setBonusAttribute,
        )
        .map((relic) => relic.suit!.name),
    );
    const suiteSpeeds = [...suiteNames]
      .flatMap((suitName) => {
        const combination = getBestSpeedCombinationForSuit(
          data.dataset,
          suitName,
        );
        return combination ? [{ suitName, speed: combination.value + 57 }] : [];
      })
      .sort((left, right) => right.speed - left.speed);
    const positions = [1, 2, 3, 4, 5, 6];

    workerScope.postMessage({
      type: "result",
      statistics: {
        relicCount: relics.length,
        maxLevelRelicCount: relics.filter(
          (relic) => relic.quality === 6 && relic.level === 15,
        ).length,
        fullSpeedRelicCount: fullSpeedRelics.length,
        fullSpeedCountsByPosition: positions.map((position) => ({
          position,
          count: fullSpeedCounts.get(position) ?? 0,
        })),
        relicCountsByPosition: positions.map((position) => ({
          position,
          count: (relicsByPosition[String(position)] || []).length,
        })),
        pveSuitScoreRanking: getPveSuitScoreRanking(data.dataset),
        suiteSpeeds,
      },
    });
  } catch (error) {
    workerScope.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "账号数据统计失败",
    });
  }
};

export {};
