import { matchAccountHistory } from "./accountMatcher";
import type {
  AccountMatcherWorkerRequest,
  AccountMatcherWorkerResponse,
} from "./accountMatcher";

const workerScope = globalThis as typeof globalThis & {
  onmessage: (event: MessageEvent<AccountMatcherWorkerRequest>) => void;
  postMessage: (value: AccountMatcherWorkerResponse) => void;
};

workerScope.onmessage = ({ data }) => {
  try {
    workerScope.postMessage({
      type: "result",
      results: matchAccountHistory(data.history, data.criteria),
    });
  } catch (error) {
    workerScope.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "本机历史匹配失败",
    });
  }
};

export {};
