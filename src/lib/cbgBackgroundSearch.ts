import type { AccountMatcherCriteria } from "@/lib/accountMatcher";
import { listen } from "@tauri-apps/api/event";

const INTERVAL_STORAGE_KEY = "yys-cbg-inspector.background-search.interval";
const SEEN_STORAGE_KEY = "yys-cbg-inspector.background-search.seen";
const USAGE_STORAGE_KEY = "yys-cbg-inspector.background-search.usage";
const DEFAULT_INTERVAL_MINUTES = 30;
const MIN_INTERVAL_MINUTES = 5;
const MAX_INTERVAL_MINUTES = 24 * 60;
const MAX_SEEN_CANDIDATES = 2000;
const MAX_USAGE_RECORDS = 2000;
const USAGE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const CBG_HOSTS = new Set(["yys.cbg.163.com", "cbg.163.com"]);

export type BackgroundSearchStatus = {
  running: boolean;
  searching: boolean;
  intervalMinutes: number;
  lastRunAt: number | null;
  nextRunAt: number | null;
  lastFoundCount: number;
  newFoundCount: number;
  error: string | null;
};

type CbgCandidate = { url: string; summary?: string };
export type BackgroundSearchUsageRecord = {
  id: string;
  event: "start" | "start_error" | "cycle" | "stop";
  occurredAt: number;
  intervalMinutes: number;
  outcome?: "success" | "error" | "stopped";
  foundCount?: number;
  newFoundCount?: number;
  durationMs?: number;
  message?: string;
};
type CbgRolePage = Awaited<
  ReturnType<NonNullable<Window["desktop"]>["readCbgRoleResults"]>
>;

function readInterval(): number {
  try {
    const value = Number(window.localStorage.getItem(INTERVAL_STORAGE_KEY));
    return Number.isInteger(value) && value >= MIN_INTERVAL_MINUTES
      ? Math.min(value, MAX_INTERVAL_MINUTES)
      : DEFAULT_INTERVAL_MINUTES;
  } catch {
    return DEFAULT_INTERVAL_MINUTES;
  }
}

function readSeenCandidates(): Set<string> {
  try {
    const saved = JSON.parse(
      window.localStorage.getItem(SEEN_STORAGE_KEY) ?? "[]",
    );
    return new Set(
      Array.isArray(saved)
        ? saved.filter((value): value is string => typeof value === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

const listeners = new Set<(status: BackgroundSearchStatus) => void>();
const usageListeners = new Set<
  (records: BackgroundSearchUsageRecord[]) => void
>();
let seenCandidates = readSeenCandidates();
let status: BackgroundSearchStatus = {
  running: false,
  searching: false,
  intervalMinutes: readInterval(),
  lastRunAt: null,
  nextRunAt: null,
  lastFoundCount: 0,
  newFoundCount: 0,
  error: null,
};
let criteriaSnapshot: AccountMatcherCriteria | null = null;
let taskId = 0;
let startPending = false;
let initialRunPending = false;
let unlistenBackgroundTick: (() => void) | null = null;

function updateStatus(update: Partial<BackgroundSearchStatus>) {
  status = { ...status, ...update };
  listeners.forEach((listener) => listener({ ...status }));
}

function candidateKey(value: string): string | null {
  try {
    const url = new URL(value);
    return CBG_HOSTS.has(url.hostname) &&
      url.protocol === "https:" &&
      /^\/cgi\/mweb\/equip\/\d+\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
      ? url.pathname.replace(/\/$/, "")
      : null;
  } catch {
    return null;
  }
}

function readBackgroundSearchUsage(): BackgroundSearchUsageRecord[] {
  try {
    const saved: unknown = JSON.parse(
      window.localStorage.getItem(USAGE_STORAGE_KEY) ?? "[]",
    );
    if (!Array.isArray(saved)) return [];
    const now = Date.now();
    const validEvents = new Set(["start", "start_error", "cycle", "stop"]);
    const records = saved.flatMap((item): BackgroundSearchUsageRecord[] => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      const occurredAt = Number(record.occurredAt);
      const intervalMinutes = Number(record.intervalMinutes);
      if (
        typeof record.event !== "string" ||
        !validEvents.has(record.event) ||
        !Number.isFinite(occurredAt) ||
        occurredAt <= 0 ||
        now - occurredAt > USAGE_RETENTION_MS ||
        !Number.isInteger(intervalMinutes) ||
        intervalMinutes < MIN_INTERVAL_MINUTES ||
        intervalMinutes > MAX_INTERVAL_MINUTES
      ) {
        return [];
      }
      return [
        {
          id: typeof record.id === "string" ? record.id : `${occurredAt}`,
          event: record.event as BackgroundSearchUsageRecord["event"],
          occurredAt,
          intervalMinutes,
          ...(record.outcome === "success" ||
          record.outcome === "error" ||
          record.outcome === "stopped"
            ? { outcome: record.outcome }
            : {}),
          ...(Number.isFinite(Number(record.foundCount)) &&
          Number(record.foundCount) >= 0
            ? { foundCount: Number(record.foundCount) }
            : {}),
          ...(Number.isFinite(Number(record.newFoundCount)) &&
          Number(record.newFoundCount) >= 0
            ? { newFoundCount: Number(record.newFoundCount) }
            : {}),
          ...(Number.isFinite(Number(record.durationMs)) &&
          Number(record.durationMs) >= 0
            ? { durationMs: Number(record.durationMs) }
            : {}),
          ...(typeof record.message === "string"
            ? { message: record.message.slice(0, 400) }
            : {}),
        },
      ];
    });
    const recent = records.slice(0, MAX_USAGE_RECORDS);
    try {
      window.localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(recent));
    } catch {
      // 过期记录仍会从当前展示列表中移除。
    }
    return recent;
  } catch {
    return [];
  }
}

let usageHistory = readBackgroundSearchUsage();

function appendUsageRecord(record: Omit<BackgroundSearchUsageRecord, "id">) {
  usageHistory = [
    {
      ...record,
      id: `${record.occurredAt}-${Math.random().toString(36).slice(2, 9)}`,
    },
    ...usageHistory,
  ]
    .filter((item) => Date.now() - item.occurredAt <= USAGE_RETENTION_MS)
    .slice(0, MAX_USAGE_RECORDS);
  try {
    window.localStorage.setItem(
      USAGE_STORAGE_KEY,
      JSON.stringify(usageHistory),
    );
  } catch {
    // 当前进程仍保留使用记录，空间不足时不影响后台搜索。
  }
  const snapshot = usageHistory.map((item) => ({ ...item }));
  usageListeners.forEach((listener) => listener(snapshot));
}

export function getBackgroundSearchUsageHistory() {
  return usageHistory.map((record) => ({ ...record }));
}

export function subscribeBackgroundSearchUsageHistory(
  listener: (records: BackgroundSearchUsageRecord[]) => void,
) {
  usageListeners.add(listener);
  listener(getBackgroundSearchUsageHistory());
  return () => usageListeners.delete(listener);
}

function matchesSubmittedSearch(
  pageUrl: string | undefined,
  targetUrl: string,
) {
  try {
    const page = new URL(pageUrl ?? "");
    const target = new URL(targetUrl);
    if (page.origin !== target.origin || page.pathname !== target.pathname) {
      return false;
    }
    return [...target.searchParams].every(
      ([key, value]) =>
        key === "refer_sn" || page.searchParams.get(key) === value,
    );
  } catch {
    return false;
  }
}

async function readSubmittedResults(
  targetUrl: string,
  currentTaskId: number,
): Promise<CbgRolePage | null> {
  const readResults = window.desktop?.readCbgRoleResults;
  if (!readResults) throw new Error("藏宝阁搜索结果读取功能不可用");
  const deadline = Date.now() + 20_000;
  let page = await readResults();
  while (Date.now() < deadline && currentTaskId === taskId) {
    if (page.status === "login_required") {
      throw new Error("藏宝阁需要登录，请先在藏宝阁窗口完成登录");
    }
    if (page.status === "security_check") {
      throw new Error("藏宝阁要求完成安全验证，请在藏宝阁窗口处理");
    }
    if (
      (page.status === "ready" || page.status === "empty") &&
      matchesSubmittedSearch(page.pageUrl, targetUrl)
    ) {
      return page;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    page = await readResults();
  }
  if (currentTaskId !== taskId) return null;
  throw new Error("藏宝阁结果页加载超时；后台搜索会在下个间隔重试");
}

async function ensureNotificationPermission() {
  if (!("__TAURI_INTERNALS__" in window)) {
    throw new Error("后台搜索和 Windows 通知仅支持桌面版");
  }
  const { isPermissionGranted, requestPermission } =
    await import("@tauri-apps/plugin-notification");
  if (await isPermissionGranted()) return;
  if ((await requestPermission()) !== "granted") {
    throw new Error("Windows 通知权限未开启，无法启动后台搜索");
  }
}

function notificationSummary(candidates: CbgCandidate[]) {
  return candidates
    .slice(0, 2)
    .map(({ summary }) =>
      (summary ?? "新账号").replace(/[\u0000-\u001f\u007f]+/g, " ").trim(),
    )
    .filter(Boolean)
    .join("；")
    .slice(0, 180);
}

async function notify(title: string, body: string) {
  try {
    const { sendNotification } =
      await import("@tauri-apps/plugin-notification");
    await sendNotification({ title, body });
  } catch {
    // 通知不可用时，后台搜索仍继续运行。
  }
}

async function listenForBackgroundTicks() {
  if (unlistenBackgroundTick) return;
  unlistenBackgroundTick = await listen<number>(
    "background-search:tick",
    ({ payload }) => {
      if (payload === taskId && status.running) void runCycle(payload);
    },
  );
}

async function runSearch(currentTaskId: number) {
  const criteria = criteriaSnapshot;
  const desktop = window.desktop;
  if (!criteria || !desktop) throw new Error("后台搜索条件或桌面接口不可用");

  const submitted = await desktop.applyCbgRoleSearch(criteria, {
    background: true,
  });
  if (currentTaskId !== taskId) return null;
  if (!submitted.url) throw new Error("藏宝阁没有返回本次搜索地址");
  const page = await readSubmittedResults(submitted.url, currentTaskId);
  if (!page || currentTaskId !== taskId) return null;

  const candidateKeys = new Set<string>();
  const candidates = (page.candidates ?? []).filter((candidate) => {
    const key = candidateKey(candidate.url);
    if (!key || candidateKeys.has(key)) return false;
    candidateKeys.add(key);
    return true;
  });
  const newCandidates = candidates.filter(
    (candidate) => !seenCandidates.has(candidateKey(candidate.url)!),
  );
  if (newCandidates.length) {
    newCandidates.forEach((candidate) =>
      seenCandidates.add(candidateKey(candidate.url)!),
    );
    seenCandidates = new Set([...seenCandidates].slice(-MAX_SEEN_CANDIDATES));
    try {
      window.localStorage.setItem(
        SEEN_STORAGE_KEY,
        JSON.stringify([...seenCandidates]),
      );
    } catch {
      // 当前进程内仍会去重，退出后再重新发现即可。
    }
    await notify(
      `发现 ${newCandidates.length} 个符合条件的新账号`,
      notificationSummary(newCandidates) || "打开账号匹配页查看详情",
    );
    if (currentTaskId !== taskId) return;
  }
  updateStatus({
    lastFoundCount: candidates.length,
    newFoundCount: newCandidates.length,
    error: null,
  });
  return { foundCount: candidates.length, newFoundCount: newCandidates.length };
}

async function runCycle(currentTaskId: number) {
  if (currentTaskId !== taskId || !status.running) return;
  const isInitialRun = initialRunPending;
  const startedAt = Date.now();
  const intervalMinutes = status.intervalMinutes;
  let outcome: "success" | "error" | "stopped" = "success";
  let foundCount: number | undefined;
  let newFoundCount: number | undefined;
  let errorMessage: string | undefined;
  updateStatus({ searching: true, lastRunAt: startedAt, error: null });
  try {
    const result = await runSearch(currentTaskId);
    if (!result) {
      outcome = "stopped";
      errorMessage = "本轮搜索在停止时中断";
    } else {
      foundCount = result.foundCount;
      newFoundCount = result.newFoundCount;
    }
    if (result && isInitialRun && currentTaskId === taskId) {
      initialRunPending = false;
      if (status.newFoundCount === 0) {
        await notify(
          "后台搜索已执行",
          `本轮找到 ${status.lastFoundCount} 条账号，没有发现新账号。`,
        );
      }
    }
  } catch (reason) {
    errorMessage = reason instanceof Error ? reason.message : String(reason);
    outcome = currentTaskId === taskId ? "error" : "stopped";
    if (outcome === "error") {
      updateStatus({ error: errorMessage });
      if (isInitialRun) {
        initialRunPending = false;
        await notify("后台搜索未完成", errorMessage);
      }
    }
  } finally {
    const completedAt = Date.now();
    appendUsageRecord({
      event: "cycle",
      occurredAt: completedAt,
      intervalMinutes,
      outcome,
      ...(foundCount !== undefined ? { foundCount } : {}),
      ...(newFoundCount !== undefined ? { newFoundCount } : {}),
      durationMs: completedAt - startedAt,
      ...(errorMessage ? { message: errorMessage } : {}),
    });
    if (currentTaskId !== taskId || !status.running) return;
    const nextRunAt = Date.now() + intervalMinutes * 60_000;
    try {
      if (!window.desktop) throw new Error("桌面接口不可用");
      await window.desktop.scheduleBackgroundSearch(
        intervalMinutes,
        currentTaskId,
      );
    } catch (reason) {
      if (currentTaskId !== taskId || !status.running) return;
      const message =
        "无法安排下一轮后台搜索：" +
        (reason instanceof Error ? reason.message : String(reason));
      taskId += 1;
      criteriaSnapshot = null;
      updateStatus({
        running: false,
        searching: false,
        nextRunAt: null,
        error: message,
      });
      appendUsageRecord({
        event: "stop",
        occurredAt: Date.now(),
        intervalMinutes,
        outcome: "error",
        message,
      });
      try {
        await window.desktop?.setBackgroundSearchRunning(false);
      } catch {
        // 页面状态仍会停止，避免继续显示为运行中。
      }
      await notify("后台搜索已停止", message);
      return;
    }
    if (currentTaskId !== taskId || !status.running) return;
    updateStatus({ searching: false, nextRunAt });
  }
}

export function getBackgroundSearchStatus(): BackgroundSearchStatus {
  return { ...status };
}

export function subscribeBackgroundSearch(
  listener: (status: BackgroundSearchStatus) => void,
) {
  listeners.add(listener);
  listener({ ...status });
  return () => {
    listeners.delete(listener);
  };
}

export function setBackgroundSearchInterval(minutes: number) {
  if (
    !Number.isInteger(minutes) ||
    minutes < MIN_INTERVAL_MINUTES ||
    minutes > MAX_INTERVAL_MINUTES
  ) {
    throw new Error(
      `搜索间隔需设置为 ${MIN_INTERVAL_MINUTES}–${MAX_INTERVAL_MINUTES} 分钟`,
    );
  }
  updateStatus({ intervalMinutes: minutes });
  try {
    window.localStorage.setItem(INTERVAL_STORAGE_KEY, String(minutes));
  } catch {
    // 设置仍保留在当前运行状态中。
  }
}

export async function startBackgroundSearch(
  criteria: AccountMatcherCriteria,
  intervalMinutes: number,
) {
  if (status.running || startPending) return;
  startPending = true;
  const startedAt = Date.now();
  try {
    setBackgroundSearchInterval(intervalMinutes);
    await ensureNotificationPermission();
    await listenForBackgroundTicks();
    criteriaSnapshot = JSON.parse(
      JSON.stringify(criteria),
    ) as AccountMatcherCriteria;
    if (!window.desktop) throw new Error("桌面接口不可用");
    await window.desktop.setBackgroundSearchRunning(true);
    appendUsageRecord({
      event: "start",
      occurredAt: startedAt,
      intervalMinutes: status.intervalMinutes,
      durationMs: Date.now() - startedAt,
    });
    const currentTaskId = ++taskId;
    initialRunPending = true;
    updateStatus({
      running: true,
      searching: true,
      lastRunAt: null,
      nextRunAt: null,
      lastFoundCount: 0,
      newFoundCount: 0,
      error: null,
    });
    void runCycle(currentTaskId);
  } catch (reason) {
    appendUsageRecord({
      event: "start_error",
      occurredAt: startedAt,
      intervalMinutes: status.intervalMinutes,
      outcome: "error",
      durationMs: Date.now() - startedAt,
      message: reason instanceof Error ? reason.message : String(reason),
    });
    throw reason;
  } finally {
    startPending = false;
  }
}

export async function stopBackgroundSearch() {
  // shortcut: stopping cancels future cycles; an IPC search already submitted finishes before it can be aborted.
  const wasRunning = status.running;
  const stoppedAt = Date.now();
  taskId += 1;
  initialRunPending = false;
  criteriaSnapshot = null;
  updateStatus({ running: false, searching: false, nextRunAt: null });
  if (!window.desktop) throw new Error("桌面接口不可用");
  try {
    await window.desktop.setBackgroundSearchRunning(false);
    if (wasRunning) {
      appendUsageRecord({
        event: "stop",
        occurredAt: stoppedAt,
        intervalMinutes: status.intervalMinutes,
        outcome: "success",
        durationMs: Date.now() - stoppedAt,
      });
    }
  } catch (reason) {
    if (wasRunning) {
      appendUsageRecord({
        event: "stop",
        occurredAt: stoppedAt,
        intervalMinutes: status.intervalMinutes,
        outcome: "error",
        durationMs: Date.now() - stoppedAt,
        message: reason instanceof Error ? reason.message : String(reason),
      });
    }
    throw reason;
  }
}
