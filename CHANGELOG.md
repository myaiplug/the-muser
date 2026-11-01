# Changelog

All notable changes to The Muser are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- `MUSER_HARDWARE_PROFILE` (`auto` | `8gb` | `24gb`): `auto` uses `8gb` on GPUs under
  20 GB (detected with `nvidia-smi`, no torch import) and keeps the original `24gb` path otherwise.
- `8gb` profile defaults: ACE-Step 1.5 `acestep-v15-turbo` DiT + `acestep-5Hz-lm-0.6B` LM on the
  `pt` backend, CPU + DiT offload, INT8, lower VRAM budgets, ACE-Step v1.0 with `cpu_offload`,
  Ollama `qwen3:8b`, and Ollama models unloaded (`keep_alive: 0`) before a GPU model loads.
- ACE-Step 1.5 5Hz LM is now initialized when enabled (`MUSER_ACESTEP_INIT_LM`, default on for
  `8gb`); float32 on pre-Ampere GPUs; failures fall back to DiT-only.
- `scripts/setup_models.sh` clones ACE-Step 1.5 into `models/ace-step-v15`.
- README section "8 GB GPU (e.g. RTX 2080 Super)".

### Changed
- `MUSER_OLLAMA_MODEL` is now honored by the provider chains and the web UI default.

### Fixed
- Seed-VC is GPL-3.0, not MIT, in THIRD_PARTY_LICENSES.md and NOTICE.

## [1.0.0] - 2026-05-26

### Added
- 46-tool composition vocabulary covering generation, validation, rendering, voice, effects, mixing, and curation
- LLM agent loop with provider-agnostic backend (Ollama, Groq, Cerebras, Gemini, Anthropic)
- Streaming LLM responses with token-by-token CLI display
- ACE-Step v1.0 and v1.5 audio generation with best-of-N candidate selection
- NotaGen symbolic music generation (ABC → MusicXML)
- DiffSinger singing voice synthesis with license-safe vocoder defaults
- RVC/Applio voice conversion with 5 feminization presets
- Demucs stem separation and Seed-VC zero-shot voice conversion
- 4-level hierarchical composition planner with zoom navigation
- Musical Memory Document for cross-session composition state
- 12-dimension audio curation pipeline (6 hard gates + 6 soft scores)
- Audio-to-MIDI extraction bridge (basic-pitch + librosa fallback)
- Individual audio effects: EQ, reverb, compression, volume
- N-track audio mixer with per-track volume, pan, and delay
- Audio playback tool for inline CLI listening
- Voice LoRA training with status monitoring and auto-registration
- Post-production mastering with genre presets and 5-stage vocal chain
- Gradio web interface with chat, audio player, and composition status
- Docker support (CPU and GPU images) with docker-compose
- CI/CD via GitHub Actions (test matrix, lint, coverage)
- Comprehensive legal documentation and license tracking
- 258+ tests with 100% tool coverage

### Legal
- All default generation paths produce commercially-safe output (Apache 2.0 / MIT)
- GPL tools (LilyPond, MuseScore) isolated to subprocess calls
- CC-BY-NC-SA vocoder (NSF-HiFiGAN) requires explicit opt-in
- parselmouth (GPL v3) isolated behind MUSER_FEMINIZE_BACKEND flag
