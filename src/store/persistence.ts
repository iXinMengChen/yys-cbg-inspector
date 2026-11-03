import type {
  AccountOverview,
  CbgChannel,
  HeroView,
  RelicDataset,
  RelicView,
} from "../types";

const databaseName = "yys-cbg-inspector-cache";
const databaseVersion = 2;
const snapshotStoreName = "snapshots";
const historyStoreName = "history";
const snapshotKey = "recent-dataset";
export const ACCOUNT_DATA_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const legacyDatasetKey = "yys-cbg-inspector.recent-dataset.v1";
const legacyProductUrlKey = "yys-cbg-inspector.recent-product-url.v1";

export type RecentDatasetSnapshot = {
  dataset: RelicDataset;
  productUrl: string;
  savedAt: number;
};

export type DatasetHistoryRecord = RecentDatasetSnapshot & {
  id: string;
  accountName: string;
  serverName: string;
  relicCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown) {
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function channelValue(value: unknown): CbgChannel | undefined {
  return value === "official" ||
    value === "huawei" ||
    value === "oppo" ||
    value === "vivo" ||
    value === "xiaomi"
    ? value
    : undefined;
}

function normalizeDexCount(value: unknown) {
  if (!isRecord(value)) return null;
  const owned = numberValue(value.owned);
  const total = numberValue(value.total);
  return owned === undefined || total === undefined ? null : { owned, total };
}

function normalizeAccount(value: unknown): AccountOverview | undefined {
  if (!isRecord(value)) return undefined;
  const dex = isRecord(value.shikigamiDex) ? value.shikigamiDex : undefined;
  const ssr = normalizeDexCount(dex?.ssr);
  const sp = normalizeDexCount(dex?.sp);
  const ur = normalizeDexCount(dex?.ur);
  const uncollected500Days = numberValue(dex?.uncollected500Days);
  const uncollected999Days = numberValue(dex?.uncollected999Days);
  const uncollectedCoupon = numberValue(dex?.uncollectedCoupon);

  return {
    title: textValue(value.title),
    name: textValue(value.name),
    sourceUrl: textValue(value.sourceUrl),
    channel: channelValue(value.channel),
    serverName: textValue(value.serverName),
    level: numberValue(value.level),
    fengzidu: numberValue(value.fengzidu),
    pvpScore: numberValue(value.pvpScore),
    pvpStage: textValue(value.pvpStage) ?? numberValue(value.pvpStage),
    scatteredFirstSpeed: numberValue(value.scatteredFirstSpeed),
    luckyFirstSpeed: numberValue(value.luckyFirstSpeed),
    speedHeadCount: numberValue(value.speedHeadCount),
    speedTailCount: numberValue(value.speedTailCount),
    relicSummary: numberValue(value.relicSummary),
    heroSummary: numberValue(value.heroSummary),
    collectionSkinCount: numberValue(value.collectionSkinCount),
    yuxingDama: numberValue(value.yuxingDama),
    price: numberValue(value.price),
    money: numberValue(value.money),
    stamina: numberValue(value.stamina),
    maxLevelRelicCount: numberValue(value.maxLevelRelicCount),
    soulJade: numberValue(value.soulJade),
    mysteryTalisman: numberValue(value.mysteryTalisman),
    realityTalisman: numberValue(value.realityTalisman),
    summonPower: numberValue(value.summonPower),
    ...(ssr && sp && ur && uncollectedCoupon !== undefined
      ? {
          shikigamiDex: {
            ssr,
            sp,
            ur,
            uncollected500Days: uncollected500Days ?? null,
            uncollected999Days: uncollected999Days ?? null,
            uncollectedCoupon,
          },
        }
      : {}),
  };
}

function normalizeHeroes(value: unknown): HeroView[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const heroes = value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const skillLevels = Array.isArray(item.skillLevels)
      ? item.skillLevels
          .map((level) => Number(level) || 0)
          .filter((level) => level > 0)
          .slice(0, 3)
      : [];
    const heroId = Number(item.heroId) || 0;
    if (!heroId || !skillLevels.length) return [];
    return [
      {
        instanceId: textValue(item.instanceId) || String(heroId),
        heroId,
        name: textValue(item.name) || "未知式神",
        rarity: numberValue(item.rarity) || 0,
        level:
          numberValue(item.level) ??
          numberValue(item.lv) ??
          numberValue(item.heroLevel) ??
          numberValue(item.hero_level) ??
          0,
        skillLevels,
      },
    ];
  });
  return heroes.length ? heroes : undefined;
}

// 旧版本的本地数据可能不完整，恢复前先收敛为页面可安全使用的结构。
function normalizeDataset(
  value: unknown,
  includeRelics = true,
): RelicDataset | null {
  if (!isRecord(value) || !isRecord(value.relicsByPosition)) return null;

  const relicsByPosition = includeRelics
    ? Object.fromEntries(
        Object.entries(value.relicsByPosition).flatMap(([position, relics]) =>
          Array.isArray(relics)
            ? [[position, relics.filter(isRecord) as RelicView[]]]
            : [],
        ),
      )
    : {};
  const account = normalizeAccount(value.account);
  const heroes = normalizeHeroes(value.heroes);
  const {
    account: _cachedAccount,
    relicsByPosition: _cachedRelicsByPosition,
    ...otherFields
  } = value;

  return {
    ...otherFields,
    ...(account ? { account } : {}),
    ...(heroes ? { heroes } : {}),
    relicsByPosition,
  };
}

function historyId(productUrl: string) {
  const normalizedUrl = productUrl.trim();
  const match = normalizedUrl.match(/\/equip\/([^/?#]+)\/([^/?#]+)/i);
  // 同一商品的推广参数会变化，历史记录只按区服和订单号判重。
  return match
    ? `equip:${match[1]}:${match[2]}`
    : normalizedUrl.replace(/[?#].*$/, "");
}

function createHistoryRecord(
  dataset: RelicDataset,
  productUrl: string,
  savedAt: number,
): DatasetHistoryRecord {
  const canonicalUrl = productUrl.trim() || dataset.account?.sourceUrl || "";
  const relicCount = Object.values(dataset.relicsByPosition).reduce(
    (total, relics) => total + relics.length,
    0,
  );

  return {
    id: historyId(canonicalUrl),
    dataset,
    productUrl: canonicalUrl,
    savedAt,
    accountName:
      dataset.account?.name || dataset.account?.title || "未命名账号",
    serverName: dataset.account?.serverName || "未知服务器",
    relicCount,
  };
}

function isPastAccountDataRetention(savedAt: number, now = Date.now()) {
  return savedAt <= 0 || now - savedAt > ACCOUNT_DATA_RETENTION_MS;
}

function openCacheDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(snapshotStoreName)) {
        request.result.createObjectStore(snapshotStoreName);
      }
      if (!request.result.objectStoreNames.contains(historyStoreName)) {
        request.result.createObjectStore(historyStoreName, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    // 旧标签页仍占用低版本数据库时，不能阻塞整个应用启动。
    request.onblocked = () => reject(new Error("本地缓存数据库正在被占用"));
  });
}

function readLegacySnapshot(): RecentDatasetSnapshot | null {
  try {
    const rawDataset = window.localStorage.getItem(legacyDatasetKey);
    if (!rawDataset) return null;
    const dataset = normalizeDataset(JSON.parse(rawDataset));
    if (!dataset) return null;
    return {
      dataset,
      productUrl:
        dataset.account?.sourceUrl ||
        window.localStorage.getItem(legacyProductUrlKey) ||
        "",
      savedAt: 0,
    };
  } catch {
    return null;
  }
}

function asSnapshot(
  value: unknown,
  includeRelics = true,
): RecentDatasetSnapshot | null {
  if (!isRecord(value)) return null;
  const dataset = normalizeDataset(value.dataset, includeRelics);
  if (!dataset) return null;
  return {
    dataset,
    productUrl: typeof value.productUrl === "string" ? value.productUrl : "",
    savedAt: Number(value.savedAt) || 0,
  };
}

function asHistoryRecord(
  value: unknown,
  includeRelics = true,
): DatasetHistoryRecord | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  const snapshot = asSnapshot(value, includeRelics);
  if (!snapshot) return null;
  return {
    ...snapshot,
    id: value.id,
    accountName:
      typeof value.accountName === "string"
        ? value.accountName
        : snapshot.dataset.account?.name || "未命名账号",
    serverName:
      typeof value.serverName === "string"
        ? value.serverName
        : snapshot.dataset.account?.serverName || "未知服务器",
    relicCount: Number(value.relicCount) || 0,
  };
}

async function readStoreValue(storeName: string, key: IDBValidKey) {
  const database = await openCacheDatabase();
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const request = database
        .transaction(storeName, "readonly")
        .objectStore(storeName)
        .get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function loadRecentDatasetSnapshot() {
  try {
    const snapshot = asSnapshot(
      await readStoreValue(snapshotStoreName, snapshotKey),
    );
    if (snapshot && isPastAccountDataRetention(snapshot.savedAt)) {
      await clearRecentDatasetSnapshot();
      return null;
    }
    return snapshot;
  } catch {
    return readLegacySnapshot();
  }
}

export async function saveRecentDatasetSnapshotOnly(
  dataset: RelicDataset,
  productUrl: string,
) {
  if (!isRecord(dataset) || !isRecord(dataset.relicsByPosition))
    throw new Error("账号数据格式不完整，无法保存本地快照");

  const snapshot: RecentDatasetSnapshot = {
    dataset,
    productUrl: productUrl.trim() || dataset.account?.sourceUrl || "",
    savedAt: Date.now(),
  };
  const database = await openCacheDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(snapshotStoreName, "readwrite");
      transaction.objectStore(snapshotStoreName).put(snapshot, snapshotKey);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function clearRecentDatasetSnapshot() {
  try {
    const database = await openCacheDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          snapshotStoreName,
          "readwrite",
        );
        transaction.objectStore(snapshotStoreName).delete(snapshotKey);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  } catch {
    // IndexedDB unavailable; still clear the legacy fallback below.
  }

  try {
    window.localStorage.removeItem(legacyDatasetKey);
    window.localStorage.removeItem(legacyProductUrlKey);
  } catch {
    // Ignore storage access failures.
  }
}

/** 让出一次主线程，让加载状态和后续绘制有机会执行。 */
function yieldToMainThread() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

/**
 * 分批读取历史记录。
 *
 * 历史记录里每条都带着整份御魂数据，一次性 getAll 会在主线程上连续反序列化上 GB 的对象，
 * 界面会僵住好几秒。这里先只取主键（几乎不耗时），再逐条 get，每条之间让出主线程：
 * 单条仍需几十到两百毫秒，但不再是一次长冻结，加载状态可以正常转起来。
 */
async function readHistoryRecordsInBatches(
  database: IDBDatabase,
): Promise<unknown[]> {
  const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
    const request = database
      .transaction(historyStoreName, "readonly")
      .objectStore(historyStoreName)
      .getAllKeys();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });

  const records: unknown[] = [];
  for (const key of keys) {
    const value = await new Promise<unknown>((resolve, reject) => {
      const request = database
        .transaction(historyStoreName, "readonly")
        .objectStore(historyStoreName)
        .get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (value !== undefined) records.push(value);
    await yieldToMainThread();
  }
  return records;
}

export async function loadDatasetHistory(): Promise<DatasetHistoryRecord[]> {
  try {
    const database = await openCacheDatabase();
    try {
      const records = await readHistoryRecordsInBatches(database);
      // 过期记录复用本次扫描结果清理：整表读取一次就要几秒，不能再为清理多读一遍。
      const expiredIds = records
        .filter(
          (record): record is Record<string, unknown> =>
            isRecord(record) &&
            typeof record.id === "string" &&
            isPastAccountDataRetention(numberValue(record.savedAt) ?? 0),
        )
        .map((record) => record.id as string);
      await deleteHistoryRecords(database, expiredIds);
      const expiredIdSet = new Set(expiredIds);
      const validRecords = records
        .filter(
          (record) =>
            !isRecord(record) ||
            typeof record.id !== "string" ||
            !expiredIdSet.has(record.id),
        )
        .map((record) => asHistoryRecord(record, false))
        .filter(
          (record): record is DatasetHistoryRecord =>
            Boolean(record) && !isPastAccountDataRetention(record.savedAt),
        )
        .sort((left, right) => right.savedAt - left.savedAt);
      const uniqueRecords = new Map<string, DatasetHistoryRecord>();
      validRecords.forEach((record) => {
        const key = historyId(record.productUrl);
        if (!uniqueRecords.has(key)) uniqueRecords.set(key, record);
      });
      return [...uniqueRecords.values()];
    } finally {
      database.close();
    }
  } catch {
    return [];
  } finally {
  }
}

export async function loadDatasetHistoryRecord(id: string) {
  try {
    const record = asHistoryRecord(await readStoreValue(historyStoreName, id));
    if (record && isPastAccountDataRetention(record.savedAt)) {
      await deleteDatasetHistoryRecord(id);
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

export async function deleteDatasetHistoryRecord(id: string) {
  try {
    const database = await openCacheDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(historyStoreName, "readwrite");
        const request = transaction.objectStore(historyStoreName).delete(id);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  } catch {
    // 删除历史失败不会影响当前正在查看的账号数据。
  }
}

/**
 * 按主键批量删除历史记录。
 *
 * 历史库里每条记录都带整份御魂数据，整表扫描（getAll）要 2.7～5.5 秒并阻塞主线程，
 * 所以清理过期记录必须复用调用方已经读到的那一份数据，不能为了清理再扫一遍。
 */
async function deleteHistoryRecords(
  database: IDBDatabase,
  ids: readonly string[],
) {
  if (!ids.length) return;
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(historyStoreName, "readwrite");
    const store = transaction.objectStore(historyStoreName);
    ids.forEach((id) => store.delete(id));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function saveRecentDatasetSnapshot(
  dataset: RelicDataset,
  productUrl: string,
) {
  if (!isRecord(dataset) || !isRecord(dataset.relicsByPosition))
    throw new Error("账号数据格式不完整，无法保存本地记录");

  const savedAt = Date.now();
  const snapshot: RecentDatasetSnapshot = {
    dataset,
    productUrl: productUrl.trim(),
    savedAt,
  };
  const historyRecord = createHistoryRecord(
    dataset,
    snapshot.productUrl,
    savedAt,
  );
  const database = await openCacheDatabase();
  try {
    // 只写这两条记录，不做任何整表扫描：
    // 历史主键由商品链接推导（createHistoryRecord 里的 historyId），重复保存会覆盖同一条；
    // 过期记录在读取历史列表时顺带清理，避免每次保存都扫一遍上 GB 的历史库。
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        [snapshotStoreName, historyStoreName],
        "readwrite",
      );
      transaction.objectStore(snapshotStoreName).put(snapshot, snapshotKey);
      transaction.objectStore(historyStoreName).put(historyRecord);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    // 列表用的记录不能带整份御魂数据，否则每条 Redux 历史都会长期占几十到上百 MB。
    return {
      ...historyRecord,
      dataset: { ...historyRecord.dataset, relicsByPosition: {} },
    } satisfies DatasetHistoryRecord;
  } finally {
    database.close();
  }
}
