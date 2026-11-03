import type { AccountOverview } from "./index";

/** 藏宝阁搜索结果里，账号列表需要展示的概览字段。 */
export type CbgCandidateMetrics = Pick<
  AccountOverview,
  | "title"
  | "name"
  | "listingStatus"
  | "serverName"
  | "level"
  | "price"
  | "fengzidu"
  | "scatteredFirstSpeed"
  | "luckyFirstSpeed"
  | "speedHeadCount"
  | "speedTailCount"
  | "money"
  | "stamina"
  | "soulJade"
  | "mysteryTalisman"
  | "realityTalisman"
  | "summonPower"
  | "yuxingDama"
  | "relicSummary"
  | "maxLevelRelicCount"
>;

/** 单条藏宝阁商品逐条读取到的详情。 */
export type CbgCandidateDetails = {
  account: CbgCandidateMetrics;
  relicCount: number;
  pvePanel?: string;
  speedPanel?: string;
};

/** 藏宝阁搜索结果中的一条商品。 */
export type CbgRoleCandidate = {
  url: string;
  summary?: string;
  details?: CbgCandidateDetails;
  detailStatus?: "pending" | "loading" | "ready" | "error";
  detailError?: string;
};
