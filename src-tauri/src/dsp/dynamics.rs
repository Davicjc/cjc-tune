//! Compressor and brick-wall limiter.

use super::{time_coef, DENORMAL_FLUSH};

// ──────────────────────────────────────────────
//  Dynamics
// ──────────────────────────────────────────────

/// Stereo-linked peak limiter with a smoothed gain envelope.
///
/// Replaces the previous per-buffer normalisation, which computed a single
/// scale factor for each 1024-sample block and applied it uniformly. That
/// stepped the gain at every block boundary, so any material driven past
/// 0 dBFS picked up ~90 Hz amplitude modulation (audible pumping and zipper
/// noise) instead of transparent limiting. Here the gain moves sample by
/// sample and persists across buffers, so block boundaries are inaudible.
pub(crate) struct Limiter {
    pub(crate) gain: f32,
    pub(crate) attack: f32,
    pub(crate) release: f32,
    pub(crate) threshold: f32,
}

impl Limiter {
    pub(crate) fn new(sample_rate: f32) -> Self {
        Self {
            gain: 1.0,
            attack: time_coef(0.5e-3, sample_rate),
            release: time_coef(120e-3, sample_rate),
            threshold: 0.98,
        }
    }

    pub(crate) fn reset(&mut self) {
        self.gain = 1.0;
    }

    #[inline]
    pub(crate) fn process_frame(&mut self, l: &mut f32, r: &mut f32) {
        let peak = l.abs().max(r.abs());
        let target = if peak > self.threshold {
            self.threshold / peak
        } else {
            1.0
        };

        // Pull the gain down quickly, let it recover slowly.
        let coef = if target < self.gain {
            self.attack
        } else {
            self.release
        };
        self.gain += (target - self.gain) * coef;

        *l *= self.gain;
        *r *= self.gain;

        // Safety net: with no lookahead the envelope still lags the very first
        // sample of a fast transient, so clamp rather than let it clip the sink.
        *l = l.clamp(-1.0, 1.0);
        *r = r.clamp(-1.0, 1.0);
    }
}

/// Stereo-linked compressor with makeup gain, driving the "Dynamic Boost" effect.
///
/// The previous implementation was an instantaneous hard-knee waveshaper: it
/// folded every sample above the threshold with no envelope and no makeup gain,
/// so raising the slider made the output quieter and added harmonic distortion
/// — the opposite of the "boost" on the label. This version follows the
/// envelope with proper attack/release and restores the headroom it takes.
pub(crate) struct Compressor {
    pub(crate) env: f32,
    pub(crate) attack: f32,
    pub(crate) release: f32,
}

impl Compressor {
    pub(crate) fn new(sample_rate: f32) -> Self {
        Self {
            env: 0.0,
            attack: time_coef(5e-3, sample_rate),
            release: time_coef(80e-3, sample_rate),
        }
    }

    pub(crate) fn reset(&mut self) {
        self.env = 0.0;
    }

    /// Follow the stereo peak envelope. Runs even while Dynamic Boost is at
    /// zero so that raising the slider starts from the true signal level
    /// instead of a stale one from whenever it was last used.
    #[inline]
    pub(crate) fn track(&mut self, l: f32, r: f32) {
        let peak = l.abs().max(r.abs());
        let coef = if peak > self.env {
            self.attack
        } else {
            self.release
        };
        self.env += (peak - self.env) * coef;
        if self.env < DENORMAL_FLUSH {
            self.env = 0.0;
        }
    }

    /// - `threshold` — linear level above which gain reduction starts
    /// - `slope` — 1/ratio (1.0 = no compression, 0.4 = 2.5:1)
    /// - `makeup` — output gain applied after compression
    #[inline]
    pub(crate) fn process_frame(
        &mut self,
        l: &mut f32,
        r: &mut f32,
        threshold: f32,
        slope: f32,
        makeup: f32,
    ) {
        self.track(*l, *r);

        let reduction = if self.env > threshold {
            (threshold + (self.env - threshold) * slope) / self.env
        } else {
            1.0
        };

        let g = reduction * makeup;
        *l *= g;
        *r *= g;
    }
}
