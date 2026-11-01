"""Hardware profile (8gb / 24gb) resolution and the low-VRAM helpers.

CPU only, no GPU, no model downloads.  Config defaults are read in a fresh
subprocess so the module-level constants of the running test session are
never changed.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from types import SimpleNamespace
from typing import ClassVar

import pytest

from src.utils import vram_profile

PROJECT_ROOT = Path(__file__).resolve().parents[1]

_PROFILE_ENV = (
    "MUSER_HARDWARE_PROFILE",
    "MUSER_VRAM_GB",
    "MUSER_FORCE_VRAM_GB",
    "MUSER_OLLAMA_MODEL",
    "MUSER_OLLAMA_UNLOAD_BEFORE_GPU",
    "MUSER_ACESTEP_DIT_MODEL",
    "MUSER_ACESTEP_LM_MODEL",
    "MUSER_ACESTEP_INIT_LM",
    "MUSER_ACESTEP_QUANT",
)


@pytest.fixture
def clean_env(monkeypatch):
    for k in _PROFILE_ENV:
        monkeypatch.delenv(k, raising=False)
    # Never shell out to a real nvidia-smi from unit tests.
    monkeypatch.setattr(vram_profile, "nvidia_smi_total_vram_gb", lambda timeout=5.0: 0.0)
    return monkeypatch


def _config_in_subprocess(**env: str) -> dict:
    code = (
        "import json\n"
        "from src.orchestrator import config as c\n"
        "from src.orchestrator import llm_provider as p\n"
        "print(json.dumps({'profile': c.HARDWARE_PROFILE, 'ollama': c.OLLAMA_MODEL,"
        " 'budget': c.VRAM_BUDGET, 'total': c.TOTAL_VRAM_GB, 'dit': c.ACESTEP_V15_DIT_MODEL,"
        " 'lm': c.ACESTEP_V15_LM_MODEL, 'init_lm': c.ACESTEP_V15_INIT_LM,"
        " 'unload': c.OLLAMA_UNLOAD_BEFORE_GPU, 'local_chain': p.LOCAL_ONLY_CHAIN,"
        " 'chain_tail': p.PROVIDER_CHAIN[-1]}))\n"
    )
    child_env = {k: v for k, v in os.environ.items() if k not in _PROFILE_ENV}
    # Hide any real nvidia-smi so "auto" only sees the env vars we pass.
    child_env["PATH"] = os.path.dirname(sys.executable)
    child_env.update(env)
    out = subprocess.run(
        [sys.executable, "-c", code],
        cwd=PROJECT_ROOT,
        env=child_env,
        capture_output=True,
        text=True,
        timeout=120,
        check=True,
    )
    return json.loads(out.stdout.strip().splitlines()[-1])


# ---------------------------------------------------------------------------
# Profile resolution
# ---------------------------------------------------------------------------


def test_resolve_explicit_values(clean_env):
    for v in ("8gb", "8GB", "8", "low"):
        assert vram_profile.resolve_hardware_profile(v, vram_gb=24) == "8gb"
    for v in ("24gb", "24", "full"):
        assert vram_profile.resolve_hardware_profile(v, vram_gb=8) == "24gb"


def test_resolve_auto_by_vram(clean_env):
    assert vram_profile.resolve_hardware_profile("auto", vram_gb=7.8) == "8gb"  # RTX 2080 Super
    assert vram_profile.resolve_hardware_profile("auto", vram_gb=12.0) == "8gb"
    assert vram_profile.resolve_hardware_profile("auto", vram_gb=24.0) == "24gb"
    # No detectable GPU keeps the original behavior.
    assert vram_profile.resolve_hardware_profile("auto", vram_gb=0.0) == "24gb"


def test_detect_vram_env_order(clean_env):
    assert vram_profile.detect_total_vram_gb() == 0.0
    clean_env.setenv("MUSER_FORCE_VRAM_GB", "8")
    assert vram_profile.detect_total_vram_gb() == 8.0
    clean_env.setenv("MUSER_VRAM_GB", "24")
    assert vram_profile.detect_total_vram_gb() == 24.0
    assert vram_profile.resolve_hardware_profile() == "24gb"
    clean_env.setenv("MUSER_HARDWARE_PROFILE", "8gb")
    assert vram_profile.resolve_hardware_profile() == "8gb"


def test_nvidia_smi_missing_is_zero(monkeypatch):
    monkeypatch.setattr(vram_profile.shutil, "which", lambda _name: None)
    assert vram_profile.nvidia_smi_total_vram_gb() == 0.0


def test_acestep_profile_for(clean_env):
    # auto follows the real card, unchanged from acestep_profile().
    assert vram_profile.acestep_profile_for("8gb", 7.8).tier == "8gb"
    assert vram_profile.acestep_profile_for("8gb", 11.0).tier == "8-12gb"
    assert vram_profile.acestep_profile_for("24gb", 24.0).tier == "20gb+"
    clean_env.setenv("MUSER_HARDWARE_PROFILE", "8gb")
    p = vram_profile.acestep_profile_for("8gb", 11.0)
    assert p.tier == "8gb" and p.lm_model == "acestep-5Hz-lm-0.6B" and p.lm_backend == "pt"
    assert p.offload_to_cpu and p.offload_dit_to_cpu
    clean_env.setenv("MUSER_HARDWARE_PROFILE", "24gb")
    assert vram_profile.acestep_profile_for("24gb", 7.8).dit_model == "acestep-v15-sft"


# ---------------------------------------------------------------------------
# Config defaults per profile (fresh interpreter each)
# ---------------------------------------------------------------------------


def test_config_24gb_defaults_unchanged():
    c = _config_in_subprocess(MUSER_HARDWARE_PROFILE="24gb")
    assert c["profile"] == "24gb"
    assert c["ollama"] == "qwen3:30b-a3b"
    assert c["total"] == 24.0
    assert c["budget"]["acestep_v15"] == 22.0 and c["budget"]["notagen"] == 8.0
    assert c["dit"] == "acestep-v15-sft" and c["lm"] == "acestep-5Hz-lm-1.7B"
    assert c["init_lm"] is False and c["unload"] is False
    assert c["local_chain"] == ["ollama_chat/qwen3:30b-a3b", "ollama_chat/qwen3:8b"]
    assert c["chain_tail"] == "ollama_chat/qwen3:30b-a3b"


def test_config_no_gpu_auto_keeps_24gb():
    c = _config_in_subprocess()
    assert c["profile"] == "24gb" and c["ollama"] == "qwen3:30b-a3b"


def test_config_8gb_defaults():
    c = _config_in_subprocess(MUSER_HARDWARE_PROFILE="auto", MUSER_FORCE_VRAM_GB="7.8")
    assert c["profile"] == "8gb"
    assert c["ollama"] == "qwen3:8b"
    assert c["total"] == 8.0
    assert all(v < 7.5 for v in c["budget"].values()), c["budget"]
    assert c["dit"] == "acestep-v15-turbo" and c["lm"] == "acestep-5Hz-lm-0.6B"
    assert c["init_lm"] is True and c["unload"] is True
    assert c["local_chain"] == ["ollama_chat/qwen3:8b"]
    assert c["chain_tail"] == "ollama_chat/qwen3:8b"


def test_config_env_overrides_win():
    c = _config_in_subprocess(
        MUSER_HARDWARE_PROFILE="8gb",
        MUSER_OLLAMA_MODEL="qwen3:4b",
        MUSER_ACESTEP_INIT_LM="false",
    )
    assert c["ollama"] == "qwen3:4b" and c["init_lm"] is False
    assert c["local_chain"][0] == "ollama_chat/qwen3:4b"
    assert "ollama_chat/qwen3:30b-a3b" not in c["local_chain"]


# ---------------------------------------------------------------------------
# Ollama unload helper
# ---------------------------------------------------------------------------


class _FakeOllama(BaseHTTPRequestHandler):
    loaded: ClassVar[list[str]] = ["qwen3:8b"]
    unloaded: ClassVar[list[dict]] = []

    def log_message(self, *args):  # keep test output quiet
        pass

    def do_GET(self):
        if self.path == "/api/ps":
            body = json.dumps({"models": [{"name": m, "model": m} for m in self.loaded]})
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body.encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        _FakeOllama.unloaded.append(json.loads(self.rfile.read(length)))
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"done": true}')


def test_unload_ollama_models():
    from src.utils.model_manager import unload_ollama_models

    server = HTTPServer(("127.0.0.1", 0), _FakeOllama)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    try:
        _FakeOllama.unloaded = []
        names = unload_ollama_models(f"http://127.0.0.1:{server.server_port}", timeout=5)
    finally:
        server.shutdown()
    assert names == ["qwen3:8b"]
    assert _FakeOllama.unloaded == [{"model": "qwen3:8b", "keep_alive": 0}]


def test_unload_ollama_unreachable_is_noop():
    from src.utils.model_manager import unload_ollama_models

    assert unload_ollama_models("http://127.0.0.1:9", timeout=0.5) == []


def test_check_vram_unloads_ollama_when_enabled(monkeypatch):
    from src.utils import model_manager as mm

    calls = []
    monkeypatch.setattr(mm, "OLLAMA_UNLOAD_BEFORE_GPU", True)
    monkeypatch.setattr(mm, "unload_ollama_models", lambda *a, **k: calls.append(1) or [])
    mgr = mm.ModelManager()
    monkeypatch.setattr(mgr, "get_vram_free_gb", lambda: 7.0)
    mgr._check_vram(3.5)
    assert calls == [1]
    monkeypatch.setattr(mm, "OLLAMA_UNLOAD_BEFORE_GPU", False)
    mgr._check_vram(3.5)
    assert calls == [1]


# ---------------------------------------------------------------------------
# ACE-Step 1.5 LM init (fake upstream handler, fake torch)
# ---------------------------------------------------------------------------


def _fake_torch(cuda: bool, major: int):
    cuda_ns = SimpleNamespace(
        is_available=lambda: cuda, get_device_capability=lambda _i=0: (major, 5)
    )
    return SimpleNamespace(cuda=cuda_ns, float32="f32", float16="f16", bfloat16="bf16")


class _FakeLLM:
    def __init__(self, ok=True):
        self.ok = ok
        self.kwargs = None

    def initialize(
        self, checkpoint_dir, lm_model_path, backend="vllm", device="auto",
        offload_to_cpu=False, dtype=None,
    ):  # fmt: skip
        self.kwargs = {
            "checkpoint_dir": checkpoint_dir,
            "lm_model_path": lm_model_path,
            "backend": backend,
            "device": device,
            "offload_to_cpu": offload_to_cpu,
            "dtype": dtype,
        }
        return ("ok" if self.ok else "boom"), self.ok


def test_lm_init_turing_uses_fp32_and_pt(clean_env):
    from src.utils import model_manager as mm

    profile = vram_profile.acestep_profile(7.8)
    llm = _FakeLLM()
    assert mm.ModelManager()._init_acestep_v15_lm(llm, profile, _fake_torch(True, 7))
    assert llm.kwargs["lm_model_path"] == "acestep-5Hz-lm-0.6B"
    assert llm.kwargs["backend"] == "pt" and llm.kwargs["offload_to_cpu"] is True
    assert llm.kwargs["dtype"] == "f32"


def test_lm_init_ampere_leaves_dtype_to_upstream(clean_env):
    from src.utils import model_manager as mm

    llm = _FakeLLM()
    mm.ModelManager()._init_acestep_v15_lm(
        llm, vram_profile.acestep_profile(7.8), _fake_torch(True, 8)
    )
    assert llm.kwargs["dtype"] is None


def test_lm_init_failure_is_not_fatal(clean_env):
    from src.utils import model_manager as mm

    ok = mm.ModelManager()._init_acestep_v15_lm(
        _FakeLLM(ok=False), vram_profile.acestep_profile(7.8), _fake_torch(True, 7)
    )
    assert ok is False
