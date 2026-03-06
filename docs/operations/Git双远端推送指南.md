# Git 双 Remote 推送指南（GitHub + ModelScope）

本文档适用于本项目当前仓库结构：

- GitHub remote：`origin`
- ModelScope remote：`modelscope`
- 主开发分支：`main`
- ModelScope 还存在历史分支：`master`（可能受保护）

## 1. 一次性检查（首次或环境变更后）

```bash
git remote -v
git branch -vv
```

你应该看到：

- `origin` 指向 GitHub
- `modelscope` 指向 ModelScope
- 当前工作分支是 `main`

## 2. 日常提交与双端推送（推荐）

只在 `main` 开发，推送顺序固定：先 GitHub，再 ModelScope。

```bash
# 1) 确认在 main
git checkout main
git pull --rebase origin main

# 2) 提交
git add .
git commit -m "你的提交说明"

# 3) 先推 GitHub
git push origin main

# 4) 再推 ModelScope main
git push modelscope main
```

## 3. 如果你还需要同步 ModelScope 的 master

### 场景 A：master 允许 force push

```bash
git push modelscope main:master --force-with-lease
```

### 场景 B：master 是受保护分支（常见）

报错特征：

- `You are not allowed to force push code to a protected branch`

此时不要强推，改用“快照同步提交”（不改写历史）：

```bash
# 1) 拉取远端 master
git fetch modelscope master

# 2) 从远端 master 建临时同步分支
git checkout -B sync-master modelscope/master

# 3) 把 main 的文件树覆盖到当前分支
git read-tree --reset -u main

# 4) 生成一次同步提交
git commit -m "chore(sync): align master snapshot with main"

# 5) 正常推送到 modelscope/master（非 force）
git push modelscope HEAD:master

# 6) 回到 main
git checkout main
```

说明：

- 这样 `master` 与 `main` 的“代码内容”一致。
- 但两者提交哈希可能不同（这是正常的）。

## 4. 快速验证是否同步成功

```bash
git ls-remote --heads modelscope main master
git log -1 --oneline --decorate
```

若你要验证 `main` 与 `sync-master` 内容一致，可看 tree hash：

```bash
git rev-parse 'main^{tree}' 'sync-master^{tree}'
```

两个 hash 相同即代表代码内容相同。

## 5. 常见问题与处理

### 问题 1：`protected branch` 拒绝 force push

不是本地问题，不能绕过。可选：

1. 走上面“场景 B”快照同步
2. 去仓库设置放开保护规则后再 force push
3. 走 MR 合并流程

### 问题 2：推送时认证失败

检查 remote URL 中 token/凭据是否有效：

```bash
git remote -v
```

必要时更新 remote URL 或重新登录凭据管理器。

### 问题 3：`index.lock` / `FETCH_HEAD` 权限报错

先确认没有其他 Git 进程占用，再重试命令。

## 6. 推荐团队约定

1. 日常只维护 `main`，`master` 仅作为兼容分支。
2. 每次发布后再决定是否同步 `master`。
3. 若平台允许，最终可删除 `master`，避免长期分叉维护成本。
