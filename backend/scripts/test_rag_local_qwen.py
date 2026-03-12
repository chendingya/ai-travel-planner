#!/usr/bin/env python3
"""Test RAG ingestion integrity and hybrid retrieval against Supabase.

Pipeline:
1. Parse query intent (city / type / poi)
2. Filter candidates by city/type with fallback scopes
3. Sparse retrieval top-N from Supabase sparse RPC
4. Dense retrieval top-N from Supabase RPC
5. Fuse with RRF
6. Rerank fused candidates with local Qwen reranker
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from urllib import parse, request

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from project_env import get_env, resolve_project_path
from ingest_local_qwen import (
    DEFAULT_JSONL,
    DEFAULT_MODEL_PATH,
    LocalQwenEmbedder,
    infer_dataset_version,
    load_chunks,
    md5_text,
    normalize_text,
)


DEFAULT_RERANKER_PATH = resolve_project_path(get_env("QWEN_RERANKER_MODEL_PATH", ""))
if not DEFAULT_RERANKER_PATH:
    DEFAULT_RERANKER_PATH = resolve_project_path("../../Qwen/Qwen3-Reranker-4B", base_dir=PROJECT_ROOT)
DEFAULT_EVAL_FILE = PROJECT_ROOT / "training" / "data" / "rag_eval_seed.jsonl"
DEFAULT_EVAL_OUTPUT_ROOT = PROJECT_ROOT / "training" / "artifacts" / "rag_retrieval_eval"
DEFAULT_QUERIES = [
    "杭州西湖适合怎么玩？",
    "北京有什么值得去的景点？",
    "义乌有哪些值得吃的美食？",
]
TYPE_KEYWORDS = {
    "food": ["美食", "吃", "餐厅", "小吃", "饮食", "饭店", "馆子", "早餐", "夜宵", "咖啡"],
    "attraction": ["景点", "观光", "景区", "打卡", "去哪玩", "游览", "景观", "门票", "寺", "博物馆"],
    "transport": ["交通", "怎么去", "路线", "公交", "地铁", "高铁", "火车", "机场", "车站", "打车"],
    "shopping": ["购物", "买东西", "商场", "步行街", "商贸", "特产", "伴手礼"],
    "activity": ["活动", "演出", "步行", "徒步", "夜游", "展览", "节庆"],
    "guide": ["攻略", "推荐", "介绍", "怎么玩", "行程", "安排", "几天", "适合"],
    "notice": ["注意", "提醒", "安全", "避坑", "风险", "禁忌", "警示"],
}
TEXT_FIELDS = [
    "city",
    "type",
    "title",
    "sectionTitle",
    "subSectionTitle",
    "poiName",
    "tags",
    "content",
]
WORD_RE = re.compile(r"[A-Za-z0-9]+|[\u4e00-\u9fff]+")

try:
    import jieba  # type: ignore
except ImportError:
    jieba = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--file",
        default=str(DEFAULT_JSONL),
        help="Optional JSONL knowledge file used only for integrity check; retrieval/eval use Supabase data",
    )
    parser.add_argument("--supabase-url", default=os.getenv("SUPABASE_URL", ""), help="Supabase project URL")
    parser.add_argument(
        "--supabase-key",
        default=os.getenv("SUPABASE_SERVICE_ROLE_KEY", "") or os.getenv("SUPABASE_ANON_KEY", ""),
        help="Supabase key, service role preferred, anon also works for read-only testing",
    )
    parser.add_argument(
        "--model-path",
        default=DEFAULT_MODEL_PATH,
        help="Local Qwen embedding model path, defaults to QWEN_EMBEDDING_MODEL_PATH from .env",
    )
    parser.add_argument(
        "--reranker-path",
        default=DEFAULT_RERANKER_PATH,
        help="Local Qwen reranker model path, defaults to QWEN_RERANKER_MODEL_PATH from .env",
    )
    parser.add_argument("--dim", type=int, default=int(os.getenv("QWEN_EMBEDDING_DIM", "1024")), help="Embedding dimension")
    parser.add_argument("--kb", default=os.getenv("RAG_KB_SLUG", "travel-cn-public"), help="Knowledge base slug")
    parser.add_argument(
        "--dataset-version",
        default=os.getenv("RAG_DATASET_VERSION", ""),
        help="Dataset version, default inferred from filename",
    )
    parser.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda"], help="Embedding device")
    parser.add_argument("--reranker-device", default="auto", choices=["auto", "cpu", "cuda"], help="Reranker device")
    parser.add_argument("--top-k", type=int, default=5, help="Final top-K after rerank")
    parser.add_argument("--dense-top-k", type=int, default=20, help="Dense retrieval candidate size")
    parser.add_argument("--sparse-top-k", type=int, default=20, help="Sparse retrieval candidate size")
    parser.add_argument("--rrf-top-k", type=int, default=30, help="RRF fused candidate size before rerank")
    parser.add_argument("--rrf-k", type=int, default=60, help="RRF rank constant")
    parser.add_argument(
        "--sparse-threshold",
        type=float,
        default=0.05,
        help="Sparse retrieval threshold used by match_travel_knowledge_sparse",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.15,
        help="Dense retrieval similarity threshold used for candidate recall",
    )
    parser.add_argument("--city", default="", help="Optional city override for all queries")
    parser.add_argument("--type", default="", help="Optional type override for all queries")
    parser.add_argument("--query", action="append", default=[], help="Query to test, can be repeated")
    parser.add_argument("--query-file", default="", help="Text file with one query per line")
    parser.add_argument("--skip-integrity", action="store_true", help="Skip JSONL vs Supabase integrity checks")
    parser.add_argument("--skip-retrieval", action="store_true", help="Skip retrieval smoke tests")
    parser.add_argument("--sample-limit", type=int, default=20, help="How many sampled JSONL rows to verify")
    parser.add_argument("--page-size", type=int, default=1000, help="Pagination size when reading Supabase rows")
    parser.add_argument("--reranker-batch-size", type=int, default=4, help="Reranker batch size")
    parser.add_argument("--reranker-max-length", type=int, default=4096, help="Reranker max token length")
    parser.add_argument("--preview-chars", type=int, default=600, help="How many content chars to print per hit")
    parser.add_argument(
        "--eval-file",
        default=str(DEFAULT_EVAL_FILE) if DEFAULT_EVAL_FILE.exists() else "",
        help="Optional labeled eval JSONL file for quantitative metrics",
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_EVAL_OUTPUT_ROOT),
        help="Directory where eval artifacts will be written when --eval-file is used",
    )
    parser.add_argument("--run-name", default="", help="Optional eval run name; defaults to timestamp")
    parser.add_argument(
        "--no-answer-threshold",
        type=float,
        default=0.3,
        help="Top1 rerank below this threshold counts as low-confidence for expected-empty cases",
    )
    parser.add_argument(
        "--reranker-instruction",
        default="Given a travel question, retrieve relevant passages that best answer the question.",
        help="Instruction passed into Qwen reranker",
    )
    args = parser.parse_args()
    if not args.model_path:
        parser.error("Missing embedding model path. Set QWEN_EMBEDDING_MODEL_PATH in .env or pass --model-path.")
    if not args.reranker_path:
        parser.error("Missing reranker path. Set QWEN_RERANKER_MODEL_PATH in .env or pass --reranker-path.")
    if args.file:
        file_path = Path(args.file)
        if not file_path.exists():
            parser.error(f"Knowledge file not found: {args.file}")
        if file_path.suffix.lower() != ".jsonl":
            parser.error(
                "Knowledge file must be a JSONL file (*.jsonl). "
                f"Current value: {args.file}. "
                "Current --file looks like a non-knowledge artifact."
            )
    return args


def load_queries(args: argparse.Namespace) -> list[str]:
    queries: list[str] = []
    queries.extend(q.strip() for q in args.query if q and q.strip())

    if args.query_file:
        with open(args.query_file, "r", encoding="utf-8") as handle:
            queries.extend(line.strip() for line in handle if line.strip())

    if not queries and not args.skip_retrieval:
        queries = list(DEFAULT_QUERIES)

    return queries


def load_eval_cases(file_path: str) -> list[dict]:
    if not file_path:
        return []

    cases: list[dict] = []
    with open(file_path, "r", encoding="utf-8") as handle:
        for line_no, raw in enumerate(handle, start=1):
            raw = raw.strip()
            if not raw:
                continue
            try:
                item = json.loads(raw)
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid eval JSONL line {line_no}: {exc}") from exc
            query_text = normalize_text(item.get("query"))
            if not query_text:
                raise ValueError(f"Eval JSONL line {line_no} missing query")
            cases.append(
                {
                    "id": normalize_text(item.get("id")) or f"case-{line_no:03d}",
                    "query": query_text,
                    "expected_city": normalize_text(item.get("expected_city")) or None,
                    "expected_type": normalize_text(item.get("expected_type")) or None,
                    "expected_poi": normalize_text(item.get("expected_poi")) or None,
                    "expected_empty": bool(item.get("expected_empty", False)),
                    "gold_external_ids": [
                        normalize_text(value)
                        for value in (item.get("gold_external_ids") or [])
                        if normalize_text(value)
                    ],
                    "notes": normalize_text(item.get("notes")) or "",
                }
            )
    return cases


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, payload: object) -> None:
    ensure_dir(path.parent)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)


def write_jsonl(path: Path, rows: list[dict]) -> None:
    ensure_dir(path.parent)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False))
            handle.write("\n")


def resolve_device(device: str) -> str:
    if device == "auto":
        return "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA requested but not available")
    return device


def http_json(
    method: str,
    url: str,
    api_key: str,
    body: object | None = None,
    extra_headers: dict[str, str] | None = None,
) -> tuple[object, dict[str, str]]:
    headers = {
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)

    payload = None if body is None else json.dumps(body).encode("utf-8")
    req = request.Request(url, data=payload, method=method, headers=headers)
    with request.urlopen(req, timeout=120) as resp:
        raw = resp.read().decode("utf-8") if resp.length != 0 else ""
        data = json.loads(raw) if raw else None
        return data, dict(resp.headers.items())


def build_rest_url(supabase_url: str, path: str, params: dict[str, str] | None = None) -> str:
    base = supabase_url.rstrip("/")
    if params:
        return f"{base}{path}?{parse.urlencode(params)}"
    return f"{base}{path}"


def count_db_rows(args: argparse.Namespace, dataset_version: str) -> int:
    url = build_rest_url(
        args.supabase_url,
        "/rest/v1/travel_knowledge",
        {
            "select": "id",
            "kb_slug": f"eq.{args.kb}",
            "dataset_version": f"eq.{dataset_version}",
        },
    )
    _, headers = http_json(
        "GET",
        url,
        args.supabase_key,
        extra_headers={"Prefer": "count=exact", "Range": "0-0"},
    )
    content_range = headers.get("Content-Range", "")
    if "/" not in content_range:
        raise RuntimeError(f"Unexpected Content-Range header: {content_range or '<empty>'}")
    return int(content_range.rsplit("/", 1)[1])


def fetch_db_rows(args: argparse.Namespace, dataset_version: str, columns: str) -> list[dict]:
    rows: list[dict] = []
    start = 0

    while True:
        end = start + args.page_size - 1
        url = build_rest_url(
            args.supabase_url,
            "/rest/v1/travel_knowledge",
            {
                "select": columns,
                "kb_slug": f"eq.{args.kb}",
                "dataset_version": f"eq.{dataset_version}",
                "order": "id.asc",
            },
        )
        batch, _ = http_json(
            "GET",
            url,
            args.supabase_key,
            extra_headers={"Range": f"{start}-{end}"},
        )
        batch = batch or []
        if not isinstance(batch, list):
            raise RuntimeError("Supabase row fetch did not return a list")
        rows.extend(batch)
        if len(batch) < args.page_size:
            break
        start += args.page_size

    return rows


def fetch_retrieval_docs(args: argparse.Namespace, dataset_version: str) -> list[dict]:
    columns = ",".join(
        [
            "external_id",
            "city",
            "type",
            "title",
            "section_title",
            "sub_section_title",
            "poi_name",
            "content",
            "tags",
        ]
    )
    rows = fetch_db_rows(args, dataset_version, columns)
    docs: list[dict] = []
    for row in rows:
        docs.append(
            {
                "id": normalize_text(row.get("external_id")) or None,
                "city": normalize_text(row.get("city")),
                "type": normalize_text(row.get("type")),
                "title": normalize_text(row.get("title")),
                "sectionTitle": normalize_text(row.get("section_title")),
                "subSectionTitle": normalize_text(row.get("sub_section_title")),
                "poiName": normalize_text(row.get("poi_name")),
                "content": normalize_text(row.get("content")),
                "tags": row.get("tags") if isinstance(row.get("tags"), list) else [],
            }
        )
    return docs


def chunk_samples(chunks: list[dict], sample_limit: int) -> list[dict]:
    if sample_limit <= 0 or not chunks:
        return []
    if sample_limit == 1:
        return [chunks[len(chunks) // 2]]
    if len(chunks) <= sample_limit:
        return chunks

    positions = sorted({int(i * (len(chunks) - 1) / (sample_limit - 1)) for i in range(sample_limit)})
    return [chunks[index] for index in positions]


def expected_unique_hash_count(chunks: list[dict]) -> int:
    return len({md5_text(normalize_text(chunk.get("content"))) for chunk in chunks})


def integrity_check(args: argparse.Namespace, dataset_version: str) -> bool:
    print("\n=== Integrity Check ===")
    chunks = load_chunks(args.file)
    jsonl_total = len(chunks)
    unique_hash_total = expected_unique_hash_count(chunks)
    db_total = count_db_rows(args, dataset_version)

    print(f"JSONL total rows: {jsonl_total}")
    print(f"JSONL unique content_hash rows: {unique_hash_total}")
    print(f"Supabase rows for kb={args.kb}, dataset_version={dataset_version}: {db_total}")

    ok = True
    if db_total != unique_hash_total:
        ok = False
        print("[FAIL] Supabase row count does not match unique JSONL content_hash count.")
    else:
        print("[PASS] Row count matches unique JSONL content_hash count.")

    samples = chunk_samples(chunks, args.sample_limit)
    if not samples:
        return ok

    db_rows = fetch_db_rows(args, dataset_version, "external_id,content_hash,city,title")
    external_ids = {row.get("external_id") for row in db_rows if row.get("external_id")}
    content_hashes = {row.get("content_hash") for row in db_rows if row.get("content_hash")}

    missing_samples: list[str] = []
    for chunk in samples:
        external_id = chunk.get("id")
        content_hash = md5_text(normalize_text(chunk.get("content")))
        label = f"id={external_id or '<none>'}, city={normalize_text(chunk.get('city'))}, title={normalize_text(chunk.get('title'))}"
        if external_id:
            if external_id not in external_ids:
                missing_samples.append(label)
        elif content_hash not in content_hashes:
            missing_samples.append(label)

    if missing_samples:
        ok = False
        print("[FAIL] Sample row verification failed:")
        for item in missing_samples[:10]:
            print(f"  - {item}")
    else:
        print(f"[PASS] Sample row verification passed ({len(samples)} sampled chunks).")

    return ok


def flatten_field(chunk: dict, key: str) -> str:
    value = chunk.get(key)
    if isinstance(value, list):
        return " ".join(normalize_text(item) for item in value if normalize_text(item))
    return normalize_text(value)


def build_search_text(chunk: dict) -> str:
    values = [flatten_field(chunk, field) for field in TEXT_FIELDS]
    return "\n".join(value for value in values if value)


def tokenize_text(text: str) -> list[str]:
    normalized = normalize_text(text).lower()
    if not normalized:
        return []

    tokens: list[str] = []
    for part in WORD_RE.findall(normalized):
        if re.fullmatch(r"[\u4e00-\u9fff]+", part):
            if jieba is not None:
                tokens.extend(tok.strip() for tok in jieba.lcut(part) if tok.strip())
            if len(part) == 1:
                tokens.append(part)
            else:
                tokens.extend(part[index:index + 2] for index in range(len(part) - 1))
        else:
            tokens.append(part)
    return tokens


def prepare_corpus(rows: list[dict]) -> tuple[list[dict], list[str], list[str]]:
    docs: list[dict] = []
    city_names: set[str] = set()
    poi_names: set[str] = set()

    for chunk in rows:
        search_text = build_search_text(chunk)
        tokens = tokenize_text(search_text)
        token_counts = Counter(tokens)
        city = normalize_text(chunk.get("city"))
        poi_name = normalize_text(chunk.get("poiName"))
        doc = {
            "doc_id": normalize_text(chunk.get("id")) or md5_text(normalize_text(chunk.get("content"))),
            "external_id": normalize_text(chunk.get("id")) or None,
            "city": city,
            "type": normalize_text(chunk.get("type")) or "guide",
            "title": normalize_text(chunk.get("title")),
            "section_title": normalize_text(chunk.get("sectionTitle")),
            "sub_section_title": normalize_text(chunk.get("subSectionTitle")),
            "poi_name": poi_name,
            "content": normalize_text(chunk.get("content")),
            "tags": chunk.get("tags") if isinstance(chunk.get("tags"), list) else [],
            "search_text": search_text,
            "tokens": tokens,
            "token_counts": token_counts,
            "doc_len": len(tokens),
            "sparse_score": 0.0,
        }
        docs.append(doc)
        if city:
            city_names.add(city)
        if len(poi_name) >= 2:
            poi_names.add(poi_name)

    sorted_cities = sorted(city_names, key=len, reverse=True)
    sorted_pois = sorted(poi_names, key=len, reverse=True)
    return docs, sorted_cities, sorted_pois


def infer_query_type(query_text: str) -> str | None:
    query = normalize_text(query_text)
    best_type = None
    best_hits = 0
    for type_name, keywords in TYPE_KEYWORDS.items():
        hits = sum(1 for keyword in keywords if keyword in query)
        if hits > best_hits:
            best_type = type_name
            best_hits = hits
    return best_type


def infer_query_city(query_text: str, city_names: list[str]) -> str | None:
    query = normalize_text(query_text)
    for city in city_names:
        if city and city in query:
            return city
    return None


def infer_query_poi(query_text: str, poi_names: list[str]) -> str | None:
    query = normalize_text(query_text)
    for poi_name in poi_names:
        if poi_name and poi_name in query:
            return poi_name
    return None


def parse_query_intent(args: argparse.Namespace, query_text: str, city_names: list[str], poi_names: list[str]) -> dict[str, str | None]:
    city = normalize_text(args.city) or infer_query_city(query_text, city_names)
    type_name = normalize_text(args.type) or infer_query_type(query_text)
    poi_name = infer_query_poi(query_text, poi_names)
    return {"city": city or None, "type": type_name or None, "poi": poi_name or None}


def candidate_scopes(intent: dict[str, str | None]) -> list[tuple[str, str | None, str | None]]:
    city = intent.get("city")
    type_name = intent.get("type")
    scoped_type = None if type_name == "guide" else type_name
    scopes: list[tuple[str, str | None, str | None]] = []
    if city and scoped_type:
        scopes.append(("city+type", city, scoped_type))
    if city:
        scopes.append(("city", city, None))
    if scoped_type:
        scopes.append(("type", None, scoped_type))
    scopes.append(("global", None, None))
    return scopes


def filter_docs(docs: list[dict], city: str | None, type_name: str | None) -> list[dict]:
    rows = docs
    if city:
        rows = [doc for doc in rows if doc["city"] == city]
    if type_name:
        rows = [doc for doc in rows if doc["type"] == type_name]
    return rows


def choose_scope(docs: list[dict], intent: dict[str, str | None]) -> tuple[str, str | None, str | None, list[dict]]:
    for scope_name, city, type_name in candidate_scopes(intent):
        scoped_docs = filter_docs(docs, city, type_name)
        if scoped_docs:
            return scope_name, city, type_name, scoped_docs
    return "global", None, None, docs


def sparse_retrieve(
    args: argparse.Namespace,
    dataset_version: str,
    query_text: str,
    city: str | None,
    type_name: str | None,
) -> list[dict]:
    query_terms = list(dict.fromkeys(tokenize_text(query_text)))
    url = build_rest_url(args.supabase_url, "/rest/v1/rpc/match_travel_knowledge_sparse")
    payload = {
        "query_text": query_text,
        "query_terms": query_terms,
        "match_count": args.sparse_top_k,
        "filter_kb_slug": args.kb,
        "filter_city": city,
        "filter_type": type_name,
        "filter_dataset_version": dataset_version,
        "sparse_threshold": args.sparse_threshold,
    }
    data, _ = http_json("POST", url, args.supabase_key, body=payload)
    if not isinstance(data, list):
        raise RuntimeError("Supabase sparse RPC did not return a list")
    rows: list[dict] = []
    for row in data:
        row_copy = dict(row)
        row_copy["doc_id"] = normalize_text(row_copy.get("external_id")) or md5_text(normalize_text(row_copy.get("content")))
        row_copy["sparse_score"] = float(row_copy.get("sparse_score") or 0.0)
        rows.append(row_copy)
    return rows


def dense_retrieve(
    args: argparse.Namespace,
    dataset_version: str,
    embedder: LocalQwenEmbedder,
    query_text: str,
    city: str | None,
    type_name: str | None,
) -> list[dict]:
    vector = embedder.encode([query_text])[0]
    url = build_rest_url(args.supabase_url, "/rest/v1/rpc/match_travel_knowledge")
    payload = {
        "query_embedding": vector,
        "match_count": args.dense_top_k,
        "filter_kb_slug": args.kb,
        "filter_city": city,
        "filter_type": type_name,
        "filter_dataset_version": dataset_version,
        "similarity_threshold": args.threshold,
    }
    data, _ = http_json("POST", url, args.supabase_key, body=payload)
    if not isinstance(data, list):
        raise RuntimeError("Supabase RPC did not return a list")
    rows: list[dict] = []
    for row in data:
        row_copy = dict(row)
        row_copy["doc_id"] = normalize_text(row_copy.get("external_id")) or md5_text(normalize_text(row_copy.get("content")))
        row_copy["sparse_score"] = 0.0
        rows.append(row_copy)
    return rows


def build_rerank_document(row: dict) -> str:
    parts = [
        normalize_text(row.get("city")),
        normalize_text(row.get("type")),
        normalize_text(row.get("title")),
        normalize_text(row.get("section_title")) or normalize_text(row.get("sectionTitle")),
        normalize_text(row.get("sub_section_title")) or normalize_text(row.get("subSectionTitle")),
        normalize_text(row.get("poi_name")) or normalize_text(row.get("poiName")),
        normalize_text(row.get("content")),
    ]
    return "\n".join(part for part in parts if part)


def rrf_fuse(
    sparse_rows: list[dict],
    dense_rows: list[dict],
    top_k: int,
    rrf_k: int,
) -> list[dict]:
    scores: defaultdict[str, float] = defaultdict(float)
    merged_rows: dict[str, dict] = {}

    def add_rows(rows: list[dict], source_name: str) -> None:
        for rank, row in enumerate(rows, start=1):
            doc_id = normalize_text(row.get("doc_id")) or md5_text(normalize_text(row.get("content")))
            scores[doc_id] += 1.0 / (rrf_k + rank)
            if doc_id not in merged_rows:
                merged_rows[doc_id] = dict(row)
                merged_rows[doc_id]["sources"] = {source_name}
            else:
                merged_rows[doc_id]["sources"].add(source_name)
                if source_name == "dense":
                    # Keep sparse-side score; only enrich dense-specific fields.
                    merged_rows[doc_id].update(
                        {
                            key: value
                            for key, value in row.items()
                            if key != "sparse_score" and value not in (None, "", [])
                        }
                    )

    add_rows(sparse_rows, "sparse")
    add_rows(dense_rows, "dense")

    fused: list[dict] = []
    for doc_id, row in merged_rows.items():
        merged = dict(row)
        merged["rrf_score"] = scores[doc_id]
        merged["sources"] = sorted(merged["sources"])
        fused.append(merged)

    fused.sort(key=lambda item: item["rrf_score"], reverse=True)
    return fused[:top_k]


class LocalQwenReranker:
    def __init__(self, model_path: str, device: str, max_length: int, batch_size: int, instruction: str) -> None:
        self.model_path = model_path
        self.device = resolve_device(device)
        self.max_length = max_length
        self.batch_size = batch_size
        self.instruction = instruction

        self.tokenizer = AutoTokenizer.from_pretrained(
            model_path,
            trust_remote_code=True,
            padding_side="left",
        )
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token

        model_kwargs = {"trust_remote_code": True}
        if self.device == "cuda":
            model_kwargs["dtype"] = torch.bfloat16

        self.model = AutoModelForCausalLM.from_pretrained(model_path, **model_kwargs).to(self.device).eval()
        self.token_false_id = self.tokenizer.convert_tokens_to_ids("no")
        self.token_true_id = self.tokenizer.convert_tokens_to_ids("yes")

        self.prefix = (
            "<|im_start|>system\n"
            "Judge whether the Document meets the requirements based on the Query and the Instruct provided. "
            "Note that the answer can only be \"yes\" or \"no\"."
            "<|im_end|>\n<|im_start|>user\n"
        )
        self.suffix = "<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n"
        self.prefix_tokens = self.tokenizer.encode(self.prefix, add_special_tokens=False)
        self.suffix_tokens = self.tokenizer.encode(self.suffix, add_special_tokens=False)

    def format_pair(self, query_text: str, document: str) -> str:
        return (
            f"<Instruct>: {self.instruction}\n"
            f"<Query>: {query_text}\n"
            f"<Document>: {document}"
        )

    def process_batch(self, pairs: list[str]) -> dict[str, torch.Tensor]:
        inputs = self.tokenizer(
            pairs,
            padding=False,
            truncation="longest_first",
            return_attention_mask=False,
            max_length=self.max_length - len(self.prefix_tokens) - len(self.suffix_tokens),
        )
        for index, token_ids in enumerate(inputs["input_ids"]):
            inputs["input_ids"][index] = self.prefix_tokens + token_ids + self.suffix_tokens
        padded = self.tokenizer.pad(inputs, padding=True, return_tensors="pt", max_length=self.max_length)
        return {key: value.to(self.device) for key, value in padded.items()}

    @torch.inference_mode()
    def score(self, query_text: str, rows: list[dict]) -> list[float]:
        scores: list[float] = []
        for start in range(0, len(rows), self.batch_size):
            batch_rows = rows[start:start + self.batch_size]
            pairs = [self.format_pair(query_text, build_rerank_document(row)) for row in batch_rows]
            inputs = self.process_batch(pairs)
            logits = self.model(**inputs).logits[:, -1, :]
            yes_scores = logits[:, self.token_true_id]
            no_scores = logits[:, self.token_false_id]
            stacked = torch.stack([no_scores, yes_scores], dim=1)
            probs = torch.nn.functional.log_softmax(stacked, dim=1).exp()[:, 1]
            scores.extend(probs.float().cpu().tolist())
        return scores


def describe_intent(intent: dict[str, str | None]) -> str:
    return f"city={intent.get('city') or '-'}, type={intent.get('type') or '-'}, poi={intent.get('poi') or '-'}"


def row_matches_case(row: dict, case: dict) -> bool:
    if case.get("expected_empty"):
        return False

    gold_ids = {normalize_text(value) for value in (case.get("gold_external_ids") or []) if normalize_text(value)}
    if not gold_ids:
        return False
    row_id = normalize_text(row.get("external_id")) or normalize_text(row.get("doc_id"))
    return row_id in gold_ids


def hit_at_k(rows: list[dict], case: dict, k: int) -> bool:
    return any(row_matches_case(row, case) for row in rows[:k])


def first_match_rank(rows: list[dict], case: dict) -> int | None:
    for rank, row in enumerate(rows, start=1):
        if row_matches_case(row, case):
            return rank
    return None


def summarize_eval(results: list[dict], no_answer_threshold: float) -> dict:
    labeled_cases = [item for item in results if item.get("has_labels")]
    nonempty_labeled = [item for item in labeled_cases if not item.get("expected_empty")]
    empty_cases = [item for item in labeled_cases if item.get("expected_empty")]
    intent_city_cases = [item for item in labeled_cases if item.get("expected_city")]
    intent_type_cases = [item for item in labeled_cases if item.get("expected_type")]

    def rate(items: list[dict], key: str) -> float | None:
        if not items:
            return None
        return sum(1 for item in items if item.get(key)) / len(items)

    def mean(values: list[float]) -> float | None:
        if not values:
            return None
        return sum(values) / len(values)

    reciprocal_ranks = []
    for item in nonempty_labeled:
        rank = item.get("label_first_match_rank")
        if isinstance(rank, int) and rank > 0:
            reciprocal_ranks.append(1.0 / rank)
        else:
            reciprocal_ranks.append(0.0)

    top1_reranks = [item["top1_rerank"] for item in results if isinstance(item.get("top1_rerank"), (int, float))]
    low_conf_empty = [
        item
        for item in empty_cases
        if isinstance(item.get("top1_rerank"), (int, float)) and item["top1_rerank"] < no_answer_threshold
    ]

    return {
        "query_count": len(results),
        "labeled_query_count": len(labeled_cases),
        "nonempty_labeled_query_count": len(nonempty_labeled),
        "expected_empty_query_count": len(empty_cases),
        "intent_city_accuracy": rate(intent_city_cases, "intent_city_correct"),
        "intent_type_accuracy": rate(intent_type_cases, "intent_type_correct"),
        "label_hit_at_1": rate(nonempty_labeled, "label_hit_at_1"),
        "label_hit_at_3": rate(nonempty_labeled, "label_hit_at_3"),
        "label_hit_at_5": rate(nonempty_labeled, "label_hit_at_5"),
        "mrr_label": mean(reciprocal_ranks),
        "empty_low_confidence_rate": (len(low_conf_empty) / len(empty_cases)) if empty_cases else None,
        "avg_top1_rerank": mean(top1_reranks),
        "avg_candidate_count": mean([float(item["candidate_count"]) for item in results]),
    }


def run_query(
    args: argparse.Namespace,
    dataset_version: str,
    docs: list[dict],
    city_names: list[str],
    poi_names: list[str],
    embedder: LocalQwenEmbedder,
    reranker: LocalQwenReranker,
    query_text: str,
) -> dict:
    intent = parse_query_intent(args, query_text, city_names, poi_names)
    scope_name, filter_city, filter_type, scoped_docs = choose_scope(docs, intent)
    sparse_rows = sparse_retrieve(args, dataset_version, query_text, filter_city, filter_type)
    dense_rows = dense_retrieve(
        args,
        dataset_version,
        embedder,
        query_text,
        filter_city,
        filter_type,
    )
    fused_rows = rrf_fuse(sparse_rows, dense_rows, args.rrf_top_k, args.rrf_k)
    if fused_rows:
        rerank_scores = reranker.score(query_text, fused_rows)
        for row, rerank_score in zip(fused_rows, rerank_scores):
            row["rerank_score"] = rerank_score
        fused_rows.sort(key=lambda item: item["rerank_score"], reverse=True)
    final_rows = fused_rows[: args.top_k]
    return {
        "query": query_text,
        "intent": intent,
        "scope_name": scope_name,
        "filter_city": filter_city,
        "filter_type": filter_type,
        "candidate_count": len(scoped_docs),
        "sparse_rows": sparse_rows,
        "dense_rows": dense_rows,
        "fused_rows": fused_rows,
        "final_rows": final_rows,
    }


def retrieval_check(
    args: argparse.Namespace,
    dataset_version: str,
    queries: list[str],
    rows: list[dict],
    eval_cases: list[dict],
) -> bool:
    print("\n=== Retrieval Smoke Test ===")
    docs, city_names, poi_names = prepare_corpus(rows)
    embedder = LocalQwenEmbedder(args.model_path, args.dim, args.device)
    reranker = LocalQwenReranker(
        args.reranker_path,
        args.reranker_device,
        args.reranker_max_length,
        args.reranker_batch_size,
        args.reranker_instruction,
    )

    cases = eval_cases or [{"id": f"query-{index:03d}", "query": query_text} for index, query_text in enumerate(queries, start=1)]
    ok = True
    eval_results: list[dict] = []

    for index, case in enumerate(cases, start=1):
        result = run_query(
            args,
            dataset_version,
            docs,
            city_names,
            poi_names,
            embedder,
            reranker,
            case["query"],
        )
        intent = result["intent"]
        final_rows = result["final_rows"]

        print(f"\n[{index}] Query: {case['query']}")
        print(f"  Intent: {describe_intent(intent)}")
        print(
            f"  Scope: {result['scope_name']} "
            f"(city={result['filter_city'] or '-'}, type={result['filter_type'] or '-'}, candidates={result['candidate_count']})"
        )
        print(f"  Sparse top-{args.sparse_top_k}: {len(result['sparse_rows'])}")
        print(f"  Dense top-{args.dense_top_k}: {len(result['dense_rows'])}")
        print(f"  RRF top-{args.rrf_top_k}: {len(result['fused_rows'])}")

        if not final_rows:
            ok = False
            print("  [FAIL] No fused candidates.")
        else:
            for rank, row in enumerate(final_rows, start=1):
                title = normalize_text(row.get("title"))
                city = normalize_text(row.get("city"))
                type_name = normalize_text(row.get("type"))
                content = normalize_text(row.get("content"))[: args.preview_chars]
                rerank_score = row.get("rerank_score", 0.0)
                rrf_score = row.get("rrf_score", 0.0)
                dense_score = row.get("similarity")
                sparse_score = row.get("sparse_score", 0.0)
                sources = ",".join(row.get("sources", []))
                dense_text = f"{dense_score:.4f}" if isinstance(dense_score, (int, float)) else "n/a"
                print(
                    f"  {rank}. {city} | {type_name} | {title} | rerank={rerank_score:.4f} | "
                    f"rrf={rrf_score:.4f} | dense={dense_text} | sparse={sparse_score:.4f} | src={sources}"
                )
                print(f"     {content}")

        has_labels = bool(case.get("gold_external_ids")) or bool(case.get("expected_empty"))
        first_rank = first_match_rank(final_rows, case) if has_labels else None
        top1_rerank = final_rows[0].get("rerank_score") if final_rows else None
        eval_item = {
            "id": case["id"],
            "query": case["query"],
            "expected_city": case.get("expected_city"),
            "expected_type": case.get("expected_type"),
            "expected_poi": case.get("expected_poi"),
            "expected_empty": case.get("expected_empty", False),
            "gold_external_ids": case.get("gold_external_ids") or [],
            "notes": case.get("notes", ""),
            "has_labels": has_labels,
            "intent": intent,
            "intent_city_correct": (intent.get("city") == case.get("expected_city")) if case.get("expected_city") else None,
            "intent_type_correct": (intent.get("type") == case.get("expected_type")) if case.get("expected_type") else None,
            "scope_name": result["scope_name"],
            "filter_city": result["filter_city"],
            "filter_type": result["filter_type"],
            "candidate_count": result["candidate_count"],
            "label_hit_at_1": hit_at_k(final_rows, case, 1) if has_labels and not case.get("expected_empty") else None,
            "label_hit_at_3": hit_at_k(final_rows, case, 3) if has_labels and not case.get("expected_empty") else None,
            "label_hit_at_5": hit_at_k(final_rows, case, 5) if has_labels and not case.get("expected_empty") else None,
            "label_first_match_rank": first_rank,
            "top1_rerank": top1_rerank,
            "top1_title": normalize_text(final_rows[0].get("title")) if final_rows else "",
            "top1_city": normalize_text(final_rows[0].get("city")) if final_rows else "",
            "top1_type": normalize_text(final_rows[0].get("type")) if final_rows else "",
            "results": [
                {
                    "rank": rank,
                    "city": normalize_text(row.get("city")),
                    "type": normalize_text(row.get("type")),
                    "title": normalize_text(row.get("title")),
                    "rerank_score": row.get("rerank_score"),
                    "rrf_score": row.get("rrf_score"),
                    "dense_score": row.get("similarity"),
                    "sparse_score": row.get("sparse_score"),
                    "sources": row.get("sources", []),
                }
                for rank, row in enumerate(final_rows, start=1)
            ],
        }
        eval_results.append(eval_item)

    if eval_cases:
        summary = summarize_eval(eval_results, args.no_answer_threshold)
        print("\n=== Eval Metrics ===")
        for key, value in summary.items():
            if isinstance(value, float):
                print(f"{key}: {value:.4f}")
            else:
                print(f"{key}: {value}")

        run_name = args.run_name or dt.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        run_dir = Path(args.output_dir) / run_name
        write_json(run_dir / "summary.json", summary)
        write_jsonl(run_dir / "predictions.jsonl", eval_results)
        failures = [
            item
            for item in eval_results
            if item.get("has_labels")
            and (
                (item.get("expected_empty") and not (isinstance(item.get("top1_rerank"), (int, float)) and item["top1_rerank"] < args.no_answer_threshold))
                or (not item.get("expected_empty") and not item.get("label_hit_at_5"))
            )
        ]
        write_jsonl(run_dir / "failures.jsonl", failures)
        print(f"Artifacts written to: {run_dir}")

    return ok


def validate_args(args: argparse.Namespace, dataset_version: str, queries: list[str]) -> None:
    if not args.skip_integrity:
        if not args.file:
            raise ValueError("Integrity check requires --file")
        if not Path(args.file).exists():
            raise FileNotFoundError(f"Input file not found: {args.file}")
    if not args.supabase_url:
        raise ValueError("Missing --supabase-url or SUPABASE_URL")
    if not args.supabase_key:
        raise ValueError("Missing --supabase-key or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY")
    if not Path(args.model_path).exists() and not args.skip_retrieval:
        raise FileNotFoundError(f"Model path not found: {args.model_path}")
    if not Path(args.reranker_path).exists() and not args.skip_retrieval:
        raise FileNotFoundError(f"Reranker path not found: {args.reranker_path}")
    if args.skip_integrity and args.skip_retrieval:
        raise ValueError("Nothing to do: both --skip-integrity and --skip-retrieval are set")
    if not args.skip_retrieval and not queries:
        raise ValueError("No retrieval queries provided")
    if not dataset_version:
        raise ValueError("Dataset version is empty")
    if args.eval_file and not Path(args.eval_file).exists():
        raise FileNotFoundError(f"Eval file not found: {args.eval_file}")


def main() -> int:
    args = parse_args()
    dataset_version = args.dataset_version or infer_dataset_version(args.file)
    eval_cases = load_eval_cases(args.eval_file) if args.eval_file else []
    queries = load_queries(args)
    if eval_cases:
        queries = [case["query"] for case in eval_cases]

    try:
        validate_args(args, dataset_version, queries)
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1

    chunks = load_chunks(args.file) if (args.file and not args.skip_integrity) else []
    retrieval_rows = fetch_retrieval_docs(args, dataset_version) if not args.skip_retrieval else []

    print("=== RAG Test Runner ===")
    print(f"JSONL file: {args.file}")
    print(f"Knowledge base: {args.kb}")
    print(f"Dataset version: {dataset_version}")
    print(f"Supabase URL: {args.supabase_url}")
    print(f"Embedding model path: {args.model_path}")
    print(f"Reranker model path: {args.reranker_path}")
    print(f"Embedding dim: {args.dim}")
    print(f"Embedding device: {args.device}")
    print(f"Reranker device: {args.reranker_device}")
    print(f"Final top-K: {args.top_k}")
    print(f"Sparse top-K: {args.sparse_top_k}")
    print(f"Sparse threshold: {args.sparse_threshold}")
    print(f"Dense top-K: {args.dense_top_k}")
    print(f"RRF top-K: {args.rrf_top_k}")
    print(f"Dense threshold: {args.threshold}")
    if retrieval_rows:
        print(f"Retrieval rows fetched from Supabase: {len(retrieval_rows)}")
    if args.eval_file:
        print(f"Eval file: {args.eval_file}")
        print(f"Eval output dir: {args.output_dir}")

    overall_ok = True

    if not args.skip_integrity:
        overall_ok = integrity_check(args, dataset_version) and overall_ok

    if not args.skip_retrieval:
        overall_ok = retrieval_check(args, dataset_version, queries, retrieval_rows, eval_cases) and overall_ok

    print("\n=== Summary ===")
    print("PASS" if overall_ok else "FAIL")
    return 0 if overall_ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
