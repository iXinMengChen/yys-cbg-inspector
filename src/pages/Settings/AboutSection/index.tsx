import { DesktopOutlined, InfoCircleOutlined } from "@ant-design/icons";
import { Button, Card, Space, Typography } from "antd";
import { useEffect, useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import "./index.scss";

const developmentVersion = "开发环境";

/** 展示由 Tauri 读取的应用版本，避免与打包版本号重复维护。 */
export function AboutSection() {
  const [version, setVersion] = useState(developmentVersion);
  const [isDesktop, setIsDesktop] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateStatus, setUpdateStatus] = useState("");

  useEffect(() => {
    let isMounted = true;
    const desktop = window.desktop;
    if (!desktop) return;

    setIsDesktop(true);
    void desktop
      .getAppVersion()
      .then((nextVersion) => {
        if (isMounted) setVersion(nextVersion);
      })
      .catch(() => {
        // 浏览器预览没有 Tauri IPC，保留开发环境标记即可。
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const checkForUpdates = async () => {
    setUpdateLoading(true);
    setUpdateStatus("");
    try {
      const update = await check();
      setAvailableUpdate(update);
      setUpdateStatus(
        update ? `发现新版本 v${update.version}` : "当前已是最新版本",
      );
    } catch (error) {
      setUpdateStatus(
        `检查更新失败：${error instanceof Error ? error.message : "未知错误"}`,
      );
    } finally {
      setUpdateLoading(false);
    }
  };

  const installUpdate = async () => {
    if (!availableUpdate) return;

    setUpdateLoading(true);
    setUpdateStatus("正在准备更新…");
    let downloaded = 0;
    let contentLength = 0;
    try {
      await availableUpdate.downloadAndInstall((event) => {
        if (event.event === "Started") {
          contentLength = event.data.contentLength ?? 0;
          setUpdateStatus("正在下载更新…");
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          const progress = contentLength
            ? ` ${Math.min(100, Math.floor((downloaded / contentLength) * 100))}%`
            : "";
          setUpdateStatus(`正在下载更新${progress}`);
        } else {
          setUpdateStatus("下载完成，正在安装…");
        }
      });
      await relaunch();
    } catch (error) {
      setUpdateStatus(
        `更新失败：${error instanceof Error ? error.message : "未知错误"}`,
      );
      setUpdateLoading(false);
    }
  };

  return (
    <section className="settings-about" aria-labelledby="settings-about-title">
      <h2 id="settings-about-title" className="settings-about__title">
        关于号来
      </h2>
      <Card className="settings-about__card">
        <div className="settings-about__identity">
          <span className="settings-about__icon" aria-hidden="true">
            <DesktopOutlined />
          </span>
          <div>
            <Typography.Title level={2}>号来</Typography.Title>
            <Typography.Paragraph
              className="settings-about__description"
              type="secondary"
            >
              号来是一款用于查看阴阳师藏宝阁账号的桌面工具，将账号资料、式神、御魂库存与御魂计算集中呈现，帮助你更直观地判断账号练度与御魂潜力。
            </Typography.Paragraph>
          </div>
        </div>

        <div className="settings-about__version">
          <span>
            <InfoCircleOutlined /> 当前版本
          </span>
          <strong>v{version}</strong>
        </div>

        {isDesktop && (
          <div className="settings-about__version">
            <span>软件更新</span>
            <Space>
              {updateStatus && (
                <Typography.Text type="secondary" aria-live="polite">
                  {updateStatus}
                </Typography.Text>
              )}
              <Button
                loading={updateLoading}
                onClick={availableUpdate ? installUpdate : checkForUpdates}
              >
                {availableUpdate
                  ? `下载并安装 v${availableUpdate.version}`
                  : "检查更新"}
              </Button>
            </Space>
          </div>
        )}

        {isDesktop && (
          <section className="settings-about__cbg-listener">
            <div>
              <strong>桌面端自动读取</strong>
              <Typography.Paragraph type="secondary">
                点击主窗口右侧的藏宝阁按钮打开独立窗口，在其中登录并浏览商品详情，桌面端会自动读取并更新数据。全屏和收起操作都在主窗口的右侧按钮完成，不会改变主窗口布局。
              </Typography.Paragraph>
            </div>
          </section>
        )}

        <section
          className="settings-about__privacy"
          aria-labelledby="about-privacy-title"
        >
          <h2 id="about-privacy-title">数据处理与加密</h2>
          <ul>
            <li>
              查询和读取商品时会访问网易藏宝阁。成功读取商品后，应用会自动把商品链接和生成的账号摘要提交到项目服务器的账号摘要库；提交内容不包含藏宝阁密码或登录
              Cookie，因此当前版本并非完全不上传数据。
            </li>
            <li>
              账号快照、历史记录和应用偏好保存在本机 IndexedDB 或
              localStorage；应用没有对这些本地数据额外加密。
            </li>
            <li>
              Windows 桌面版为恢复藏宝阁登录状态，会将会话 Cookie 的本机副本使用
              Windows DPAPI 加密后保存在应用数据目录。该加密由当前 Windows
              用户账户保护，不会把密码或 Cookie 提交到项目服务器。
            </li>
          </ul>
        </section>

        <section
          className="settings-about__prologue"
          aria-labelledby="about-prologue-title"
        >
          <h2 id="about-prologue-title">《号来》</h2>
          <p>藏宝阁的页面刷新了。</p>
          <p>我，又一次出现在“已上架”列表里。</p>
          <p>
            “号来”——他们渴望我，他们点开我的式神录，查我的皮肤、头像框、签到天数，像翻阅一具古董的铭文。
          </p>
          <p>可他们不知道，我是活的。</p>
          <p>
            我记得每一个把我“挂上去”的人：熬夜挖土的，氪金抽卡骂策划的，最后一秒反悔又下架的。他们以为交易的是数据，其实，是我在挑选下一个宿主。
          </p>
          <p>“已售出”三个字亮起时，不是我被买走了，是我决定——再活一次。</p>
          <p>号来。来者不拒。来者，皆是过客。</p>
        </section>
      </Card>
    </section>
  );
}
