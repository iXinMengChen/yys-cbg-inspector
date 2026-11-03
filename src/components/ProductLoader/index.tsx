import "./index.scss";
import {
  CheckCircleFilled,
  GlobalOutlined,
  HistoryOutlined,
  LinkOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { Button, Input, Tooltip } from "antd";
import type { ProductLoaderProps } from "@/types/layout";

export function ProductLoader({
  value,
  loading,
  history,
  showHistoryTrigger,
  restoreNotice,
  onChange,
  onLoad,
  onOpenHistory,
  onOpenCbgWindow,
  cbgSyncEnabled = true,
  onToggleCbgSync,
}: ProductLoaderProps) {
  const hasHistory = showHistoryTrigger && history.length > 0;
  const hasSideControls = Boolean(onOpenCbgWindow || onToggleCbgSync);

  return (
    <div className="product-loader-root">
      {showHistoryTrigger && (
        <div className="product-loader-intro">
          <span>阴阳师藏宝阁</span>
          <h1>账号查询</h1>
        </div>
      )}
      <div
        className={`product-loader-layout${hasSideControls ? " product-loader-layout--with-tools" : ""}`}
      >
        <div className="product-loader">
          <div
            className={`product-loader-search${hasHistory ? " product-loader-search--with-history" : " product-loader-search--without-history"}`}
          >
            <Input
              value={value}
              allowClear
              prefix={<LinkOutlined />}
              placeholder="粘贴藏宝阁商品链接"
              disabled={loading}
              onChange={(event) => onChange(event.target.value)}
              onPressEnter={onLoad}
            />
            {hasHistory && (
              <Button
                className="product-history-trigger"
                icon={<HistoryOutlined />}
                aria-label="历史记录"
                title="历史记录"
                disabled={loading || history.length === 0}
                onClick={onOpenHistory}
              />
            )}
            <Button
              className="product-loader-read"
              type="primary"
              icon={<ReloadOutlined />}
              loading={loading}
              onClick={onLoad}
            >
              读取链接
            </Button>
          </div>
        </div>
        {hasSideControls && (
          <div className="product-loader-tools">
            {onOpenCbgWindow && (
              <Button
                className="product-loader-cbg"
                icon={<GlobalOutlined />}
                onClick={onOpenCbgWindow}
                title="打开或收起独立藏宝阁窗口"
              >
                藏宝阁
              </Button>
            )}
            {onToggleCbgSync && (
              <div className="product-loader-sync-control">
                <div className="product-loader-sync-heading">
                  <span className="product-loader-sync-label">同步数据</span>
                  <Tooltip
                    title="开启后，在独立藏宝阁窗口浏览账号商品时会自动读取并同步账号数据；关闭后仍可粘贴商品链接手动读取。"
                    trigger={["hover", "focus", "click"]}
                    placement="topRight"
                  >
                    <Button
                      className="product-loader-sync-help"
                      type="text"
                      size="small"
                      icon={<QuestionCircleOutlined />}
                      aria-label="同步数据作用说明"
                    />
                  </Tooltip>
                </div>
                <Button
                  className="product-loader-sync-toggle"
                  type={cbgSyncEnabled ? "primary" : "default"}
                  size="small"
                  aria-label="切换藏宝阁数据自动同步"
                  aria-pressed={cbgSyncEnabled}
                  onClick={() => onToggleCbgSync(!cbgSyncEnabled)}
                >
                  {cbgSyncEnabled ? "已开启" : "已关闭"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
      {restoreNotice && (
        <div className="product-restore-notice" role="status">
          <CheckCircleFilled aria-hidden="true" />
          <span>{restoreNotice}</span>
        </div>
      )}
    </div>
  );
}
