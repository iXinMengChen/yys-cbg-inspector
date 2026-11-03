import {
  CheckOutlined,
  GithubOutlined,
  GlobalOutlined,
  LinkOutlined,
  MoonOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import { Button, Card, Select, Switch, Typography, message } from "antd";
import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  detectInstalledExternalBrowsers,
  externalBrowserOptions,
  getExternalBrowserPreference,
  openExternalUrl,
  saveExternalBrowserPreference,
  type ExternalBrowser,
  type InstalledExternalBrowser,
} from "@/lib/externalBrowser";
import type { SettingsPageOutletContext } from "@/types/layout";
import { AboutSection } from "./AboutSection";
import "./index.scss";

const sourceRepositoryUrl =
  "https://github.com/iXinMengChen/yys-cbg-inspector/tree/tauri";

export function SettingsPage() {
  const { themeMode, onToggleTheme, cbgSyncEnabled, setCbgSyncEnabled } =
    useOutletContext<SettingsPageOutletContext>();
  const [browser, setBrowser] = useState<ExternalBrowser>("system");
  const [browserOptions, setBrowserOptions] = useState<
    (typeof externalBrowserOptions)[number][]
  >([externalBrowserOptions[0]]);
  const [browserDetectionFinished, setBrowserDetectionFinished] =
    useState(false);
  const [api, contextHolder] = message.useMessage();

  useEffect(() => {
    let active = true;
    void detectInstalledExternalBrowsers()
      .then((installed) => {
        if (!active) return;
        const installedBrowsers = new Set<InstalledExternalBrowser>(installed);
        setBrowserOptions(
          externalBrowserOptions.filter(
            ({ value }) =>
              value === "system" ||
              installedBrowsers.has(value as InstalledExternalBrowser),
          ),
        );
        const preference = getExternalBrowserPreference();
        const available =
          preference === "system" || installedBrowsers.has(preference);
        const nextBrowser = available ? preference : "system";
        if (!available) {
          saveExternalBrowserPreference("system");
          api.info("上次选择的浏览器未安装，已切换为系统默认浏览器");
        }
        setBrowser(nextBrowser);
      })
      .catch(() => {
        if (!active) return;
        saveExternalBrowserPreference("system");
        setBrowser("system");
        api.error("无法检测已安装浏览器，已切换为系统默认浏览器");
      })
      .finally(() => {
        if (active) setBrowserDetectionFinished(true);
      });
    return () => {
      active = false;
    };
  }, [api]);

  const updateBrowser = (value: ExternalBrowser) => {
    saveExternalBrowserPreference(value);
    setBrowser(value);
    api.success("默认浏览器设置已保存");
  };

  const testBrowser = async () => {
    try {
      await openExternalUrl("https://yys.cbg.163.com/");
      api.success("已打开藏宝阁首页");
    } catch (error) {
      api.error(
        `打开失败：${error instanceof Error ? error.message : "请检查浏览器是否已安装"}`,
      );
    }
  };

  const openSourceRepository = async () => {
    try {
      await openExternalUrl(sourceRepositoryUrl);
    } catch (error) {
      api.error(
        `仓库打开失败：${error instanceof Error ? error.message : "请检查浏览器设置"}`,
      );
    }
  };

  return (
    <main className="width result settings-page">
      {contextHolder}
      <header className="page-heading">
        <div>
          <h1>应用设置</h1>
          <p>管理应用偏好、数据同步与版本信息</p>
        </div>
      </header>

      <Card className="settings-page__card">
        <section
          className="settings-page__section"
          aria-labelledby="general-settings"
        >
          <h2 id="general-settings">常规</h2>
          <div className="settings-page__row">
            <div className="settings-page__copy">
              <strong>
                <LinkOutlined /> 默认浏览器
              </strong>
              <Typography.Text type="secondary">
                仅显示本机已安装的浏览器；系统默认浏览器不会被修改。
              </Typography.Text>
            </div>
            <div className="settings-page__control">
              <Select
                aria-label="默认浏览器"
                value={browser}
                options={browserOptions.map(({ value, label }) => ({
                  value,
                  label,
                }))}
                onChange={updateBrowser}
                disabled={!browserDetectionFinished}
              />
              <Button
                icon={<GlobalOutlined />}
                onClick={() => void testBrowser()}
                disabled={!browserDetectionFinished}
              >
                测试打开
              </Button>
            </div>
          </div>
          <div className="settings-page__row">
            <div className="settings-page__copy">
              <strong>
                <GlobalOutlined /> 界面语言
              </strong>
              <Typography.Text type="secondary">
                目前只提供简体中文。
              </Typography.Text>
            </div>
            <span className="settings-page__fixed-value">
              <CheckOutlined /> 简体中文
            </span>
          </div>
          <div className="settings-page__row">
            <div className="settings-page__copy">
              <strong>
                <GithubOutlined /> 开源仓库
              </strong>
              <Typography.Text type="secondary">
                项目源码已公开，当前桌面版在 Tauri 分支；点击仓库地址可复制。
              </Typography.Text>
              <Typography.Text copyable={{ text: sourceRepositoryUrl }}>
                {sourceRepositoryUrl}
              </Typography.Text>
            </div>
            <Button
              icon={<LinkOutlined />}
              onClick={() => void openSourceRepository()}
            >
              打开仓库
            </Button>
          </div>
        </section>

        <section
          className="settings-page__section"
          aria-labelledby="appearance-settings"
        >
          <h2 id="appearance-settings">外观与数据</h2>
          <div className="settings-page__row">
            <div className="settings-page__copy">
              <strong>
                <MoonOutlined /> 深色主题
              </strong>
              <Typography.Text type="secondary">
                切换应用界面的浅色或深色外观。
              </Typography.Text>
            </div>
            <Switch
              checked={themeMode === "dark"}
              checkedChildren="深色"
              unCheckedChildren="浅色"
              onChange={onToggleTheme}
              aria-label="深色主题"
            />
          </div>
          <div className="settings-page__row">
            <div className="settings-page__copy">
              <strong>
                <SyncOutlined /> 藏宝阁自动同步
              </strong>
              <Typography.Text type="secondary">
                浏览藏宝阁商品详情时，自动读取并更新当前账号数据。
              </Typography.Text>
            </div>
            <Switch
              checked={cbgSyncEnabled}
              checkedChildren="开启"
              unCheckedChildren="关闭"
              onChange={setCbgSyncEnabled}
              aria-label="藏宝阁自动同步"
            />
          </div>
        </section>
      </Card>
      <AboutSection />
    </main>
  );
}
