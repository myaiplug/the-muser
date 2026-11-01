"""Centralized configuration for The Muser.

Uses environment variables with sensible defaults for all paths,
API keys, model settings, and VRAM budgets.
"""

import os
from pathlib import Path

from src.utils.vram_profile import resolve_hardware_profile

# ---------------------------------------------------------------------------
# Root directories
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]
MODELS_DIR = PROJECT_ROOT / "models"
VOICES_DIR = PROJECT_ROOT / "voices"
SOUNDFONTS_DIR = PROJECT_ROOT / "soundfonts"
COMPOSITIONS_DIR = PROJECT_ROOT / "compositions"
RELEASES_DIR = PROJECT_ROOT / "releases"
TRAINING_DATA_DIR = PROJECT_ROOT / "training_data"

# ---------------------------------------------------------------------------
# Model directories
# ---------------------------------------------------------------------------
NOTAGEN_DIR = MODELS_DIR / "notagen"
ACESTEP_DIR = MODELS_DIR / "ace-step"
ACESTEP_V15_DIR = MODELS_DIR / "ace-step-v15"
DIFFSINGER_DIR = MODELS_DIR / "diffsinger"
APPLIO_DIR = MODELS_DIR / "applio"
DEMUCS_DIR = MODELS_DIR / "demucs"
SEEDVC_DIR = MODELS_DIR / "seed-vc"

# ---------------------------------------------------------------------------
# Soundfont paths
# ---------------------------------------------------------------------------
SOUNDFONT_PATHS = {
    "preview": SOUNDFONTS_DIR / "FluidR3_GM.sf2",
    "draft": SOUNDFONTS_DIR / "GeneralUser_GS.sf2",
}
SONATINA_SSO_DIR = SOUNDFONTS_DIR / "sonatina-sso"
VSCO_CE_DIR = SOUNDFONTS_DIR / "vsco-2-ce"

# ---------------------------------------------------------------------------
# Hardware profile — "8gb" (e.g. RTX 2080 Super) or "24gb" (original target)
# ---------------------------------------------------------------------------
# MUSER_HARDWARE_PROFILE = auto | 8gb | 24gb.  "auto" (default) picks "8gb" when
# the detected card has under 20 GB of VRAM and "24gb" otherwise (or when no
# NVIDIA GPU can be detected, which keeps the original behavior).  Individual
# env vars below (MUSER_VRAM_GB, MUSER_OLLAMA_MODEL, MUSER_ACESTEP_*) still win.
HARDWARE_PROFILE = resolve_hardware_profile()
LOW_VRAM = HARDWARE_PROFILE == "8gb"

# ---------------------------------------------------------------------------
# VRAM budget (GB) — sequential loading, only one model at a time
# ---------------------------------------------------------------------------
VRAM_BUDGET_PROFILES = {
    "24gb": {
        "notagen": 8.0,
        "acestep": 18.0,
        "acestep_v15": 22.0,
        "diffsinger": 8.0,
        "rvc": 6.0,
        "demucs": 4.0,
        "seedvc": 5.0,
    },
    # An 8 GB card reports ~7.6-8.0 GB total and ~7 GB free with a desktop
    # running, so every budget must stay below that.  ACE-Step v1.5 is further
    # capped by the upstream tier in src/utils/vram_profile.py (3.5 GB with
    # CPU offload + INT8); v1.0 is loaded with cpu_offload on this profile.
    "8gb": {
        "notagen": 6.5,  # NotaGen-X README: "may require 8GB" — tight on 8 GB cards
        "acestep": 6.0,
        "acestep_v15": 6.0,
        "diffsinger": 4.0,
        "rvc": 4.0,
        "demucs": 3.0,
        "seedvc": 4.0,
    },
}
VRAM_BUDGET = dict(VRAM_BUDGET_PROFILES[HARDWARE_PROFILE])
TOTAL_VRAM_GB = float(os.environ.get("MUSER_VRAM_GB", "8" if LOW_VRAM else "24"))

# ---------------------------------------------------------------------------
# LLM Provider
# ---------------------------------------------------------------------------
# Options: "local" (Ollama only, default), "hybrid" (free cloud + local fallback),
#          "cloud" (free APIs only), "anthropic" (paid, requires API key)
MUSER_LLM_MODE = os.environ.get("MUSER_LLM_MODE", "local")

# Anthropic (optional — only needed if MUSER_LLM_MODE="anthropic")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

# Free cloud API keys (optional — enables faster inference when set)
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
CEREBRAS_API_KEY = os.environ.get("CEREBRAS_API_KEY", "")
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")  # Gemini

# Ollama (always available as fallback)
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
# qwen3:30b-a3b is ~19 GB; on the 8gb profile default to qwen3:8b (~5.2 GB).
OLLAMA_MODEL = os.environ.get("MUSER_OLLAMA_MODEL", "qwen3:8b" if LOW_VRAM else "qwen3:30b-a3b")
# Ask Ollama to drop its models from VRAM (keep_alive=0) before Muser loads a
# GPU music/voice model.  An 8 GB card cannot hold qwen3:8b and ACE-Step at once.
OLLAMA_UNLOAD_BEFORE_GPU = (
    os.environ.get("MUSER_OLLAMA_UNLOAD_BEFORE_GPU", "true" if LOW_VRAM else "false").lower()
    == "true"
)

# Legacy Claude model references (used when MUSER_LLM_MODE="anthropic")
CLAUDE_MODEL_ROUTINE = os.environ.get("MUSER_CLAUDE_MODEL_ROUTINE", "claude-sonnet-4-5-20250929")
CLAUDE_MODEL_COMPLEX = os.environ.get("MUSER_CLAUDE_MODEL_COMPLEX", "claude-opus-4-6")
MAX_TOOL_ITERATIONS = int(os.environ.get("MUSER_MAX_TOOL_ITERATIONS", "20"))

# ---------------------------------------------------------------------------
# Generation defaults
# ---------------------------------------------------------------------------
NOTAGEN_MAX_LENGTH = int(os.environ.get("MUSER_NOTAGEN_MAX_LEN", "1024"))
NOTAGEN_TIMEOUT_S = int(os.environ.get("MUSER_NOTAGEN_TIMEOUT", "120"))
ACESTEP_DEFAULT_DURATION_S = int(os.environ.get("MUSER_ACESTEP_DURATION", "120"))
ACESTEP_MAX_RETRIES = int(os.environ.get("MUSER_ACESTEP_RETRIES", "3"))
ACESTEP_INFER_STEP = int(os.environ.get("MUSER_ACESTEP_INFER_STEP", "50"))
ACESTEP_GUIDANCE_SCALE = float(os.environ.get("MUSER_ACESTEP_GUIDANCE", "4.0"))
BEST_OF_N = int(os.environ.get("MUSER_BEST_OF_N", "2"))
ACESTEP_SAMPLE_RATE = 48000  # ACE-Step native output rate (not configurable)

# ---------------------------------------------------------------------------
# DiffSinger settings
# ---------------------------------------------------------------------------
DIFFSINGER_SAMPLE_RATE = 44100  # DiffSinger native sample rate
DIFFSINGER_HOP_SIZE = 512
DIFFSINGER_MEL_BINS = 128
DIFFSINGER_VOCODER = os.environ.get("MUSER_DIFFSINGER_VOCODER", "griffin-lim")
DIFFSINGER_VOCODER_NC_ACK = os.environ.get("MUSER_VOCODER_NC_ACK", "false").lower() == "true"
DIFFSINGER_PREFER_ONNX = os.environ.get("MUSER_DIFFSINGER_ONNX", "true").lower() == "true"
DIFFSINGER_TIMEOUT = int(os.environ.get("MUSER_DIFFSINGER_TIMEOUT", "300"))

# ---------------------------------------------------------------------------
# ACE-Step v1.5 settings
# ---------------------------------------------------------------------------
ACESTEP_VERSION = os.environ.get("MUSER_ACESTEP_VERSION", "v15")
# 8gb profile: 2B turbo DiT + 0.6B LM on the "pt" backend (ACE-Step 1.5
# README / docs/en/GPU_COMPATIBILITY.md, 6-8 GB tier).
ACESTEP_V15_DIT_MODEL = os.environ.get(
    "MUSER_ACESTEP_DIT_MODEL", "acestep-v15-turbo" if LOW_VRAM else "acestep-v15-sft"
)
ACESTEP_V15_LM_MODEL = os.environ.get(
    "MUSER_ACESTEP_LM_MODEL", "acestep-5Hz-lm-0.6B" if LOW_VRAM else "acestep-5Hz-lm-1.7B"
)
ACESTEP_V15_LM_TEMPERATURE = float(os.environ.get("MUSER_ACESTEP_LM_TEMP", "0.85"))
ACESTEP_V15_LM_CFG_SCALE = float(os.environ.get("MUSER_ACESTEP_LM_CFG", "2.0"))
# Upstream allows batch 2 on the 6-8 GB tier and shrinks it itself if VRAM is short.
ACESTEP_V15_BATCH_SIZE = int(os.environ.get("MUSER_ACESTEP_BATCH_SIZE", "2"))
# Initialize the 5Hz LM so generate_music() can plan/"think" (default on for
# the 8gb profile; off on 24gb, which keeps the previous DiT-only path). Failure is
# non-fatal: generation falls back to DiT-only (the previous behavior).
ACESTEP_V15_INIT_LM = (
    os.environ.get("MUSER_ACESTEP_INIT_LM", "true" if LOW_VRAM else "false").lower() == "true"
)
# Turing (RTX 20xx) has no bf16; the LM defaults to fp32 there unless overridden
# with MUSER_ACESTEP_LM_DTYPE=float16|bfloat16|float32.
ACESTEP_V15_LM_DTYPE = os.environ.get("MUSER_ACESTEP_LM_DTYPE", "")
ACESTEP_V15_THINKING_MODE = os.environ.get("MUSER_ACESTEP_THINKING", "true").lower() == "true"
ACESTEP_V15_API_URL = os.environ.get("MUSER_ACESTEP_API_URL", "")
ACESTEP_V15_API_KEY = os.environ.get("MUSER_ACESTEP_API_KEY", "")

# ---------------------------------------------------------------------------
# Audio defaults
# ---------------------------------------------------------------------------
SAMPLE_RATE = int(os.environ.get("MUSER_SAMPLE_RATE", "44100"))
TARGET_LUFS = float(os.environ.get("MUSER_TARGET_LUFS", "-14"))
MP3_BITRATE = os.environ.get("MUSER_MP3_BITRATE", "320k")

# ---------------------------------------------------------------------------
# Local tool paths (.local prefix for sudo-free installs)
# ---------------------------------------------------------------------------
LOCAL_DIR = PROJECT_ROOT / ".local"
_lilypond_candidates = (
    sorted(LOCAL_DIR.glob("lilypond-*/bin/lilypond")) if LOCAL_DIR.exists() else []
)
LILYPOND_PATH = os.environ.get(
    "MUSER_LILYPOND_PATH",
    str(_lilypond_candidates[-1]) if _lilypond_candidates else "lilypond",
)
FLUIDSYNTH_PATH = os.environ.get(
    "MUSER_FLUIDSYNTH_PATH",
    str(LOCAL_DIR / "bin" / "fluidsynth")
    if (LOCAL_DIR / "bin" / "fluidsynth").exists()
    else "fluidsynth",
)
SFIZZ_PATH = os.environ.get(
    "MUSER_SFIZZ_PATH",
    str(LOCAL_DIR / "bin" / "sfizz_render")
    if (LOCAL_DIR / "bin" / "sfizz_render").exists()
    else "sfizz_render",
)

# ---------------------------------------------------------------------------
# Rendering timeouts (seconds)
# ---------------------------------------------------------------------------
LILYPOND_TIMEOUT = int(os.environ.get("MUSER_LILYPOND_TIMEOUT", "120"))
MUSESCORE_TIMEOUT = int(os.environ.get("MUSER_MUSESCORE_TIMEOUT", "120"))
FLUIDSYNTH_TIMEOUT = int(os.environ.get("MUSER_FLUIDSYNTH_TIMEOUT", "300"))
FFMPEG_TIMEOUT = int(os.environ.get("MUSER_FFMPEG_TIMEOUT", "300"))

# ---------------------------------------------------------------------------
# Feminization presets (3-stage pipeline: formant pre-shift + RVC + EQ)
# ---------------------------------------------------------------------------
FEMINIZATION_PRESETS = {
    "powerful_mezzo": {
        "pre_formant_ratio": 1.07,
        "transpose": 4,
        "formant_timbre": 1.20,
        "f0_method": "rmvpe",
        "presence_boost_db": 1.5,
        "chest_cut_db": 1.0,
        "add_breathiness": False,
    },
    "soft_feminine": {
        "pre_formant_ratio": 1.08,
        "transpose": 8,
        "formant_timbre": 1.15,
        "f0_method": "rmvpe",
        "presence_boost_db": 2.0,
        "chest_cut_db": 1.5,
        "add_breathiness": True,
    },
    "androgynous": {
        "pre_formant_ratio": 1.04,
        "transpose": 3,
        "formant_timbre": 1.10,
        "f0_method": "rmvpe",
        "presence_boost_db": 1.0,
        "chest_cut_db": 0.5,
        "add_breathiness": False,
    },
    "natural_male": {
        "pre_formant_ratio": 1.0,
        "transpose": 0,
        "formant_timbre": 1.0,
        "f0_method": "rmvpe",
        "presence_boost_db": 0.0,
        "chest_cut_db": 0.0,
        "add_breathiness": False,
    },
    "deep_male": {
        "pre_formant_ratio": 0.97,
        "transpose": -3,
        "formant_timbre": 0.95,
        "f0_method": "rmvpe",
        "presence_boost_db": 0.0,
        "chest_cut_db": 0.0,
        "add_breathiness": False,
    },
}
