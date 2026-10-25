# The Muser

**The open-source alternative to Suno and ElevenLabs Music.**
Run locally. Own everything. No subscriptions, no ToS, no limits.

Describe what you want to hear in natural language, and The Muser orchestrates
AI models to produce scores, audio, and vocal performances — entirely on your
hardware.

## Quick Start

```bash
pip install -e "."
ollama pull qwen3:30b-a3b          # 8 GB GPU? use qwen3:8b, see below
bash scripts/setup_models.sh
muser
```

> **You:** Compose a 2-minute lo-fi hip hop beat with jazzy piano and vinyl crackle
>
> The Muser generates candidates, selects the best, and exports production-ready audio.

> **NoDAW Labs fork:** this fork adds **The Muser Studio**, a hardware-style web studio (stem splitting,
> per-stem mixer, pads, keys, undo/redo) on top of the original agent. See **[STUDIO_README.md](STUDIO_README.md)**
> for Windows setup (`setup_windows.bat` → `start_studio.bat`).

## What It Does

```
User ──► LLM Agent (46 tools) ──► AI Models ──► Your Music
              │                        │
         Plans, validates,        NotaGen (notation)
         iterates, mixes         ACE-Step (audio)
                                 DiffSinger (vocals)
                                 RVC (voice cloning)
```

- **Natural language composition** — describe music in plain English, get professional output
- **46-tool vocabulary** — generation, validation, rendering, voice, effects, mixing, curation
- **Multiple AI models** — NotaGen for classical notation, ACE-Step for modern audio, DiffSinger for singing
- **Full voice pipeline** — RVC voice conversion, Demucs stem separation, feminization presets
- **Quality scoring** — 9-metric analysis with letter grades, best-of-N candidate selection
- **Audio-to-MIDI bridge** — extract sheet music from generated audio
- **Individual effects** — EQ, reverb, compression, volume, mixing — all controllable by the LLM
- **12-dimension curation** — hard gates + soft scores for batch quality control
- **Web UI** — Gradio interface with chat, audio player, and composition status
- **Streaming** — token-by-token LLM responses, no more staring at spinners

## Output Ownership

Every default generation path produces commercially-safe output:

| Path | License | Commercial Use |
|---|---|---|
| ACE-Step audio | Apache 2.0 | **YES** |
| NotaGen notation | MIT | **YES** |
| DiffSinger + Griffin-Lim (default) | Apache 2.0 | **YES** |
| RVC voice conversion | MIT | **YES** |
| FluidSynth/sfizz rendering | LGPL/BSD | **YES** |

See [docs/legal.md](docs/legal.md) for the full breakdown including optional components.

## Installation

### Prerequisites

- Python 3.10+
- NVIDIA GPU with 24GB VRAM (for full pipeline), an 8 GB GPU with the low-VRAM
  profile ([see below](#8-gb-gpu-eg-rtx-2080-super)), or CPU-only (LLM orchestration)
- [Ollama](https://ollama.com) for local LLM inference
- ffmpeg, FluidSynth (for audio rendering)

### Full Install

```bash
git clone https://github.com/noah-chelednik/the-muser.git
cd the-muser
python -m venv .venv && source .venv/bin/activate
pip install -e ".[gpu,voice]"       # GPU + voice pipeline
bash scripts/setup_environment.sh   # System tools + Ollama
bash scripts/setup_models.sh        # AI model weights
cp .env.example .env                # Edit as needed
```

### Docker

```bash
docker-compose up muser-gpu    # GPU mode (requires NVIDIA Container Toolkit)
docker-compose up muser-cpu    # CPU-only mode
docker-compose up muser-web    # Web UI at http://localhost:7860
```

### 8 GB GPU (e.g. RTX 2080 Super)

The Muser picks a **hardware profile** at startup. `MUSER_HARDWARE_PROFILE=auto`
(the default) reads total VRAM from `nvidia-smi` and uses `8gb` on cards under
20 GB and `24gb` otherwise. With no detectable NVIDIA GPU it stays on `24gb`,
the original behavior. You can force either one:

```bash
export MUSER_HARDWARE_PROFILE=8gb       # PowerShell: $env:MUSER_HARDWARE_PROFILE="8gb"
ollama pull qwen3:8b                    # ~5.2 GB, instead of qwen3:30b-a3b (~19 GB)
bash scripts/setup_models.sh            # also clones ACE-Step 1.5 into models/ace-step-v15
```

What the `8gb` profile changes (any individual `MUSER_*` variable still wins):

| Setting | `24gb` (original) | `8gb` |
|---|---|---|
| ACE-Step 1.5 DiT | `acestep-v15-sft` | `acestep-v15-turbo` (2B) |
| ACE-Step 5Hz LM | not loaded | `acestep-5Hz-lm-0.6B`, `pt` backend |
| Offload / quantization | none | CPU offload (incl. DiT), INT8 weights |
| ACE-Step v1.0 (if selected) | GPU | `cpu_offload=True` |
| Ollama model | `qwen3:30b-a3b` | `qwen3:8b` |
| Ollama in VRAM during generation | left loaded | unloaded first (`keep_alive: 0`) |
| VRAM budgets | 22 GB ACE-Step 1.5, 8 GB NotaGen... | 3.5 GB ACE-Step 1.5, 6.5 GB NotaGen... |

These follow the 6-8 GB tier in ACE-Step 1.5's
[GPU compatibility guide](https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/GPU_COMPATIBILITY.md):
2B turbo DiT, 0.6B LM on the PyTorch backend, CPU + DiT offload, INT8.

RTX 20-series (Turing) notes:

- No native bfloat16, so the DiT runs in float16 (ACE-Step 1.5 picks this
  itself) and the 5Hz LM runs in float32. `MUSER_ACESTEP_LM_DTYPE=float16`
  saves about 1 GB, but some bf16-trained weights can produce NaNs in fp16.
- FlashAttention 2 and FP8 need an RTX 30 or newer card, so both stay off.
  `torch.compile` is off by default (`MUSER_ACESTEP_COMPILE=true` to try it).
- INT8 needs `torchao` (ACE-Step 1.5 pins `>=0.16,<0.17`). Without it ACE-Step
  logs "Quantization disabled" and loads unquantized fp16 weights, which may not fit. `MUSER_ACESTEP_QUANT=none`
  turns it off on purpose.
- Ollama and the music model cannot share 8 GB. The profile unloads Ollama
  models before a GPU model loads, and they reload on the next chat turn. To keep
  the LLM on the CPU instead, start Ollama with `CUDA_VISIBLE_DEVICES=-1 ollama serve`.
- Close browsers, games and other GPU apps before generating.

Other engines on 8 GB: DiffRhythm fits with chunked VAE decoding (`--chunked`,
per its README; the Studio passes it automatically). YuE needs 24 GB+ and is not
a default. The Studio has its own per-engine VRAM guide in
[STUDIO_README.md](STUDIO_README.md).

To go back to the original path on any card, set `MUSER_HARDWARE_PROFILE=24gb`.

## Usage

### CLI

```bash
muser                           # Interactive session
muser -c my-piece               # Resume a composition
muser --stream                  # Streaming responses (default)
muser -m groq/llama-3.3-70b    # Use a specific LLM provider
```

### Web UI

```bash
muser-web                       # Launch at http://localhost:7860
```

### LLM Providers

No paid API key required. The Muser routes to the best available provider:

| Provider | Speed | Cost | Setup |
|---|---|---|---|
| Groq | 300+ tok/s | Free tier | Set `GROQ_API_KEY` |
| Cerebras | 1000+ tok/s | Free tier | Set `CEREBRAS_API_KEY` |
| Gemini | Fast | Free tier | Set `GOOGLE_API_KEY` |
| Ollama (local) | 12-28 tok/s | Free forever | `ollama pull qwen3:30b-a3b` (`qwen3:8b` on 8 GB GPUs) |

## Architecture

```
src/
  orchestrator/    LLM agent loop, 46 tools, composition state
  generation/      AI model wrappers (NotaGen, ACE-Step, DiffSinger)
  audio/           Rendering, validation, effects, mixing, export
  notation/        Format conversion, theory validation, score rendering
  voice/           Voice conversion (RVC, Seed-VC), stem separation
  curation/        12-dimension quality analysis, batch curation
  web/             Gradio web interface
```

See [docs/architecture.md](docs/architecture.md) for the full system design.

## Testing

```bash
pytest tests/ -v -m "not gpu"   # 258+ tests, ~6 seconds
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style,
and the tool-adding guide.

## License

[MIT](LICENSE) — The Muser framework and all original code.

See [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) for component licenses
and [docs/legal.md](docs/legal.md) for output ownership details.
