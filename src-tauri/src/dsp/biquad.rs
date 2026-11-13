//! Second-order IIR filters that glide between settings instead of clicking.

// ──────────────────────────────────────────────
//  Biquad Filter
// ──────────────────────────────────────────────

/// Frames over which a biquad glides to new coefficients (20 ms at 48 kHz).
///
/// Measured on a Flat → Deep Bass preset switch: 5 ms let the sudden +12 dB
/// of bass hit the limiter before its gain could follow, 40 ms rose slower
/// than the compressor attacks; 20 ms gave the smallest overshoot.
pub(crate) const COEF_GLIDE_FRAMES: u32 = 960;

/// Second-order IIR (biquad) filter coefficients and state.
///
/// Used for peaking EQ filters — each band gets its own biquad
/// that only boosts/cuts around its center frequency.
#[derive(Clone)]
pub(crate) struct BiquadFilter {
    // Coefficients currently in use
    pub(crate) b0: f32,
    pub(crate) b1: f32,
    pub(crate) b2: f32,
    pub(crate) a1: f32,
    pub(crate) a2: f32,

    // Coefficient glide: where it ends, the per-frame increment, frames left
    pub(crate) target: [f32; 5],
    pub(crate) step: [f32; 5],
    pub(crate) glide_left: u32,

    // Delay line (filter state for two channels)
    pub(crate) x1: [f32; 2],
    pub(crate) x2: [f32; 2],
    pub(crate) y1: [f32; 2],
    pub(crate) y2: [f32; 2],
}

impl BiquadFilter {
    /// Create a peaking EQ filter.
    ///
    /// - `freq` — center frequency in Hz
    /// - `gain_db` — boost/cut in dB (positive = boost, negative = cut)
    /// - `q` — quality factor (higher = narrower band)
    /// - `sample_rate` — audio sample rate in Hz
    pub(crate) fn peaking_eq(freq: f32, gain_db: f32, q: f32, sample_rate: f32) -> Self {
        let a = 10.0f32.powf(gain_db / 40.0);
        let w0 = 2.0 * std::f32::consts::PI * freq / sample_rate;
        let alpha = w0.sin() / (2.0 * q);

        let b0 = 1.0 + alpha * a;
        let b1 = -2.0 * w0.cos();
        let b2 = 1.0 - alpha * a;
        let a0 = 1.0 + alpha / a;
        let a1 = -2.0 * w0.cos();
        let a2 = 1.0 - alpha / a;

        // Normalize by a0
        Self {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: a1 / a0,
            a2: a2 / a0,
            target: [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0],
            step: [0.0; 5],
            glide_left: 0,
            x1: [0.0; 2],
            x2: [0.0; 2],
            y1: [0.0; 2],
            y2: [0.0; 2],
        }
    }

    /// Create a low-shelf filter — boosts/cuts everything below `freq` while
    /// leaving the midrange and treble alone.
    ///
    /// Used by HyperBass, which previously applied a flat broadband gain (i.e.
    /// a volume knob) rather than actually boosting the low end.
    ///
    /// - `freq` — shelf corner frequency in Hz
    /// - `gain_db` — boost/cut in dB applied below the corner
    /// - `slope` — shelf slope, 1.0 is the steepest without overshoot
    /// - `sample_rate` — audio sample rate in Hz
    pub(crate) fn low_shelf(freq: f32, gain_db: f32, slope: f32, sample_rate: f32) -> Self {
        let a = 10.0f32.powf(gain_db / 40.0);
        let w0 = 2.0 * std::f32::consts::PI * freq / sample_rate;
        let cos_w0 = w0.cos();
        // RBJ cookbook: 2*sqrt(A)*alpha, expanded to avoid a separate alpha term
        let two_sqrt_a_alpha = w0.sin() * ((a * a + 1.0) * (1.0 / slope - 1.0) + 2.0 * a).sqrt();

        let b0 = a * ((a + 1.0) - (a - 1.0) * cos_w0 + two_sqrt_a_alpha);
        let b1 = 2.0 * a * ((a - 1.0) - (a + 1.0) * cos_w0);
        let b2 = a * ((a + 1.0) - (a - 1.0) * cos_w0 - two_sqrt_a_alpha);
        let a0 = (a + 1.0) + (a - 1.0) * cos_w0 + two_sqrt_a_alpha;
        let a1 = -2.0 * ((a - 1.0) + (a + 1.0) * cos_w0);
        let a2 = (a + 1.0) + (a - 1.0) * cos_w0 - two_sqrt_a_alpha;

        Self {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: a1 / a0,
            a2: a2 / a0,
            target: [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0],
            step: [0.0; 5],
            glide_left: 0,
            x1: [0.0; 2],
            x2: [0.0; 2],
            y1: [0.0; 2],
            y2: [0.0; 2],
        }
    }

    /// Create a flat (pass-through) filter — all coefficients set for unity gain.
    pub(crate) fn flat() -> Self {
        Self {
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
            target: [1.0, 0.0, 0.0, 0.0, 0.0],
            step: [0.0; 5],
            glide_left: 0,
            x1: [0.0; 2],
            x2: [0.0; 2],
            y1: [0.0; 2],
            y2: [0.0; 2],
        }
    }

    /// Glide to another filter's coefficients, keeping this filter's delay
    /// line.
    ///
    /// Moving a slider used to replace the whole filter, zeroing its history
    /// mid-stream, so the output restarted from silence — a click on every
    /// step of a drag. Even with the history kept, switching coefficients in
    /// one sample leaves a step in the output on big jumps such as preset
    /// changes, so they move linearly over COEF_GLIDE_FRAMES instead.
    ///
    /// Gliding cannot destabilise the filter: a biquad is stable exactly when
    /// (a1, a2) lies inside the triangle |a2| < 1, |a1| < 1 + a2. That region
    /// is convex, so every point on the line between two stable designs is
    /// stable too.
    pub(crate) fn set_coefficients(&mut self, from: &BiquadFilter) {
        self.target = [from.b0, from.b1, from.b2, from.a1, from.a2];
        let current = [self.b0, self.b1, self.b2, self.a1, self.a2];
        for ((step, &to), &now) in self.step.iter_mut().zip(&self.target).zip(&current) {
            *step = (to - now) / COEF_GLIDE_FRAMES as f32;
        }
        self.glide_left = COEF_GLIDE_FRAMES;
    }

    /// Advance the coefficient glide by one frame, landing exactly on target.
    #[inline]
    pub(crate) fn advance_glide(&mut self) {
        self.glide_left -= 1;
        if self.glide_left == 0 {
            [self.b0, self.b1, self.b2, self.a1, self.a2] = self.target;
        } else {
            self.b0 += self.step[0];
            self.b1 += self.step[1];
            self.b2 += self.step[2];
            self.a1 += self.step[3];
            self.a2 += self.step[4];
        }
    }

    /// Forget all past samples.
    pub(crate) fn reset(&mut self) {
        self.x1 = [0.0; 2];
        self.x2 = [0.0; 2];
        self.y1 = [0.0; 2];
        self.y2 = [0.0; 2];
    }

    /// Process a single sample through the filter for the given channel.
    #[inline]
    pub(crate) fn process(&mut self, input: f32, channel: usize) -> f32 {
        let ch = channel % 2;
        let output = self.b0 * input + self.b1 * self.x1[ch] + self.b2 * self.x2[ch]
            - self.a1 * self.y1[ch]
            - self.a2 * self.y2[ch];

        // Shift delay line. The recursive y-terms decay towards denormals once
        // the input goes quiet, so flush them to zero.
        self.x2[ch] = self.x1[ch];
        self.x1[ch] = input;
        self.y2[ch] = self.y1[ch];
        self.y1[ch] = if output.abs() < 1e-25 { 0.0 } else { output };

        // Coefficients advance once per stereo frame, after the right channel.
        if ch == 1 && self.glide_left > 0 {
            self.advance_glide();
        }

        output
    }
}
