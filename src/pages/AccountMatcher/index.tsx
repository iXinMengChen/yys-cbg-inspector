import {
  DeleteOutlined,
  DownOutlined,
  HistoryOutlined,
  LinkOutlined,
  QuestionCircleOutlined,
  SearchOutlined,
  StopOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Collapse,
  Col,
  Empty,
  InputNumber,
  message,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  matchAccountHistory,
  type AccountMatchResult,
  type AccountMatcherCriteria,
  type AccountMatcherWorkerRequest,
  type AccountMatcherWorkerResponse,
} from "@/lib/accountMatcher";
import { APP_ROUTE_PATHS } from "@/router";
import {
  ACCOUNT_DATA_RETENTION_MS,
  type DatasetHistoryRecord,
  useAppSelector,
} from "@/store";
import { parseProductUrl } from "@/lib/relics";
import { convertCbgPayloadInWorker } from "@/lib/cbgDataset";
import {
  getBackgroundSearchUsageHistory,
  getBackgroundSearchStatus,
  setBackgroundSearchInterval,
  startBackgroundSearch,
  stopBackgroundSearch,
  subscribeBackgroundSearch,
  subscribeBackgroundSearchUsageHistory,
} from "@/lib/cbgBackgroundSearch";
import { loadRelicSuits } from "@/lib/staticApi";
import { openExternalUrl } from "@/lib/externalBrowser";
import {
  cbgCandidateStatus,
  formatAccountCount,
  formatCbgSearchTime,
  hasPanelData,
  renderAccountDetailSections,
  renderCbgMetric,
  renderCbgPanel,
} from "./cbgPresentation";
import type {
  CbgCandidateDetails,
  CbgCandidateMetrics,
  CbgRoleCandidate,
  GameConfig,
} from "@/types";
import "./index.scss";

const { Text } = Typography;

type NumberFilter = {
  name: string;
  label: string;
  max?: number;
  precision?: number;
};

type CbgResultsState = "idle" | "loading" | "ready" | "empty" | "error";
type CbgSearchNotice = {
  type: "info" | "success" | "error";
  message: string;
};
type CbgSearchSnapshot = {
  candidates: CbgRoleCandidate[];
  criteria: AccountMatcherCriteria;
  state: Exclude<CbgResultsState, "idle">;
  searchedAt: number;
  hasNext: boolean;
  loadingNext: boolean;
  notice: CbgSearchNotice | null;
};

const cbgAppliedCriterionLabels: Record<string, string> = {
  pass_fair_show: "仅看公示期",
  full_ssr: "SSR 全图鉴",
  full_sp: "SP 全图鉴",
  full_x: "联动全图鉴",
  full_ur: "UR 全图鉴",
  six_star_num: "6 星式神数量",
  fengzidu: "风姿度",
  max_sanjian_speed: "散件一速",
  max_zhaocai_speed: "招财一速",
  tou_counts: "头个数",
  tou_speed: "头速度",
  wei_counts: "尾个数",
  wei_speed: "尾速度",
  zhaocai_tou_counts: "招财头个数",
  zhaocai_tou_speed: "招财头速度",
  full_speed_yuhun: "满速御魂数量",
  goyu: "勾玉",
  strength: "体力",
  gameble_card: "神秘符咒",
  money: "金币",
  black_egg_num: "御行达摩数量",
  qianghua_yuhun_num: "满级御魂数量",
  sign_days: "签到天数",
  equip_level: "账号等级",
  ss_skin_num: "式神皮肤数量",
  collection_skin_num: "典藏皮肤数量",
  yard_skin_num: "庭院皮肤数量",
  yzg_open: "曜之阁开启",
  gouyu_card: "永久勾玉卡",
  is_xinyi_vip: "心易徽记",
  honor_id: "徽章",
  achieve_ids: "成就",
  serverid: "区服",
  platform_type: "平台",
};

const relicOverviewFields: NumberFilter[] = [
  {
    name: "minimumMaxSpeedCount",
    label: "满速御魂数 ≥",
    max: 999,
    precision: 0,
  },
  {
    name: "minimumScatteredSpeed",
    label: "散件一速 ≥",
    max: 162,
    precision: 1,
  },
  {
    name: "minimumLuckySpeed",
    label: "招财一速 ≥",
    max: 162,
    precision: 1,
  },
];

const relicHeadFields: NumberFilter[] = [
  { name: "minimumHeadCount", label: "头个数 ≥", max: 999, precision: 0 },
  { name: "minimumHeadSpeed", label: "头速度 ≥", max: 17.5, precision: 1 },
  {
    name: "minimumLuckyHeadCount",
    label: "招财头个数 ≥",
    max: 999,
    precision: 0,
  },
  {
    name: "minimumLuckyHeadSpeed",
    label: "招财头速度 ≥",
    max: 17.5,
    precision: 1,
  },
];

const relicTailFields: NumberFilter[] = [
  { name: "minimumTailCount", label: "尾个数 ≥", max: 999, precision: 0 },
  { name: "minimumTailSpeed", label: "尾速度 ≥", max: 17.5, precision: 1 },
];

const assetNumberFields: NumberFilter[] = [
  { name: "jade", label: "勾玉" },
  { name: "mysteryAmulet", label: "神秘符咒" },
  { name: "stamina", label: "体力" },
  { name: "goldWan", label: "金币（万）" },
  { name: "goldenAmulet", label: "金御札" },
  { name: "jadeStone", label: "魂玉" },
  { name: "御札", label: "御札" },
  { name: "逢魔之魂", label: "逢魔之魂" },
  { name: "大蛇的逆鳞", label: "大蛇的逆鳞" },
  { name: "御行达摩", label: "御行达摩" },
  { name: "皮肤券", label: "皮肤券" },
  { name: "勋章", label: "勋章" },
  { name: "六星结界卡", label: "六星结界卡" },
  { name: "满级御魂", label: "满级御魂" },
];

const skinCountFields: NumberFilter[] = [
  { name: "式神皮肤总数", label: "式神皮肤总数" },
  { name: "典藏皮肤总数", label: "典藏皮肤总数" },
  { name: "庭院皮肤总数", label: "庭院皮肤总数" },
  { name: "召唤屋皮肤总数", label: "召唤屋皮肤总数" },
  { name: "幕间皮肤总数", label: "幕间皮肤总数" },
  { name: "战斗主题总数", label: "战斗主题总数" },
  { name: "阴阳术皮肤总数", label: "阴阳术皮肤总数" },
];

const sixStarHeroCountField: NumberFilter = {
  name: "minimumSixStarHeroCount",
  label: "6 星式神数量 ≥",
  max: 999,
  precision: 0,
};

const accountNumberFields: NumberFilter[] = [
  { name: "minimumStyle", label: "风姿度 ≥", max: 999999, precision: 0 },
  { name: "minimumSignInDays", label: "签到天数 ≥", max: 9999, precision: 0 },
  { name: "maximumLevel", label: "等级 ≤", max: 60, precision: 0 },
];

const dexRequirementOptions = [
  { label: "SSR 全图鉴", value: "ssr" },
  { label: "SP 全图鉴", value: "sp" },
  { label: "UR 全图鉴", value: "ur" },
  { label: "联动全图鉴", value: "collaboration" },
];

const assetSwitchOptions = ["曜之阁开启", "永久勾玉卡", "心易徽记"];
const badgeOptions = ["秘闻·天下一", "地域·天下一", "馆主·博", "终极之巅"].map(
  (name) => ({ label: name, value: name }),
);
const achievementOptions = [
  "征服世界",
  "非洲·大阴阳师",
  "阴阳师·大神",
  "对弈竞猜·卓见",
].map((name) => ({ label: name, value: name }));

const serverOptions = [
  {
    label: "中国区-iOS",
    options: [
      "春之樱",
      "桂之馥",
      "兰之雅",
      "莲之净",
      "雀之羽",
      "松之苍",
      "夏之蝉",
      "云之遏",
      "夜之月",
      "竹之幽",
    ].map((name) => ({ label: name, value: `中国区-iOS/${name}` })),
  },
  {
    label: "网易-双平台",
    options: [
      "携手同心",
      "相伴相随",
      "情比金坚",
      "形影不离",
      "同心一意",
      "相知相依",
      "心意相通",
      "永生之谜",
      "缥缈之旅",
      "遥远之忆",
      "孤高之心",
      "风雨同行",
      "两情相悦",
      "春樱共赏",
      "谜之暗影",
      "结伴同游",
    ].map((name) => ({ label: `网易-${name}`, value: `网易-双平台/${name}` })),
  },
  {
    label: "联运-双平台",
    options: [
      "B站-两心无间",
      "B站-亲密无间",
      "B站-情深谊长",
      "B站-情意相投",
    ].map((name) => ({ label: name, value: `联运-双平台/${name}` })),
  },
  {
    label: "国际区",
    options: ["海外加速区", "全球国际区"].map((name) => ({
      label: name,
      value: `国际区/${name}`,
    })),
  },
  {
    label: "全平台互通新区",
    options: [
      "八岐魅影",
      "彼世之花",
      "百鬼夜行",
      "白玉银阙",
      "初心未改",
      "赤夜降临",
      "春告之雪",
      "渡世之风",
      "枫之舞",
      "浮梦之境",
      "鬼灭之刃",
      "高天原",
      "鬼灯的冷彻",
      "鬼王之宴",
      "欢庆鼓舞",
      "狐之宴",
      "绘世之卷",
      "黄金爪",
      "花札物语",
      "花火之夏",
      "旧友新朋",
      "今时月",
      "举手相庆",
      "瀞灵廷",
      "旧时童梦",
      "镜如明心",
      "经霜之枫",
      "结世缘",
      "鲛人之歌",
      "立秋夕烛",
      "轮回之庭",
      "铃心踏焰",
      "灵狐愿",
      "麓海为王",
      "鸣麓逐浪",
      "猫川别馆",
      "暖风春穗",
      "念山行",
      "破晓之樱",
      "犬夜叉",
      "晴空日和",
      "祈世之舞",
      "乾坤行",
      "千山醉",
      "人间千年",
      "日轮之城",
      "深情厚谊",
      "少时之约",
      "森之王",
      "四载平安",
      "四季生",
      "森遥乡",
      "神鲤生财",
      "神之晚宴",
      "时海曜光",
      "三途烽烬",
      "守山谣",
      "天上天下",
      "桃映春馨",
      "天罗地网",
      "庭中酌",
      "踏雪行",
      "唯吾独尊",
      "万事屋",
      "雾山隐",
      "相伴同行",
      "相伴长情",
      "夏之风铃",
      "携手共度",
      "雪之萤",
      "相闻秋歌",
      "循光世",
      "夏目友人帐",
      "依偎相守",
      "樱之忆",
      "游梦迷蝶",
      "夜火离歌",
      "一叶禅心",
      "永生之海",
      "雅乐之邦",
      "愿予必成",
      "御香归",
      "樱月相邀",
      "夜摩天殿",
      "音起时",
      "有龙则灵",
      "夜影之谜",
      "音巡夜",
      "竹风夏意",
      "朝夕相伴",
      "追月逐兔",
      "稚羽萌心",
      "真味如初",
      "真言之塔",
      "奏世之宴",
    ].map((name) => ({ label: name, value: `全平台互通新区/${name}` })),
  },
];

const priceRanges = [
  { label: "100–499 元", value: "100-499", minimum: 100, maximum: 499 },
  { label: "500–1,999 元", value: "500-1999", minimum: 500, maximum: 1999 },
  {
    label: "2,000–4,999 元",
    value: "2000-4999",
    minimum: 2000,
    maximum: 4999,
  },
  {
    label: "5,000 元以上",
    value: "5000-plus",
    minimum: 5000,
    maximum: null,
  },
];

const accountMatcherCriteriaStorageKey =
  "yys-cbg-inspector.account-matcher.criteria";
const accountMatcherSearchStorageKey =
  "yys-cbg-inspector.account-matcher.last-search";
const trialNoticeDismissedKey =
  "yys-cbg-inspector.account-matcher.trial-notice-dismissed";
const filterGuidanceDismissedKey =
  "yys-cbg-inspector.account-matcher.filter-guidance-dismissed";
const emptyLocalMatchResults: AccountMatchResult[] = [];
let activeCbgSearchTasks = 0;
const loadingCandidateUrls = new Set<string>();
/**
 * 账号匹配页当前是否在前台。
 * 逐条读取商品详情要在藏宝阁窗口内执行脚本并回传整包数据，与首页读取商品共用同一个
 * 窗口；离开本页后继续跑会让首页长时间卡住，所以只在本页可见时才继续读取，剩下的
 * 候选保留 pending，回到本页后由恢复逻辑接着读。
 */
let matcherPageActive = false;
type CbgSearchSession = {
  snapshot: CbgSearchSnapshot | null;
  notice: CbgSearchNotice | null;
  applying: boolean;
};
let cbgSearchSession: CbgSearchSession = {
  snapshot: null,
  notice: null,
  applying: false,
};
let cbgSearchSessionLoaded = false;
let cbgSearchPageHideListenerAdded = false;
let cbgSearchNotifyTimer: number | undefined;
let cbgSearchPersistTimer: number | undefined;
const cbgSearchSessionListeners = new Set<() => void>();
let activeLocalMatchJob: {
  controller: AbortController;
  history: DatasetHistoryRecord[];
  promise: Promise<AccountMatchResult[] | null>;
} | null = null;
const localMatchJobs = new WeakMap<
  DatasetHistoryRecord[],
  {
    criteriaKey: string;
    promise: Promise<AccountMatchResult[] | null>;
  }
>();

function matchLocalHistoryInBackground(
  history: DatasetHistoryRecord[],
  criteria: AccountMatcherCriteria,
) {
  const criteriaKey = JSON.stringify(criteria);
  const existing = localMatchJobs.get(history);
  if (existing?.criteriaKey === criteriaKey) return existing.promise;

  activeLocalMatchJob?.controller.abort();
  const controller = new AbortController();
  const promise = matchAccountHistoryInWorker(
    history,
    criteria,
    controller.signal,
  );
  localMatchJobs.set(history, { criteriaKey, promise });
  activeLocalMatchJob = { controller, history, promise };

  const clearJob = () => {
    if (localMatchJobs.get(history)?.promise === promise) {
      localMatchJobs.delete(history);
    }
    if (activeLocalMatchJob?.controller === controller) {
      activeLocalMatchJob = null;
    }
  };
  void promise.then((results) => {
    if (results === null) clearJob();
    else if (activeLocalMatchJob?.controller === controller) {
      activeLocalMatchJob = null;
    }
  }, clearJob);

  return promise;
}

function matchAccountHistoryInWorker(
  history: DatasetHistoryRecord[],
  criteria: AccountMatcherCriteria,
  signal: AbortSignal,
) {
  if (!history.length || signal.aborted) {
    return Promise.resolve(signal.aborted ? null : []);
  }

  const recordsById = new Map(history.map((record) => [record.id, record]));
  const workerHistory: DatasetHistoryRecord[] = history.map((record) => ({
    id: record.id,
    productUrl: record.productUrl,
    savedAt: record.savedAt,
    accountName: record.accountName,
    serverName: record.serverName,
    relicCount: record.relicCount,
    dataset: {
      account: record.dataset.account,
      heroes: record.dataset.heroes,
      relicsByPosition: {},
    },
  }));

  return new Promise<AccountMatchResult[] | null>((resolve, reject) => {
    const worker = new Worker(
      new URL("../../lib/accountMatcher.worker.ts", import.meta.url),
      { type: "module" },
    );
    let settled = false;
    const finish = () => {
      if (settled) return false;
      settled = true;
      signal.removeEventListener("abort", handleAbort);
      worker.terminate();
      return true;
    };
    const handleAbort = () => {
      if (finish()) resolve(null);
    };

    signal.addEventListener("abort", handleAbort, { once: true });
    if (signal.aborted) {
      handleAbort();
      return;
    }

    worker.onmessage = (event: MessageEvent<AccountMatcherWorkerResponse>) => {
      if (!finish()) return;
      if (event.data.type === "error") {
        reject(new Error(event.data.message));
        return;
      }
      resolve(
        event.data.results.map((result) => ({
          ...result,
          record: recordsById.get(result.record.id) ?? result.record,
        })),
      );
    };
    worker.onerror = (event) => {
      event.preventDefault();
      if (finish()) reject(new Error(event.message || "本机历史匹配线程异常"));
    };
    worker.onmessageerror = () => {
      if (finish()) reject(new Error("无法读取本机历史匹配结果"));
    };

    try {
      const request: AccountMatcherWorkerRequest = {
        history: workerHistory,
        criteria,
      };
      worker.postMessage(request);
    } catch (error) {
      if (finish()) {
        reject(error instanceof Error ? error : new Error("本机历史匹配失败"));
      }
    }
  });
}

function cancelLocalHistoryMatch() {
  const job = activeLocalMatchJob;
  job?.controller.abort();
  if (job && localMatchJobs.get(job.history)?.promise === job.promise) {
    localMatchJobs.delete(job.history);
  }
  activeLocalMatchJob = null;
}

function normalizeCbgCandidate(
  value: unknown,
  keepLoading = false,
): CbgRoleCandidate | undefined {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof (value as CbgRoleCandidate).url !== "string"
  ) {
    return undefined;
  }

  const candidate = value as CbgRoleCandidate;
  const rawDetails = candidate.details as CbgCandidateDetails | undefined;
  const rawAccount = rawDetails?.account as Record<string, unknown> | undefined;
  const account = rawAccount
    ? Object.fromEntries(
        Object.entries(rawAccount).filter(
          ([key, item]) =>
            (["title", "name", "listingStatus", "serverName"].includes(key) &&
              typeof item === "string") ||
            ([
              "level",
              "price",
              "fengzidu",
              "scatteredFirstSpeed",
              "luckyFirstSpeed",
              "speedHeadCount",
              "speedTailCount",
              "money",
              "stamina",
              "soulJade",
              "mysteryTalisman",
              "realityTalisman",
              "summonPower",
              "yuxingDama",
              "relicSummary",
              "maxLevelRelicCount",
            ].includes(key) &&
              typeof item === "number" &&
              Number.isFinite(item)),
        ),
      )
    : undefined;
  const details =
    account && Number.isFinite(rawDetails?.relicCount)
      ? {
          account: account as CbgCandidateMetrics,
          relicCount: rawDetails.relicCount,
          ...(typeof rawDetails.pvePanel === "string"
            ? { pvePanel: rawDetails.pvePanel }
            : {}),
          ...(typeof rawDetails.speedPanel === "string"
            ? { speedPanel: rawDetails.speedPanel }
            : {}),
        }
      : undefined;

  return {
    url: candidate.url,
    ...(typeof candidate.summary === "string"
      ? { summary: candidate.summary }
      : {}),
    ...(details ? { details } : {}),
    detailStatus:
      candidate.detailStatus === "ready" && details
        ? "ready"
        : candidate.detailStatus === "error"
          ? "error"
          : candidate.detailStatus === "loading" && keepLoading
            ? "loading"
            : "pending",
    ...(typeof candidate.detailError === "string"
      ? { detailError: candidate.detailError }
      : {}),
  };
}

async function loadCbgCandidateDetails(
  candidate: CbgRoleCandidate,
  gameConfig: GameConfig,
): Promise<CbgCandidateDetails> {
  const product = parseProductUrl(candidate.url);
  // 走 loadProductRaw：整包数据（含御魂详情）以字符串回传，解析和转换都在 Worker 内完成。
  // 直接在主线程解析几十兆的商品数据会持续阻塞界面，列表里几十条详情足以卡住十几秒。
  const loadProductRaw = window.desktop?.loadProductRaw;
  if (!loadProductRaw) throw new Error("藏宝阁商品详情读取功能不可用");

  const payload = await loadProductRaw(product);
  const dataset = await convertCbgPayloadInWorker(payload, gameConfig, {
    accountOnly: true,
  });
  const relicCount = Number(dataset.account?.relicSummary) || 0;
  return {
    account: dataset.account || {},
    relicCount,
  };
}

function loadLastAccountMatcherCriteria(): Partial<AccountMatcherCriteria> {
  try {
    const saved = JSON.parse(
      window.localStorage.getItem(accountMatcherCriteriaStorageKey) ?? "null",
    );
    return saved && typeof saved === "object" && !Array.isArray(saved)
      ? saved
      : {};
  } catch {
    return {};
  }
}

function loadLastCbgSearch(): CbgSearchSnapshot | null {
  try {
    const saved = JSON.parse(
      window.localStorage.getItem(accountMatcherSearchStorageKey) ?? "null",
    );
    if (
      !saved ||
      typeof saved !== "object" ||
      Array.isArray(saved) ||
      !["loading", "ready", "empty", "error"].includes(saved.state) ||
      !Array.isArray(saved.candidates) ||
      !saved.criteria ||
      typeof saved.criteria !== "object" ||
      Array.isArray(saved.criteria) ||
      !Number.isFinite(saved.searchedAt)
    ) {
      return null;
    }
    if (Date.now() - saved.searchedAt > ACCOUNT_DATA_RETENTION_MS) {
      window.localStorage.removeItem(accountMatcherSearchStorageKey);
      return null;
    }

    const keepLoading = activeCbgSearchTasks > 0;
    const candidates = saved.candidates.flatMap((candidate: unknown) => {
      const normalized = normalizeCbgCandidate(candidate, keepLoading);
      return normalized ? [normalized] : [];
    });
    const interrupted =
      !keepLoading && (saved.state === "loading" || saved.loadingNext === true);
    const state: CbgSearchSnapshot["state"] =
      saved.state === "loading" && candidates.length
        ? "ready"
        : interrupted && saved.state === "loading"
          ? "error"
          : saved.state;
    const notice =
      interrupted && saved.state === "loading"
        ? {
            type: "error" as const,
            message: candidates.length
              ? "上次搜索中断，已恢复已获取的账号并继续读取详情"
              : "上次搜索未完成，请重新开始搜索",
          }
        : interrupted
          ? {
              type: "info" as const,
              message: "上次加载下一页未完成，可重新点击加载下一页",
            }
          : saved.notice &&
              ["info", "success", "error"].includes(saved.notice.type) &&
              typeof saved.notice.message === "string"
            ? saved.notice
            : null;
    return {
      candidates,
      criteria: saved.criteria as AccountMatcherCriteria,
      state: state === "ready" && !candidates.length ? "empty" : state,
      searchedAt: saved.searchedAt,
      hasNext: Boolean(saved.hasNext),
      loadingNext: keepLoading && Boolean(saved.loadingNext),
      notice,
    };
  } catch {
    return null;
  }
}

function notifyCbgSearchSession() {
  if (cbgSearchNotifyTimer !== undefined) return;
  cbgSearchNotifyTimer = window.setTimeout(() => {
    cbgSearchNotifyTimer = undefined;
    cbgSearchSessionListeners.forEach((listener) => listener());
  }, 80);
}

function flushCbgSearchSnapshot() {
  if (cbgSearchPersistTimer !== undefined) {
    window.clearTimeout(cbgSearchPersistTimer);
  }
  cbgSearchPersistTimer = undefined;
  try {
    if (cbgSearchSession.snapshot) {
      window.localStorage.setItem(
        accountMatcherSearchStorageKey,
        JSON.stringify(cbgSearchSession.snapshot),
      );
    } else {
      window.localStorage.removeItem(accountMatcherSearchStorageKey);
    }
  } catch {
    // 搜索结果仍保留在当前应用会话中。
  }
}

function scheduleCbgSearchSnapshotSave() {
  if (cbgSearchPersistTimer !== undefined) {
    window.clearTimeout(cbgSearchPersistTimer);
  }
  cbgSearchPersistTimer = window.setTimeout(flushCbgSearchSnapshot, 500);
}

function getCbgSearchSession(): CbgSearchSession {
  if (!cbgSearchSessionLoaded) {
    cbgSearchSessionLoaded = true;
    if (!cbgSearchPageHideListenerAdded) {
      window.addEventListener("pagehide", flushCbgSearchSnapshot);
      cbgSearchPageHideListenerAdded = true;
    }
    const snapshot = loadLastCbgSearch();
    cbgSearchSession = {
      snapshot,
      notice:
        snapshot?.notice ??
        (snapshot
          ? {
              type: "info",
              message: `已恢复上次藏宝阁搜索结果（${formatCbgSearchTime(snapshot.searchedAt)}）`,
            }
          : null),
      applying:
        activeCbgSearchTasks > 0 ||
        snapshot?.state === "loading" ||
        Boolean(
          snapshot?.candidates.some(
            (candidate) =>
              candidate.detailStatus === "pending" ||
              candidate.detailStatus === "loading",
          ),
        ),
    };
  }
  return cbgSearchSession;
}

function subscribeCbgSearchSession(listener: () => void) {
  getCbgSearchSession();
  cbgSearchSessionListeners.add(listener);
  return () => {
    cbgSearchSessionListeners.delete(listener);
  };
}

function saveCbgSearchSnapshot(snapshot: CbgSearchSnapshot) {
  const current = getCbgSearchSession();
  cbgSearchSession = { ...current, snapshot, notice: snapshot.notice };
  notifyCbgSearchSession();
  scheduleCbgSearchSnapshotSave();
}

function updateCbgSearchSnapshot(
  update: (snapshot: CbgSearchSnapshot) => CbgSearchSnapshot,
) {
  const current = getCbgSearchSession().snapshot;
  if (current) saveCbgSearchSnapshot(update(current));
}

function setCbgSearchNotice(notice: CbgSearchNotice | null) {
  const current = getCbgSearchSession();
  if (
    current.notice?.type === notice?.type &&
    current.notice?.message === notice?.message
  ) {
    return;
  }
  cbgSearchSession = {
    ...current,
    notice,
    snapshot: current.snapshot
      ? { ...current.snapshot, notice }
      : current.snapshot,
  };
  notifyCbgSearchSession();
  if (current.snapshot) scheduleCbgSearchSnapshotSave();
}

function setCbgSearchApplying(applying: boolean) {
  const current = getCbgSearchSession();
  if (current.applying === applying) return;
  cbgSearchSession = { ...current, applying };
  notifyCbgSearchSession();
}

function clearCbgSearchSession() {
  cbgSearchSession = { snapshot: null, notice: null, applying: false };
  if (cbgSearchPersistTimer !== undefined) {
    window.clearTimeout(cbgSearchPersistTimer);
    cbgSearchPersistTimer = undefined;
  }
  try {
    window.localStorage.removeItem(accountMatcherSearchStorageKey);
  } catch {
    // 忽略不可用的本地存储。
  }
  notifyCbgSearchSession();
}

function isNoticeDismissed(key: string) {
  try {
    return window.localStorage.getItem(key) === "dismissed";
  } catch {
    return false;
  }
}

function persistNoticeDismissal(key: string) {
  try {
    window.localStorage.setItem(key, "dismissed");
  } catch {
    // 存储不可用时仍在当前页面关闭提示。
  }
}

export function AccountMatcherPage() {
  const navigate = useNavigate();
  const [messageApi, messageHolder] = message.useMessage();
  const cbgSearchSession = useSyncExternalStore(
    subscribeCbgSearchSession,
    getCbgSearchSession,
    getCbgSearchSession,
  );
  const savedSearch = cbgSearchSession.snapshot;
  const history = useAppSelector((state) => state.app.history);
  const cacheReady = useAppSelector((state) => state.app.cacheReady);
  const [showTrialNotice, setShowTrialNotice] = useState(
    () => !isNoticeDismissed(trialNoticeDismissedKey),
  );
  const [showFilterGuidance, setShowFilterGuidance] = useState(
    () => !isNoticeDismissed(filterGuidanceDismissedKey),
  );
  const [savedCriteria] = useState(loadLastAccountMatcherCriteria);
  const [backgroundStatus, setBackgroundStatus] = useState(
    getBackgroundSearchStatus,
  );
  const [backgroundUsageHistory, setBackgroundUsageHistory] = useState(
    getBackgroundSearchUsageHistory,
  );
  const [backgroundHistoryOpen, setBackgroundHistoryOpen] = useState(false);
  const [backgroundSearchExpanded, setBackgroundSearchExpanded] =
    useState(false);
  const [backgroundInterval, setBackgroundInterval] = useState(
    backgroundStatus.intervalMinutes,
  );
  const [localMatch, setLocalMatch] = useState<{
    history: typeof history;
    criteria: AccountMatcherCriteria;
    results: AccountMatchResult[];
  } | null>(null);
  const [localMatchFailure, setLocalMatchFailure] = useState<{
    history: typeof history;
    criteria: AccountMatcherCriteria;
    message: string;
  } | null>(null);
  const hasSearched = Boolean(savedSearch);
  const applyingCbgSearch = cbgSearchSession.applying;
  const cbgCandidates = savedSearch?.candidates ?? [];
  const cbgResultsState = savedSearch?.state ?? "idle";
  const cbgHasNext = savedSearch?.hasNext ?? false;
  const [expandedCbgRows, setExpandedCbgRows] = useState<string[]>([]);
  const [expandedLocalRows, setExpandedLocalRows] = useState<string[]>([]);
  const [localResultPage, setLocalResultPage] = useState(1);
  const cbgSearchedAt = savedSearch?.searchedAt ?? null;
  const cbgSearchedCriteria = savedSearch?.criteria ?? null;
  const loadingCbgNext = savedSearch?.loadingNext ?? false;
  const cbgSearchNotice = cbgSearchSession.notice;
  const [minimumPrice, setMinimumPrice] = useState<number | null>(
    savedCriteria.minimumPrice ?? null,
  );
  const [maximumPrice, setMaximumPrice] = useState<number | null>(
    savedCriteria.maximumPrice ?? null,
  );
  const [selectedServers, setSelectedServers] = useState<string[]>(
    savedCriteria.selectedServers ?? [],
  );
  const [draftServers, setDraftServers] = useState<string[]>([]);
  const [serverPickerOpen, setServerPickerOpen] = useState(false);
  const [activeServerGroup, setActiveServerGroup] = useState(
    serverOptions[0].label,
  );
  const [publication, setPublication] = useState<
    AccountMatcherCriteria["publication"]
  >(savedCriteria.publication ?? "any");
  const [platforms, setPlatforms] = useState<string[]>(
    savedCriteria.platforms ?? [],
  );
  const [priceBucket, setPriceBucket] = useState(
    () =>
      priceRanges.find(
        (range) =>
          range.minimum === (savedCriteria.minimumPrice ?? null) &&
          range.maximum === (savedCriteria.maximumPrice ?? null),
      )?.value ?? "",
  );
  const [dexRequirements, setDexRequirements] = useState<string[]>(
    savedCriteria.dexRequirements ?? [],
  );
  const [numberFilters, setNumberFilters] = useState<
    Record<string, number | null>
  >(savedCriteria.numberFilters ?? {});
  const [assetFlags, setAssetFlags] = useState<string[]>(
    savedCriteria.assetFlags ?? [],
  );
  const [badges, setBadges] = useState<string[]>(savedCriteria.badges ?? []);
  const [achievements, setAchievements] = useState<string[]>(
    savedCriteria.achievements ?? [],
  );

  useEffect(() => {
    const unsubscribeStatus = subscribeBackgroundSearch(setBackgroundStatus);
    const unsubscribeUsage = subscribeBackgroundSearchUsageHistory(
      setBackgroundUsageHistory,
    );
    return () => {
      unsubscribeStatus();
      unsubscribeUsage();
    };
  }, []);

  // 本页是商品详情逐条读取的发起方：进入时恢复读取，离开时立刻让读取循环停下，
  // 避免在其它页面（尤其是首页读取商品时）继续占用藏宝阁窗口和主线程。
  useEffect(() => {
    matcherPageActive = true;
    return () => {
      matcherPageActive = false;
    };
  }, []);

  const criteria = useMemo<AccountMatcherCriteria>(
    () => ({
      minimumPrice,
      maximumPrice,
      selectedServers,
      publication,
      platforms,
      dexRequirements,
      numberFilters,
      assetFlags,
      badges,
      achievements,
    }),
    [
      minimumPrice,
      maximumPrice,
      selectedServers,
      publication,
      platforms,
      dexRequirements,
      numberFilters,
      assetFlags,
      badges,
      achievements,
    ],
  );
  useEffect(() => {
    try {
      window.localStorage.setItem(
        accountMatcherCriteriaStorageKey,
        JSON.stringify(criteria),
      );
    } catch {
      // 本地存储不可用时保留当前页面筛选状态。
    }
  }, [criteria]);
  const localMatchCriteria = cbgSearchedCriteria ?? criteria;
  const hasCurrentLocalMatch =
    localMatch?.history === history &&
    localMatch.criteria === localMatchCriteria;
  const results =
    hasSearched && hasCurrentLocalMatch
      ? localMatch.results
      : emptyLocalMatchResults;
  const localMatchError =
    localMatchFailure?.history === history &&
    localMatchFailure.criteria === localMatchCriteria
      ? localMatchFailure.message
      : null;
  const localMatchPending =
    hasSearched &&
    cacheReady &&
    history.length > 0 &&
    !hasCurrentLocalMatch &&
    !localMatchError;
  useEffect(() => {
    if (!hasSearched || !cacheReady) return;
    if (
      localMatch?.history === history &&
      localMatch.criteria === localMatchCriteria
    ) {
      return;
    }

    setLocalMatchFailure(null);
    void matchLocalHistoryInBackground(history, localMatchCriteria)
      .then((nextResults) => {
        if (!nextResults) return;
        setLocalMatch({
          history,
          criteria: localMatchCriteria,
          results: nextResults,
        });
      })
      .catch((error: unknown) => {
        setLocalMatchFailure({
          history,
          criteria: localMatchCriteria,
          message: error instanceof Error ? error.message : "本机历史匹配失败",
        });
      });
  }, [cacheReady, localMatchCriteria, hasSearched, history, localMatch]);
  useEffect(() => {
    if (!hasSearched) return;
    setLocalResultPage(1);
    setExpandedLocalRows((current) => (current.length ? [] : current));
  }, [localMatchCriteria, hasSearched, history]);
  const updateNumber = (name: string, value: number | null) => {
    setNumberFilters((current) => ({ ...current, [name]: value }));
  };
  const queryAccountInHome = (url: string) =>
    navigate(APP_ROUTE_PATHS.home, {
      state: { autoQueryProductUrl: url },
    });
  const querySavedAccountInHome = (recordId: string) =>
    navigate(APP_ROUTE_PATHS.home, {
      state: { autoQueryHistoryRecordId: recordId },
    });
  const openProductLink = (url: string) => {
    void openExternalUrl(url).catch((error: unknown) => {
      messageApi.error(
        `商品链接打开失败：${error instanceof Error ? error.message : "请检查默认浏览器设置"}`,
      );
    });
  };
  const updateBudget = (minimum: number | null, maximum: number | null) => {
    setMinimumPrice(minimum);
    setMaximumPrice(maximum);
    setPriceBucket(
      priceRanges.find(
        (range) => range.minimum === minimum && range.maximum === maximum,
      )?.value ?? "",
    );
  };

  const waitForCbgRoleResults = async () => {
    const readResults = window.desktop?.readCbgRoleResults;
    if (!readResults) throw new Error("藏宝阁搜索结果读取功能不可用");

    const deadline = Date.now() + 20_000;
    let page = await readResults();
    let siteNotice: string | undefined;
    while (page.status === "loading" || page.status === "not_role_search") {
      if (page.siteNotice) {
        siteNotice = page.siteNotice;
        const notice: CbgSearchNotice = {
          type: "info",
          message: `藏宝阁提示：${siteNotice}；正在等待搜索结果…`,
        };
        setCbgSearchNotice(notice);
      }
      if (Date.now() >= deadline) {
        throw new Error(
          siteNotice
            ? `藏宝阁提示：${siteNotice}；未进入角色列表`
            : "藏宝阁搜索已提交，但结果页加载超时",
        );
      }
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      page = await readResults();
    }
    return { ...page, siteNotice: page.siteNotice ?? siteNotice };
  };

  const loadCandidateDetails = useCallback(
    async (candidates: CbgRoleCandidate[], summary: string) => {
      const candidatesToLoad = candidates.filter(
        ({ url }) => !loadingCandidateUrls.has(url),
      );
      if (!candidatesToLoad.length) return;

      activeCbgSearchTasks += 1;
      const markCandidate = (
        url: string,
        update: Partial<CbgRoleCandidate>,
      ) => {
        updateCbgSearchSnapshot((snapshot) => ({
          ...snapshot,
          candidates: snapshot.candidates.map((candidate) =>
            candidate.url === url ? { ...candidate, ...update } : candidate,
          ),
        }));
      };
      const updateNotice = (notice: CbgSearchNotice) => {
        setCbgSearchNotice(notice);
      };

      const loadingUrls = new Set(candidatesToLoad.map(({ url }) => url));
      loadingUrls.forEach((url) => loadingCandidateUrls.add(url));
      const markLoading = (candidate: CbgRoleCandidate): CbgRoleCandidate =>
        loadingUrls.has(candidate.url)
          ? { ...candidate, detailStatus: "loading", detailError: undefined }
          : candidate;
      updateCbgSearchSnapshot((snapshot) => ({
        ...snapshot,
        candidates: snapshot.candidates.map(markLoading),
      }));

      try {
        const gameConfig = await loadRelicSuits<GameConfig>().catch(
          () => ({}) as GameConfig,
        );
        let loaded = 0;
        let failed = 0;
        let pausedByNavigation = false;

        for (const [index, candidate] of candidatesToLoad.entries()) {
          // 离开本页就停止继续读取：详情读取会占用藏宝阁窗口并回传整包数据，
          // 与首页的商品读取抢资源，是本页之外卡顿的直接来源。
          if (!matcherPageActive) {
            pausedByNavigation = true;
            break;
          }
          updateNotice({
            type: "info",
            message: `${summary}；正在读取第 ${index + 1}/${candidatesToLoad.length} 条商品详情…`,
          });
          try {
            const details = await loadCbgCandidateDetails(
              candidate,
              gameConfig,
            );
            markCandidate(candidate.url, {
              details,
              detailStatus: "ready",
              detailError: undefined,
            });
            loaded += 1;
          } catch (reason) {
            const message =
              reason instanceof Error ? reason.message : String(reason);
            markCandidate(candidate.url, {
              detailStatus: "error",
              detailError: message.slice(0, 180),
            });
            failed += 1;
            if (
              /登录状态|重新登录|安全验证|风险控制|风控|访问频繁|系统繁忙/.test(
                message,
              )
            ) {
              const remaining = candidatesToLoad.slice(index + 1);
              remaining.forEach((item) =>
                markCandidate(item.url, {
                  detailStatus: "error",
                  detailError: message.slice(0, 180),
                }),
              );
              failed += remaining.length;
              break;
            }
          }
        }

        if (pausedByNavigation) {
          // 未读取的候选保持 pending，回到本页后由下面的恢复 effect 接着读。
          updateNotice({
            type: "info",
            message: `${summary}；已暂停读取商品详情，回到本页会继续`,
          });
          return;
        }

        updateNotice({
          type: failed ? "info" : "success",
          message: `${summary}；已读取 ${loaded}/${candidatesToLoad.length} 个账号详情${failed ? `，${failed} 个读取失败` : ""}`,
        });
      } finally {
        candidatesToLoad.forEach(({ url }) => {
          loadingCandidateUrls.delete(url);
        });
        activeCbgSearchTasks = Math.max(0, activeCbgSearchTasks - 1);
        if (!activeCbgSearchTasks) setCbgSearchApplying(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (cbgResultsState !== "ready") return;
    const pendingCandidates = cbgCandidates.filter(
      (candidate) => candidate.detailStatus === "pending",
    );
    if (pendingCandidates.length) {
      void loadCandidateDetails(pendingCandidates, "恢复上次藏宝阁搜索结果");
    }
  }, [cbgCandidates, cbgResultsState, loadCandidateDetails]);

  const runSearch = async () => {
    if (backgroundStatus.running) return;
    const searchedAt = Date.now();
    const initialNotice: CbgSearchNotice = {
      type: "info",
      message:
        "正在提交藏宝阁筛选并读取商品结果；切到其它页面会保留已取到的结果，回到本页继续读取详情…",
    };
    activeCbgSearchTasks += 1;
    setExpandedCbgRows([]);
    setExpandedLocalRows([]);
    setCbgSearchApplying(true);
    saveCbgSearchSnapshot({
      candidates: [],
      criteria,
      state: "loading",
      searchedAt,
      hasNext: false,
      loadingNext: false,
      notice: initialNotice,
    });
    try {
      const result = await window.desktop?.applyCbgRoleSearch(criteria);
      if (!result) throw new Error("藏宝阁桌面窗口当前不可用");
      const page = await waitForCbgRoleResults();
      if (page.status !== "ready" && page.status !== "empty") {
        const message =
          page.status === "login_required"
            ? "藏宝阁需要先登录，请在藏宝阁窗口登录后重试"
            : page.status === "security_check"
              ? "藏宝阁要求先完成安全验证，请在藏宝阁窗口处理后重试"
              : "藏宝阁没有进入角色搜索结果页，请检查筛选是否已提交";
        throw new Error(message);
      }
      const candidates = page.candidates ?? [];
      const pendingCandidates = candidates.map((candidate) => ({
        ...candidate,
        detailStatus: "pending" as const,
      }));
      const state = candidates.length ? "ready" : "empty";
      const appliedConditions = result.applied
        .filter((key) => key !== "price_min" && key !== "price_max")
        .map((key) => cbgAppliedCriterionLabels[key] ?? "其他条件");
      if (
        result.applied.some((key) => key === "price_min" || key === "price_max")
      ) {
        const formatPrice = (value: number) =>
          `¥${value.toLocaleString("zh-CN")}`;
        const budgetLabel =
          criteria.minimumPrice !== null && criteria.maximumPrice !== null
            ? `预算范围 ${formatPrice(criteria.minimumPrice)}–${formatPrice(criteria.maximumPrice)}`
            : criteria.minimumPrice !== null
              ? `最低价 ${formatPrice(criteria.minimumPrice)} 起`
              : criteria.maximumPrice !== null
                ? `最高价 ${formatPrice(criteria.maximumPrice)} 以内`
                : "预算范围";
        appliedConditions.unshift(budgetLabel);
      }
      const searchSummary = [
        appliedConditions.length
          ? `藏宝阁已按这些条件筛选：${appliedConditions.join("、")}`
          : "已打开藏宝阁角色筛选页",
        result.localOnlyCriteria
          ? "藏宝阁暂不支持部分条件，这些条件仅用于本机历史账号匹配"
          : "",
        page.siteNotice ? `藏宝阁提示：${page.siteNotice}` : "",
        `当前页找到 ${candidates.length} 个账号；本机 ${history.length} 条历史账号匹配结果显示在下方`,
      ]
        .filter(Boolean)
        .join("；");
      const resultsNotice: CbgSearchNotice = {
        type: pendingCandidates.length
          ? "info"
          : result.localOnlyCriteria || page.siteNotice
            ? "info"
            : "success",
        message: pendingCandidates.length
          ? `${searchSummary}；正在读取商品详情…`
          : searchSummary,
      };
      saveCbgSearchSnapshot({
        candidates: pendingCandidates,
        criteria,
        state,
        searchedAt,
        hasNext: Boolean(page.hasNext),
        loadingNext: false,
        notice: resultsNotice,
      });
      if (pendingCandidates.length) {
        await loadCandidateDetails(pendingCandidates, searchSummary);
      }
    } catch (reason) {
      const message =
        (reason instanceof Error ? reason.message : String(reason)) +
        `；本机 ${history.length} 条历史仍会按当前条件筛选并显示在下方`;
      const errorNotice: CbgSearchNotice = { type: "error", message };
      const current = getCbgSearchSession().snapshot;
      saveCbgSearchSnapshot({
        candidates: current?.candidates ?? [],
        criteria,
        state: "error",
        searchedAt,
        hasNext: current?.hasNext ?? false,
        loadingNext: false,
        notice: errorNotice,
      });
    } finally {
      setCbgSearchApplying(false);
      activeCbgSearchTasks = Math.max(0, activeCbgSearchTasks - 1);
    }
  };

  const toggleBackgroundSearch = async () => {
    if (backgroundStatus.running) {
      try {
        await stopBackgroundSearch();
      } catch (reason) {
        setCbgSearchNotice({
          type: "error",
          message: reason instanceof Error ? reason.message : String(reason),
        });
      }
      return;
    }
    if (applyingCbgSearch || loadingCbgNext || activeCbgSearchTasks > 0) {
      setCbgSearchNotice({
        type: "error",
        message: "当前藏宝阁搜索或商品读取尚未完成，请完成后再开启后台搜索",
      });
      return;
    }
    try {
      await startBackgroundSearch(criteria, backgroundInterval);
      setCbgSearchNotice({
        type: "info",
        message: `后台搜索已启动：立即执行一次，之后每 ${backgroundInterval} 分钟搜索；使用启动时的筛选条件。`,
      });
      await window.desktop?.hideMainWindow();
    } catch (reason) {
      setCbgSearchNotice({
        type: "error",
        message: reason instanceof Error ? reason.message : String(reason),
      });
    }
  };

  const loadNextCbgResultsPage = async () => {
    const nextPage = window.desktop?.nextCbgRoleResultsPage;
    if (!nextPage || loadingCbgNext || backgroundStatus.running) return;

    activeCbgSearchTasks += 1;
    const nextNotice: CbgSearchNotice = {
      type: "info",
      message: "正在加载藏宝阁下一页…",
    };
    updateCbgSearchSnapshot((snapshot) => ({
      ...snapshot,
      loadingNext: true,
      notice: nextNotice,
    }));
    try {
      if (!(await nextPage())) {
        updateCbgSearchSnapshot((snapshot) => ({
          ...snapshot,
          hasNext: false,
          notice: { type: "info", message: "没有更多藏宝阁结果" },
        }));
        return;
      }
      const page = await waitForCbgRoleResults();
      if (page.status !== "ready" && page.status !== "empty") {
        throw new Error("无法读取藏宝阁下一页结果");
      }
      const nextCandidates = page.candidates ?? [];
      const existingUrls = new Set(
        (getCbgSearchSession().snapshot?.candidates ?? cbgCandidates).map(
          ({ url }) => url,
        ),
      );
      const pendingCandidates = nextCandidates
        .filter(({ url }) => !existingUrls.has(url))
        .map((candidate) => ({
          ...candidate,
          detailStatus: "pending" as const,
        }));
      const summary = `已加载藏宝阁下一页 ${pendingCandidates.length} 条商品`;
      const pageNotice: CbgSearchNotice = {
        type: "info",
        message: pendingCandidates.length
          ? `${summary}；正在读取商品详情…`
          : summary,
      };
      updateCbgSearchSnapshot((snapshot) => ({
        ...snapshot,
        candidates: [...snapshot.candidates, ...pendingCandidates],
        hasNext: Boolean(page.hasNext),
        notice: pageNotice,
      }));
      if (pendingCandidates.length) {
        await loadCandidateDetails(pendingCandidates, summary);
      }
    } catch (reason) {
      const notice: CbgSearchNotice = {
        type: "error",
        message: reason instanceof Error ? reason.message : String(reason),
      };
      setCbgSearchNotice(notice);
    } finally {
      updateCbgSearchSnapshot((snapshot) => ({
        ...snapshot,
        loadingNext: false,
      }));
      activeCbgSearchTasks = Math.max(0, activeCbgSearchTasks - 1);
    }
  };
  const renderNumberFields = (
    fields: NumberFilter[],
    columns: "standard" | "three" | "two" = "standard",
  ) => (
    <Row gutter={[12, 10]}>
      {fields.map((field) => (
        <Col
          {...(columns === "three"
            ? { xs: 24, sm: 12, lg: 8 }
            : columns === "two"
              ? { xs: 24, sm: 12 }
              : { xs: 24, sm: 12, lg: 8, xxl: 6 })}
          key={field.name}
        >
          <label
            className="account-matcher-label"
            htmlFor={`filter-${field.name}`}
          >
            {field.label}
          </label>
          <InputNumber
            id={`filter-${field.name}`}
            className="account-matcher-number"
            min={0}
            max={field.max}
            precision={field.precision ?? 0}
            placeholder="不限"
            value={numberFilters[field.name] ?? null}
            onChange={(value) =>
              updateNumber(field.name, value === null ? null : Number(value))
            }
          />
        </Col>
      ))}
    </Row>
  );

  const clearConditions = () => {
    cancelLocalHistoryMatch();
    clearCbgSearchSession();
    setSelectedServers([]);
    setPublication("any");
    setPlatforms([]);
    updateBudget(null, null);
    setDexRequirements([]);
    setNumberFilters({});
    setAssetFlags([]);
    setBadges([]);
    setAchievements([]);
  };
  const currentServerGroup = serverOptions.find(
    (group) => group.label === activeServerGroup,
  )!;
  const currentServerValues = currentServerGroup.options.map(
    (option) => option.value,
  );
  const allCurrentServersSelected = currentServerValues.every((value) =>
    draftServers.includes(value),
  );
  const someCurrentServersSelected = currentServerValues.some((value) =>
    draftServers.includes(value),
  );

  const toggleCurrentServerGroup = (checked: boolean) => {
    setDraftServers((current) => {
      const next = new Set(current);
      currentServerValues.forEach((value) =>
        checked ? next.add(value) : next.delete(value),
      );
      return [...next];
    });
  };

  const summarizeNumberFields = (fields: NumberFilter[]) =>
    fields.flatMap(({ name, label }) => {
      const value = numberFilters[name];
      if (value === null || value === undefined) return [];
      const comparator = label.match(/[≥≤]/)?.[0] ?? "≥";
      const fieldName = label.replace(/\s*[≥≤]\s*$/, "");
      return [`${fieldName}${comparator}${value.toLocaleString("zh-CN")}`];
    });
  const joinSummary = (items: string[]) => items.filter(Boolean).join(" · ");
  const budgetSummary =
    minimumPrice !== null || maximumPrice !== null
      ? `预算 ${
          minimumPrice !== null && maximumPrice !== null
            ? `${minimumPrice.toLocaleString("zh-CN")}–${maximumPrice.toLocaleString("zh-CN")}`
            : minimumPrice !== null
              ? `≥${minimumPrice.toLocaleString("zh-CN")}`
              : `≤${maximumPrice!.toLocaleString("zh-CN")}`
        } 元`
      : "";
  const sectionSummaries = {
    listing: joinSummary([
      selectedServers.length ? `区服 ${selectedServers.length} 个` : "",
      publication === "only"
        ? "只看公示期"
        : publication === "exclude"
          ? "不看公示期"
          : "",
      platforms.length ? `平台 ${platforms.join("/")}` : "",
      budgetSummary,
    ]),
    heroes: joinSummary([
      dexRequirements.length
        ? `图鉴 ${dexRequirementOptions
            .filter(({ value }) => dexRequirements.includes(value))
            .map(({ label }) => label.replace(" 全图鉴", ""))
            .join("/")}`
        : "",
      ...summarizeNumberFields([sixStarHeroCountField, ...accountNumberFields]),
    ]),
    relics: joinSummary(
      summarizeNumberFields([
        ...relicOverviewFields,
        ...relicHeadFields,
        ...relicTailFields,
      ]),
    ),
    assets: joinSummary([
      ...summarizeNumberFields(assetNumberFields),
      ...assetFlags,
    ]),
    collection: joinSummary([
      ...summarizeNumberFields(skinCountFields),
      ...(badges.length ? [`徽章 ${badges.join("/")}`] : []),
    ]),
    achievements: achievements.length ? `成就 ${achievements.join("/")}` : "",
  };
  const sectionLabel = (title: string, summary: string, fallback: string) => {
    const description = summary || fallback;
    return (
      <div className="account-matcher-collapse-title">
        <div>
          <Text strong>{title}</Text>
          {description && (
            <Tooltip title={description} trigger={["hover", "focus"]}>
              <span
                className="account-matcher-collapse-summary"
                tabIndex={0}
                aria-label={`${title}摘要：${description}`}
              >
                {description}
              </span>
            </Tooltip>
          )}
        </div>
      </div>
    );
  };

  const collapseItems = [
    {
      key: "listing",
      label: sectionLabel(
        "商品条件",
        sectionSummaries.listing,
        "区服、公示状态、平台与预算",
      ),
      children: (
        <Row className="account-matcher-listing-grid" gutter={[16, 16]}>
          <Col xs={24} sm={12} xl={6}>
            <span className="account-matcher-label">区服</span>
            <Button
              id="match-server"
              className="account-matcher-server-picker-trigger"
              aria-haspopup="dialog"
              onClick={() => {
                setDraftServers(selectedServers);
                setServerPickerOpen(true);
              }}
            >
              <span>
                {selectedServers.length
                  ? `已选 ${selectedServers.length} 个区服`
                  : "不限区服"}
              </span>
              <DownOutlined />
            </Button>
          </Col>
          <Col xs={24} sm={12} xl={8}>
            <span className="account-matcher-label">公示期</span>
            <Radio.Group
              className="account-matcher-publication"
              value={publication}
              onChange={(event) => setPublication(event.target.value)}
              optionType="button"
              buttonStyle="solid"
              options={[
                { label: "不限", value: "any" },
                { label: "只看公示期", value: "only" },
                { label: "不看公示期", value: "exclude" },
              ]}
            />
          </Col>
          <Col xs={24} sm={12} xl={4}>
            <span className="account-matcher-label">操作系统</span>
            <Checkbox.Group
              className="account-matcher-platforms"
              options={["iOS", "Android"]}
              value={platforms}
              onChange={(value) => setPlatforms(value as string[])}
            />
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <span className="account-matcher-label">预算范围（元）</span>
            <Space.Compact className="account-matcher-price-range">
              <InputNumber
                min={0}
                precision={0}
                placeholder="最低价"
                value={minimumPrice}
                onChange={(value) =>
                  updateBudget(
                    value === null ? null : Number(value),
                    maximumPrice,
                  )
                }
                aria-label="最低价格，元"
              />
              <span className="account-matcher-range-separator">至</span>
              <InputNumber
                min={0}
                precision={0}
                placeholder="最高价"
                value={maximumPrice}
                onChange={(value) =>
                  updateBudget(
                    minimumPrice,
                    value === null ? null : Number(value),
                  )
                }
                aria-label="最高价格，元"
              />
            </Space.Compact>
          </Col>
          <Col xs={24}>
            <span className="account-matcher-label">常用价格区间</span>
            <Radio.Group
              className="account-matcher-price-buckets"
              options={priceRanges.map(({ label, value }) => ({
                label,
                value,
              }))}
              value={priceBucket}
              onChange={(event) => {
                const range = priceRanges.find(
                  (option) => option.value === event.target.value,
                );
                if (range) updateBudget(range.minimum, range.maximum);
              }}
            />
          </Col>
        </Row>
      ),
    },
    {
      key: "heroes",
      label: sectionLabel(
        "图鉴与账号",
        sectionSummaries.heroes,
        "图鉴、6 星式神、风姿度与账号等级",
      ),
      children: (
        <div className="account-matcher-panel-content">
          <Row gutter={[12, 8]} align="middle">
            <Col xs={24} lg={18}>
              <div className="account-matcher-filter-block">
                <span className="account-matcher-label">图鉴要求</span>
                <Checkbox.Group
                  options={dexRequirementOptions}
                  value={dexRequirements}
                  onChange={(value) => setDexRequirements(value as string[])}
                />
              </div>
            </Col>
            <Col xs={24} lg={6}>
              <div className="account-matcher-inline-number">
                <label
                  className="account-matcher-label"
                  htmlFor="filter-minimumSixStarHeroCount"
                >
                  {sixStarHeroCountField.label}
                </label>
                <InputNumber
                  id="filter-minimumSixStarHeroCount"
                  className="account-matcher-number account-matcher-number--compact"
                  min={0}
                  max={sixStarHeroCountField.max}
                  precision={sixStarHeroCountField.precision}
                  placeholder="不限"
                  value={numberFilters.minimumSixStarHeroCount ?? null}
                  onChange={(value) =>
                    updateNumber(
                      "minimumSixStarHeroCount",
                      value === null ? null : Number(value),
                    )
                  }
                />
              </div>
            </Col>
          </Row>
          {renderNumberFields(accountNumberFields, "three")}
        </div>
      ),
    },
    {
      key: "relics",
      label: sectionLabel(
        "御魂速度",
        sectionSummaries.relics,
        "满速、一速以及头尾属性",
      ),
      children: (
        <div className="account-matcher-relic-layout">
          <section className="account-matcher-relic-group">
            <Text strong>整体速度</Text>
            {renderNumberFields(relicOverviewFields, "three")}
          </section>
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <section className="account-matcher-relic-group">
                <Text strong>头部</Text>
                {renderNumberFields(relicHeadFields, "two")}
              </section>
            </Col>
            <Col xs={24} lg={12}>
              <section className="account-matcher-relic-group">
                <Text strong>尾部</Text>
                {renderNumberFields(relicTailFields, "two")}
              </section>
            </Col>
          </Row>
        </div>
      ),
    },
    {
      key: "assets",
      label: sectionLabel(
        "资产",
        sectionSummaries.assets,
        "资源数量与账号特征",
      ),
      children: (
        <div className="account-matcher-panel-content">
          {renderNumberFields(assetNumberFields)}
          <div className="account-matcher-switch-grid">
            {assetSwitchOptions.map((name) => (
              <div className="account-matcher-inline-control" key={name}>
                <Text>{name}</Text>
                <Switch
                  checked={assetFlags.includes(name)}
                  onChange={(checked) =>
                    setAssetFlags((current) =>
                      checked
                        ? [...current, name]
                        : current.filter((item) => item !== name),
                    )
                  }
                  aria-label={name}
                />
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      key: "collection",
      label: sectionLabel(
        "外观与收藏",
        sectionSummaries.collection,
        "皮肤与徽章",
      ),
      children: (
        <div className="account-matcher-panel-content">
          <div className="account-matcher-subsection">
            <Text strong>皮肤</Text>
            {renderNumberFields(skinCountFields)}
          </div>
          <div className="account-matcher-subsection">
            <Text strong>徽章</Text>
            <Checkbox.Group
              className="account-matcher-option-grid"
              options={badgeOptions}
              value={badges}
              onChange={(value) => setBadges(value as string[])}
            />
          </div>
        </div>
      ),
    },
    {
      key: "achievements",
      label: sectionLabel("成就", sectionSummaries.achievements, "指定成就"),
      children: (
        <div className="account-matcher-panel-content">
          <div className="account-matcher-filter-block">
            <span className="account-matcher-label">指定成就</span>
            <Checkbox.Group
              options={achievementOptions}
              value={achievements}
              onChange={(value) => setAchievements(value as string[])}
            />
          </div>
        </div>
      ),
    },
  ];
  const hasCbgPvePanel = cbgCandidates.some((candidate) =>
    hasPanelData(candidate.details?.pvePanel),
  );
  const hasCbgSpeedPanel = cbgCandidates.some((candidate) =>
    hasPanelData(candidate.details?.speedPanel),
  );
  /**
   * 搜索结果表格的横向滚动宽度，等于各列 width 之和（改了列宽要同步这里）。
   *
   * 这张表必须用固定列宽：详情是逐条读取的，未读到的行只有「读取中」这类短占位文字，
   * 自动布局（tableLayout="auto" + x:"max-content"）会把这些列压成 0 宽，
   * 表现为「区服 / 状态 / 价格」整列消失，直到全部详情读完才恢复正常。
   */
  const cbgTableWidth =
    250 +
    170 +
    110 +
    120 +
    85 +
    110 + // 账号信息
    120 +
    120 +
    80 +
    80 + // 速度属性
    100 +
    110 +
    100 +
    110 +
    110 +
    100 +
    90 +
    90 +
    110 + // 资源
    220 + // 操作
    (hasCbgPvePanel ? 380 : 0) +
    (hasCbgSpeedPanel ? 380 : 0);

  return (
    <main className="account-matcher-page">
      {messageHolder}
      {showTrialNotice && (
        <Alert
          className="account-matcher-trial-notice"
          showIcon
          closable
          onClose={() => persistNoticeDismissal(trialNoticeDismissedKey)}
          afterClose={() => setShowTrialNotice(false)}
          type="warning"
          message="账号匹配处于试运行阶段"
          description="藏宝阁筛选和商品详情读取可能受官方页面或风控规则变化影响，结果与详情可能不完整，请以藏宝阁商品页为准。"
        />
      )}
      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} xl={24}>
          <Card className="account-matcher-card" title="筛选条件">
            {showFilterGuidance && (
              <Alert
                className="account-matcher-filter-guidance"
                showIcon
                closable
                onClose={() =>
                  persistNoticeDismissal(filterGuidanceDismissedKey)
                }
                afterClose={() => setShowFilterGuidance(false)}
                type="info"
                message="请尽量细化筛选条件"
                description="藏宝阁会按条件筛选全部符合项，并分页展示，不会替你精选推荐。条件过少时结果可能很多、不易比较，参考价值也会下降；建议补充区服、图鉴、速度或资源等条件后再搜索。"
              />
            )}
            <Collapse
              className="account-matcher-collapse"
              bordered={false}
              defaultActiveKey={["listing", "heroes"]}
              items={collapseItems}
            />
            <div className="account-matcher-actions">
              <div className="account-matcher-condition-preview">
                <Text type="secondary">留空表示不限。</Text>
              </div>
              <div className="account-matcher-actions-toolbar">
                <Space
                  size="small"
                  wrap={false}
                  className="account-matcher-primary-actions"
                >
                  <Button icon={<DeleteOutlined />} onClick={clearConditions}>
                    清空条件
                  </Button>
                  <Button
                    type="primary"
                    icon={<SearchOutlined />}
                    title="打开藏宝阁筛选结果页并匹配本机历史账号"
                    loading={applyingCbgSearch}
                    disabled={backgroundStatus.running}
                    onClick={runSearch}
                  >
                    开始搜索
                  </Button>
                </Space>
              </div>
              <Collapse
                className="account-matcher-background-search-collapse"
                bordered={false}
                activeKey={
                  backgroundSearchExpanded ? ["background-search"] : []
                }
                onChange={(keys) =>
                  setBackgroundSearchExpanded(
                    Array.isArray(keys)
                      ? keys.includes("background-search")
                      : keys === "background-search",
                  )
                }
                items={[
                  {
                    key: "background-search",
                    label: (
                      <div className="account-matcher-background-search-heading">
                        <Text strong>后台搜索</Text>
                        <Text type="secondary">
                          每 {backgroundInterval} 分钟
                        </Text>
                        {backgroundStatus.running && (
                          <Tooltip
                            title={
                              backgroundStatus.error ??
                              `下次搜索：${
                                backgroundStatus.nextRunAt
                                  ? new Date(
                                      backgroundStatus.nextRunAt,
                                    ).toLocaleTimeString("zh-CN", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "安排中"
                              }；本轮找到 ${backgroundStatus.lastFoundCount} 条，新增 ${backgroundStatus.newFoundCount} 条`
                            }
                          >
                            <Tag
                              className="account-matcher-background-search-status"
                              color={
                                backgroundStatus.error
                                  ? "error"
                                  : backgroundStatus.searching
                                    ? "processing"
                                    : "success"
                              }
                            >
                              {backgroundStatus.error
                                ? "搜索异常"
                                : backgroundStatus.searching
                                  ? "搜索中"
                                  : "运行中"}
                            </Tag>
                          </Tooltip>
                        )}
                      </div>
                    ),
                    children: (
                      <Space
                        size={8}
                        wrap
                        className="account-matcher-background-search-controls"
                      >
                        <Button
                          size="small"
                          icon={<HistoryOutlined />}
                          onClick={() => {
                            setBackgroundUsageHistory(
                              getBackgroundSearchUsageHistory(),
                            );
                            setBackgroundHistoryOpen(true);
                          }}
                        >
                          使用记录（{backgroundUsageHistory.length}）
                        </Button>
                        <InputNumber
                          aria-label="后台搜索间隔（分钟）"
                          min={5}
                          max={1440}
                          precision={0}
                          value={backgroundInterval}
                          disabled={backgroundStatus.running}
                          onChange={(value) => {
                            if (value === null) return;
                            setBackgroundInterval(value);
                            if (
                              Number.isInteger(value) &&
                              value >= 5 &&
                              value <= 1440
                            ) {
                              setBackgroundSearchInterval(value);
                            }
                          }}
                        />
                        <Text type="secondary">分钟</Text>
                        <Tooltip title="开启后立即按当前筛选条件搜索，之后按设定间隔重复；切换应用页面时继续运行。发现符合条件的新商品会发送 Windows 通知。使用记录保留近三个月，包含启动、每轮搜索结果、停止或失败信息。再次点击可停止，关闭程序后会停止。运行中使用启动时的条件，修改条件后需停止并重新开启。">
                          <Button
                            type="text"
                            size="small"
                            aria-label="后台搜索说明"
                            icon={<QuestionCircleOutlined />}
                          />
                        </Tooltip>
                        <Button
                          danger={backgroundStatus.running}
                          icon={
                            backgroundStatus.running ? (
                              <StopOutlined />
                            ) : (
                              <SearchOutlined />
                            )
                          }
                          disabled={
                            !backgroundStatus.running &&
                            (applyingCbgSearch ||
                              loadingCbgNext ||
                              activeCbgSearchTasks > 0)
                          }
                          onClick={toggleBackgroundSearch}
                        >
                          {backgroundStatus.running
                            ? "停止后台搜索"
                            : "开启后台搜索"}
                        </Button>
                      </Space>
                    ),
                  },
                ]}
              />
            </div>
            {cbgSearchNotice && (
              <Alert
                showIcon
                type={cbgSearchNotice.type}
                message={cbgSearchNotice.message}
              />
            )}
          </Card>
        </Col>

        {hasSearched && (
          <Col xs={24}>
            <Card
              className="account-matcher-results account-matcher-cbg-results"
              title="藏宝阁搜索结果"
              extra={
                <Text type="secondary">
                  {cbgResultsState === "loading"
                    ? "读取中"
                    : cbgSearchedAt !== null
                      ? `${cbgCandidates.length} 条商品 · 已保存 ${formatCbgSearchTime(cbgSearchedAt)} · 点击行展开详情`
                      : ""}
                </Text>
              }
            >
              {cbgResultsState === "loading" ? (
                <div className="account-matcher-results-loading" role="status">
                  正在读取藏宝阁商品…
                </div>
              ) : cbgResultsState === "ready" ? (
                <>
                  <Table<CbgRoleCandidate>
                    className="account-matcher-table"
                    rowKey="url"
                    size="small"
                    tableLayout="fixed"
                    pagination={{ pageSize: 10, showSizeChanger: false }}
                    scroll={{ x: cbgTableWidth }}
                    dataSource={cbgCandidates}
                    columns={[
                      {
                        title: "账号信息",
                        children: [
                          {
                            title: "账号",
                            key: "name",
                            width: 250,
                            render: (_, candidate) => {
                              const account = candidate.details?.account;
                              const value =
                                account?.name ||
                                account?.title ||
                                candidate.summary ||
                                cbgCandidateStatus(candidate);
                              return (
                                <Text
                                  title={candidate.summary || candidate.url}
                                >
                                  {value}
                                </Text>
                              );
                            },
                          },
                          {
                            title: "区服",
                            key: "server",
                            width: 170,
                            render: (_, candidate) =>
                              candidate.details?.account.serverName ||
                              cbgCandidateStatus(candidate),
                          },
                          {
                            title: "状态",
                            key: "listing-status",
                            width: 110,
                            render: (_, candidate) =>
                              candidate.details
                                ? candidate.details.account.listingStatus ||
                                  "未知"
                                : cbgCandidateStatus(candidate),
                          },
                          {
                            title: "价格",
                            key: "price",
                            width: 120,
                            render: (_, candidate) =>
                              renderCbgMetric(
                                candidate,
                                candidate.details?.account.price,
                                (value) =>
                                  value === undefined
                                    ? "未知"
                                    : "¥" + value.toLocaleString("zh-CN"),
                              ),
                          },
                          {
                            title: "等级",
                            key: "level",
                            width: 85,
                            render: (_, candidate) =>
                              renderCbgMetric(
                                candidate,
                                candidate.details?.account.level,
                                (value) =>
                                  value === undefined ? "未知" : value + " 级",
                              ),
                          },
                          {
                            title: "风姿度",
                            key: "fengzidu",
                            width: 110,
                            render: (_, candidate) =>
                              renderCbgMetric(
                                candidate,
                                candidate.details?.account.fengzidu,
                              ),
                          },
                        ],
                      },
                      {
                        title: "速度属性",
                        children: [
                          {
                            title: "散件一速",
                            key: "scattered-speed",
                            width: 120,
                            render: (_, candidate) =>
                              renderCbgMetric(
                                candidate,
                                candidate.details?.account.scatteredFirstSpeed,
                                (value) =>
                                  value === undefined ? "—" : value.toFixed(2),
                              ),
                          },
                          {
                            title: "招财一速",
                            key: "lucky-speed",
                            width: 120,
                            render: (_, candidate) =>
                              renderCbgMetric(
                                candidate,
                                candidate.details?.account.luckyFirstSpeed,
                                (value) =>
                                  value === undefined ? "—" : value.toFixed(2),
                              ),
                          },
                          {
                            title: "头数",
                            key: "speed-head-count",
                            width: 80,
                            render: (_, candidate) =>
                              renderCbgMetric(
                                candidate,
                                candidate.details?.account.speedHeadCount,
                              ),
                          },
                          {
                            title: "尾数",
                            key: "speed-tail-count",
                            width: 80,
                            render: (_, candidate) =>
                              renderCbgMetric(
                                candidate,
                                candidate.details?.account.speedTailCount,
                              ),
                          },
                        ],
                      },
                      {
                        title: "资源",
                        children: [
                          {
                            title: "体力",
                            key: "stamina",
                            width: 100,
                            render: (_, candidate) =>
                              renderCbgMetric(
                                candidate,
                                candidate.details?.account.stamina,
                              ),
                          },
                          {
                            title: "金币",
                            key: "money",
                            width: 110,
                            render: (_, candidate) =>
                              renderCbgMetric(
                                candidate,
                                candidate.details?.account.money,
                              ),
                          },
                          {
                            title: "勾玉",
                            key: "soul-jade",
                            width: 100,
                            render: (_, candidate) =>
                              renderCbgMetric(
                                candidate,
                                candidate.details?.account.soulJade,
                              ),
                          },
                          {
                            title: "神秘符咒",
                            key: "mystery-talisman",
                            width: 110,
                            render: (_, candidate) =>
                              renderCbgMetric(
                                candidate,
                                candidate.details?.account.mysteryTalisman,
                              ),
                          },
                          {
                            title: "现世符咒",
                            key: "reality-talisman",
                            width: 110,
                            render: (_, candidate) =>
                              renderCbgMetric(
                                candidate,
                                candidate.details?.account.realityTalisman,
                              ),
                          },
                          {
                            title: "抽卡数",
                            key: "summon-power",
                            width: 100,
                            render: (_, candidate) =>
                              renderCbgMetric(
                                candidate,
                                candidate.details?.account.summonPower,
                              ),
                          },
                          {
                            title: "达摩",
                            key: "yuxing-dama",
                            width: 90,
                            render: (_, candidate) =>
                              renderCbgMetric(
                                candidate,
                                candidate.details?.account.yuxingDama,
                              ),
                          },
                          {
                            title: "御魂数",
                            key: "relic-count",
                            width: 90,
                            render: (_, candidate) =>
                              renderCbgMetric(
                                candidate,
                                candidate.details?.relicCount,
                              ),
                          },
                          {
                            title: "满级御魂",
                            key: "max-level-relic-count",
                            width: 110,
                            render: (_, candidate) =>
                              renderCbgMetric(
                                candidate,
                                candidate.details?.account.maxLevelRelicCount,
                              ),
                          },
                        ],
                      },
                      ...(hasCbgPvePanel || hasCbgSpeedPanel
                        ? [
                            {
                              title: "御魂面板",
                              children: [
                                ...(hasCbgPvePanel
                                  ? [
                                      {
                                        title: "PVE 面板",
                                        key: "pve-panel",
                                        width: 380,
                                        render: (
                                          _: unknown,
                                          candidate: CbgRoleCandidate,
                                        ) =>
                                          renderCbgPanel(
                                            candidate,
                                            candidate.details?.pvePanel,
                                          ),
                                      },
                                    ]
                                  : []),
                                ...(hasCbgSpeedPanel
                                  ? [
                                      {
                                        title: "速度面板",
                                        key: "speed-panel",
                                        width: 380,
                                        render: (
                                          _: unknown,
                                          candidate: CbgRoleCandidate,
                                        ) =>
                                          renderCbgPanel(
                                            candidate,
                                            candidate.details?.speedPanel,
                                          ),
                                      },
                                    ]
                                  : []),
                              ],
                            },
                          ]
                        : []),
                      {
                        title: "操作",
                        key: "actions",
                        width: 220,
                        fixed: "right",
                        render: (_, candidate) => (
                          <Space size={4} wrap={false}>
                            <Button
                              type="link"
                              size="small"
                              icon={<LinkOutlined />}
                              title="在默认浏览器打开藏宝阁商品页"
                              onClick={(event) => {
                                event.stopPropagation();
                                openProductLink(candidate.url);
                              }}
                            >
                              打开商品页
                            </Button>
                            <Button
                              type="link"
                              size="small"
                              icon={<SearchOutlined />}
                              title="进入首页并查询该账号数据"
                              onClick={(event) => {
                                event.stopPropagation();
                                queryAccountInHome(candidate.url);
                              }}
                            >
                              首页查询
                            </Button>
                          </Space>
                        ),
                      },
                    ]}
                    expandable={{
                      expandRowByClick: true,
                      expandedRowKeys: expandedCbgRows,
                      onExpand: (expanded, candidate) =>
                        setExpandedCbgRows((current) =>
                          expanded
                            ? [...current, candidate.url]
                            : current.filter((url) => url !== candidate.url),
                        ),
                      expandedRowRender: (candidate) =>
                        renderAccountDetailSections({
                          account: candidate.details?.account,
                          relicCount: candidate.details?.relicCount,
                          pvePanel: candidate.details?.pvePanel,
                          speedPanel: candidate.details?.speedPanel,
                          note:
                            candidate.detailError ||
                            candidate.summary ||
                            candidate.url,
                        }),
                    }}
                  />
                  {cbgHasNext && (
                    <div className="account-matcher-cbg-results-pagination">
                      <Button
                        loading={loadingCbgNext}
                        disabled={backgroundStatus.running}
                        onClick={loadNextCbgResultsPage}
                      >
                        加载下一页
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    cbgResultsState === "empty"
                      ? "藏宝阁当前没有符合条件的商品"
                      : "藏宝阁结果暂不可用，请查看上方提示"
                  }
                />
              )}
            </Card>
          </Col>
        )}

        <Col xs={24}>
          <Card
            className="account-matcher-results"
            title="本机匹配结果"
            extra={
              <Space size={8}>
                <Text type="secondary">
                  {hasSearched
                    ? localMatchPending
                      ? `正在分批匹配 ${history.length} 条本机历史…`
                      : localMatchError
                        ? "本机历史匹配失败"
                        : `已检查 ${history.length} 条本机历史`
                    : `${history.length} 条本地历史`}
                </Text>
                <Text type="secondary">
                  本地记录保留近三个月 · 点击行展开详情
                </Text>
              </Space>
            }
          >
            {!cacheReady ? (
              <div className="account-matcher-results-loading" role="status">
                正在读取本机账号历史…
              </div>
            ) : !hasSearched ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  history.length
                    ? "点击“开始搜索”后按当前条件筛选本机历史；藏宝阁实时商品列表显示在藏宝阁窗口"
                    : "本机还没有账号历史；藏宝阁实时商品列表显示在藏宝阁窗口"
                }
              />
            ) : history.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="本机还没有账号历史；请先读取并保存账号，藏宝阁实时商品列表请在藏宝阁窗口查看"
              />
            ) : localMatchPending ? (
              <div className="account-matcher-results-loading" role="status">
                正在分批匹配本机账号历史，其他页面仍可继续操作…
              </div>
            ) : localMatchError ? (
              <Alert showIcon type="error" message={localMatchError} />
            ) : results.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={`检查了 ${history.length} 条本机历史，没有账号符合当前条件；藏宝阁实时商品列表请在藏宝阁窗口查看`}
              />
            ) : (
              <Table
                className="account-matcher-table"
                rowKey={(result) => result.record.id}
                size="small"
                tableLayout="auto"
                pagination={{
                  current: localResultPage,
                  pageSize: 10,
                  showSizeChanger: false,
                  onChange: (page) => {
                    setLocalResultPage(page);
                    setExpandedLocalRows([]);
                  },
                }}
                scroll={{ x: "max-content" }}
                dataSource={results}
                columns={[
                  {
                    title: "账号信息",
                    children: [
                      {
                        title: "账号",
                        key: "account-name",
                        width: 250,
                        render: (_, result) => (
                          <Text>{result.record.accountName}</Text>
                        ),
                      },
                      {
                        title: "区服",
                        key: "server",
                        width: 170,
                        render: (_, result) => (
                          <Text>{result.record.serverName}</Text>
                        ),
                      },
                      {
                        title: "状态",
                        key: "listing-status",
                        width: 110,
                        render: (_, result) => (
                          <Text>
                            {result.record.dataset.account?.listingStatus ||
                              "状态未知"}
                          </Text>
                        ),
                      },
                      {
                        title: "价格",
                        key: "price",
                        width: 120,
                        render: (_, result) => {
                          const price = result.record.dataset.account?.price;
                          return (
                            <Text>
                              {price === undefined
                                ? "未知"
                                : "¥" + price.toLocaleString("zh-CN")}
                            </Text>
                          );
                        },
                      },
                      {
                        title: "等级",
                        key: "level",
                        width: 85,
                        render: (_, result) => {
                          const level = result.record.dataset.account?.level;
                          return <Text>{level ? level + " 级" : "未知"}</Text>;
                        },
                      },
                      {
                        title: "风姿度",
                        key: "fengzidu",
                        width: 110,
                        render: (_, result) => (
                          <Text>
                            {formatAccountCount(
                              result.record.dataset.account?.fengzidu,
                            )}
                          </Text>
                        ),
                      },
                    ],
                  },
                  {
                    title: "速度属性",
                    children: [
                      {
                        title: "散件一速",
                        key: "scattered-speed",
                        width: 120,
                        render: (_, result) => {
                          const value =
                            result.record.dataset.account?.scatteredFirstSpeed;
                          return (
                            <Text>
                              {value === undefined ? "—" : value.toFixed(2)}
                            </Text>
                          );
                        },
                      },
                      {
                        title: "招财一速",
                        key: "lucky-speed",
                        width: 120,
                        render: (_, result) => {
                          const value =
                            result.record.dataset.account?.luckyFirstSpeed;
                          return (
                            <Text>
                              {value === undefined ? "—" : value.toFixed(2)}
                            </Text>
                          );
                        },
                      },
                      {
                        title: "头数",
                        key: "speed-head-count",
                        width: 80,
                        render: (_, result) => (
                          <Text>
                            {formatAccountCount(
                              result.record.dataset.account?.speedHeadCount,
                            )}
                          </Text>
                        ),
                      },
                      {
                        title: "尾数",
                        key: "speed-tail-count",
                        width: 80,
                        render: (_, result) => (
                          <Text>
                            {formatAccountCount(
                              result.record.dataset.account?.speedTailCount,
                            )}
                          </Text>
                        ),
                      },
                    ],
                  },
                  {
                    title: "资源",
                    children: [
                      {
                        title: "体力",
                        key: "stamina",
                        width: 100,
                        render: (_, result) => (
                          <Text>
                            {formatAccountCount(
                              result.record.dataset.account?.stamina,
                            )}
                          </Text>
                        ),
                      },
                      {
                        title: "金币",
                        key: "money",
                        width: 110,
                        render: (_, result) => (
                          <Text>
                            {formatAccountCount(
                              result.record.dataset.account?.money,
                            )}
                          </Text>
                        ),
                      },
                      {
                        title: "勾玉",
                        key: "soul-jade",
                        width: 100,
                        render: (_, result) => (
                          <Text>
                            {formatAccountCount(
                              result.record.dataset.account?.soulJade,
                            )}
                          </Text>
                        ),
                      },
                      {
                        title: "神秘符咒",
                        key: "mystery-talisman",
                        width: 110,
                        render: (_, result) => (
                          <Text>
                            {formatAccountCount(
                              result.record.dataset.account?.mysteryTalisman,
                            )}
                          </Text>
                        ),
                      },
                      {
                        title: "现世符咒",
                        key: "reality-talisman",
                        width: 110,
                        render: (_, result) => (
                          <Text>
                            {formatAccountCount(
                              result.record.dataset.account?.realityTalisman,
                            )}
                          </Text>
                        ),
                      },
                      {
                        title: "抽卡数",
                        key: "summon-power",
                        width: 100,
                        render: (_, result) => (
                          <Text>
                            {formatAccountCount(
                              result.record.dataset.account?.summonPower,
                            )}
                          </Text>
                        ),
                      },
                      {
                        title: "达摩",
                        key: "yuxing-dama",
                        width: 90,
                        render: (_, result) => (
                          <Text>
                            {formatAccountCount(
                              result.record.dataset.account?.yuxingDama,
                            )}
                          </Text>
                        ),
                      },
                      {
                        title: "御魂数",
                        key: "relic-count",
                        width: 90,
                        render: (_, result) => (
                          <Text>
                            {formatAccountCount(result.record.relicCount)}
                          </Text>
                        ),
                      },
                      {
                        title: "满级御魂",
                        key: "max-level-relic-count",
                        width: 110,
                        render: (_, result) => (
                          <Text>
                            {formatAccountCount(
                              result.record.dataset.account?.maxLevelRelicCount,
                            )}
                          </Text>
                        ),
                      },
                    ],
                  },
                  {
                    title: "操作",
                    key: "actions",
                    width: 220,
                    fixed: "right",
                    render: (_, result) => (
                      <Space size={4} wrap={false}>
                        <Button
                          type="link"
                          size="small"
                          icon={<LinkOutlined />}
                          title="在默认浏览器打开藏宝阁商品页"
                          onClick={(event) => {
                            event.stopPropagation();
                            openProductLink(result.record.productUrl);
                          }}
                        >
                          打开商品页
                        </Button>
                        <Button
                          type="link"
                          size="small"
                          icon={<SearchOutlined />}
                          title="进入首页并查询该账号数据"
                          onClick={(event) => {
                            event.stopPropagation();
                            querySavedAccountInHome(result.record.id);
                          }}
                        >
                          首页查询
                        </Button>
                      </Space>
                    ),
                  },
                ]}
                expandable={{
                  expandRowByClick: true,
                  expandedRowKeys: expandedLocalRows,
                  onExpand: (expanded, result) =>
                    setExpandedLocalRows((current) =>
                      expanded
                        ? [...current, result.record.id]
                        : current.filter((id) => id !== result.record.id),
                    ),
                  expandedRowRender: (result) =>
                    renderAccountDetailSections({
                      account: result.record.dataset.account,
                      relicCount: result.record.relicCount,
                      note:
                        "本机历史 · 保存于 " +
                        formatCbgSearchTime(result.record.savedAt),
                    }),
                }}
              />
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        title={`后台搜索使用记录（${backgroundUsageHistory.length}）`}
        open={backgroundHistoryOpen}
        width="min(960px, calc(100vw - 32px))"
        onCancel={() => setBackgroundHistoryOpen(false)}
        footer={
          <Button onClick={() => setBackgroundHistoryOpen(false)}>关闭</Button>
        }
      >
        <Table
          className="account-matcher-table"
          rowKey="id"
          size="small"
          tableLayout="fixed"
          scroll={{ x: 900, y: 440 }}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          dataSource={backgroundUsageHistory}
          locale={{ emptyText: "还没有后台搜索使用记录" }}
          columns={[
            {
              title: "时间",
              dataIndex: "occurredAt",
              width: 180,
              render: (value: number) =>
                new Date(value).toLocaleString("zh-CN"),
            },
            {
              title: "事件",
              dataIndex: "event",
              width: 120,
              render: (event: string) =>
                ({
                  start: "启动后台搜索",
                  start_error: "启动失败",
                  cycle: "执行一轮",
                  stop: "停止后台搜索",
                })[event] || event,
            },
            {
              title: "结果 / 说明",
              key: "result",
              ellipsis: true,
              render: (_, record) => {
                if (record.message) {
                  return (
                    <Tooltip title={record.message}>
                      <Text type="danger">{record.message}</Text>
                    </Tooltip>
                  );
                }
                if (record.event === "cycle") {
                  return record.outcome === "stopped"
                    ? "本轮中断"
                    : record.outcome === "success"
                      ? "搜索完成"
                      : "搜索失败";
                }
                return record.event === "start" ? "立即执行首轮搜索" : "已停止";
              },
            },
            {
              title: "找到 / 新增",
              key: "counts",
              width: 120,
              render: (_, record) =>
                record.event === "cycle" && record.foundCount !== undefined
                  ? `${record.foundCount} / ${record.newFoundCount ?? 0}`
                  : "—",
            },
            {
              title: "耗时",
              dataIndex: "durationMs",
              width: 100,
              render: (value?: number) =>
                value === undefined
                  ? "—"
                  : value < 1000
                    ? `${value} 毫秒`
                    : `${(value / 1000).toFixed(1)} 秒`,
            },
            {
              title: "间隔",
              dataIndex: "intervalMinutes",
              width: 90,
              render: (value: number) => `${value} 分钟`,
            },
          ]}
        />
      </Modal>

      <Modal
        title="区服选择"
        open={serverPickerOpen}
        width={760}
        onCancel={() => setServerPickerOpen(false)}
        footer={
          <div className="account-matcher-server-picker-footer">
            <Button onClick={() => setDraftServers([])}>重置</Button>
            <Space>
              <Button onClick={() => setServerPickerOpen(false)}>取消</Button>
              <Button
                type="primary"
                onClick={() => {
                  setSelectedServers(draftServers);
                  setServerPickerOpen(false);
                }}
              >
                完成
              </Button>
            </Space>
          </div>
        }
      >
        <div className="account-matcher-server-picker">
          <nav
            className="account-matcher-server-groups"
            aria-label="区服平台分组"
          >
            {serverOptions.map((group) => (
              <Button
                key={group.label}
                type={activeServerGroup === group.label ? "primary" : "text"}
                className="account-matcher-server-group"
                onClick={() => setActiveServerGroup(group.label)}
              >
                {group.label}
              </Button>
            ))}
          </nav>
          <section className="account-matcher-server-options">
            <Checkbox
              checked={allCurrentServersSelected}
              indeterminate={
                someCurrentServersSelected && !allCurrentServersSelected
              }
              onChange={(event) =>
                toggleCurrentServerGroup(event.target.checked)
              }
            >
              全选
            </Checkbox>
            <Checkbox.Group
              className="account-matcher-server-options-list"
              options={currentServerGroup.options}
              value={draftServers}
              onChange={(values) =>
                setDraftServers((current) => [
                  ...current.filter(
                    (value) => !currentServerValues.includes(value),
                  ),
                  ...(values as string[]),
                ])
              }
            />
          </section>
        </div>
      </Modal>
    </main>
  );
}
