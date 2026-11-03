import { convertCbgPayloadToDataset } from "./relics";
import type { GameConfig, RelicDataset } from "../types";

type DatasetConversionRequest = {
  /** 既接受原始字符串（在 Worker 内解析），也接受已解析的对象。 */
  payload: unknown;
  gameConfig: GameConfig;
  /** 只保留账号概览时跳过御魂库存，用于商品列表这类只展示账号字段的场景。 */
  accountOnly?: boolean;
};

type DatasetConversionResponse =
  | { type: "result"; dataset: RelicDataset }
  | { type: "error"; message: string };

const workerScope = globalThis as typeof globalThis & {
  onmessage: (event: MessageEvent<DatasetConversionRequest>) => void;
  postMessage: (value: DatasetConversionResponse) => void;
};

workerScope.onmessage = ({ data }) => {
  try {
    const payload =
      typeof data.payload === "string"
        ? JSON.parse(data.payload)
        : data.payload;
    workerScope.postMessage({
      type: "result",
      dataset: convertCbgPayloadToDataset(payload, data.gameConfig, {
        accountOnly: Boolean(data.accountOnly),
      }),
    });
  } catch (error) {
    workerScope.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "账号数据转换失败",
    });
  }
};

export {};
