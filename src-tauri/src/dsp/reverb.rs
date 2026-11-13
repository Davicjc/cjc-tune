//! Freeverb-style stereo reverb behind the Ambience control.

use super::ANTI_DENORMAL;

// ──────────────────────────────────────────────
//  Reverb (Ambiance effect)
// ──────────────────────────────────────────────

/// One-pole-damped feedback comb filter (Freeverb-style).
pub(crate) struct CombFilter {
    pub(crate) buffer: Vec<f32>,
    pub(crate) index: usize,
    pub(crate) feedback: f32,
    pub(crate) damp1: f32,
    pub(crate) damp2: f32,
    pub(crate) filter_store: f32,
}

impl CombFilter {
    pub(crate) fn new(size: usize, feedback: f32, damp: f32) -> Self {
        Self {
            buffer: vec![0.0; size.max(1)],
            index: 0,
            feedback,
            damp1: damp,
            damp2: 1.0 - damp,
            filter_store: 0.0,
        }
    }

    pub(crate) fn reset(&mut self) {
        self.buffer.fill(0.0);
        self.filter_store = 0.0;
    }

    #[inline]
    pub(crate) fn process(&mut self, input: f32) -> f32 {
        let output = self.buffer[self.index];
        // Low-pass the feedback path for a warmer, less metallic tail
        self.filter_store = output * self.damp2 + self.filter_store * self.damp1 + ANTI_DENORMAL;
        self.buffer[self.index] = input + self.filter_store * self.feedback;
        self.index += 1;
        if self.index >= self.buffer.len() {
            self.index = 0;
        }
        output
    }
}

/// Schroeder allpass filter used to diffuse the reverb tail.
pub(crate) struct AllpassFilter {
    pub(crate) buffer: Vec<f32>,
    pub(crate) index: usize,
    pub(crate) feedback: f32,
}

impl AllpassFilter {
    pub(crate) fn new(size: usize, feedback: f32) -> Self {
        Self {
            buffer: vec![0.0; size.max(1)],
            index: 0,
            feedback,
        }
    }

    pub(crate) fn reset(&mut self) {
        self.buffer.fill(0.0);
    }

    #[inline]
    pub(crate) fn process(&mut self, input: f32) -> f32 {
        let buffered = self.buffer[self.index];
        let output = -input + buffered;
        self.buffer[self.index] = input + buffered * self.feedback;
        self.index += 1;
        if self.index >= self.buffer.len() {
            self.index = 0;
        }
        output
    }
}

/// Compact stereo reverb (4 parallel combs + 2 series allpasses per channel),
/// a reduced Freeverb. Produces the wet signal for the "ambiance" effect.
///
/// Delay lengths are tuned for a 48 kHz sample rate; the right channel is
/// offset by a small stereo spread so the two channels decorrelate.
pub(crate) struct StereoReverb {
    pub(crate) combs_l: Vec<CombFilter>,
    pub(crate) combs_r: Vec<CombFilter>,
    pub(crate) allpass_l: Vec<AllpassFilter>,
    pub(crate) allpass_r: Vec<AllpassFilter>,
    pub(crate) input_gain: f32,
}

impl StereoReverb {
    pub(crate) fn new() -> Self {
        // Comb/allpass delay lengths in samples (Freeverb tunings scaled to 48 kHz)
        pub(crate) const COMB_TUNINGS: [usize; 4] = [1215, 1293, 1390, 1476];
        pub(crate) const ALLPASS_TUNINGS: [usize; 2] = [605, 480];
        pub(crate) const STEREO_SPREAD: usize = 25;
        pub(crate) const ROOM_SIZE: f32 = 0.82; // comb feedback — larger = longer tail
        pub(crate) const DAMP: f32 = 0.25; // high-frequency damping of the tail
        pub(crate) const ALLPASS_FEEDBACK: f32 = 0.5;

        let combs_l = COMB_TUNINGS
            .iter()
            .map(|&t| CombFilter::new(t, ROOM_SIZE, DAMP))
            .collect();
        let combs_r = COMB_TUNINGS
            .iter()
            .map(|&t| CombFilter::new(t + STEREO_SPREAD, ROOM_SIZE, DAMP))
            .collect();
        let allpass_l = ALLPASS_TUNINGS
            .iter()
            .map(|&t| AllpassFilter::new(t, ALLPASS_FEEDBACK))
            .collect();
        let allpass_r = ALLPASS_TUNINGS
            .iter()
            .map(|&t| AllpassFilter::new(t + STEREO_SPREAD, ALLPASS_FEEDBACK))
            .collect();

        Self {
            combs_l,
            combs_r,
            allpass_l,
            allpass_r,
            // Scales the dry input feeding the reverb so the summed comb
            // output stays near unity before the wet mix is applied.
            input_gain: 0.022,
        }
    }

    /// Silence the tail.
    pub(crate) fn reset(&mut self) {
        self.combs_l.iter_mut().for_each(CombFilter::reset);
        self.combs_r.iter_mut().for_each(CombFilter::reset);
        self.allpass_l.iter_mut().for_each(AllpassFilter::reset);
        self.allpass_r.iter_mut().for_each(AllpassFilter::reset);
    }

    /// Process one stereo frame and return the wet (reverb-only) L/R signal.
    #[inline]
    pub(crate) fn process(&mut self, l: f32, r: f32) -> (f32, f32) {
        let input = (l + r) * self.input_gain;

        // Parallel comb filters (summed)
        let mut wet_l = 0.0;
        for comb in self.combs_l.iter_mut() {
            wet_l += comb.process(input);
        }
        let mut wet_r = 0.0;
        for comb in self.combs_r.iter_mut() {
            wet_r += comb.process(input);
        }

        // Series allpass filters (diffusion)
        for ap in self.allpass_l.iter_mut() {
            wet_l = ap.process(wet_l);
        }
        for ap in self.allpass_r.iter_mut() {
            wet_r = ap.process(wet_r);
        }

        (wet_l, wet_r)
    }
}
