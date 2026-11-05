export {};

import type { CbgChannel } from "./types";
import type { CbgPanelBounds } from "./types/layout";
import type { AccountMatcherCriteria } from "./lib/accountMatcher";

declare global {
  interface Window {
    desktop?: {
      getAppVersion(): Promise<string>;
      hideMainWindow(): Promise<void>;
      scheduleBackgroundSearch(
        intervalMinutes: number,
        taskId: number,
      ): Promise<void>;
      setBackgroundSearchRunning(running: boolean): Promise<void>;
      getComputeCapacity(): Promise<{
        logicalCores: number;
        totalMemoryMb: number;
        freeMemoryMb: number;
      }>;
      loadProduct(request: {
        serverid: string;
        ordersn: string;
        channel: CbgChannel;
        sourceUrl: string;
        viewLoc?: string;
        tfid?: string;
        tcid?: string;
      }): Promise<unknown>;
      loadProductRaw(request: {
        serverid: string;
        ordersn: string;
        channel: CbgChannel;
        sourceUrl: string;
        viewLoc?: string;
        tfid?: string;
        tcid?: string;
      }): Promise<unknown>;
      toggleCbgWindow(channel: CbgChannel): Promise<boolean>;
      setCbgWebview(channel: CbgChannel, bounds: CbgPanelBounds): Promise<void>;
      setCbgWindowFullscreen(
        channel: CbgChannel,
        fullscreen: boolean,
      ): Promise<void>;
      getCbgLoginStatus(channel: CbgChannel): Promise<boolean | null>;
      applyCbgRoleSearch(
        criteria: AccountMatcherCriteria,
        options?: { background?: boolean },
      ): Promise<{
        status: "submitted";
        applied: string[];
        url?: string;
        localOnlyCriteria?: boolean;
      }>;
      readCbgRoleResults(): Promise<{
        status:
          | "ready"
          | "empty"
          | "loading"
          | "login_required"
          | "security_check"
          | "not_role_search";
        pageUrl?: string;
        pageKey?: string;
        siteNotice?: string;
        candidates?: { url: string; summary?: string }[];
        hasNext?: boolean;
      }>;
      nextCbgRoleResultsPage(): Promise<boolean>;
      takeCbgPageCapture(): Promise<{
        pageUrl: string;
        payload: unknown;
      } | null>;
      saveAccountSummary(request: {
        productUrl: string;
        summary: string;
      }): Promise<void>;
      readStaticData(endpoint: string): Promise<unknown>;
      updateStaticData(endpoint: string): Promise<unknown>;
      saveStaticData(endpoint: string, data: unknown): Promise<unknown>;
      updateStaticAssets(request: {
        heroIds: number[];
        suitIds: number[];
      }): Promise<{
        heroIcons: number;
        suitIcons: number;
        failed: number;
      }>;
      openDownloadsFolder(): Promise<void>;
      /** 已移除的原生计算通道，旧会话类型保留至下一轮页面整理。 */
      calculateRelicsNative(protocolBytes: Uint8Array): Promise<unknown>;
      onNativeCalculatorProgress(
        listener: (progress: {
          stage: string;
          processed: number;
          total: number;
        }) => void,
      ): () => void;
      cancelNativeCalculator(): Promise<void>;
      onOpenMaintenance(listener: () => void): () => void;
    };
  }
}
