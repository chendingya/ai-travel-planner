# Qwen3.5-2B-Base 工具调用训练计划

## 摘要
- 目标模型通过 `TRAINING_MODEL_PATH` 配置
- 训练环境固定为：`conda activate llm`
- 本目录用于承载后续完整路线：工具调用能力评测 -> SFT QLoRA -> RL 强化 -> 旅游规划任务落地
- 当前阶段先产出目录骨架和本计划文档，不创建训练脚本
- 训练脚本优先读取 `training/.env`，其次项目根 `.env`、`backend/.env`，同时允许 CLI 参数覆盖
- backend 本地 Qwen 脚本只读取项目根 `.env` 和 `backend/.env`，避免 training 配置串扰

## 目录约定
- `training/README.md`
  - 训练工作的总入口文档，负责计划、约定和持续实验记录
- `training/eval/`
  - 后续放工具调用基线评测脚本与结果汇总脚本
- `training/data/`
  - 后续放数据下载、清洗、格式转换脚本
- `training/sft/`
  - 后续放 QLoRA SFT 训练代码、配置和启动脚本
- `training/rl/`
  - 后续放 GRPO/RLHF 相关代码和奖励函数
- `training/artifacts/`
  - 后续放评测结果摘要、训练配置快照，不放大模型权重

## 当前目标
1. 评测 base model 的工具调用能力
2. 通过 SFT 让模型学会稳定输出合法工具调用
3. 通过 RL 提升多步工具使用和旅游规划完成率
4. 最终对接现有旅游工具链 `bing / amap / 12306`

## 项目约束
- 只使用 `llm` 环境
- 本地模型优先，不依赖远程商用模型
- 第一版优先做离线可复现 benchmark
- 后续接真实 API 前，先用 mock tool environment

## 阶段计划
### Phase 0: 环境检查与依赖补齐
- 补装 `datasets`、`trl`、`jsonschema`
- 验证 `llm` 环境可加载 Qwen3.5 `tokenizer / config / model`
- 环境检查脚本固定放在 `training/eval/check_llm_env.py`
- 路径配置示例固定放在 `training/.env.example`
- 推荐命令：
  - `conda activate llm`
  - `python training/eval/check_llm_env.py --check-model`
  - `python training/eval/check_llm_env.py --check-model --output training/artifacts/phase0_env_check.json`

### Phase 1: 工具调用基线评测
- 实现单轮 function-calling 评测
- 实现多轮 tool trajectory 回放评测
- 输出 `summary.json / predictions.jsonl / failures.jsonl`
- 单轮 BFCL 评测脚本先放在 `training/eval/eval_bfcl_simple.py`
- 第一版先覆盖 `BFCL_v3_simple.json`，再扩展到多轮子集

### Phase 2: 数据准备
- 引入 BFCL、ToolACE、xLAM/APIGen 类数据
- 统一转换为 Qwen3.5 chat template 所需格式
- 单独整理旅游工具 schema 和旅游任务样本

### Phase 3: SFT QLoRA
- 先训练通用工具调用能力
- 再混入旅游任务数据
- 对比 base model 与 SFT model 的评测指标

### Phase 4: RL
- 先做基于规则奖励的 GRPO
- 奖励围绕工具名、参数、schema、调用次数、最终答案结构
- 只在 mock tool 环境中验证

### Phase 5: 旅游任务接入
- 映射到现有 MCP 工具
- 验证真实旅游规划场景

## 工具与数据约定
### 目标工具 schema
统一目标工具 schema 先收敛为：
- `search_web`
- `search_map_poi`
- `query_train_tickets`

未来与现有后端工具的映射关系：
- `search_web` -> `bing-cn-mcp-server`
- `search_map_poi` -> `amap-maps`
- `query_train_tickets` -> `12306-mcp`

### 评测与训练数据
- 评测基准优先：`BFCL v3`
- 训练数据优先：`ToolACE`
- 训练数据补充：`xLAM / APIGen` 类 function-calling 数据

### 数据来源与许可证
后续引入任何数据集时，统一在本节补充以下内容：

| 名称 | 用途 | 来源链接 | License | 本地落盘位置 | 备注 |
| --- | --- | --- | --- | --- | --- |
| BFCL v3 | 基线评测 | 待补充 | 待补充 | 待补充 | 待补充 |
| ToolACE | SFT 训练 | 待补充 | 待补充 | 待补充 | 待补充 |
| xLAM / APIGen | SFT 数据补充 | 待补充 | 待补充 | 待补充 | 待补充 |

## 评测指标
### 单轮
- `tool_name_accuracy`
- `required_arg_recall`
- `arg_exact_match`
- `schema_valid_rate`
- `hallucinated_tool_rate`

### 多轮
- `trajectory_success_rate`
- `step_tool_accuracy`
- `step_arg_valid_rate`
- `premature_stop_rate`
- `overcalling_rate`

### RAG 检索离线评测
- `intent_city_accuracy`
- `intent_type_accuracy`
- `label_hit_at_1`
- `label_hit_at_3`
- `label_hit_at_5`
- `mrr_label`
- `empty_low_confidence_rate`
- `avg_top1_rerank`
- `avg_candidate_count`

RAG 检索评测的标签文件放在：
- `training/data/rag_eval_seed.jsonl`

当前版本说明：
- 评测集已扩展到 `50` 条
- 检索命中标准已从弱标签切换为 `gold_external_ids`
- 检索、稀疏候选和意图识别均以 `Supabase travel_knowledge` 为数据源，不再依赖本地 JSONL 参与召回
- 稀疏检索已迁移为数据库原生 RPC：`match_travel_knowledge_sparse`
- 当前数据库侧实现基于 `pg_trgm + searchable_text + term hit boost`

RAG 检索评测脚本复用：
- `backend/scripts/test_rag_local_qwen.py`

默认产物目录：
- `training/artifacts/rag_retrieval_eval/<run_name>/summary.json`
- `training/artifacts/rag_retrieval_eval/<run_name>/predictions.jsonl`
- `training/artifacts/rag_retrieval_eval/<run_name>/failures.jsonl`

推荐命令：

```bash
cd /home/wushiwei/projects_z/cdy/RAG/ai-travel-planner

/home/wushiwei/anaconda3/bin/conda run -n llm python backend/scripts/test_rag_local_qwen.py \
  --supabase-url 'YOUR_SUPABASE_URL' \
  --supabase-key 'YOUR_SERVICE_ROLE_KEY' \
  --eval-file training/data/rag_eval_seed.jsonl
```

## 训练配置默认值
第一版默认配置先固定如下，后续每次改动都需要在工作记录区注明原因：

| 配置项 | 默认值 |
| --- | --- |
| quantization | `4-bit NF4` |
| lora_r | `64` |
| lora_alpha | `128` |
| lora_dropout | `0.05` |
| max_seq_length | `2048` |
| per_device_train_batch_size | `2` |
| gradient_accumulation_steps | `16` |
| learning_rate | `2e-4` |
| epoch | `1` |

RL 阶段默认先不做人类偏好标注，优先走规则奖励。

## 默认交付物
每个阶段至少要产出以下内容：

| 阶段 | 最少交付物 |
| --- | --- |
| Phase 0 | 环境检查命令与依赖确认结果 |
| Phase 1 | 可重复运行的评测脚本与结果文件 |
| Phase 2 | 数据转换脚本与统一格式样本 |
| Phase 3 | SFT 训练脚本、配置、checkpoint 说明 |
| Phase 4 | RL 训练脚本、奖励函数、对比结果 |
| Phase 5 | 与旅游工具链联调记录和验证报告 |

## 当前状态
截至 2026-03-12，已确认：
- `llm` 环境可以加载 `TRAINING_MODEL_PATH` 指向的本地 Qwen3.5 config、tokenizer 和 model
- `llm` 环境已补齐 `datasets`、`trl`、`jsonschema`
- `torch`、`transformers`、`peft`、`accelerate`、`bitsandbytes` 已可用
- 本机 CUDA 资源满足后续 QLoRA 和评测需要
- Phase 0 检查结果已落盘到 `training/artifacts/phase0_env_check.json`
- BFCL simple smoke test 已跑通，结果目录为 `training/artifacts/bfcl_simple/20260312_073755`

## 实施说明
- 目录名固定使用 `training`，不使用 `train` 或 `finetune`
- 计划文档固定放在 `training/README.md`，不放进 `docs/`
- 文档语言使用中文，命令、路径、指标名保留英文原文
- 后续脚本创建时，默认按 `eval / data / sft / rl / artifacts` 分目录放置
- 所有本地模型路径优先走 `.env` 或 CLI 参数，不在代码里写死个人绝对路径

## 验收标准
- `training/` 与 `backend/`、`frontend/` 同级
- `training/README.md` 能独立说明模型路径、环境、目标、阶段计划、默认训练配置、实验记录模板
- 后续实现者只看本文件，就能知道下一步该先写哪个脚本、放到哪个子目录、评测哪些指标

## 工作记录
后续每次实验或实现，按以下模板直接追加在本文件末尾，不再单独维护零散笔记：

```md
### YYYY-MM-DD
- 目标：
- 改动：
- 命令：
- 结果：
- 问题：
- 下一步：
```

### 2026-03-12
- 目标：初始化训练目录与总计划文档
- 改动：创建 `training/` 及其子目录；写入本 README
- 命令：`mkdir -p training/{eval,data,sft,rl,artifacts}`
- 结果：训练工作目录骨架已建立，后续工作入口固定为本文件
- 问题：暂无
- 下一步：实现 Phase 0 的环境检查与依赖补齐记录

### 2026-03-12
- 目标：固化 Phase 0 的环境检查入口
- 改动：新增 `training/eval/check_llm_env.py`；补充 README 中的 Phase 0 命令和当前状态
- 命令：`python training/eval/check_llm_env.py --check-model`
- 结果：脚本已就位，并生成 `training/artifacts/phase0_env_check.json`；确认 full model 可加载
- 问题：`datasets`、`trl`、`jsonschema` 仍未安装
- 下一步：补齐缺失依赖，并把检查结果落盘到 `training/artifacts/`

### 2026-03-12
- 目标：完成 Phase 0 并启动 Phase 1 单轮评测
- 改动：在 `llm` 环境安装 `datasets`、`trl`、`jsonschema`；新增 `training/eval/eval_bfcl_simple.py`
- 命令：`python -m pip install datasets trl jsonschema`
- 结果：Phase 0 依赖已补齐；已具备 BFCL simple 单轮评测脚本
- 问题：多轮 BFCL 评测脚本仍未实现
- 下一步：先跑 BFCL simple smoke test，确认输出格式和基础指标

### 2026-03-12
- 目标：验证 BFCL simple 单轮评测脚本可用
- 改动：执行 `training/eval/eval_bfcl_simple.py` 的 smoke test
- 命令：`python training/eval/eval_bfcl_simple.py --max-samples 3`
- 结果：成功生成 `summary.json`、`predictions.jsonl`、`failures.jsonl`；3 条样本 smoke test 指标为 `tool_name_accuracy=0.6667`、`required_arg_recall=0.6000`、`arg_exact_match=0.6667`
- 问题：当前只覆盖 BFCL simple，尚未实现多轮评测和更大样本集运行
- 下一步：实现 BFCL 多轮 loader 与评测脚本

### 2026-03-12
- 目标：移除脚本中的硬编码本机路径
- 改动：新增共享配置模块 `project_env.py` 和 `training/.env.example`；把 `check_llm_env.py`、`eval_bfcl_simple.py`、`ingest_local_qwen.py`、`test_rag_local_qwen.py` 改为优先读取 `.env` 或 CLI 参数
- 命令：`python training/eval/check_llm_env.py --model-path <your-model-path>`；`python training/eval/eval_bfcl_simple.py --model-path <your-model-path>`
- 结果：相关脚本不再依赖个人绝对路径；显式传参模式已验证可运行
- 问题：如果不提供 `.env` 且不传模型参数，训练脚本会直接报缺少路径，这是预期行为
- 下一步：给多轮 BFCL 评测脚本沿用同一套 `project_env.py` 配置入口

### 2026-03-12
- 目标：修复 `RAG_KNOWLEDGE_FILE` 配错导致读取 checkpoint 文件的问题
- 改动：`project_env.py` 增加按作用域加载 env；backend 脚本不再读取 `training/.env`；`ingest_local_qwen.py` 与 `test_rag_local_qwen.py` 新增 `--file` 的存在性和 `.jsonl` 校验
- 命令：`python scripts/test_rag_local_qwen.py --help`、`python -m py_compile ...`
- 结果：配置串扰被隔离，错误文件路径会直接报错，不再静默跑成 0 行
- 问题：如果 `.env` 仍配置为 checkpoint 路径，需要手动改成知识库 `.jsonl`
- 下一步：在 `backend/.env` 设置 `RAG_KNOWLEDGE_FILE` 为正确 JSONL，重新执行 RAG test

### 2026-03-12
- 目标：把 RAG smoke test 扩展为可量化的离线评测
- 改动：为 `backend/scripts/test_rag_local_qwen.py` 增加 `--eval-file / --output-dir / --run-name`；新增 `training/data/rag_eval_seed.jsonl`
- 命令：`python backend/scripts/test_rag_local_qwen.py --eval-file training/data/rag_eval_seed.jsonl`
- 结果：脚本可对标注 query 计算 `Hit@K / MRR / intent accuracy / empty_low_confidence_rate`，并把 `summary.json / predictions.jsonl / failures.jsonl` 写入 `training/artifacts/rag_retrieval_eval/`
- 问题：当前 seed 集仍是第一版，需要继续扩充并人工校对标签
- 下一步：把评测集扩到 50~100 条，并按城市、类型、POI、无答案场景分层统计

### 2026-03-12
- 目标：把 RAG 评测切换到数据库驱动和严格 gold 标注
- 改动：`test_rag_local_qwen.py` 的检索、稀疏候选和城市/POI 词典改为从 Supabase 拉取；评测文件改为 `gold_external_ids` 格式；`training/data/rag_eval_seed.jsonl` 扩展到 50 条
- 命令：`python backend/scripts/test_rag_local_qwen.py --eval-file training/data/rag_eval_seed.jsonl`
- 结果：离线评测已可输出基于 `external_id` 的严格 `Hit@K / MRR`，且不再依赖本地 JSONL 作为召回语料
- 问题：当前 seed 集仍需继续人工扩充和校对，数据库原生 sparse 仍需要在线上服务链路中接入
- 下一步：根据 `failures.jsonl` 分析失败模式，并评估是否把 `match_travel_knowledge_sparse` 接入正式 `ragService`

### 2026-03-12
- 目标：把 RAG 离线评测迁移到数据库原生稀疏检索
- 改动：`rag-setup.sql` 新增 `searchable_text`、`pg_trgm` 索引、`match_travel_knowledge_sparse` RPC；`test_rag_local_qwen.py` 改为直接调用 Supabase sparse RPC，并统一输出 `sparse_score`
- 命令：`python -m py_compile backend/scripts/test_rag_local_qwen.py`；`python backend/scripts/test_rag_local_qwen.py --help`
- 结果：离线评测链路已不再使用客户端 BM25 打分，当前 hybrid 流程变为 `DB sparse RPC + DB dense RPC + RRF + reranker`
- 问题：尚未在真实 Supabase 环境执行 SQL migration 和整链回归
- 下一步：在 Supabase SQL Editor 执行 `rag-setup.sql` 更新后，重跑 50 条评测集并对比 `Hit@1/5/MRR`
