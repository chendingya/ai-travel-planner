#!/usr/bin/env python3
"""Check the local llm environment for Qwen3.5 tool-calling work."""

from __future__ import annotations

import argparse
import json
import os
import platform
import sys
from importlib import metadata, util
from pathlib import Path
from typing import Any

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
DEFAULT_OUTPUT_PATH = resolve_project_path(
    get_env(
        "TRAINING_PHASE0_OUTPUT",
        "training/artifacts/phase0_env_check.json",
        candidates=TRAINING_ENV_CANDIDATES,
    ),
    base_dir=PROJECT_ROOT,
)
DEFAULT_PACKAGES = [
    "torch",
    "transformers",
    "datasets",
    "peft",
    "trl",
    "accelerate",
    "bitsandbytes",
    "jinja2",
    "jsonschema",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate the llm conda environment for local Qwen3.5 experiments.",
    )
    parser.add_argument(
        "--model-path",
        default=DEFAULT_MODEL_PATH,
        help="Local Qwen model path; defaults to TRAINING_MODEL_PATH from .env",
    )
    parser.add_argument(
        "--check-model",
        action="store_true",
        help="Also load the full model weights to verify end-to-end compatibility",
    )
    parser.add_argument(
        "--output",
        default=DEFAULT_OUTPUT_PATH,
        help="Optional JSON output path; defaults to TRAINING_PHASE0_OUTPUT from .env",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit non-zero when required packages are missing or model loading fails",
    )
    return parser.parse_args()


def package_version(name: str) -> str | None:
    pkg_name = "Jinja2" if name == "jinja2" else name
    try:
        return metadata.version(pkg_name)
    except metadata.PackageNotFoundError:
        return None


def collect_packages(names: list[str]) -> dict[str, dict[str, Any]]:
    results: dict[str, dict[str, Any]] = {}
    for name in names:
        found = util.find_spec(name) is not None
        results[name] = {
            "found": found,
            "version": package_version(name) if found else None,
        }
    return results


def collect_runtime() -> dict[str, Any]:
    runtime: dict[str, Any] = {
        "python_executable": sys.executable,
        "python_version": platform.python_version(),
        "platform": platform.platform(),
        "conda_env": os.getenv("CONDA_DEFAULT_ENV", ""),
    }

    if util.find_spec("torch") is None:
        runtime["cuda"] = {"available": False, "reason": "torch missing"}
        return runtime

    import torch

    cuda_info: dict[str, Any] = {
        "available": bool(torch.cuda.is_available()),
        "device_count": int(torch.cuda.device_count()),
        "devices": [],
    }
    if torch.cuda.is_available():
        for index in range(torch.cuda.device_count()):
            props = torch.cuda.get_device_properties(index)
            cuda_info["devices"].append(
                {
                    "index": index,
                    "name": props.name,
                    "total_memory_gb": round(props.total_memory / (1024**3), 2),
                }
            )
    runtime["cuda"] = cuda_info
    return runtime


def check_model(model_path: str, check_weights: bool) -> dict[str, Any]:
    result: dict[str, Any] = {
        "path": model_path,
        "exists": Path(model_path).exists(),
        "config": {"ok": False, "class": "", "error": ""},
        "tokenizer": {"ok": False, "class": "", "error": ""},
        "model": {"checked": check_weights, "ok": False, "class": "", "error": ""},
    }
    if not result["exists"]:
        result["config"]["error"] = "model path does not exist"
        result["tokenizer"]["error"] = "model path does not exist"
        if check_weights:
            result["model"]["error"] = "model path does not exist"
        return result

    if util.find_spec("transformers") is None:
        error = "transformers missing"
        result["config"]["error"] = error
        result["tokenizer"]["error"] = error
        if check_weights:
            result["model"]["error"] = error
        return result

    from transformers import AutoConfig, AutoModelForCausalLM, AutoTokenizer

    try:
        config = AutoConfig.from_pretrained(model_path, trust_remote_code=True)
        result["config"]["ok"] = True
        result["config"]["class"] = config.__class__.__name__
    except Exception as exc:  # pragma: no cover - diagnostic path
        result["config"]["error"] = f"{type(exc).__name__}: {exc}"

    try:
        tokenizer = AutoTokenizer.from_pretrained(model_path, trust_remote_code=True)
        result["tokenizer"]["ok"] = True
        result["tokenizer"]["class"] = tokenizer.__class__.__name__
    except Exception as exc:  # pragma: no cover - diagnostic path
        result["tokenizer"]["error"] = f"{type(exc).__name__}: {exc}"

    if check_weights:
        try:
            model = AutoModelForCausalLM.from_pretrained(
                model_path,
                trust_remote_code=True,
                device_map="cpu",
            )
            result["model"]["ok"] = True
            result["model"]["class"] = model.__class__.__name__
            del model
        except Exception as exc:  # pragma: no cover - diagnostic path
            result["model"]["error"] = f"{type(exc).__name__}: {exc}"

    return result


def build_report(args: argparse.Namespace) -> dict[str, Any]:
    packages = collect_packages(DEFAULT_PACKAGES)
    runtime = collect_runtime()
    model = check_model(args.model_path, check_weights=args.check_model)
    missing = sorted(name for name, item in packages.items() if not item["found"])

    report = {
        "runtime": runtime,
        "packages": packages,
        "model": model,
        "summary": {
            "missing_packages": missing,
            "config_ok": bool(model["config"]["ok"]),
            "tokenizer_ok": bool(model["tokenizer"]["ok"]),
            "model_ok": bool(model["model"]["ok"]) if args.check_model else None,
        },
    }
    return report


def write_output(report: dict[str, Any], output_path: str) -> None:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def print_human_readable(report: dict[str, Any]) -> None:
    runtime = report["runtime"]
    summary = report["summary"]
    model = report["model"]

    print(f"Conda env: {runtime['conda_env'] or '<unknown>'}")
    print(f"Python: {runtime['python_version']} ({runtime['python_executable']})")
    cuda = runtime["cuda"]
    print(f"CUDA available: {cuda['available']}")
    if cuda["available"]:
        print(f"CUDA devices: {cuda['device_count']}")
        for item in cuda["devices"]:
            print(f"  - cuda:{item['index']} {item['name']} {item['total_memory_gb']} GB")

    print("\nPackages:")
    for name, item in report["packages"].items():
        status = item["version"] if item["found"] else "MISSING"
        print(f"  - {name}: {status}")

    print("\nModel checks:")
    print(f"  - config: {'OK' if model['config']['ok'] else 'FAIL'} {model['config']['class'] or model['config']['error']}")
    print(f"  - tokenizer: {'OK' if model['tokenizer']['ok'] else 'FAIL'} {model['tokenizer']['class'] or model['tokenizer']['error']}")
    if model["model"]["checked"]:
        print(f"  - model: {'OK' if model['model']['ok'] else 'FAIL'} {model['model']['class'] or model['model']['error']}")

    if summary["missing_packages"]:
        print("\nMissing packages:", ", ".join(summary["missing_packages"]))
    else:
        print("\nMissing packages: none")


def main() -> int:
    args = parse_args()
    args.model_path = resolve_project_path(args.model_path)
    args.output = resolve_project_path(args.output)
    if not args.model_path:
        raise SystemExit("Missing model path. Set TRAINING_MODEL_PATH in .env or pass --model-path.")
    report = build_report(args)
    print_human_readable(report)
    if args.output:
        write_output(report, args.output)

    has_missing = bool(report["summary"]["missing_packages"])
    config_ok = bool(report["summary"]["config_ok"])
    tokenizer_ok = bool(report["summary"]["tokenizer_ok"])
    model_ok = report["summary"]["model_ok"]
    failed_model = model_ok is False

    if args.strict and (has_missing or not config_ok or not tokenizer_ok or failed_model):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
