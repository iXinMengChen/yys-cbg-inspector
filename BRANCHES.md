# 分支说明

本仓库同时保存了两条产品线，且**历史彼此独立**（没有共同祖先提交），因此分支之间不能直接合并或对比。请按目标形态选择分支。

## 分支一览

| 分支              | 形态               | 技术栈                    | 状态                     | 入口                         |
| ----------------- | ------------------ | ------------------------- | ------------------------ | ---------------------------- |
| `nextjs-refactor` | Web 全栈应用       | Next.js + Prisma + 服务端 | GitHub 默认分支          | `app/`、`server/`、`prisma/` |
| `tauri`           | 桌面应用           | Tauri 2 + React + Vite    | **活跃开发**（当前主力） | `src/`、`src-tauri/`         |
| `electron`        | 桌面应用（旧实现） | Electron                  | 已冻结，不再加功能       | `src/`、`electron` 相关脚本  |

## 历史关系

| 分支                 | 根提交                                 |
| -------------------- | -------------------------------------- |
| `tauri` / `electron` | `a2a03d0` chore: initialize repository |
| `nextjs-refactor`    | `34164d6` chore: initialize repository |

两条根提交不同，`git merge-base tauri origin/nextjs-refactor` 为空。这意味着：

- 不能跨分支直接 `merge`/`rebase`，也不能用两点的 `git diff A..B` 做有意义的比较；
- 想在两者之间搬代码，只能手工迁移或用 `git checkout <branch> -- <path>` 挑文件；
- 长期看，两条线拆成两个仓库会更清晰（或统一历史后再合并）。

## 版本标签

标签打在 `package.json` 首次出现该版本号的提交上，回溯某个 beta 版请直接 `git checkout v1.0.0-beta.N`。

| 标签            | 提交      |
| --------------- | --------- |
| `v1.0.0-beta.1` | `a2a03d0` |
| `v1.0.0-beta.2` | `13e0a2b` |
| `v1.0.0-beta.3` | `70409c6` |
| `v1.0.0-beta.4` | `3bb9945` |
| `v1.0.0-beta.5` | `5ca431a` |
| `v1.0.0-beta.6` | `c24517a` |
| `v1.0.0-beta.7` | `ce2e266` |

`ce2e266` 之后的提交（账号匹配、性能修复等）尚未发版，版本号仍为 beta.7。

## 提交信息约定

沿用 `AGENTS.md` §15：标题写清动作与范围，正文列出关键改动、影响端（Web / Electron / Tauri）、兼容性注意点和验证结果。

历史提交里有不少「正式发布第六个测试版」「新增渠道服」这类自由标题，检索和生成变更日志时不便，新提交请带上 `feat:` / `fix:` / `perf:` / `chore:` 前缀。
