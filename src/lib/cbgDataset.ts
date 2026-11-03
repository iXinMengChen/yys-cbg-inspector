import type {
  CbgPayloadConversionOptions,
  GameConfig,
  RelicDataset,
} from "@/types";

type DatasetConversionWorkerResponse =
  | { type: "result"; dataset: RelicDataset }
  | { type: "error"; message: string };

/**
 * 在 Worker 内把藏宝阁原始数据转换成页面使用的数据集。
 *
 * 为什么必须放在 Worker 里：藏宝阁商品整包（含御魂详情）单次可达数十 MB，
 * 在主线程解析或转换会让界面连续掉帧。因此这里把原始字符串（或已解析对象）
 * 直接交给 Worker，解析和转换都发生在后台线程。
 *
 * 每次调用独立创建并销毁 Worker：数据集本身很大，常驻线程会长期持有上一次的
 * 数据副本，反而增加内存压力。Worker 创建失败时 Promise 会 reject，由调用方
 * 决定提示文案，不在这里做静默降级，避免把主线程转换重新引回来。
 */
export function convertCbgPayloadInWorker(
  payload: unknown,
  gameConfig: GameConfig,
  options: CbgPayloadConversionOptions = {},
): Promise<RelicDataset> {
  return new Promise<RelicDataset>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./cbgDataset.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch (error) {
      reject(error);
      return;
    }

    // Worker 只能被关闭一次：成功、失败、消息通道异常都走同一个收尾函数。
    const finish = () => worker.terminate();

    worker.onmessage = (
      event: MessageEvent<DatasetConversionWorkerResponse>,
    ) => {
      finish();
      if (event.data.type === "error") {
        reject(new Error(event.data.message));
        return;
      }
      resolve(event.data.dataset);
    };
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || "账号数据转换失败"));
    };
    worker.onmessageerror = () => {
      finish();
      reject(new Error("账号数据转换结果读取失败"));
    };

    try {
      worker.postMessage({
        payload,
        gameConfig,
        accountOnly: Boolean(options.accountOnly),
      });
    } catch (error) {
      finish();
      reject(error);
    }
  });
}
