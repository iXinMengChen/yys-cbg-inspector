import { Descriptions, Typography } from "antd";
import type { CbgCandidateMetrics, CbgRoleCandidate } from "@/types";

const { Text } = Typography;

/** 搜索结果时间统一按「月-日 时:分」展示，避免不同页面各写一套格式。 */
export function formatCbgSearchTime(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

export function formatAccountCount(value: number | undefined) {
  return value === undefined ? "—" : value.toLocaleString("zh-CN");
}

/** 详情还没读到时，用这一句说明该行当前状态。 */
export function cbgCandidateStatus(candidate: CbgRoleCandidate) {
  return candidate.detailStatus === "loading"
    ? "读取中"
    : candidate.detailStatus === "error"
      ? "读取失败"
      : "待读取";
}

export function renderCbgMetric(
  candidate: CbgRoleCandidate,
  value: number | undefined,
  format: (value: number | undefined) => string = formatAccountCount,
) {
  const label = candidate.details
    ? format(value)
    : cbgCandidateStatus(candidate);
  return <Text title={candidate.detailError || label}>{label}</Text>;
}

export function renderCbgPanel(
  candidate: CbgRoleCandidate,
  value: string | undefined,
) {
  const label = candidate.details
    ? value || "暂无数据"
    : cbgCandidateStatus(candidate);
  return <Text title={candidate.detailError || label}>{label}</Text>;
}

export function hasPanelData(value: string | undefined) {
  const normalized = value?.trim();
  return Boolean(normalized && normalized !== "暂无数据");
}

/** 结果行展开后的账号详情；搜索结果与本机历史匹配结果共用。 */
export function renderAccountDetailSections({
  account,
  relicCount,
  pvePanel,
  speedPanel,
  note,
}: {
  account?: Partial<CbgCandidateMetrics>;
  relicCount?: number;
  pvePanel?: string;
  speedPanel?: string;
  note?: string;
}) {
  const hasPvePanel = hasPanelData(pvePanel);
  const hasSpeedPanel = hasPanelData(speedPanel);

  return (
    <div className="account-matcher-detail">
      <section className="account-matcher-detail-section">
        <div className="account-matcher-detail-title">账号信息</div>
        <Descriptions size="small" bordered column={3}>
          <Descriptions.Item label="账号">
            {account?.name || account?.title || "暂无数据"}
          </Descriptions.Item>
          <Descriptions.Item label="区服">
            {account?.serverName || "暂无数据"}
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            {account?.listingStatus || "状态未知"}
          </Descriptions.Item>
          <Descriptions.Item label="价格">
            {account?.price === undefined
              ? "未知"
              : "¥" + account.price.toLocaleString("zh-CN")}
          </Descriptions.Item>
          <Descriptions.Item label="等级">
            {account?.level ? account.level + " 级" : "未知"}
          </Descriptions.Item>
          <Descriptions.Item label="风姿度">
            {formatAccountCount(account?.fengzidu)}
          </Descriptions.Item>
        </Descriptions>
      </section>

      <section className="account-matcher-detail-section">
        <div className="account-matcher-detail-title">速度属性</div>
        <Descriptions size="small" bordered column={4}>
          <Descriptions.Item label="散件一速">
            {account?.scatteredFirstSpeed?.toFixed(2) ?? "—"}
          </Descriptions.Item>
          <Descriptions.Item label="招财一速">
            {account?.luckyFirstSpeed?.toFixed(2) ?? "—"}
          </Descriptions.Item>
          <Descriptions.Item label="头数">
            {formatAccountCount(account?.speedHeadCount)}
          </Descriptions.Item>
          <Descriptions.Item label="尾数">
            {formatAccountCount(account?.speedTailCount)}
          </Descriptions.Item>
        </Descriptions>
      </section>

      <section className="account-matcher-detail-section">
        <div className="account-matcher-detail-title">资源</div>
        <Descriptions size="small" bordered column={4}>
          <Descriptions.Item label="体力">
            {formatAccountCount(account?.stamina)}
          </Descriptions.Item>
          <Descriptions.Item label="金币">
            {formatAccountCount(account?.money)}
          </Descriptions.Item>
          <Descriptions.Item label="勾玉">
            {formatAccountCount(account?.soulJade)}
          </Descriptions.Item>
          <Descriptions.Item label="神秘符咒">
            {formatAccountCount(account?.mysteryTalisman)}
          </Descriptions.Item>
          <Descriptions.Item label="现世符咒">
            {formatAccountCount(account?.realityTalisman)}
          </Descriptions.Item>
          <Descriptions.Item label="抽卡数">
            {formatAccountCount(account?.summonPower)}
          </Descriptions.Item>
          <Descriptions.Item label="达摩">
            {formatAccountCount(account?.yuxingDama)}
          </Descriptions.Item>
          <Descriptions.Item label="御魂数量">
            {formatAccountCount(relicCount ?? account?.relicSummary)} 件
          </Descriptions.Item>
          <Descriptions.Item label="满级御魂">
            {formatAccountCount(account?.maxLevelRelicCount)}
          </Descriptions.Item>
        </Descriptions>
      </section>

      {(hasPvePanel || hasSpeedPanel) && (
        <section className="account-matcher-detail-section account-matcher-detail-section-wide">
          <div className="account-matcher-detail-title">御魂面板</div>
          <Descriptions size="small" bordered column={2}>
            {hasPvePanel && (
              <Descriptions.Item label="PVE 面板">{pvePanel}</Descriptions.Item>
            )}
            {hasSpeedPanel && (
              <Descriptions.Item label="速度面板">
                {speedPanel}
              </Descriptions.Item>
            )}
          </Descriptions>
        </section>
      )}

      {note && (
        <section className="account-matcher-detail-section account-matcher-detail-section-wide">
          <div className="account-matcher-detail-title">说明</div>
          <div className="account-matcher-detail-text">{note}</div>
        </section>
      )}
    </div>
  );
}
