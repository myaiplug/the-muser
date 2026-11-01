// License allowlist. Anything not matched here is rejected ("unknown => reject").
//
// There is no external license-check API. The license value comes from the
// source's own metadata (Freesound API license URL, archive.org licenseurl,
// a repo LICENSE file) and is matched here against an explicit allowlist.

const CC = 'creativecommons.org'

export const ALLOWED = {
  'CC0-1.0': {
    name: 'CC0 1.0 Universal',
    canonicalUrl: `https://${CC}/publicdomain/zero/1.0/`,
    requiresAttribution: false,
    patterns: [new RegExp(`^https?://${CC}/publicdomain/zero/1\\.0(/legalcode)?/?$`, 'i')],
  },
  'CC-BY-4.0': {
    name: 'CC BY 4.0',
    canonicalUrl: `https://${CC}/licenses/by/4.0/`,
    requiresAttribution: true,
    patterns: [new RegExp(`^https?://${CC}/licenses/by/4\\.0(/legalcode)?/?$`, 'i')],
  },
  'CC-BY-3.0': {
    name: 'CC BY 3.0',
    canonicalUrl: `https://${CC}/licenses/by/3.0/`,
    requiresAttribution: true,
    // unported plus national ports (by/3.0/us/ etc.)
    patterns: [new RegExp(`^https?://${CC}/licenses/by/3\\.0(/[a-z]{2})?(/legalcode)?/?$`, 'i')],
  },
}

// Documented rejections, used for readable error messages. Not required for
// correctness: unmatched licenses are rejected anyway.
export const REJECTED_HINTS = [
  [/licenses\/by-nc/i, 'NonCommercial licenses are not allowed in a paid app'],
  [/licenses\/by-sa/i, 'ShareAlike is not allowed (would force the app to relicense)'],
  [/licenses\/by-nd/i, 'NoDerivatives is not allowed (samples are trimmed and processed)'],
  [/licenses\/sampling/i, 'Sampling+ licenses are not allowed'],
  [/gnu\.org|gpl/i, 'GPL/LGPL kits are not allowed'],
]

/**
 * Map a license URL or SPDX-like id to an allowlist key, or null.
 * Accepts the exact SPDX ids in ALLOWED and any URL matching a pattern.
 */
export function normalizeLicense(input) {
  if (typeof input !== 'string') return null
  const s = input.trim()
  if (ALLOWED[s]) return s
  for (const [key, def] of Object.entries(ALLOWED)) {
    if (def.patterns.some((p) => p.test(s))) return key
  }
  return null
}

export function rejectionReason(input) {
  const s = typeof input === 'string' ? input : ''
  for (const [re, why] of REJECTED_HINTS) if (re.test(s)) return why
  return `license not on allowlist: ${s || '(empty)'}`
}

/** Default attribution line generated for a sound. */
export function makeAttribution({ title, author, source_url, license }) {
  const def = ALLOWED[license]
  const lic = def ? `${def.name} (${def.canonicalUrl})` : String(license)
  return `"${title}" by ${author}, ${source_url}, licensed ${lic}.`
}
