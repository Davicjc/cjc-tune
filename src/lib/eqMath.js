/**
 * Geometry for the EQ graph: the frequency axis, and the response the
 * processor really applies (same peaking filters, same Q, same sample rate as
 * `src-tauri/src/dsp/biquad.rs`), so the curve on screen is the sound.
 */

import { BAND_FREQS } from "./presets";

const SAMPLE_RATE = 48000;
const Q = 1.4;
export const MAX_DB = 12;

// Half an octave beyond the outer bands, so the ten bands sit evenly spaced
// in the middle of their own columns.
export const F_MIN = BAND_FREQS[0] / Math.SQRT2;
export const F_MAX = BAND_FREQS[BAND_FREQS.length - 1] * Math.SQRT2;
const LOG_MIN = Math.log(F_MIN);
const LOG_SPAN = Math.log(F_MAX) - LOG_MIN;

/** 0..1 position of `freq` on the logarithmic axis. */
export const freqToX = (freq) => (Math.log(freq) - LOG_MIN) / LOG_SPAN;

/** 0..1 position (0 = top) of `db` on the ±MAX_DB axis. */
export const dbToY = (db) => 0.5 - db / (2 * MAX_DB);

/** Inverse of `dbToY`, clamped and rounded to 0.5 dB like the sliders. */
export function yToDb(y) {
    const db = (0.5 - y) * 2 * MAX_DB;
    return Math.round(Math.max(-MAX_DB, Math.min(MAX_DB, db)) * 2) / 2;
}

function peaking(freq, gainDb) {
    const a = 10 ** (gainDb / 40);
    const w0 = (2 * Math.PI * freq) / SAMPLE_RATE;
    const alpha = Math.sin(w0) / (2 * Q);
    const a0 = 1 + alpha / a;
    return {
        b0: (1 + alpha * a) / a0,
        b1: (-2 * Math.cos(w0)) / a0,
        b2: (1 - alpha * a) / a0,
        a1: (-2 * Math.cos(w0)) / a0,
        a2: (1 - alpha / a) / a0,
    };
}

/** |H(f)| of one biquad, in dB. */
function magnitudeDb({ b0, b1, b2, a1, a2 }, freq) {
    const w = (2 * Math.PI * freq) / SAMPLE_RATE;
    const c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    const nr = b0 + b1 * c1 + b2 * c2, ni = -(b1 * s1 + b2 * s2);
    const dr = 1 + a1 * c1 + a2 * c2, di = -(a1 * s1 + a2 * s2);
    return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
}

/**
 * Total response of the ten bands at `points` log-spaced frequencies.
 * Bands within 0.1 dB of flat are bypassed, as in the processor.
 */
export function responseCurve(gains, points = 160) {
    const filters = gains
        .map((g, i) => (Math.abs(g) < 0.1 ? null : peaking(BAND_FREQS[i], g)))
        .filter(Boolean);
    const out = new Array(points);
    for (let i = 0; i < points; i++) {
        const x = i / (points - 1);
        const freq = Math.exp(LOG_MIN + x * LOG_SPAN);
        let db = 0;
        for (const f of filters) db += magnitudeDb(f, freq);
        out[i] = [x, db];
    }
    return out;
}

/** Smooth SVG path through points already in pixel space. */
export function smoothPath(points) {
    if (!points.length) return "";
    let d = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
    for (let i = 1; i < points.length; i++) {
        d += ` L${points[i][0].toFixed(1)},${points[i][1].toFixed(1)}`;
    }
    return d;
}

/**
 * Centre frequency of each of the 32 spectrum values the processor reports
 * (FFT of 512 at 48 kHz, bins grouped by `1 + ((i+1)/32)^1.8 * 255`), so the
 * spectrum lines up with the EQ axis.
 */
export const SPECTRUM_FREQS = (() => {
    const binHz = SAMPLE_RATE / 512;
    const edges = [1];
    let low = 1;
    for (let i = 0; i < 32; i++) {
        let high = Math.round(1 + ((i + 1) / 32) ** 1.8 * 255);
        if (high <= low) high = low + 1;
        high = Math.min(high, 256);
        edges.push(high);
        low = high;
    }
    return edges.slice(0, 32).map((lo, i) => Math.sqrt(lo * edges[i + 1]) * binHz);
})();
