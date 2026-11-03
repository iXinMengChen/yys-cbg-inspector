import type { RelicDataset } from "@/types";
import { getRelicAnalysis } from "./homeAnalysis";

function displayCount(value: number | undefined) {
  return value === undefined ? undefined : value.toLocaleString("zh-CN");
}

export async function buildAccountSummary(dataset: RelicDataset) {
  const analysis = await getRelicAnalysis(dataset);
  const account = dataset.account || {};
  const relicTotal = account.relicSummary ?? analysis.relicCount;
  const identity = [
    account.title,
    account.name,
    account.serverName,
    account.level !== undefined && `${account.level} 级`,
    account.price !== undefined &&
      `¥${account.price.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ");
  const firstSpeed = [
    account.scatteredFirstSpeed !== undefined &&
      `散件 ${account.scatteredFirstSpeed.toFixed(2)}`,
    account.luckyFirstSpeed !== undefined &&
      `招财 ${account.luckyFirstSpeed.toFixed(2)}`,
    (account.speedHeadCount !== undefined ||
      account.speedTailCount !== undefined) &&
      `满速头/尾 ${account.speedHeadCount ?? "未知"}/${account.speedTailCount ?? "未知"}`,
  ]
    .filter((value): value is string => Boolean(value))
    .join("；");
  const resources = [
    account.stamina !== undefined && `体力 ${displayCount(account.stamina)}`,
    account.money !== undefined && `金币 ${displayCount(account.money)}`,
    account.soulJade !== undefined && `勾玉 ${displayCount(account.soulJade)}`,
    account.summonPower !== undefined &&
      `抽卡能力 ${displayCount(account.summonPower)} 抽`,
    account.mysteryTalisman !== undefined &&
      `神秘符咒 ${displayCount(account.mysteryTalisman)} 张`,
    account.realityTalisman !== undefined &&
      `现世符咒 ${displayCount(account.realityTalisman)} 张`,
    account.yuxingDama !== undefined &&
      `御行达摩 ${displayCount(account.yuxingDama)} 个`,
    `御魂 ${displayCount(relicTotal)} 件`,
    account.heroSummary !== undefined &&
      `式神 ${displayCount(account.heroSummary)} 个`,
    account.maxLevelRelicCount !== undefined &&
      `满级御魂 ${displayCount(account.maxLevelRelicCount)} 件`,
  ]
    .filter((value): value is string => Boolean(value))
    .join("；");
  const pvePanel = [
    analysis.pveSuitScoreRanking.length > 0 &&
      analysis.pveSuitScoreRanking
        .slice(0, 5)
        .map(
          ({ suitName, totalScore, relicCount }) =>
            `${suitName} ${totalScore} 分/${relicCount} 件`,
        )
        .join("、"),
  ]
    .filter((value): value is string => Boolean(value))
    .join("；");
  const speedPanel = analysis.suiteSpeeds
    .slice(0, 5)
    .map(({ suitName, speed }) => `${suitName} ${speed.toFixed(2)}`)
    .join("、");
  const fields = [
    identity && `账号：${identity}`,
    `一速：${firstSpeed || "暂无数据"}`,
    `风姿度：${displayCount(account.fengzidu) ?? "未知"}`,
    `资源：${resources || "暂无数据"}`,
    `PVE面板：${pvePanel || "暂无数据"}`,
    `速度面板：${speedPanel || "暂无数据"}`,
  ].filter((field): field is string => Boolean(field));

  return fields.join("\n");
}
