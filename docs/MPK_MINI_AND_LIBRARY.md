# MPK Mini and local sound libraries

Connect MIDI in the Deck. **Auto** recognizes an input name containing MPK; **MPK Mini (8 pads)** selects it manually. Factory channel 10 notes 36–43 (bank A) and 44–51 (bank B) both trigger studio pads 1–8. Hardware bottom row is 1–4; top row is 5–8. Pads continue working while the Keys tab is open. Keyboard notes on other channels remain keys, including notes transposed down into the drum-note range. Generic **Pads 36–51** still addresses all sixteen pads.

Open **MIDI Programmer** for visible Learn/Clear controls for all sixteen pads, the currently mounted knobs, and Octave −/+. Hit a note or send a CC after Learn; assignments persist locally and override defaults. For reprogrammed controllers, choose the pad channel and first note of the contiguous pad bank (the following bank shares the same eight destinations). An Any-channel option is available for shared-channel presets, where overlapping keyboard and pad notes cannot be distinguished; individual Learn assignments can resolve those presets.

Unlearned CC 70–77 and CC 1–8 control the current view's available knobs. Keys prioritize cutoff, resonance, attack, release, detune, level, then the first two available Keys FX dials. Pads prioritize the selected pad's level and pitch, followed by available pad FX dials. Add FX for additional destinations; knobs with explicit custom assignments are reserved for those assignments. Last received CC/channel/value is displayed even when there is no destination.

The MPK's hardware Octave buttons normally transpose the keyboard internally; they do not emit MIDI. Incoming notes shift the visible piano range. The on-screen Octave buttons shift that range too. Devices that actually emit a CC/note can learn the same octave actions; no undocumented CC is assumed.

## Desktop folders

The default scan field contains both `F:\sound kits` and `G:\sounds\Ganked_Dank_Sounds`. Edited paths are remembered locally. Scan runs only when **Scan drives** is pressed, through the existing desktop server API. No files from those folders are included in this repository or uploaded to a website.

## Browser/demo

The website cannot scan Windows paths. Under Sounds, **Import files** supports multiple selections and **Import folder** uses the browser's directory picker where supported. Audio is validated and stored in that browser's IndexedDB, not sent to a server. My uploads sorts 808-like names first and offers search and an 808-only filter; all supported kit sounds can still be imported. Individual sounds can be assigned to pads or used as pitched Keys instruments. Capacity is 512 sounds / 256 MB decoded audio, keeping at most 30 seconds per sound. A full library or browser quota failure produces an error rather than evicting old sounds.

**Load soundfont (.sf2)** uses the existing browser SF2 engine. SFZ still requires the desktop scanned library to resolve external samples; SF3 is not supported. No new font is bundled; the existing CC0 catalog, including its thirteen 808s, remains available.

## Verification

From `studio/web`: `npm run test:midi`, `npm run test:library`, `npm run test:phone-audio`, `npm run test:demo`, `npm run build`, `npm run lint`.

Hardware/manual checks still needed: play banks A/B in both views; test octave-transposed keys without drum collisions; twist both CC presets; learn and clear a pad/knob; reload to verify persistence; import a small mixed kit folder, filter 808s and audition a pitched sample; load a known-good SF2. Real hardware, the Windows folders, and a user-provided SF2 are not available in automated tests.
