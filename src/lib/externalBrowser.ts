import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

const preferenceKey = "yys-cbg-inspector.external-browser";

export const externalBrowserOptions = [
  { value: "system", label: "系统默认浏览器" },
  { value: "edge", label: "Microsoft Edge" },
  { value: "chrome", label: "Google Chrome" },
  { value: "firefox", label: "Mozilla Firefox" },
] as const;

export type ExternalBrowser = (typeof externalBrowserOptions)[number]["value"];
export type InstalledExternalBrowser = Exclude<ExternalBrowser, "system">;

export async function detectInstalledExternalBrowsers() {
  if (!("__TAURI_INTERNALS__" in window)) return [];
  return invoke<InstalledExternalBrowser[]>("get_installed_browsers");
}

const browserCommands: Record<Exclude<ExternalBrowser, "system">, string> = {
  edge: "msedge.exe",
  chrome: "chrome.exe",
  firefox: "firefox.exe",
};

export function getExternalBrowserPreference(): ExternalBrowser {
  const stored = localStorage.getItem(preferenceKey);
  return externalBrowserOptions.some((option) => option.value === stored)
    ? (stored as ExternalBrowser)
    : "system";
}

export function saveExternalBrowserPreference(browser: ExternalBrowser) {
  localStorage.setItem(preferenceKey, browser);
}

export async function openExternalUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("链接格式无效");
  }
  if (url.protocol !== "https:") throw new Error("只允许打开 HTTPS 链接");

  if ("__TAURI_INTERNALS__" in window) {
    const browser = getExternalBrowserPreference();
    try {
      await openUrl(
        url,
        browser === "system" ? undefined : browserCommands[browser],
      );
    } catch (error) {
      if (browser === "system") throw error;
      const label = externalBrowserOptions.find(
        (option) => option.value === browser,
      )?.label;
      const detail = error instanceof Error ? `：${error.message}` : "";
      throw new Error(
        `${label || "所选浏览器"}无法启动，请确认已安装${detail}`,
      );
    }
    return;
  }

  window.open(url.toString(), "_blank", "noopener,noreferrer");
}
