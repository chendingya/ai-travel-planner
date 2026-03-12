#!/usr/bin/env python3
"""Evaluate local Qwen3.5 tool-calling on BFCL v3 simple."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import torch
from huggingface_hub import hf_hub_download
from transformers import AutoModelForCausalLM, AutoTokenizer

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from project_env import get_env, resolve_project_path

TRAINING_ENV_CANDIDATES = (
    PROJECT_ROOT / "training" / ".env",
    PROJECT_ROOT / ".env",
    PROJECT_ROOT / "backend" / ".env",
)
DEFAULT_MODEL_PATH = resolve_project_path(
    get_env(
        "TRAINING_MODEL_PATH",
        "../../Qwen/Qwen3.5-2B-Base",
        candidates=TRAINING_ENV_CANDIDATES,
    ),
    base_dir=PROJECT_ROOT,
)
DEFAULT_DATASET_REPO = get_env(
    "TRAINING_BFCL_DATASET_REPO",
    "gorilla-llm/Berkeley-Function-Calling-Leaderboard",
    candidates=TRAINING_ENV_CANDIDATES,
)
DEFAULT_OUTPUT_DIR = resolve_project_path(
    get_env(
        "TRAINING_BFCL_OUTPUT_DIR",
        "training/artifacts/bfcl_simple",
        candidates=TRAINING_ENV_CANDIDATES,
    ),
    base_dir=PROJECT_ROOT,
)

TOOL_CALL_RE = re.compile(r"<tool_call>(.*?)</tool_call>", re.DOTALL)
FUNCTION_RE = re.compile(r"<function=([^>\n]+)>\s*(.*?)\s*</function>", re.DOTALL)
PARAM_RE = re.compile(r"<parameter=([^>\n]+)>\s*(.*?)\s*</parameter>", re.DOTALL)


@dataclass
class Prediction:
    raw_text: str
    tool_name: str
    arguments: dict[str, Any]
    parse_ok: bool


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-path", default=DEFAULT_MODEL_PATH)
    parser.add_argument("--dataset-repo", default=DEFAULT_DATASET_REPO)
    parser.add_argument("--dataset-file", default="BFCL_v3_simple.json")
    parser.add_argument("--answer-file", default="possible_answer/BFCL_v3_simple.json")
    parser.add_argument("--max-samples", type=int, default=20)
    parser.add_argument("--device", choices=["auto", "cpu", "cuda"], default="auto")
    parser.add_argument("--max-new-tokens", type=int, default=512)
    parser.add_argument("--temperature", type=float, default=0.0)
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    return parser.parse_args()


def resolve_device(device: str) -> str:
    if device == "auto":
        return "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA requested but not available")
    return device


def load_jsonl(path: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with open(path, "r", encoding="utf-8") as handle:
        for raw in handle:
            raw = raw.strip()
            if raw:
                rows.append(json.loads(raw))
    return rows


def normalize_scalar(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return str(value).lower()
    if isinstance(value, (int, float)):
        if isinstance(value, float) and value.is_integer():
            return str(int(value))
        return str(value)
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    text = str(value).strip()
    if not text:
        return ""
    try:
        parsed = json.loads(text)
    except Exception:
        return text
    return normalize_scalar(parsed)


def parse_argument_value(raw: str) -> Any:
    text = raw.strip()
    if not text:
        return ""
    try:
        return json.loads(text)
    except Exception:
        return text


def parse_tool_call(text: str) -> Prediction:
    match = TOOL_CALL_RE.search(text)
    if not match:
        return Prediction(raw_text=text, tool_name="", arguments={}, parse_ok=False)

    block = match.group(1)
    function_match = FUNCTION_RE.search(block)
    if not function_match:
        return Prediction(raw_text=text, tool_name="", arguments={}, parse_ok=False)

    tool_name = function_match.group(1).strip()
    body = function_match.group(2)
    arguments: dict[str, Any] = {}
    for param_name, param_value in PARAM_RE.findall(body):
        arguments[param_name.strip()] = parse_argument_value(param_value)

    return Prediction(
        raw_text=text,
        tool_name=tool_name,
        arguments=arguments,
        parse_ok=bool(tool_name),
    )


def download_dataset_file(repo_id: str, filename: str) -> str:
    return hf_hub_download(repo_id=repo_id, repo_type="dataset", filename=filename)


def build_answer_map(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    return {row["id"]: row["ground_truth"] for row in rows}


def load_model_and_tokenizer(model_path: str, device: str):
    tokenizer = AutoTokenizer.from_pretrained(model_path, trust_remote_code=True)
    model_kwargs: dict[str, Any] = {"trust_remote_code": True}
    if device == "cuda":
        model_kwargs["torch_dtype"] = torch.bfloat16
        model_kwargs["device_map"] = "auto"
    model = AutoModelForCausalLM.from_pretrained(model_path, **model_kwargs)
    model.eval()
    return model, tokenizer


def generate_prediction(
    model,
    tokenizer,
    messages: list[dict[str, str]],
    tools: list[dict[str, Any]],
    max_new_tokens: int,
    temperature: float,
) -> Prediction:
    inputs = tokenizer.apply_chat_template(
        messages,
        tools=tools,
        add_generation_prompt=True,
        tokenize=True,
        return_dict=True,
        return_tensors="pt",
    )
    model_device = next(model.parameters()).device
    inputs = {key: value.to(model_device) for key, value in inputs.items()}

    generation_kwargs: dict[str, Any] = {
        "max_new_tokens": max_new_tokens,
        "pad_token_id": tokenizer.eos_token_id,
        "do_sample": temperature > 0,
    }
    if temperature > 0:
        generation_kwargs["temperature"] = temperature

    with torch.inference_mode():
        output_ids = model.generate(**inputs, **generation_kwargs)

    prompt_length = inputs["input_ids"].shape[1]
    generated_ids = output_ids[0][prompt_length:]
    text = tokenizer.decode(generated_ids, skip_special_tokens=False)
    return parse_tool_call(text)


def arg_matches(pred_value: Any, gold_options: list[Any]) -> bool:
    pred_norm = normalize_scalar(pred_value)
    gold_norms = {normalize_scalar(item) for item in gold_options}
    return pred_norm in gold_norms


def optional_arg_can_be_missing(gold_options: list[Any]) -> bool:
    return "" in {normalize_scalar(item) for item in gold_options}


def evaluate_against_candidates(
    prediction: Prediction,
    candidates: list[dict[str, Any]],
    required_args: list[str],
    available_tools: set[str],
) -> dict[str, Any]:
    tool_known = prediction.tool_name in available_tools if prediction.tool_name else False
    hallucinated_tool = bool(prediction.tool_name) and not tool_known
    tool_name_correct = False
    arg_exact_match = False
    matched_required = 0
    matched_candidate_index = -1

    for index, candidate in enumerate(candidates):
        if len(candidate) != 1:
            continue
        gold_tool_name, gold_args = next(iter(candidate.items()))
        if prediction.tool_name != gold_tool_name:
            continue

        tool_name_correct = True
        current_required = 0
        all_args_ok = True

        for arg_name, gold_options in gold_args.items():
            pred_has_arg = arg_name in prediction.arguments
            if arg_name in required_args:
                if pred_has_arg and arg_matches(prediction.arguments[arg_name], gold_options):
                    current_required += 1
            if pred_has_arg:
                if not arg_matches(prediction.arguments[arg_name], gold_options):
                    all_args_ok = False
            elif not optional_arg_can_be_missing(gold_options):
                all_args_ok = False

        extra_args = set(prediction.arguments) - set(gold_args)
        if extra_args:
            all_args_ok = False

        if current_required > matched_required:
            matched_required = current_required
            matched_candidate_index = index

        if all_args_ok:
            arg_exact_match = True
            matched_required = len(required_args)
            matched_candidate_index = index
            break

    return {
        "parse_ok": prediction.parse_ok,
        "tool_name_correct": tool_name_correct,
        "required_arg_matched": matched_required,
        "required_arg_total": len(required_args),
        "arg_exact_match": arg_exact_match,
        "schema_valid": prediction.parse_ok and tool_known,
        "hallucinated_tool": hallucinated_tool,
        "matched_candidate_index": matched_candidate_index,
    }


def save_outputs(output_dir: Path, summary: dict[str, Any], rows: list[dict[str, Any]]) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    with (output_dir / "predictions.jsonl").open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    with (output_dir / "failures.jsonl").open("w", encoding="utf-8") as handle:
        for row in rows:
            metrics = row["metrics"]
            if not metrics["arg_exact_match"]:
                handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def main() -> int:
    args = parse_args()
    args.model_path = resolve_project_path(args.model_path)
    args.output_dir = resolve_project_path(args.output_dir, base_dir=PROJECT_ROOT)
    if not args.model_path:
        raise SystemExit("Missing model path. Set TRAINING_MODEL_PATH in .env or pass --model-path.")
    device = resolve_device(args.device)
    dataset_path = download_dataset_file(args.dataset_repo, args.dataset_file)
    answer_path = download_dataset_file(args.dataset_repo, args.answer_file)

    dataset_rows = load_jsonl(dataset_path)[: args.max_samples]
    answer_map = build_answer_map(load_jsonl(answer_path))

    model, tokenizer = load_model_and_tokenizer(args.model_path, device)

    evaluated_rows: list[dict[str, Any]] = []
    totals = {
        "samples": 0,
        "tool_name_correct": 0,
        "required_arg_matched": 0,
        "required_arg_total": 0,
        "arg_exact_match": 0,
        "schema_valid": 0,
        "hallucinated_tool": 0,
        "parse_ok": 0,
    }

    for row in dataset_rows:
        sample_id = row["id"]
        messages = row["question"][0]
        tools = row["function"]
        candidates = answer_map[sample_id]
        required_args = list(tools[0].get("parameters", {}).get("required", []))
        available_tools = {tool["name"] for tool in tools}

        prediction = generate_prediction(
            model=model,
            tokenizer=tokenizer,
            messages=messages,
            tools=tools,
            max_new_tokens=args.max_new_tokens,
            temperature=args.temperature,
        )
        metrics = evaluate_against_candidates(
            prediction=prediction,
            candidates=candidates,
            required_args=required_args,
            available_tools=available_tools,
        )

        totals["samples"] += 1
        totals["tool_name_correct"] += int(metrics["tool_name_correct"])
        totals["required_arg_matched"] += metrics["required_arg_matched"]
        totals["required_arg_total"] += metrics["required_arg_total"]
        totals["arg_exact_match"] += int(metrics["arg_exact_match"])
        totals["schema_valid"] += int(metrics["schema_valid"])
        totals["hallucinated_tool"] += int(metrics["hallucinated_tool"])
        totals["parse_ok"] += int(metrics["parse_ok"])

        evaluated_rows.append(
            {
                "id": sample_id,
                "messages": messages,
                "tools": tools,
                "gold_candidates": candidates,
                "prediction": {
                    "tool_name": prediction.tool_name,
                    "arguments": prediction.arguments,
                    "parse_ok": prediction.parse_ok,
                    "raw_text": prediction.raw_text,
                },
                "metrics": metrics,
            }
        )

    samples = max(1, totals["samples"])
    required_total = max(1, totals["required_arg_total"])
    summary = {
        "dataset_repo": args.dataset_repo,
        "dataset_file": args.dataset_file,
        "answer_file": args.answer_file,
        "model_path": args.model_path,
        "device": device,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "samples": totals["samples"],
        "tool_name_accuracy": totals["tool_name_correct"] / samples,
        "required_arg_recall": totals["required_arg_matched"] / required_total,
        "arg_exact_match": totals["arg_exact_match"] / samples,
        "schema_valid_rate": totals["schema_valid"] / samples,
        "hallucinated_tool_rate": totals["hallucinated_tool"] / samples,
        "parse_success_rate": totals["parse_ok"] / samples,
    }

    run_dir = Path(args.output_dir) / datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    save_outputs(run_dir, summary, evaluated_rows)

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"Saved results to: {run_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
