import "./index.scss";
import { startTransition, useEffect, useRef, useState } from "react";
import {
  Button,
  ConfigProvider,
  Grid,
  Layout as AntLayout,
  message,
  Modal,
  Switch,
  Typography,
  theme as antdTheme,
} from "antd";
import type { AppLayoutProps } from "@/types/layout";
import { PageNavigation } from "./PageNavigation";
import { MobileLayoutContext } from "./mobileLayout";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { shallowEqual } from "react-redux";
import { DatasetHistoryModal } from "@/components/DatasetHistoryModal";
import { MaintenanceModal } from "@/components/MaintenanceModal";
import { ProductLoader } from "@/components/ProductLoader";
import {
  deleteDatasetHistoryRecord,
  clearRecentDatasetSnapshot,
  loadDatasetHistory,
  loadDatasetHistoryRecord,
  loadRecentDatasetSnapshot,
  saveRecentDatasetSnapshot,
  saveRecentDatasetSnapshotOnly,
  emptyDataset,
  incrementCalculatorStaticRefreshRequestId,
  setCacheReady,
  setDataset,
  setHistory,
  setHistoryLoading,
  setHistoryOpen,
  setProductUrl,
  setRestoreNotice,
  setStaticAssetPreview,
  setStaticDataLoading,
  setUpdating,
  upsertHistoryRecord,
  setMaintenanceOpen,
  useAppDispatch,
  useAppSelector,
} from "@/store";
import {
  extractCbgCollectionSkinCount,
  extractCbgSpeedHighlights,
  getCbgChannelFromUrl,
  parseProductUrl,
} from "@/lib/relics";
import { APP_ROUTE_PATHS, getRouteFromPath, type AppRoute } from "@/router";
import { navigationItems } from "@/router/routes";
import {
  getStaticRefreshRemaining,
  markStaticRefresh,
} from "@/lib/staticRefresh";
import { loadHeroPanels, loadRelicSuits } from "@/lib/staticApi";
import { convertCbgPayloadInWorker } from "@/lib/cbgDataset";
import { buildAccountSummary } from "@/lib/accountSummary";
import {
  applyTheme,
  getStoredTheme,
  persistTheme,
  type ThemeMode,
} from "@/lib/theme";
import type { GameConfig, RelicDataset } from "@/types";

type HeroStaticPayload = {
  heroesById?: Record<string, { id?: number }>;
};

type RelicSuitStaticPayload = {
  yuhun_list?: Array<[number, ...unknown[]]>;
};

const CBG_DATA_SYNC_STORAGE_KEY = "yys-cbg-sync-enabled";
const CBG_LOGIN_NOTICE_STORAGE_KEY = "account-matcher-cbg-login-notice-v1";

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    for (const key of ["message", "msg", "error", "reason"]) {
      if (typeof value[key] === "string" && value[key].trim()) {
        return value[key];
      }
    }
  }
  return fallback;
}

/**
 * 旧缓存没有一速、头尾及准确的典藏皮肤数量。商品已上架后不会变化，因此只在
 * 数据结构升级时补读一次该商品，随后立刻回存，避免每次恢复记录都请求接口。
 */
async function migrateCachedSpeedHighlights(
  dataset: RelicDataset,
  productUrl: string,
) {
  // 版本 11 起御行达摩改为从 damo_count_dict 的物品 ID 411 汇总。
  // 低版本缓存可能把其他货币错误地写成 0，必须回源重新转换一次。
  const needsDarumaMigration = (dataset.schemaVersion || 0) < 11;
  // 旧缓存可能已包含 heroes，但还没有当前页面所需的式神等级字段。
  const hasHeroLevels =
    (dataset.heroes?.length || 0) > 0 &&
    dataset.heroes?.every(
      (hero) => Number.isFinite(hero.level) && hero.level > 0,
    );
  // 桌面端恢复历史记录时仍以本地快照为主，仅为新增的售价字段补读一次远程数据。
  const needsPriceMigration = dataset.account?.price === undefined;
  if (!needsPriceMigration || !productUrl) {
    return dataset;
  }
  const product = parseProductUrl(productUrl);
  const payload = await window.desktop!.loadProduct({
    serverid: product.serverid,
    ordersn: product.ordersn,
    channel: product.channel,
    sourceUrl: product.sourceUrl,
    viewLoc: product.viewLoc,
    tfid: product.tfid,
    tcid: product.tcid,
  });
  const gameConfig = {} as GameConfig;
  const refreshedDataset = await convertCbgPayloadInWorker(payload, gameConfig);
  return {
    ...refreshedDataset,
    schemaVersion: 11,
    account: {
      ...refreshedDataset.account,
      ...extractCbgSpeedHighlights(payload),
      collectionSkinCount: extractCbgCollectionSkinCount(payload, gameConfig),
      channel: product.channel,
      sourceUrl:
        dataset.account?.sourceUrl ||
        refreshedDataset.account?.sourceUrl ||
        product.sourceUrl,
    },
  };
}

export function AppLayout({}: AppLayoutProps) {
  const screens = Grid.useBreakpoint();
  const shellRef = useRef<HTMLDivElement>(null);
  const autoOpenedCbgLogin = useRef(false);
  const autoQueryHandledLocation = useRef<string | null>(null);
  const [isMobile, setIsMobile] = useState(!screens.md);
  const isMedium = Boolean(!isMobile && screens.md && !screens.lg);
  const isWide = Boolean(screens.xl);
  const isUltraWide = Boolean(screens.xxl);
  const dispatch = useAppDispatch();
  const {
    dataset,
    productUrl,
    cacheReady,
    updating,
    history,
    historyOpen,
    historyLoading,
    staticDataLoading,
    staticAssetPreview,
    restoreNotice,
    maintenanceOpen,
  } = useAppSelector(
    ({ app }) => ({
      dataset: app.dataset,
      productUrl: app.productUrl,
      cacheReady: app.cacheReady,
      updating: app.updating,
      history: app.history,
      historyOpen: app.historyOpen,
      historyLoading: app.historyLoading,
      staticDataLoading: app.staticDataLoading,
      staticAssetPreview: app.staticAssetPreview,
      restoreNotice: app.restoreNotice,
      maintenanceOpen: app.maintenanceOpen,
    }),
    shallowEqual,
  );
  const [api, holder] = message.useMessage();
  const location = useLocation();
  const navigate = useNavigate();
  const [pageLoading, setPageLoading] = useState(false);
  const [pendingPage, setPendingPage] = useState<AppRoute | null>(null);
  const [calculationLoading, setCalculationLoading] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [cbgSyncEnabled, setCbgSyncEnabled] = useState(
    () => localStorage.getItem(CBG_DATA_SYNC_STORAGE_KEY) !== "false",
  );
  const [cbgLoginNoticeOpen, setCbgLoginNoticeOpen] = useState(() => {
    try {
      return localStorage.getItem(CBG_LOGIN_NOTICE_STORAGE_KEY) !== "dismissed";
    } catch {
      return true;
    }
  });

  const dismissCbgLoginNotice = () => {
    try {
      localStorage.setItem(CBG_LOGIN_NOTICE_STORAGE_KEY, "dismissed");
    } catch {
      // 页面当前会话内仍可关闭提示。
    }
    setCbgLoginNoticeOpen(false);
  };

  const uploadAccountSummary = (
    summaryDataset: RelicDataset,
    productUrl: string,
  ) => {
    void buildAccountSummary(summaryDataset)
      .then(async (summary) => {
        if (!summary.trim()) throw new Error("账号摘要为空");
        await window.desktop!.saveAccountSummary({ productUrl, summary });
      })
      .catch((error: unknown) => {
        console.warn(
          "账号摘要上传失败",
          error instanceof Error ? error.message : error,
        );
      });
  };

  const page = getRouteFromPath(location.pathname);
  const hasRelicData = Object.values(dataset.relicsByPosition || {}).some(
    (items) => items.length > 0,
  );
  const hasLoadedProduct = Boolean(dataset.account?.sourceUrl) || hasRelicData;
  const cbgChannel =
    getCbgChannelFromUrl(productUrl) ?? dataset.account?.channel ?? "official";
  const guardedPage =
    page === "settings" || page === "maintenance" || hasLoadedProduct
      ? page
      : "home";
  const availableNavigationItems = hasLoadedProduct
    ? navigationItems
    : navigationItems.filter(
        (item) => item.route === "home" || item.route === "settings",
      );
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const updateMobileLayout = () => {
      setIsMobile(shell.getBoundingClientRect().width <= 1080);
    };
    const observer = new ResizeObserver(updateMobileLayout);
    updateMobileLayout();
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);
  const navigateFromMenu = (route: AppRoute) => {
    if (route === guardedPage || route === pendingPage) return;
    setPendingPage(route);
    setPageLoading(true);
    startTransition(() => {
      navigate(APP_ROUTE_PATHS[route]);
    });
  };
  useEffect(() => {
    const storedTheme = getStoredTheme();
    setThemeMode(storedTheme);
    applyTheme(storedTheme);
  }, []);

  const toggleTheme = () => {
    setThemeMode((current) => {
      const nextTheme = current === "dark" ? "light" : "dark";
      applyTheme(nextTheme);
      persistTheme(nextTheme);
      return nextTheme;
    });
  };

  useEffect(() => {
    // 菜单切换后复位窗口滚动位置，避免新页面沿用上一个页面的阅读位置。
    const arrivedPage = getRouteFromPath(location.pathname);
    if (!pendingPage || pendingPage === arrivedPage) {
      setPendingPage(null);
      setPageLoading(false);
    }
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname, pendingPage]);
  useEffect(() => {
    return window.desktop?.onOpenMaintenance(() =>
      navigate(APP_ROUTE_PATHS.maintenance),
    );
  }, [navigate]);

  const refreshStaticDataFromMenu = async () => {
    if (staticDataLoading) return;
    if (getStaticRefreshRemaining() > 0) {
      api.info("静态数据仍在冷却中，请稍后再试");
      return;
    }

    dispatch(setStaticDataLoading(true));
    try {
      const [heroData, suitData] = await Promise.all([
        loadHeroPanels<HeroStaticPayload>(true),
        loadRelicSuits<RelicSuitStaticPayload>(true),
      ]);
      const serverListUpdated = await window
        .desktop!.updateStaticData("/static/server-list")
        .then(() => true)
        .catch(() => false);
      const heroIds = Object.values(heroData.heroesById || {})
        .map((hero) => hero.id)
        .filter((id): id is number => Number.isInteger(id) && id > 0);
      const suitIds = (suitData.yuhun_list || [])
        .map(([id]) => id)
        .filter((id): id is number => Number.isInteger(id) && id > 0);
      const assetResult = await window.desktop!.updateStaticAssets({
        heroIds,
        suitIds,
      });
      dispatch(
        setStaticAssetPreview({
          ...assetResult,
          heroIds: heroIds.slice(0, 5),
          suitIds: suitIds.slice(0, 5),
        }),
      );
      markStaticRefresh();
      dispatch(incrementCalculatorStaticRefreshRequestId());
      api.success(
        `静态数据已更新：${assetResult.heroIcons} 个式神图标、${assetResult.suitIcons} 个御魂图标；${serverListUpdated ? "区服表已更新" : "区服表更新失败，继续使用本地版本"}`,
      );
    } catch {
      api.error("静态数据更新失败，请稍后重试");
    } finally {
      dispatch(setStaticDataLoading(false));
    }
  };

  // IndexedDB supports full relic inventories that exceed Safari localStorage limits.
  useEffect(() => {
    let cancelled = false;
    let historyLoadTimer: number | undefined;
    let restoredSnapshot: Awaited<
      ReturnType<typeof loadRecentDatasetSnapshot>
    > = null;
    const readyFallbackTimer = window.setTimeout(() => {
      if (!cancelled) dispatch(setCacheReady(true));
    }, 1_500);

    void loadRecentDatasetSnapshot()
      .then((snapshot) => {
        if (cancelled) return;
        if (!snapshot) return;
        restoredSnapshot = snapshot;
        dispatch(setDataset(snapshot.dataset));
        dispatch(setRestoreNotice("已恢复上次访问数据"));
        // 仅为旧缓存补齐一次藏宝阁已计算的一速和头尾汇总。
        void migrateCachedSpeedHighlights(
          snapshot.dataset,
          snapshot.productUrl || snapshot.dataset.account?.sourceUrl || "",
        )
          .then(async (migratedDataset) => {
            if (cancelled || migratedDataset === snapshot.dataset) return;
            dispatch(setDataset(migratedDataset));
            const record = await saveRecentDatasetSnapshot(
              migratedDataset,
              snapshot.productUrl,
            );
            if (!cancelled) dispatch(upsertHistoryRecord(record));
          })
          .catch(() => undefined);
      })
      .finally(() => {
        window.clearTimeout(readyFallbackTimer);
        if (cancelled) return;
        dispatch(setCacheReady(true));
        // 首屏和最近账号先恢复，完整历史记录在首帧后读取。
        historyLoadTimer = window.setTimeout(() => {
          // 历史库里每条记录都带整份御魂数据，读取需要几秒；这段耗时明确展示成加载状态，
          // 避免界面上看不出正在做什么。读取本身已按条让出主线程，加载提示会持续运转。
          dispatch(setHistoryLoading(true));
          void loadDatasetHistory()
            .then((records) => {
              if (cancelled) return;
              dispatch(setHistory(records));
              const snapshot = restoredSnapshot;
              // 将旧版只有“最近一次”的缓存同步到新历史记录表。
              if (
                !snapshot ||
                records.some(
                  (record) => record.productUrl === snapshot.productUrl,
                )
              ) {
                return;
              }
              return saveRecentDatasetSnapshot(
                snapshot.dataset,
                snapshot.productUrl,
              ).then((record) => {
                if (!cancelled) dispatch(upsertHistoryRecord(record));
              });
            })
            .catch(() => undefined)
            .finally(() => {
              if (!cancelled) dispatch(setHistoryLoading(false));
            });
        }, 0);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(readyFallbackTimer);
      if (historyLoadTimer !== undefined) {
        window.clearTimeout(historyLoadTimer);
      }
    };
  }, [dispatch]);

  // 搜索链接只服务于当前查询，切换功能页面后不保留已输入内容。
  useEffect(() => {
    dispatch(setProductUrl(""));
  }, [dispatch, page]);

  useEffect(() => {
    if (!restoreNotice) return;
    const timer = window.setTimeout(
      () => dispatch(setRestoreNotice(null)),
      4_000,
    );
    return () => window.clearTimeout(timer);
  }, [dispatch, restoreNotice]);

  useEffect(() => {
    localStorage.setItem(CBG_DATA_SYNC_STORAGE_KEY, String(cbgSyncEnabled));
  }, [cbgSyncEnabled]);

  useEffect(() => {
    if (
      !("__TAURI_INTERNALS__" in window) ||
      !cacheReady ||
      updating ||
      !cbgSyncEnabled ||
      !window.desktop?.takeCbgPageCapture
    ) {
      return;
    }
    let stopped = false;
    let checking = false;
    const pollBrowserCapture = async () => {
      if (checking || stopped) return;
      checking = true;
      try {
        const capture = await window.desktop?.takeCbgPageCapture();
        if (!capture || stopped) return;
        const product = parseProductUrl(capture.pageUrl);
        const gameConfig = {} as GameConfig;
        const next = await convertCbgPayloadInWorker(
          capture.payload,
          gameConfig,
        );
        const loadedDataset: RelicDataset = {
          ...next,
          account: {
            ...next.account,
            channel: product.channel,
            sourceUrl: product.sourceUrl,
          },
        };
        dispatch(setDataset(loadedDataset));
        dispatch(setProductUrl(""));
        void saveRecentDatasetSnapshot(loadedDataset, product.sourceUrl)
          .then((record) => dispatch(upsertHistoryRecord(record)))
          .catch(() => undefined);
        uploadAccountSummary(loadedDataset, product.sourceUrl);
      } catch (error) {
        console.warn(
          "浏览器藏宝阁数据自动同步失败",
          error instanceof Error ? error.message : error,
        );
      } finally {
        checking = false;
      }
    };
    const timer = window.setInterval(() => void pollBrowserCapture(), 800);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [cacheReady, cbgSyncEnabled, dispatch, updating]);

  // 弹窗和下拉层打开时锁定背景滚动，桌面端不需要触控事件兼容分支。
  useEffect(() => {
    const body = document.body;
    const html = document.documentElement;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyPosition = body.style.position;
    const previousBodyTop = body.style.top;
    const previousBodyWidth = body.style.width;
    let lockedScrollY = 0;
    let isScrollLocked = false;

    const setScrollLock = (shouldLock: boolean) => {
      if (shouldLock && !isScrollLocked) {
        lockedScrollY = window.scrollY;
        body.style.position = "fixed";
        body.style.top = `-${lockedScrollY}px`;
        body.style.width = "100%";
        body.style.overflow = "hidden";
        html.style.overflow = "hidden";
        isScrollLocked = true;
        return;
      }

      if (!shouldLock && isScrollLocked) {
        body.style.position = previousBodyPosition;
        body.style.top = previousBodyTop;
        body.style.width = previousBodyWidth;
        body.style.overflow = previousBodyOverflow;
        html.style.overflow = previousHtmlOverflow;
        window.scrollTo(0, lockedScrollY);
        isScrollLocked = false;
      }
    };

    const syncScrollLock = () => {
      const hasOpenSelect = Array.from(
        document.querySelectorAll<HTMLElement>(".ant-select-dropdown"),
      ).some(
        (dropdown) =>
          !dropdown.classList.contains("ant-select-dropdown-hidden"),
      );
      const hasOpenModal = Array.from(
        document.querySelectorAll<HTMLElement>(".ant-modal-wrap"),
      ).some((modal) => {
        const style = window.getComputedStyle(modal);
        return style.display !== "none" && style.visibility !== "hidden";
      });
      const hasFullScreenOverlay = hasOpenModal;
      setScrollLock(hasFullScreenOverlay || hasOpenSelect);
    };

    let scheduledFrame = 0;

    const isScrollLockTarget = (target: Node) => {
      if (target === body) return true;
      if (!(target instanceof Element)) return false;
      return Boolean(target.closest(".ant-select-dropdown, .ant-modal-wrap"));
    };

    const containsScrollLockTarget = (node: Node) => {
      if (!(node instanceof Element)) return false;
      return (
        node.matches(
          ".ant-select-dropdown, .ant-modal-wrap, .ant-drawer-content-wrapper",
        ) ||
        Boolean(
          node.querySelector(
            ".ant-select-dropdown, .ant-modal-wrap, .ant-drawer-content-wrapper",
          ),
        )
      );
    };

    const scheduleSyncScrollLock = () => {
      if (scheduledFrame) return;
      scheduledFrame = window.requestAnimationFrame(() => {
        scheduledFrame = 0;
        syncScrollLock();
      });
    };

    const observer = new MutationObserver((mutations) => {
      const needsSync = mutations.some((mutation) => {
        if (mutation.type === "attributes") {
          return isScrollLockTarget(mutation.target);
        }
        if (mutation.type !== "childList") return false;
        return (
          (mutation.target !== body && isScrollLockTarget(mutation.target)) ||
          Array.from(mutation.addedNodes).some(containsScrollLockTarget) ||
          Array.from(mutation.removedNodes).some(containsScrollLockTarget)
        );
      });
      if (needsSync) scheduleSyncScrollLock();
    });
    observer.observe(body, {
      attributes: true,
      attributeFilter: ["class", "style", "aria-hidden"],
      childList: true,
      subtree: true,
    });
    syncScrollLock();

    return () => {
      observer.disconnect();
      if (scheduledFrame) window.cancelAnimationFrame(scheduledFrame);
      setScrollLock(false);
    };
  }, []);

  const loadProduct = async (requestedUrl = productUrl) => {
    let loadRequestPending = false;
    dispatch(setUpdating(true));
    try {
      const product = parseProductUrl(requestedUrl);
      loadRequestPending = true;
      const payload = await window.desktop!.loadProductRaw({
        serverid: product.serverid,
        ordersn: product.ordersn,
        channel: product.channel,
        sourceUrl: product.sourceUrl,
        viewLoc: product.viewLoc,
        tfid: product.tfid,
        tcid: product.tcid,
      });
      loadRequestPending = false;
      const gameConfig = {} as GameConfig;
      const next = await convertCbgPayloadInWorker(payload, gameConfig);
      const loadedDataset: RelicDataset = {
        ...next,
        account: {
          ...next.account,
          channel: product.channel,
          sourceUrl: product.sourceUrl,
        },
      };

      dispatch(setDataset(loadedDataset));
      dispatch(setProductUrl(""));
      void saveRecentDatasetSnapshot(loadedDataset, product.sourceUrl)
        .then((record) => {
          dispatch(upsertHistoryRecord(record));
        })
        .catch(() => undefined);
      api.success("商品数据已读取并保存到本机浏览器");
      uploadAccountSummary(loadedDataset, product.sourceUrl);
    } catch (error) {
      const errorMessage = getErrorMessage(error, "商品数据读取失败");
      const isRiskControl = /风控|风险|系统繁忙|反馈代号|访问频繁/.test(
        errorMessage,
      );
      const isLoginRequired = /没有找到藏宝阁登录状态|藏宝阁要求重新登录/.test(
        errorMessage,
      );
      const isEquipDescError = /御魂详情|御魂数据编号|御魂数据地址/.test(
        errorMessage,
      );
      const notice = isRiskControl
        ? api.warning({
            content: `藏宝阁返回异常：${errorMessage}。请在藏宝阁窗口打开同一商品确认页面状态；若页面也提示验证或繁忙，稍后再试。`,
          })
        : isLoginRequired
          ? api.warning({
              content: `没有检测到有效的藏宝阁登录状态：${errorMessage}。请在藏宝阁窗口重新登录后再试。`,
            })
          : isEquipDescError
            ? api.error({ content: errorMessage })
            : loadRequestPending
              ? api.warning({
                  content: `已检测到登录状态，但商品详情请求失败：${errorMessage}。这不一定是风控；可能是藏宝阁页面未就绪、请求超时、网络异常或接口校验失败。请在藏宝阁窗口打开同一商品确认页面状态后重试。`,
                })
              : api.error({
                  content: errorMessage,
                });
      if (isLoginRequired && !autoOpenedCbgLogin.current) {
        autoOpenedCbgLogin.current = true;
        void notice.then(() => openCbgWindow());
      }
    } finally {
      dispatch(setUpdating(false));
    }
  };
  const loadProductRef = useRef(loadProduct);
  loadProductRef.current = loadProduct;

  useEffect(() => {
    const routeState = location.state as {
      autoQueryProductUrl?: unknown;
      autoQueryHistoryRecordId?: unknown;
    } | null;
    const historyRecordId = routeState?.autoQueryHistoryRecordId;
    const requestedUrl = routeState?.autoQueryProductUrl;
    if (page !== "home" || autoQueryHandledLocation.current === location.key) {
      return;
    }

    if (typeof historyRecordId === "string" && historyRecordId.trim()) {
      autoQueryHandledLocation.current = location.key;
      navigate(APP_ROUTE_PATHS.home, { replace: true, state: null });
      dispatch(setProductUrl(""));
      dispatch(setUpdating(true));
      void loadDatasetHistoryRecord(historyRecordId)
        .then((record) => {
          if (!record) throw new Error("该历史记录已失效，请重新读取账号链接");
          dispatch(setDataset(record.dataset));
          void saveRecentDatasetSnapshotOnly(
            record.dataset,
            record.productUrl,
          ).catch(() => undefined);
          dispatch(setRestoreNotice("已从本机历史打开账号数据"));
        })
        .catch((error: unknown) => {
          api.error(
            error instanceof Error ? error.message : "历史记录读取失败",
          );
        })
        .finally(() => dispatch(setUpdating(false)));
      return;
    }

    if (typeof requestedUrl !== "string" || !requestedUrl.trim()) return;
    autoQueryHandledLocation.current = location.key;
    navigate(APP_ROUTE_PATHS.home, { replace: true, state: null });
    dispatch(setProductUrl(requestedUrl));
    void loadProductRef.current(requestedUrl);
  }, [api, dispatch, location.key, location.state, navigate, page]);

  const openCbgWindow = async () => {
    try {
      await window.desktop?.toggleCbgWindow(cbgChannel);
    } catch (error) {
      api.error(getErrorMessage(error, "无法打开藏宝阁窗口"));
    }
  };

  const restoreHistory = async (id: string) => {
    dispatch(setUpdating(true));
    try {
      const record = await loadDatasetHistoryRecord(id);
      if (!record) throw new Error("该历史记录已失效，请重新读取账号链接");
      let restoredDataset = record.dataset;
      try {
        restoredDataset = await migrateCachedSpeedHighlights(
          record.dataset,
          record.productUrl || record.dataset.account?.sourceUrl || "",
        );
      } catch {
        // 历史数据已可离线使用，补齐汇总失败时保持原有记录。
      }
      dispatch(setDataset(restoredDataset));
      dispatch(setProductUrl(""));
      dispatch(
        upsertHistoryRecord(
          await saveRecentDatasetSnapshot(restoredDataset, record.productUrl),
        ),
      );
      dispatch(setRestoreNotice("已恢复历史记录数据"));
    } catch (error) {
      api.error(error instanceof Error ? error.message : "历史记录恢复失败");
    } finally {
      dispatch(setUpdating(false));
    }
  };

  const deleteHistory = async (id: string) => {
    const deletedIndex = history.findIndex((record) => record.id === id);
    const currentSourceUrl = dataset.account?.sourceUrl || productUrl.trim();
    const currentRecord = currentSourceUrl
      ? history.find(
          (record) =>
            record.productUrl === currentSourceUrl ||
            record.dataset.account?.sourceUrl === currentSourceUrl,
        )
      : undefined;
    const deletingCurrentRecord = currentRecord?.id === id;

    await deleteDatasetHistoryRecord(id);
    // 直接从当前列表里摘掉即可：整表重读一次要几秒，删除一条不值得。
    const nextHistory = history.filter((record) => record.id !== id);
    dispatch(setHistory(nextHistory));

    if (!deletingCurrentRecord) return;

    const nextRecord =
      nextHistory[deletedIndex] || nextHistory[deletedIndex - 1] || null;
    if (nextRecord) {
      const fullNextRecord = await loadDatasetHistoryRecord(nextRecord.id);
      if (fullNextRecord) {
        dispatch(setDataset(fullNextRecord.dataset));
        dispatch(setProductUrl(fullNextRecord.productUrl));
        await saveRecentDatasetSnapshotOnly(
          fullNextRecord.dataset,
          fullNextRecord.productUrl,
        );
        dispatch(setRestoreNotice("当前账号已删除，已切换到下一个账号。"));
        return;
      }
    }

    dispatch(setDataset(emptyDataset));
    dispatch(setProductUrl(""));
    await clearRecentDatasetSnapshot();
    dispatch(setRestoreNotice("当前账号已删除，已清空本地账号数据。"));
  };

  return (
    <ConfigProvider
      theme={{
        algorithm:
          themeMode === "dark"
            ? antdTheme.darkAlgorithm
            : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: themeMode === "dark" ? "#8b5cf6" : "#1677ff",
          colorInfo: themeMode === "dark" ? "#4096ff" : "#1677ff",
          colorSuccess: themeMode === "dark" ? "#73d13d" : "#52c41a",
          colorWarning: themeMode === "dark" ? "#ffc53d" : "#faad14",
          colorError: themeMode === "dark" ? "#ff7875" : "#ff4d4f",
          borderRadius: 8,
          colorBgLayout: themeMode === "dark" ? "#111315" : "#f5f7fa",
        },
      }}
    >
      <MobileLayoutContext.Provider value={isMobile}>
        <AntLayout
          ref={shellRef}
          className={`app-layout shell ${hasLoadedProduct ? "has-product" : "no-product"}${isMobile ? " is-mobile" : ""}${isMedium ? " is-medium" : ""}${isWide ? " is-wide" : ""}${isUltraWide ? " is-ultra-wide" : ""}`}
        >
          {holder}
          {/* 后台耗时（读取商品、读取本机历史）用不挡操作的角标说明进度，不遮住界面。 */}
          {(updating || historyLoading) && (
            <div className="app-status-stack">
              {updating && (
                <div
                  className="app-status-pill"
                  role="status"
                  aria-live="polite"
                >
                  <span
                    className="app-status-pill__spinner"
                    aria-hidden="true"
                  />
                  <span>正在读取账号数据，请稍候…</span>
                </div>
              )}
              {historyLoading && (
                <div
                  className="app-status-pill"
                  role="status"
                  aria-live="polite"
                >
                  <span
                    className="app-status-pill__spinner"
                    aria-hidden="true"
                  />
                  <span>正在加载本机历史记录…</span>
                </div>
              )}
            </div>
          )}
          {cacheReady && (
            <>
              <PageNavigation
                guardedPage={pendingPage || guardedPage}
                showNavigation={
                  hasLoadedProduct || page === "home" || page === "settings"
                }
                navigationItems={availableNavigationItems}
                desktopNavigationItems={availableNavigationItems}
                onNavigate={navigateFromMenu}
                themeMode={themeMode}
                onToggleTheme={toggleTheme}
                loginChannel={cbgChannel}
              />
              <AntLayout className="workspace-main">
                {hasLoadedProduct && (
                  <header className="workspace-bar">
                    <div className="workspace-breadcrumb">
                      <span>账号工作区</span>
                      <span aria-hidden="true">/</span>
                      <strong>
                        {navigationItems.find(
                          (item) => item.route === guardedPage,
                        )?.label || "账号查询"}
                      </strong>
                    </div>
                    <div className="workspace-account">
                      <span className="workspace-account-label">当前账号</span>
                      <strong>{dataset.account?.name || "已加载"}</strong>
                    </div>
                  </header>
                )}
                <AntLayout.Content className="workspace-content">
                  <div
                    className="page-route-transition"
                    key={guardedPage}
                    aria-busy={pageLoading || calculationLoading || updating}
                  >
                    {guardedPage === "home" && (
                      <div className="width overview-loader-wrap">
                        <ProductLoader
                          value={productUrl}
                          loading={updating}
                          history={history}
                          showHistoryTrigger={!hasLoadedProduct}
                          restoreNotice={restoreNotice}
                          onChange={(value) => dispatch(setProductUrl(value))}
                          onLoad={() => void loadProduct()}
                          onOpenHistory={() => dispatch(setHistoryOpen(true))}
                          onOpenCbgWindow={
                            "__TAURI_INTERNALS__" in window
                              ? () => void openCbgWindow()
                              : undefined
                          }
                          cbgSyncEnabled={cbgSyncEnabled}
                          onToggleCbgSync={
                            "__TAURI_INTERNALS__" in window
                              ? setCbgSyncEnabled
                              : undefined
                          }
                        />
                      </div>
                    )}
                    <Outlet
                      context={{
                        setCalculationLoading,
                        themeMode,
                        onToggleTheme: toggleTheme,
                        cbgSyncEnabled,
                        setCbgSyncEnabled,
                      }}
                    />
                  </div>
                  {/*
                    读取商品要访问藏宝阁（含御魂详情文件，可达几十 MB），耗时不确定。
                    这里不再用全屏遮罩盖住界面：那会在整个读取期间吞掉所有点击，
                    看起来就像应用假死。改为不挡操作的右下角进度提示。
                  */}
                  {(pageLoading || calculationLoading) && (
                    <div
                      className="page-navigation-loading"
                      role="status"
                      aria-live="polite"
                    >
                      <span className="page-navigation-loading__spinner" />
                      <span>
                        {calculationLoading
                          ? "正在计算速度组合"
                          : "页面加载中…"}
                      </span>
                    </div>
                  )}
                </AntLayout.Content>
              </AntLayout>
            </>
          )}
          <DatasetHistoryModal
            open={historyOpen}
            history={history}
            onOpenChange={(open) => dispatch(setHistoryOpen(open))}
            onRestore={(id) => void restoreHistory(id)}
            onDelete={(id) => void deleteHistory(id)}
          />
          <MaintenanceModal
            open={maintenanceOpen}
            loading={staticDataLoading}
            assetPreview={staticAssetPreview}
            onClose={() => dispatch(setMaintenanceOpen(false))}
            onUpdate={refreshStaticDataFromMenu}
          />
          <Modal
            title="藏宝阁首次使用提示"
            open={cbgLoginNoticeOpen}
            onCancel={dismissCbgLoginNotice}
            footer={
              <Button type="primary" onClick={dismissCbgLoginNotice}>
                我知道了
              </Button>
            }
          >
            <Typography.Paragraph>
              网易藏宝阁近期调整了风控策略，账号搜索和商品详情读取现在需要有效的藏宝阁登录状态。请先在应用首页点击“藏宝阁”打开窗口并完成登录；如果出现安全验证，也请在该窗口完成后再回来搜索。未登录或登录过期时，可能无法进入账号列表或读取商品详情。
            </Typography.Paragraph>
            <Typography.Paragraph>
              本项目源码已开源。仓库地址以及数据处理、加密说明可在“设置”页查看。
            </Typography.Paragraph>
          </Modal>
        </AntLayout>
      </MobileLayoutContext.Provider>
    </ConfigProvider>
  );
}
