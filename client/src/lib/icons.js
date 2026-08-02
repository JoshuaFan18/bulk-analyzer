// Rules: docs/libraries.md and docs/components.md (domain-art assets)
// The game's domain art, as bundled 64x64 PNGs. The 1000x1000 originals live in
// the repo-root icons/ folder, which sits outside Vite's root (vite.config.js
// sets root: 'client'); scripts/resize-icons.ps1 downscales the 14 the UI uses
// into client/src/assets/icons/, where Vite hashes and copies them into dist/.
//
// The pointers are hard-coded rather than derived from the filename, both
// because the TODO asked for it and because an ES import cannot be built from a
// runtime string — a `icons/${domain}.png` template would not be bundled at all.
//
// Each 64px icon is under Vite's 4KB assetsInlineLimit, so by default all
// fourteen would be base64'd into the main JS chunk. vite.config.js opts this
// folder out; see the note there.

import bodyPlain from '../assets/icons/Body.png';
import calmPlain from '../assets/icons/Calm.png';
import chaosPlain from '../assets/icons/Chaos.png';
import furyPlain from '../assets/icons/Fury.png';
import mindPlain from '../assets/icons/Mind.png';
import orderPlain from '../assets/icons/Order.png';

import bodyPower from '../assets/icons/Body2.png';
import calmPower from '../assets/icons/Calm2.png';
import chaosPower from '../assets/icons/Chaos2.png';
import furyPower from '../assets/icons/Fury2.png';
import mindPower from '../assets/icons/Mind2.png';
import orderPower from '../assets/icons/Order2.png';

import rainbowRune from '../assets/icons/RainbowRune.png';
import tap from '../assets/icons/Tap.png';
import sword from '../assets/icons/SwordIconRB.png';

// Plain art, for the Collection page's domain filter chips.
export const DOMAIN_ICON = {
  Fury: furyPlain,
  Calm: calmPlain,
  Mind: mindPlain,
  Body: bodyPlain,
  Order: orderPlain,
  Chaos: chaosPlain,
};

// The "2"-suffixed art, for power costs and for [rb_rune_<domain>] in rules
// text. Colorless has no art of its own — generic power falls back to RAINBOW_ICON.
export const DOMAIN_POWER_ICON = {
  Fury: furyPower,
  Calm: calmPower,
  Mind: mindPower,
  Body: bodyPower,
  Order: orderPower,
  Chaos: chaosPower,
};

// "A rune of any domain": [rb_rune_rainbow], generic power, and multi-domain power.
export const RAINBOW_ICON = rainbowRune;

// [rb_exhaust]
export const TAP_ICON = tap;

// The might symbol: [rb_might] in rules text and the might stat on a deck row.
export const MIGHT_ICON = sword;
