# Browser demo generator

This is a deterministic procedural sampler/synth, not an AI music model.

- `genres.ts` chooses instrument recipes, sparse hook rhythms and mix settings.
- `synth.ts` writes a 2-4 note hook, repeats an A A' A B phrase with chord-aware
  voice leading, renders drums/bass/chords/lead, and automatically mixes the audition.
- `samples.ts` selects existing CC0 catalog one-shots by type, genre and seed.
  Recorded kits win equally suitable comparisons. Tuned 808s are transposed from
  their catalog note tags, with a gate and optional glide.
- Decoding uses only a temporary `OfflineAudioContext`. This module must never
  import the shared playback engine, create a live context, or resume audio.
  The `LibSound` import is type-only. Fetch or codec failures fall back per voice
  to the procedural instruments. The decoded cache is bounded to 48 sounds.
- `voices.ts` supplies the melodic timbres and the offline fallback kit.

The audition receives EQ carving, stem level balance, kick sidechain, filtered
lead delay and short reverb, bus glue, soft clipping and peak limiting. The
four exported stems contain their own mix effects but are pre-master, so their
sum need not equal the mastered audition. Existing iPhone playback routing is
unchanged. No samples or models were added; catalog attribution and licenses
remain under `public/library`.

## Validation

From `studio/web`:

```
npm run test:demo
npm run test:phone-audio
npm run build
```

`test:demo` checks 192 hook/genre seeds, sample picking and licenses, four-stem
renders, repeatability, controlled estimated true peak and fallback behavior.
If FFmpeg is installed, its codec fixture adapter decodes the actual bundled
FLAC files through the offline decoder contract. This is not real Safari QA.
Set `DEMO_WAV_DIR=/tmp/nodaw-auditions` to write mix and lead WAVs for listening.
The master keeps estimated true peak at or below -1 dBFS; this is an estimate,
not a certified broadcast true-peak measurement.
