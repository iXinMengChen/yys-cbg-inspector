import {
  configureStore,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import { setAutoFreeze } from "immer";
import {
  useDispatch,
  useSelector,
  type TypedUseSelectorHook,
} from "react-redux";
import type { DatasetHistoryRecord } from "./persistence";
import type { RelicDataset } from "@/types";

export * from "./persistence";

export type StaticAssetPreview = {
  heroIcons: number;
  suitIcons: number;
  failed: number;
  heroIds: number[];
  suitIds: number[];
};

export type AppState = {
  dataset: RelicDataset;
  productUrl: string;
  cacheReady: boolean;
  updating: boolean;
  history: DatasetHistoryRecord[];
  historyOpen: boolean;
  /** 本机历史记录正在从 IndexedDB 读取，用于展示加载状态而不是让界面显得卡住。 */
  historyLoading: boolean;
  mobileMenuOpen: boolean;
  staticDataLoading: boolean;
  calculatorStaticRefreshRequestId: number;
  restoreNotice: string | null;
  maintenanceOpen: boolean;
  staticAssetPreview: StaticAssetPreview | null;
};

export const emptyDataset: RelicDataset = { relicsByPosition: {} };

// 藏宝阁御魂详情体积较大，递归冻结会在账号切页时同步阻塞主线程。
setAutoFreeze(false);

const initialState: AppState = {
  dataset: emptyDataset,
  productUrl: "",
  cacheReady: false,
  updating: false,
  history: [],
  historyOpen: false,
  historyLoading: false,
  mobileMenuOpen: false,
  staticDataLoading: false,
  calculatorStaticRefreshRequestId: 0,
  restoreNotice: null,
  maintenanceOpen: false,
  staticAssetPreview: null,
};

const appSlice = createSlice({
  name: "app",
  initialState,
  reducers: {
    setDataset(state, action: PayloadAction<RelicDataset>) {
      state.dataset = action.payload;
    },
    setProductUrl(state, action: PayloadAction<string>) {
      state.productUrl = action.payload;
    },
    setCacheReady(state, action: PayloadAction<boolean>) {
      state.cacheReady = action.payload;
    },
    setUpdating(state, action: PayloadAction<boolean>) {
      state.updating = action.payload;
    },
    setHistory(state, action: PayloadAction<DatasetHistoryRecord[]>) {
      state.history = action.payload;
    },
    /**
     * 用一条记录更新历史列表：同主键替换并保持按保存时间倒序。
     * 保存商品后走这里，避免为了刷新列表再整表读一次 IndexedDB（那要几秒）。
     */
    upsertHistoryRecord(state, action: PayloadAction<DatasetHistoryRecord>) {
      state.history = [
        action.payload,
        ...state.history.filter((record) => record.id !== action.payload.id),
      ].sort((left, right) => right.savedAt - left.savedAt);
    },
    setHistoryOpen(state, action: PayloadAction<boolean>) {
      state.historyOpen = action.payload;
    },
    setHistoryLoading(state, action: PayloadAction<boolean>) {
      state.historyLoading = action.payload;
    },
    setMobileMenuOpen(state, action: PayloadAction<boolean>) {
      state.mobileMenuOpen = action.payload;
    },
    setStaticDataLoading(state, action: PayloadAction<boolean>) {
      state.staticDataLoading = action.payload;
    },
    incrementCalculatorStaticRefreshRequestId(state) {
      state.calculatorStaticRefreshRequestId += 1;
    },
    setRestoreNotice(state, action: PayloadAction<string | null>) {
      state.restoreNotice = action.payload;
    },
    setMaintenanceOpen(state, action: PayloadAction<boolean>) {
      state.maintenanceOpen = action.payload;
    },
    setStaticAssetPreview(
      state,
      action: PayloadAction<StaticAssetPreview | null>,
    ) {
      state.staticAssetPreview = action.payload;
    },
    resetDataset(state) {
      state.dataset = emptyDataset;
      state.productUrl = "";
    },
  },
});

export const {
  incrementCalculatorStaticRefreshRequestId,
  resetDataset,
  setCacheReady,
  setDataset,
  setHistory,
  setHistoryOpen,
  setHistoryLoading,
  setMaintenanceOpen,
  setMobileMenuOpen,
  setProductUrl,
  setRestoreNotice,
  setStaticAssetPreview,
  setStaticDataLoading,
  setUpdating,
  upsertHistoryRecord,
} = appSlice.actions;

export const store = configureStore({
  reducer: {
    app: appSlice.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      immutableCheck: { ignoredPaths: ["app.dataset"] },
      serializableCheck: {
        ignoredActions: [setDataset.type],
        ignoredPaths: ["app.dataset"],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
