/**
 * Presets: EQ gains (dB, -12..+12) and effect amounts (0..100).
 *
 * The tables are mirrored by the headroom test in `src-tauri/src/dsp/chain.rs`;
 * keep the two in sync when editing them.
 */

/* global __APP_VERSION__ */
export const APP_VERSION = __APP_VERSION__;

/** Centre frequency of each EQ band, in Hz (octave spaced). */
export const BAND_FREQS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

/** Short label shown under each band. */
export const BAND_LABELS = ["32", "64", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"];

export const EFFECTS = ["fidelity", "ambiance", "dynamic", "surround", "bass"];

export const PRESETS = [
    "Flat",
    "Music",
    "Movies",
    "Gaming",
    "Podcast",
    "Bass Boost",
    "Vocal Boost",
    "Deep Bass",
    "Treble Boost",
    "Night Mode",
];

export const PRESET_EQ = {
    "Flat": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "Music": [3, 2, 1, 0, -1, 0, 2, 3, 3, 2],
    "Movies": [4, 3, 2, 0, -1, 0, 1, 2, 3, 4],
    "Gaming": [5, 4, 2, 1, 0, 0, 1, 2, 4, 5],
    "Podcast": [-1, 0, 2, 4, 4, 3, 2, 1, 0, -1],
    "Bass Boost": [8, 7, 5, 3, 0, -1, -1, -1, -2, -2],
    "Vocal Boost": [-2, -1, 0, 3, 5, 5, 3, 1, 0, -1],
    "Deep Bass": [10, 8, 6, 2, 0, -1, -2, -2, -3, -3],
    "Treble Boost": [-3, -2, -1, 0, 1, 2, 4, 6, 7, 8],
    "Night Mode": [2, 2, 1, 0, -2, -2, -1, 0, 1, 2],
};

export const PRESET_FX = {
    "Flat": { fidelity: 0, ambiance: 0, dynamic: 0, surround: 0, bass: 0 },
    "Music": { fidelity: 65, ambiance: 40, dynamic: 50, surround: 30, bass: 45 },
    "Movies": { fidelity: 70, ambiance: 75, dynamic: 60, surround: 80, bass: 55 },
    "Gaming": { fidelity: 60, ambiance: 50, dynamic: 70, surround: 90, bass: 60 },
    "Podcast": { fidelity: 80, ambiance: 20, dynamic: 55, surround: 10, bass: 20 },
    "Bass Boost": { fidelity: 50, ambiance: 30, dynamic: 65, surround: 20, bass: 90 },
    "Vocal Boost": { fidelity: 85, ambiance: 35, dynamic: 50, surround: 25, bass: 15 },
    "Deep Bass": { fidelity: 45, ambiance: 25, dynamic: 70, surround: 15, bass: 95 },
    "Treble Boost": { fidelity: 75, ambiance: 45, dynamic: 45, surround: 35, bass: 10 },
    "Night Mode": { fidelity: 55, ambiance: 60, dynamic: 35, surround: 40, bass: 30 },
};

/** Preset applied on the very first launch, before anything was saved. */
export const FIRST_PRESET = "Music";

/** Whether `name` is a preset this build knows (anything else shows as Custom). */
export const isKnownPreset = (name) => name === "Custom" || Boolean(PRESET_EQ[name]);
