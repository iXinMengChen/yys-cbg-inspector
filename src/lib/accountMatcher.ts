import type { DatasetHistoryRecord } from "@/store";

export type AccountMatcherCriteria = {
  minimumPrice: number | null;
  maximumPrice: number | null;
  selectedServers: string[];
  publication: "any" | "only" | "exclude";
  platforms: string[];
  dexRequirements: string[];
  numberFilters: Record<string, number | null>;
  assetFlags: string[];
  badges: string[];
  achievements: string[];
};

export type AccountMatchEvidence = {
  label: string;
  expected: string;
  actual: string;
  status: "match" | "near" | "unknown";
};

export type AccountMatchResult = {
  record: DatasetHistoryRecord;
  matchTier: "strict" | "expanded" | "outside";
  score: number | null;
  matchedCount: number;
  evaluatedCount: number;
  unknownCount: number;
  differences: AccountMatchEvidence[];
  unavailable: AccountMatchEvidence[];
};

export type AccountMatcherWorkerRequest = {
  history: DatasetHistoryRecord[];
  criteria: AccountMatcherCriteria;
};

export type AccountMatcherWorkerResponse =
  | { type: "result"; results: AccountMatchResult[] }
  | { type: "error"; message: string };

type MatchDimension = "price" | "speed" | "other";
type ScoredEvidence = AccountMatchEvidence & {
  value: number;
  dimension: MatchDimension;
  withinExpandedRange?: boolean;
};

function finiteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function displayNumber(value: number) {
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function addUnknown(
  evidence: ScoredEvidence[],
  label: string,
  expected: string,
) {
  evidence.push({
    label,
    expected,
    actual: "本地数据未保存",
    status: "unknown",
    value: 0,
    dimension: "other",
  });
}

function addKnown(
  evidence: ScoredEvidence[],
  label: string,
  expected: string,
  actual: string,
  value: number,
  dimension: MatchDimension,
  withinExpandedRange = value >= 1,
) {
  evidence.push({
    label,
    expected,
    actual,
    status: value >= 1 ? "match" : "near",
    value: clamp(value),
    dimension,
    withinExpandedRange,
  });
}

function addMinimum(
  evidence: ScoredEvidence[],
  label: string,
  required: number | null | undefined,
  actualValue: unknown,
  dimension: MatchDimension,
) {
  if (required === null || required === undefined || required <= 0) return;
  const actual = finiteNumber(actualValue);
  const expected = `≥ ${displayNumber(required)}`;
  if (actual === undefined) {
    addUnknown(evidence, label, expected);
    return;
  }
  addKnown(
    evidence,
    label,
    expected,
    displayNumber(actual),
    actual >= required ? 1 : actual / required,
    dimension,
    dimension === "speed"
      ? /数量|个数|御魂数/.test(label)
        ? actual >= required - 1
        : actual >= required - 0.5
      : actual >= required * 0.9,
  );
}

function addMaximum(
  evidence: ScoredEvidence[],
  label: string,
  maximum: number | null | undefined,
  actualValue: unknown,
) {
  if (maximum === null || maximum === undefined) return;
  const actual = finiteNumber(actualValue);
  const expected = `≤ ${displayNumber(maximum)}`;
  if (actual === undefined) {
    addUnknown(evidence, label, expected);
    return;
  }
  addKnown(
    evidence,
    label,
    expected,
    displayNumber(actual),
    actual <= maximum ? 1 : actual === 0 ? 0 : maximum / actual,
    "other",
    actual <= maximum,
  );
}

function addRange(
  evidence: ScoredEvidence[],
  minimum: number | null,
  maximum: number | null,
  actualValue: unknown,
) {
  if (minimum === null && maximum === null) return;
  const actual = finiteNumber(actualValue);
  const expected =
    minimum !== null && maximum !== null
      ? `¥${displayNumber(minimum)}–¥${displayNumber(maximum)}`
      : minimum !== null
        ? `≥ ¥${displayNumber(minimum)}`
        : `≤ ¥${displayNumber(maximum!)}`;
  if (actual === undefined) {
    addUnknown(evidence, "预算", expected);
    return;
  }
  const belowMinimum = minimum !== null && actual < minimum;
  const aboveMaximum = maximum !== null && actual > maximum;
  const closeness = belowMinimum
    ? minimum > 0
      ? actual / minimum
      : 0
    : aboveMaximum
      ? actual > 0
        ? maximum! / actual
        : 0
      : 1;
  addKnown(
    evidence,
    "预算",
    expected,
    `¥${displayNumber(actual)}`,
    closeness,
    "price",
    !aboveMaximum && (minimum === null || actual >= minimum * 0.9),
  );
}

function addChoice(
  evidence: ScoredEvidence[],
  label: string,
  expected: string,
  actual: string | undefined,
  matches: (actual: string) => boolean,
  dimension: MatchDimension = "other",
) {
  if (!actual) {
    addUnknown(evidence, label, expected);
    return;
  }
  const isMatch = matches(actual);
  addKnown(
    evidence,
    label,
    expected,
    actual,
    isMatch ? 1 : 0,
    dimension,
    isMatch,
  );
}

function normalizedServerName(value: string) {
  return value
    .trim()
    .replace(/[\s\-_]/g, "")
    .toLocaleLowerCase();
}

function selectedServerMatches(actual: string, selected: string[]) {
  const server = normalizedServerName(actual.split("/").at(-1) || actual);
  return selected.some((item) => {
    const selectedName = normalizedServerName(item.split("/").at(-1) || item);
    return server === selectedName || server.endsWith(selectedName);
  });
}

function addMinimumFromFilter(
  evidence: ScoredEvidence[],
  criteria: AccountMatcherCriteria,
  key: string,
  label: string,
  actual: unknown,
  dimension: MatchDimension,
) {
  addMinimum(evidence, label, criteria.numberFilters[key], actual, dimension);
}

function assessRecord(
  record: DatasetHistoryRecord,
  criteria: AccountMatcherCriteria,
): AccountMatchResult {
  const evidence: ScoredEvidence[] = [];
  const { account, heroes } = record.dataset;

  if (criteria.selectedServers.length) {
    addChoice(
      evidence,
      "区服",
      criteria.selectedServers
        .map((server) => server.split("/").at(-1) || server)
        .join("、"),
      account?.serverName,
      (actual) => selectedServerMatches(actual, criteria.selectedServers),
    );
  }

  if (criteria.publication !== "any") {
    addChoice(
      evidence,
      "公示期",
      criteria.publication === "only" ? "只看公示期" : "不看公示期",
      account?.listingStatus,
      (actual) =>
        criteria.publication === "only"
          ? actual === "公示期"
          : actual !== "公示期",
    );
  }

  if (criteria.platforms.length) {
    addUnknown(evidence, "操作系统", criteria.platforms.join(" / "));
  }

  addRange(
    evidence,
    criteria.minimumPrice,
    criteria.maximumPrice,
    account?.price,
  );

  const dexKeys: Record<string, "ssr" | "sp" | "ur"> = {
    ssr: "ssr",
    sp: "sp",
    ur: "ur",
  };
  criteria.dexRequirements.forEach((requirement) => {
    if (requirement === "collaboration") {
      addUnknown(evidence, "联动全图鉴", "全图鉴");
      return;
    }
    const key = dexKeys[requirement];
    if (!key) return;
    const dex = account?.shikigamiDex?.[key];
    if (!dex || dex.total <= 0) {
      addUnknown(evidence, `${requirement.toUpperCase()} 全图鉴`, "全图鉴");
      return;
    }
    addKnown(
      evidence,
      `${requirement.toUpperCase()} 全图鉴`,
      "全图鉴",
      `${dex.owned}/${dex.total}`,
      dex.owned / dex.total,
      "other",
      dex.owned / dex.total >= 0.9,
    );
  });

  if (
    criteria.numberFilters.minimumSixStarHeroCount !== null &&
    criteria.numberFilters.minimumSixStarHeroCount !== undefined
  ) {
    const sixStarCount = heroes?.filter((hero) => hero.rarity >= 6).length;
    addMinimumFromFilter(
      evidence,
      criteria,
      "minimumSixStarHeroCount",
      "6 星式神数量",
      sixStarCount,
      "other",
    );
  }

  addMinimumFromFilter(
    evidence,
    criteria,
    "minimumStyle",
    "风姿度",
    account?.fengzidu,
    "other",
  );
  addMinimumFromFilter(
    evidence,
    criteria,
    "minimumSignInDays",
    "签到天数",
    undefined,
    "other",
  );
  addMaximum(
    evidence,
    "等级",
    criteria.numberFilters.maximumLevel,
    account?.level,
  );

  addMinimumFromFilter(
    evidence,
    criteria,
    "minimumMaxSpeedCount",
    "满速御魂数",
    undefined,
    "speed",
  );
  addMinimumFromFilter(
    evidence,
    criteria,
    "minimumScatteredSpeed",
    "散件一速",
    account?.scatteredFirstSpeed,
    "speed",
  );
  addMinimumFromFilter(
    evidence,
    criteria,
    "minimumLuckySpeed",
    "招财一速",
    account?.luckyFirstSpeed,
    "speed",
  );
  addMinimumFromFilter(
    evidence,
    criteria,
    "minimumHeadCount",
    "头个数",
    account?.speedHeadCount,
    "speed",
  );
  addMinimumFromFilter(
    evidence,
    criteria,
    "minimumHeadSpeed",
    "头速度",
    undefined,
    "speed",
  );
  addMinimumFromFilter(
    evidence,
    criteria,
    "minimumTailCount",
    "尾个数",
    account?.speedTailCount,
    "speed",
  );
  addMinimumFromFilter(
    evidence,
    criteria,
    "minimumTailSpeed",
    "尾速度",
    undefined,
    "speed",
  );
  addMinimumFromFilter(
    evidence,
    criteria,
    "minimumLuckyHeadCount",
    "招财头个数",
    undefined,
    "speed",
  );
  addMinimumFromFilter(
    evidence,
    criteria,
    "minimumLuckyHeadSpeed",
    "招财头速度",
    undefined,
    "speed",
  );

  const assets: Record<string, { label: string; value: unknown }> = {
    jade: { label: "勾玉", value: account?.soulJade },
    mysteryAmulet: { label: "神秘符咒", value: account?.mysteryTalisman },
    stamina: { label: "体力", value: account?.stamina },
    goldWan: {
      label: "金币（万）",
      value:
        finiteNumber(account?.money) === undefined
          ? undefined
          : finiteNumber(account?.money)! / 10_000,
    },
    goldenAmulet: { label: "金御札", value: undefined },
    jadeStone: { label: "魂玉", value: undefined },
    御札: { label: "御札", value: undefined },
    逢魔之魂: { label: "逢魔之魂", value: undefined },
    大蛇的逆鳞: { label: "大蛇的逆鳞", value: undefined },
    御行达摩: { label: "御行达摩", value: account?.yuxingDama },
    皮肤券: { label: "皮肤券", value: undefined },
    勋章: { label: "勋章", value: undefined },
    六星结界卡: { label: "六星结界卡", value: undefined },
    满级御魂: { label: "满级御魂", value: account?.maxLevelRelicCount },
  };
  Object.entries(assets).forEach(([key, item]) => {
    addMinimumFromFilter(
      evidence,
      criteria,
      key,
      item.label,
      item.value,
      "other",
    );
  });

  addMinimumFromFilter(
    evidence,
    criteria,
    "式神皮肤总数",
    "式神皮肤总数",
    undefined,
    "other",
  );
  addMinimumFromFilter(
    evidence,
    criteria,
    "典藏皮肤总数",
    "典藏皮肤总数",
    account?.collectionSkinCount,
    "other",
  );
  [
    "庭院皮肤总数",
    "召唤屋皮肤总数",
    "幕间皮肤总数",
    "战斗主题总数",
    "阴阳术皮肤总数",
  ].forEach((key) =>
    addMinimumFromFilter(evidence, criteria, key, key, undefined, "other"),
  );

  criteria.assetFlags.forEach((flag) => addUnknown(evidence, flag, "已开启"));
  criteria.badges.forEach((badge) => addUnknown(evidence, "徽章", badge));
  criteria.achievements.forEach((achievement) =>
    addUnknown(evidence, "成就", achievement),
  );

  const scoredEvidence = evidence.filter((item) => item.status !== "unknown");
  const weightedTotal = scoredEvidence.reduce((total, item) => {
    return total + item.value;
  }, 0);
  const totalWeight = scoredEvidence.length;

  const differences = evidence.filter((item) => item.status === "near");
  const matchTier =
    differences.length === 0
      ? "strict"
      : differences.every((item) => item.withinExpandedRange)
        ? "expanded"
        : "outside";

  return {
    record,
    matchTier,
    score: totalWeight ? Math.round((weightedTotal / totalWeight) * 100) : null,
    matchedCount: scoredEvidence.filter((item) => item.status === "match")
      .length,
    evaluatedCount: scoredEvidence.length,
    unknownCount: evidence.length - scoredEvidence.length,
    differences,
    unavailable: evidence.filter((item) => item.status === "unknown"),
  };
}

export function matchAccountHistory(
  history: DatasetHistoryRecord[],
  criteria: AccountMatcherCriteria,
) {
  return rankAccountMatches(
    [...new Map(history.map((record) => [record.id, record])).values()].map(
      (record) => assessRecord(record, criteria),
    ),
  );
}

function rankAccountMatches(assessed: AccountMatchResult[]) {
  const strictCount = assessed.filter(
    (result) => result.matchTier === "strict",
  ).length;

  return assessed
    .filter(
      (result) =>
        result.matchTier === "strict" ||
        (strictCount < 10 && result.matchTier === "expanded"),
    )
    .sort((left, right) => {
      if (left.matchTier !== right.matchTier) {
        return left.matchTier === "strict" ? -1 : 1;
      }
      if (left.score !== right.score) {
        return (right.score ?? -1) - (left.score ?? -1);
      }
      if (left.matchedCount !== right.matchedCount) {
        return right.matchedCount - left.matchedCount;
      }

      const leftAccount = left.record.dataset.account;
      const rightAccount = right.record.dataset.account;
      const leftSpeed =
        (finiteNumber(leftAccount?.scatteredFirstSpeed) ?? 0) +
        (finiteNumber(leftAccount?.luckyFirstSpeed) ?? 0);
      const rightSpeed =
        (finiteNumber(rightAccount?.scatteredFirstSpeed) ?? 0) +
        (finiteNumber(rightAccount?.luckyFirstSpeed) ?? 0);
      if (leftSpeed !== rightSpeed) return leftSpeed - rightSpeed;
      return right.record.savedAt - left.record.savedAt;
    });
}
