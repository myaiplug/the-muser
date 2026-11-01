// Drum taxonomy for the NoDAW library.
// Genre ids match the 24 demo profiles in studio/web/src/demo/genres.ts.
// A category is a (type, style) pair, e.g. "modern-house-kick". Sounds carry one
// category; their genres are derived from the category, so the two never drift.

export const TYPES = ['kick', 'snare', 'clap', 'hat', 'open-hat', 'perc', '808', 'cymbal', 'tom']

export const GENRES = [
  { id: 'lo-fi-chill', name: 'Lo-fi Chill', aliases: ['lofi', 'lo-fi', 'chillhop'] },
  { id: 'hip-hop', name: 'Hip Hop', aliases: ['hiphop', 'boom-bap', 'boombap'] },
  { id: 'trap', name: 'Trap', aliases: ['atlanta-trap'] },
  { id: 'uk-drill', name: 'UK Drill', aliases: ['drill', 'ny-drill'] },
  { id: 'phonk', name: 'Phonk', aliases: ['memphis', 'drift-phonk'] },
  { id: 'techno', name: 'Techno', aliases: ['deep-techno', 'minimal-techno', 'warehouse'] },
  { id: 'house', name: 'House', aliases: ['modern-house', 'deep-house', 'tech-house'] },
  { id: 'edm-anthem', name: 'EDM Anthem', aliases: ['edm', 'big-room', 'festival', 'trance'] },
  { id: 'synthwave', name: 'Synthwave', aliases: ['retrowave', 'outrun'] },
  { id: 'chillwave', name: 'Chillwave', aliases: ['vaporwave', 'dream-pop'] },
  { id: 'ambient', name: 'Ambient', aliases: ['soundscape'] },
  { id: 'cinematic', name: 'Cinematic', aliases: ['film', 'trailer', 'orchestral'] },
  { id: 'jazz-lounge', name: 'Jazz Lounge', aliases: ['jazz', 'lounge', 'bossa'] },
  { id: 'r-b-slow-jam', name: 'R&B Slow Jam', aliases: ['rnb', 'r-and-b', 'neo-soul'] },
  { id: 'pop', name: 'Pop', aliases: ['dance-pop', 'electropop'] },
  { id: 'rock', name: 'Rock', aliases: ['alt-rock', 'punk', 'garage-rock'] },
  { id: 'metal', name: 'Metal', aliases: ['djent', 'thrash'] },
  { id: 'afrobeats', name: 'Afrobeats', aliases: ['afrobeat', 'amapiano', 'afropop'] },
  { id: 'reggaeton', name: 'Reggaeton', aliases: ['dembow', 'latin', 'moombahton'] },
  { id: 'drum-and-bass', name: 'Drum and Bass', aliases: ['dnb', 'jungle', 'liquid'] },
  { id: 'dubstep', name: 'Dubstep', aliases: ['brostep', 'riddim', 'bass-music'] },
  { id: 'country-pop', name: 'Country Pop', aliases: ['country', 'nashville'] },
  { id: 'indie-folk', name: 'Indie Folk', aliases: ['folk', 'indie', 'acoustic'] },
  { id: 'gospel-soul', name: 'Gospel Soul', aliases: ['gospel', 'soul'] },
]

const c = (id, type, label, genres, tags = []) => ({ id, type, label, genres, tags })
const EL = ['trap', 'uk-drill', 'phonk']
const BAND = ['rock', 'country-pop', 'indie-folk']
const WARM = ['jazz-lounge', 'gospel-soul', 'r-b-slow-jam']

export const CATEGORIES = [
  // kicks (synth)
  c('modern-house-kick', 'kick', 'Modern House Kick', ['house'], ['four-on-the-floor', 'punchy']),
  c('techno-kick', 'kick', 'Deep Techno Kick', ['techno'], ['driving', 'distorted']),
  c('boom-bap-kick', 'kick', 'Boom Bap Kick', ['hip-hop'], ['boom-bap', 'round']),
  c('lofi-dusty-kick', 'kick', 'Lo-fi Dusty Kick', ['lo-fi-chill'], ['dusty', 'soft']),
  c('trap-kick', 'kick', 'Trap Kick', EL, ['hard', 'long-tail']),
  c('dnb-kick', 'kick', 'Drum and Bass Kick', ['drum-and-bass'], ['tight', 'fast']),
  c('dubstep-kick', 'kick', 'Dubstep Kick', ['dubstep'], ['heavy', 'saturated']),
  c('edm-anthem-kick', 'kick', 'EDM Anthem Kick', ['edm-anthem'], ['big-room', 'club']),
  c('pop-kick', 'kick', 'Modern Pop Kick', ['pop', 'afrobeats', 'reggaeton'], ['clean', 'mid-punch']),
  c('soft-kick', 'kick', 'Soft Kick', ['chillwave', 'ambient', 'r-b-slow-jam', 'indie-folk', 'synthwave'], ['soft', 'warm']),
  c('rock-kick', 'kick', 'Rock Kick', ['rock', 'country-pop'], ['beater', 'tight']),
  c('metal-kick', 'kick', 'Metal Kick', ['metal'], ['clicky', 'double-pedal']),
  c('jazz-kick', 'kick', 'Jazz Kick', ['jazz-lounge', 'gospel-soul'], ['feathered', 'low-tuned']),
  c('cinematic-kick', 'kick', 'Cinematic Impact Kick', ['cinematic', 'ambient'], ['impact', 'deep']),
  // kicks (recorded)
  c('acoustic-kick', 'kick', 'Acoustic Kick', [...BAND, 'metal', ...WARM, 'hip-hop', 'lo-fi-chill'], ['acoustic', 'recorded']),
  c('electronic-kick-general', 'kick', 'Electronic Kick (general)', ['house', 'techno', 'edm-anthem', 'trap', 'phonk', 'dubstep', 'drum-and-bass'], ['electronic', 'producer-kick']),
  // snares
  c('boom-bap-snare', 'snare', 'Boom Bap Snare', ['hip-hop'], ['boom-bap', 'crack']),
  c('lofi-snare', 'snare', 'Lo-fi Snare', ['lo-fi-chill', 'chillwave'], ['dusty', 'filtered']),
  c('trap-snare', 'snare', 'Trap Snare', EL, ['bright', 'snappy']),
  c('rock-snare', 'snare', 'Rock Snare', ['rock', 'country-pop'], ['crack', 'ring']),
  c('metal-snare', 'snare', 'Metal Snare', ['metal'], ['tight', 'bright']),
  c('dnb-snare', 'snare', 'Drum and Bass Snare', ['drum-and-bass'], ['snappy', 'high-tuned']),
  c('dubstep-snare', 'snare', 'Dubstep Snare', ['dubstep'], ['heavy', 'half-time']),
  c('gated-snare', 'snare', 'Gated Snare', ['synthwave', 'pop', 'edm-anthem'], ['gated', '80s']),
  c('pop-snare', 'snare', 'Modern Pop Snare', ['pop', 'afrobeats', 'reggaeton'], ['clean', 'mid']),
  c('techno-snare', 'snare', 'Tight Techno Snare', ['techno', 'house'], ['tight', 'short']),
  c('soft-snare', 'snare', 'Soft Snare', ['r-b-slow-jam', 'indie-folk', 'ambient', 'gospel-soul'], ['soft', 'round']),
  c('jazz-snare', 'snare', 'Jazz Snare', ['jazz-lounge'], ['brushed', 'dry']),
  c('cinematic-snare', 'snare', 'Cinematic Snare', ['cinematic'], ['big', 'long-tail']),
  c('acoustic-snare', 'snare', 'Acoustic Snare', ['rock', 'metal', 'country-pop', 'indie-folk', 'jazz-lounge', 'gospel-soul', 'r-b-slow-jam', 'hip-hop', 'lo-fi-chill'], ['acoustic', 'recorded']),
  c('acoustic-rimshot', 'snare', 'Acoustic Rimshot', ['rock', 'metal', 'country-pop', 'gospel-soul', 'hip-hop'], ['acoustic', 'rimshot']),
  c('acoustic-sidestick', 'snare', 'Acoustic Side Stick', ['jazz-lounge', 'r-b-slow-jam', 'indie-folk', 'gospel-soul', 'country-pop', 'lo-fi-chill'], ['acoustic', 'cross-stick']),
  // claps
  c('house-clap', 'clap', 'House Clap', ['house', 'techno'], ['layered', 'tight']),
  c('trap-clap', 'clap', 'Trap Clap', EL, ['snappy', 'wide']),
  c('pop-clap', 'clap', 'Pop Clap', ['pop', 'edm-anthem', 'synthwave', 'reggaeton', 'afrobeats'], ['clean']),
  c('lofi-clap', 'clap', 'Lo-fi Clap', ['lo-fi-chill', 'chillwave', 'r-b-slow-jam'], ['dusty', 'soft']),
  c('boom-bap-clap', 'clap', 'Boom Bap Clap', ['hip-hop'], ['sampled-style']),
  c('bass-music-clap', 'clap', 'Bass Music Clap', ['dubstep', 'drum-and-bass'], ['bright']),
  c('hand-clap', 'clap', 'Hand Clap', ['gospel-soul', 'indie-folk', 'country-pop', 'afrobeats'], ['acoustic', 'recorded']),
  // hats
  c('trap-hat', 'hat', 'Trap Hat', EL, ['tick', 'bright']),
  c('house-hat', 'hat', 'House Hat', ['house', 'techno', 'edm-anthem', 'drum-and-bass', 'dubstep'], ['crisp']),
  c('lofi-hat', 'hat', 'Lo-fi Hat', ['lo-fi-chill', 'chillwave', 'hip-hop', 'r-b-slow-jam'], ['dull', 'dusty']),
  c('pop-hat', 'hat', 'Pop Hat', ['pop', 'afrobeats', 'reggaeton', 'synthwave', 'ambient'], ['clean']),
  c('acoustic-hat', 'hat', 'Acoustic Hi-hat', ['rock', 'metal', 'jazz-lounge', 'country-pop', 'indie-folk', 'gospel-soul'], ['acoustic', 'recorded']),
  // open hats
  c('trap-open-hat', 'open-hat', 'Trap Open Hat', EL, ['bright']),
  c('house-open-hat', 'open-hat', 'House Open Hat', ['house', 'techno', 'edm-anthem', 'drum-and-bass', 'dubstep'], ['offbeat']),
  c('lofi-open-hat', 'open-hat', 'Lo-fi Open Hat', ['lo-fi-chill', 'chillwave', 'hip-hop', 'r-b-slow-jam'], ['dull']),
  c('pop-open-hat', 'open-hat', 'Pop Open Hat', ['pop', 'afrobeats', 'reggaeton', 'synthwave', 'ambient'], ['clean']),
  c('acoustic-open-hat', 'open-hat', 'Acoustic Open Hi-hat', ['rock', 'metal', 'jazz-lounge', 'country-pop', 'indie-folk', 'gospel-soul'], ['acoustic', 'recorded']),
  // perc
  c('rim-perc', 'perc', 'Rim Click', ['hip-hop', 'reggaeton', 'afrobeats', 'r-b-slow-jam', 'lo-fi-chill'], ['rim', 'click']),
  c('cowbell-perc', 'perc', 'Cowbell', ['reggaeton', 'afrobeats', 'phonk', 'house', 'rock'], ['cowbell', 'metallic']),
  c('shaker-perc', 'perc', 'Shaker', ['house', 'afrobeats', 'reggaeton', 'pop', 'lo-fi-chill', 'indie-folk'], ['shaker']),
  c('tambourine-perc', 'perc', 'Tambourine', ['gospel-soul', 'indie-folk', 'country-pop', 'pop', 'rock'], ['tambourine']),
  c('conga-perc', 'perc', 'Conga', ['afrobeats', 'reggaeton', 'house', 'jazz-lounge'], ['conga', 'tonal']),
  c('clave-perc', 'perc', 'Clave', ['afrobeats', 'reggaeton', 'jazz-lounge'], ['clave', 'wood']),
  c('snap-perc', 'perc', 'Finger Snap', ['r-b-slow-jam', 'pop', 'lo-fi-chill', 'trap'], ['snap']),
  c('woodblock-perc', 'perc', 'Wood Block', ['afrobeats', 'reggaeton', 'indie-folk', 'cinematic'], ['wood']),
  c('world-hand-perc', 'perc', 'Hand Drum / World Perc', ['afrobeats', 'reggaeton', 'indie-folk', 'gospel-soul', 'ambient', 'cinematic'], ['djembe', 'bongo', 'darbouka', 'cajon', 'recorded']),
  c('acoustic-tambourine-perc', 'perc', 'Acoustic Tambourine', ['gospel-soul', 'indie-folk', 'country-pop', 'rock', 'pop'], ['tambourine', 'recorded']),
  c('acoustic-woodblock-perc', 'perc', 'Acoustic Wood Block', ['indie-folk', 'cinematic', 'afrobeats', 'reggaeton'], ['wood', 'recorded']),
  c('acoustic-cowbell-perc', 'perc', 'Acoustic Cowbell', ['rock', 'afrobeats', 'reggaeton', 'country-pop'], ['cowbell', 'recorded']),
  // 808
  c('808-sub', '808', '808 Sub Bass', ['trap', 'hip-hop', 'r-b-slow-jam', 'pop', 'reggaeton', 'afrobeats'], ['sub', 'clean']),
  c('808-distorted', '808', 'Distorted 808', ['phonk', 'trap', 'uk-drill'], ['distorted', 'hard']),
  c('808-slide', '808', 'Long 808 (slide-ready)', ['uk-drill', 'trap'], ['long', 'glide']),
  c('808-short', '808', 'Short 808', ['hip-hop', 'drum-and-bass', 'dubstep'], ['short', 'punchy']),
  // cymbals
  c('crash-cymbal', 'cymbal', 'Crash Cymbal', ['edm-anthem', 'pop', 'rock', 'metal', 'cinematic', 'country-pop'], ['crash']),
  c('ride-cymbal', 'cymbal', 'Ride Cymbal', ['jazz-lounge', 'gospel-soul', 'rock', 'indie-folk'], ['ride']),
  c('acoustic-crash', 'cymbal', 'Acoustic Crash', ['rock', 'metal', 'cinematic', 'country-pop', 'pop', 'edm-anthem'], ['crash', 'recorded']),
  c('acoustic-ride', 'cymbal', 'Acoustic Ride', ['jazz-lounge', 'gospel-soul', 'rock', 'indie-folk'], ['ride', 'recorded']),
  c('acoustic-china', 'cymbal', 'China / Splash', ['metal', 'rock', 'cinematic'], ['china', 'splash', 'recorded']),
  // toms
  c('acoustic-tom', 'tom', 'Acoustic Tom', ['rock', 'metal', 'cinematic', 'gospel-soul', 'country-pop', 'jazz-lounge'], ['acoustic', 'recorded']),
  c('synth-tom', 'tom', 'Synth Tom', ['synthwave', 'pop', 'techno', 'edm-anthem'], ['electronic']),
]

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((x) => [x.id, x]))
export const GENRE_IDS = GENRES.map((g) => g.id)

/** Resolve a genre id or alias ("modern-house") to a canonical id, or null. */
export function resolveGenre(input) {
  if (!input) return null
  const s = String(input).trim().toLowerCase().replace(/[\s_]+/g, '-')
  for (const g of GENRES) if (g.id === s || g.aliases.includes(s)) return g.id
  return null
}

/** taxonomy.json shape: per genre, the categories available. */
export function buildTaxonomy() {
  return {
    version: 1,
    types: TYPES,
    genres: GENRES.map((g) => ({
      ...g,
      categories: CATEGORIES.filter((x) => x.genres.includes(g.id)).map((x) => x.id),
    })),
    categories: CATEGORIES,
  }
}
