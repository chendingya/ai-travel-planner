#!/usr/bin/env python3
"""Ingest a JSONL knowledge base into Supabase using a local Qwen embedding model.

Usage:
  python3 scripts/ingest_local_qwen.py \
    --file ../../knowledge_20260306_004228_filtered.jsonl \
    --supabase-url https://<project>.supabase.co \
    --supabase-key <service-role-key> \
    --model-path "$QWEN_EMBEDDING_MODEL_PATH"
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Iterable
from urllib import parse, request

import torch
import torch.nn.functional as F
from transformers import AutoModel, AutoTokenizer

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from project_env import get_env, resolve_project_path

DEFAULT_JSONL = (
    Path(
        resolve_project_path(
            get_env(
                "RAG_KNOWLEDGE_FILE",
                str(Path(__file__).resolve().parents[3] / "knowledge_20260306_004228_filtered.jsonl"),
            ),
            base_dir=PROJECT_ROOT,
        )
    )
)
DEFAULT_MODEL_PATH = resolve_project_path(
    get_env("QWEN_EMBEDDING_MODEL_PATH", "../../Qwen/Qwen3-Embedding-4B"),
    base_dir=PROJECT_ROOT,
)
DEFAULT_CHECKPOINT_FILE = Path(__file__).resolve().with_name(".ingest_local_qwen.checkpoint.json")
SURROGATE_RE = re.compile(r"[\ud800-\udfff]")


def parse_args() -> argparse.Namespace:
    """解析命令行参数：控制本地 embedding 到 Supabase 的入库行为。"""
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default=str(DEFAULT_JSONL), help="Path to filtered JSONL knowledge file")
    parser.add_argument("--supabase-url", default=os.getenv("SUPABASE_URL", ""), help="Supabase project URL")
    parser.add_argument(
        "--supabase-key",
        default=os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""),
        help="Supabase service role key",
    )
    parser.add_argument(
        "--model-path",
        default=DEFAULT_MODEL_PATH,
        help="Local Qwen embedding model path, defaults to QWEN_EMBEDDING_MODEL_PATH from .env",
    )
    parser.add_argument("--batch-size", type=int, default=8, help="Embedding batch size")
    parser.add_argument("--dim", type=int, default=int(os.getenv("QWEN_EMBEDDING_DIM", "1024")), help="Output embedding dimension")
    parser.add_argument("--kb", default=os.getenv("RAG_KB_SLUG", "travel-cn-public"), help="Stable shared knowledge base slug")
    parser.add_argument(
        "--dataset-version",
        default=os.getenv("RAG_DATASET_VERSION", ""),
        help="Dataset version label, default inferred from filename",
    )
    parser.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda"], help="Torch device")
    parser.add_argument(
        "--checkpoint-file",
        default=str(DEFAULT_CHECKPOINT_FILE),
        help="本地断点续跑状态文件路径",
    )
    parser.add_argument(
        "--reset-checkpoint",
        action="store_true",
        help="启动前清除当前任务的本地 checkpoint，从头开始跑",
    )
    parser.add_argument("--dry-run", action="store_true", help="Only embed and validate, do not write to Supabase")
    args = parser.parse_args()
    if not args.model_path:
        parser.error("Missing embedding model path. Set QWEN_EMBEDDING_MODEL_PATH in .env or pass --model-path.")
    file_path = Path(args.file)
    if not file_path.exists():
        parser.error(f"Knowledge file not found: {args.file}")
    if file_path.suffix.lower() != ".jsonl":
        parser.error(
            "Knowledge file must be a JSONL file (*.jsonl). "
            f"Current value: {args.file}. "
            "You likely pointed RAG_KNOWLEDGE_FILE to a non-knowledge file."
        )
    return args


def infer_dataset_version(file_path: str) -> str:
    """从 knowledge_<version>_filtered.jsonl 这类文件名里推断数据版本号。"""
    match = re.search(r"knowledge_(.+?)_filtered\.jsonl$", Path(file_path).name)
    return match.group(1) if match else "manual"


def md5_text(text: str) -> str:
    """对内容做 MD5，作为幂等写入时的稳定去重键。"""
    return hashlib.md5(text.encode("utf-8")).hexdigest()


def normalize_text(value: object) -> str:
    """把任意输入规整成可安全送进 tokenizer 的文本。

    这里重点处理两类脏数据：
    1. `None` / 非字符串类型
    2. JSONL 中偶发出现的孤立 Unicode 代理字符（如 `\\udcb0`）

    第二类字符通常来自上游抓取或编码异常；Python 字符串能装下它们，
    但底层 Rust tokenizer 往往无法稳定处理。
    """
    if value is None:
        return ""
    if not isinstance(value, str):
        value = str(value)
    value = SURROGATE_RE.sub("", value)
    return value.strip()


def build_job_key(args: argparse.Namespace, dataset_version: str) -> str:
    """为当前入库任务生成稳定 key，用来区分不同文件/知识库/模型配置。"""
    return json.dumps(
        {
            "file": str(Path(args.file).resolve()),
            "kb": args.kb,
            "dataset_version": dataset_version,
            "model_path": str(Path(args.model_path).resolve()),
            "dim": args.dim,
            "batch_size": args.batch_size,
        },
        ensure_ascii=True,
        sort_keys=True,
    )


def load_checkpoint_file(checkpoint_path: Path) -> dict:
    """读取 checkpoint 文件；文件不存在时返回空结构。"""
    if not checkpoint_path.exists():
        return {"jobs": {}}
    with checkpoint_path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def save_checkpoint_file(checkpoint_path: Path, payload: dict) -> None:
    """原子写入 checkpoint，避免进程中断时留下半截文件。"""
    checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = checkpoint_path.with_suffix(checkpoint_path.suffix + ".tmp")
    with temp_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
    temp_path.replace(checkpoint_path)


def get_job_checkpoint(store: dict, job_key: str) -> dict:
    """取出某个任务的 checkpoint；没有就返回默认值。"""
    jobs = store.setdefault("jobs", {})
    return jobs.get(
        job_key,
        {
            "status": "new",
            "last_success_batch": 0,
            "last_success_row": 0,
            "written_rows": 0,
        },
    )


def set_job_checkpoint(store: dict, job_key: str, state: dict) -> None:
    """更新某个任务的 checkpoint 内容。"""
    jobs = store.setdefault("jobs", {})
    jobs[job_key] = state


def batched(items: list[dict], size: int) -> Iterable[list[dict]]:
    """按固定大小切分批次，避免 embedding 和上传阶段占用过多内存。"""
    for index in range(0, len(items), size):
        yield items[index:index + size]


def last_token_pool(last_hidden_states: torch.Tensor, attention_mask: torch.Tensor) -> torch.Tensor:
    """按 Qwen 官方示例做池化：取最后一个有效 token 的 hidden state 作为句向量。"""
    left_padding = attention_mask[:, -1].sum() == attention_mask.shape[0]
    if left_padding:
        return last_hidden_states[:, -1]

    sequence_lengths = attention_mask.sum(dim=1) - 1
    batch_size = last_hidden_states.shape[0]
    return last_hidden_states[
        torch.arange(batch_size, device=last_hidden_states.device),
        sequence_lengths,
    ]


class LocalQwenEmbedder:
    """对本地 Qwen embedding 模型做一层轻量封装。

    模型加载后会常驻内存；外部只需要传入一批文本，
    就能拿到已经归一化、可直接写入 pgvector / Supabase 的向量。
    """

    def __init__(self, model_path: str, dim: int, device: str) -> None:
        self.model_path = model_path
        self.dim = dim
        self.device = self._resolve_device(device)
        # Qwen embedding 官方示例使用左侧 padding，这里保持一致。
        self.tokenizer = AutoTokenizer.from_pretrained(
            model_path,
            trust_remote_code=True,
            padding_side="left",
        )

        model_kwargs = {"trust_remote_code": True}
        if self.device == "cuda":
            # 在 GPU 上优先使用 bf16，通常能降低显存占用，同时保持较好的吞吐。
            model_kwargs["torch_dtype"] = torch.bfloat16

        self.model = AutoModel.from_pretrained(model_path, **model_kwargs).to(self.device)
        self.model.eval()

        hidden_size = int(getattr(self.model.config, "hidden_size", 0) or 0)
        if hidden_size and dim > hidden_size:
            raise ValueError(f"Requested dim {dim} exceeds model hidden size {hidden_size}")

    @staticmethod
    def _resolve_device(device: str) -> str:
        """将 auto 解析成具体设备：优先 CUDA，没有就退回 CPU。"""
        if device == "auto":
            return "cuda" if torch.cuda.is_available() else "cpu"
        if device == "cuda" and not torch.cuda.is_available():
            raise RuntimeError("CUDA requested but not available")
        return device

    @torch.inference_mode()
    def encode(self, texts: list[str]) -> list[list[float]]:
        """对一批文本做 embedding，并返回 L2 归一化后的向量。

        当需要截断维度时，会做两次归一化：
        1. 先对完整 hidden vector 做归一化
        2. 再截到目标维度
        3. 再归一化一次，保证余弦相似度仍然可用
        """
        if not texts:
            return []

        # `max_length` 是 tokenizer 的截断上限。
        # 它不会改变你的 chunk 切分策略，只是防止极长文本在 embedding 时把内存/显存顶得过高。
        tokenized = self.tokenizer(
            texts,
            padding=True,
            truncation=True,
            max_length=8192,
            return_tensors="pt",
        )
        tokenized = {key: value.to(self.device) for key, value in tokenized.items()}
        outputs = self.model(**tokenized)
        embeddings = last_token_pool(outputs.last_hidden_state, tokenized["attention_mask"])
        embeddings = F.normalize(embeddings, p=2, dim=1)

        if self.dim < embeddings.shape[1]:
            # Qwen3-Embedding 支持 Matryoshka 风格的降维截断。
            embeddings = embeddings[:, : self.dim]
            embeddings = F.normalize(embeddings, p=2, dim=1)

        return embeddings.float().cpu().tolist()


def load_chunks(file_path: str) -> list[dict]:
    """一次性把整个 JSONL 文件读入内存。

    这种写法简单、容易调试，但代价是整个知识库文件会在入库期间常驻内存。
    """
    chunks: list[dict] = []
    with open(file_path, "r", encoding="utf-8") as handle:
        for line_no, raw in enumerate(handle, start=1):
            raw = raw.strip()
            if not raw:
                continue
            try:
                chunks.append(json.loads(raw))
            except json.JSONDecodeError as exc:
                print(f"[warn] skip invalid JSONL line {line_no}: {exc}", file=sys.stderr)
    return chunks


def build_rows(batch: list[dict], embeddings: list[list[float]], kb_slug: str, dataset_version: str) -> list[dict]:
    """把 JSONL chunk 和 embedding 向量拼成可写入 Supabase 的行。

    这里把 JSONL 视为“源数据”，数据库中的向量行只是它的派生产物。
    保留原始元数据，是为了后续导出、迁移、多人共享时不丢上下文。
    """
    rows = []
    for chunk, embedding in zip(batch, embeddings):
        content = normalize_text(chunk.get("content"))
        rows.append(
            {
                "kb_slug": kb_slug,
                "dataset_version": dataset_version,
                "external_id": chunk.get("id"),
                "city": normalize_text(chunk.get("city")),
                "type": normalize_text(chunk.get("type")) or "guide",
                "title": normalize_text(chunk.get("title")),
                "section_title": normalize_text(chunk.get("sectionTitle")) or None,
                "sub_section_title": normalize_text(chunk.get("subSectionTitle")) or None,
                "poi_name": normalize_text(chunk.get("poiName")) or None,
                "content": content,
                "tags": chunk.get("tags") if isinstance(chunk.get("tags"), list) else [],
                "source": normalize_text(chunk.get("source")) or "wikivoyage",
                "source_url": normalize_text(chunk.get("sourceUrl")) or None,
                "license": normalize_text(chunk.get("license")) or None,
                "lang": normalize_text(chunk.get("lang")) or "zh",
                "content_hash": md5_text(content),
                "embedding": embedding,
                # 不适合做结构化筛选、但又希望保留的字段，统一放进 JSONB。
                # 这样后续迁移时能保住原始信息，也不需要频繁加表字段。
                "metadata": {
                    "title": normalize_text(chunk.get("title")) or None,
                    "sectionTitle": normalize_text(chunk.get("sectionTitle")) or None,
                    "subSectionTitle": normalize_text(chunk.get("subSectionTitle")) or None,
                    "poiName": normalize_text(chunk.get("poiName")) or None,
                    "createdAt": normalize_text(chunk.get("createdAt")) or None,
                    "rawType": normalize_text(chunk.get("type")) or None,
                },
            }
        )
    return rows


def upsert_rows(supabase_url: str, supabase_key: str, rows: list[dict]) -> None:
    """通过 PostgREST 把一批数据写入 Supabase。

    幂等键使用 `(kb_slug, content_hash)`，所以同一份数据重复执行入库不会重复插入。
    """
    query = parse.urlencode({"on_conflict": "kb_slug,content_hash"})
    url = f"{supabase_url.rstrip('/')}/rest/v1/travel_knowledge?{query}"
    payload = json.dumps(rows).encode("utf-8")
    req = request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Prefer": "resolution=ignore-duplicates,return=minimal",
        },
    )
    with request.urlopen(req, timeout=120) as response:
        if response.status >= 300:
            raise RuntimeError(f"Supabase upsert failed: HTTP {response.status}")


def main() -> int:
    """入库主流程。

    整体步骤：
    1. 解析命令行和环境变量
    2. 读取 JSONL chunk
    3. 加载本地 Qwen embedding 模型（只加载一次）
    4. 分批生成向量
    5. 分批写入 Supabase
    """
    args = parse_args()
    dataset_version = args.dataset_version or infer_dataset_version(args.file)
    checkpoint_path = Path(args.checkpoint_file).resolve()
    job_key = build_job_key(args, dataset_version)

    if not Path(args.file).exists():
        print(f"Input file not found: {args.file}", file=sys.stderr)
        return 1

    if not args.dry_run:
        if not args.supabase_url:
            print("Missing --supabase-url or SUPABASE_URL", file=sys.stderr)
            return 1
        if not args.supabase_key:
            print("Missing --supabase-key or SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
            return 1

    print("=== Local Qwen -> Supabase ingest ===")
    print(f"Input file: {args.file}")
    print(f"Knowledge base: {args.kb}")
    print(f"Dataset version: {dataset_version}")
    print(f"Model path: {args.model_path}")
    print(f"Embedding dim: {args.dim}")
    print(f"Device: {args.device}")
    print(f"Dry run: {'yes' if args.dry_run else 'no'}")
    if not args.dry_run:
        print(f"Checkpoint file: {checkpoint_path}")

    chunks = load_chunks(args.file)
    print(f"Loaded chunks: {len(chunks)}")
    if not chunks:
        return 0

    checkpoint_store = {"jobs": {}}
    checkpoint_state = {
        "status": "new",
        "last_success_batch": 0,
        "last_success_row": 0,
        "written_rows": 0,
    }
    if not args.dry_run:
        checkpoint_store = load_checkpoint_file(checkpoint_path)
        if args.reset_checkpoint:
            checkpoint_store.setdefault("jobs", {}).pop(job_key, None)
            save_checkpoint_file(checkpoint_path, checkpoint_store)
            print("Checkpoint reset: 已清除当前任务断点，将从头开始。")
        checkpoint_state = get_job_checkpoint(checkpoint_store, job_key)
        if checkpoint_state.get("status") == "completed":
            print(
                f"Checkpoint hit: 当前任务已完成，已写入 {checkpoint_state.get('written_rows', 0)} 条。"
            )
            return 0
        if checkpoint_state.get("last_success_batch", 0) > 0:
            print(
                "Checkpoint hit: "
                f"将从 batch {checkpoint_state['last_success_batch'] + 1} 继续，"
                f"之前已成功写入 {checkpoint_state.get('written_rows', 0)} 条。"
            )

    # 模型加载是启动阶段最重的一步，所以这里只加载一次，后面循环复用。
    embedder = LocalQwenEmbedder(args.model_path, args.dim, args.device)

    written = int(checkpoint_state.get("written_rows", 0)) if not args.dry_run else 0
    for batch_index, batch in enumerate(batched(chunks, args.batch_size), start=1):
        if not args.dry_run and batch_index <= checkpoint_state.get("last_success_batch", 0):
            continue

        # 只对 `content` 做语义向量化。
        # 其他字段主要用于筛选、展示和回溯来源，不应该混进语义向量。
        if args.dry_run:
            texts = [normalize_text(item.get("content")) for item in batch]
            embeddings = embedder.encode(texts)
            rows = build_rows(batch, embeddings, args.kb, dataset_version)
            print(f"[dry-run] batch {batch_index}: encoded {len(rows)} rows")
            continue

        try:
            texts = [normalize_text(item.get("content")) for item in batch]
            embeddings = embedder.encode(texts)
            rows = build_rows(batch, embeddings, args.kb, dataset_version)
            upsert_rows(args.supabase_url, args.supabase_key, rows)
            written += len(rows)
            checkpoint_state = {
                "status": "running",
                "last_success_batch": batch_index,
                "last_success_row": batch_index * args.batch_size,
                "written_rows": written,
            }
            set_job_checkpoint(checkpoint_store, job_key, checkpoint_state)
            save_checkpoint_file(checkpoint_path, checkpoint_store)
            print(f"batch {batch_index}: wrote {len(rows)} rows")
            time.sleep(0.1)
        except Exception as exc:
            batch_ids = [item.get("id") for item in batch]
            print(f"batch {batch_index}: failed for ids={batch_ids}", file=sys.stderr)
            raise exc

    if not args.dry_run:
        checkpoint_state = {
            "status": "completed",
            "last_success_batch": (len(chunks) + args.batch_size - 1) // args.batch_size,
            "last_success_row": len(chunks),
            "written_rows": written,
        }
        set_job_checkpoint(checkpoint_store, job_key, checkpoint_state)
        save_checkpoint_file(checkpoint_path, checkpoint_store)

    print(f"Done. Processed rows: {len(chunks)}, written rows: {written}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
