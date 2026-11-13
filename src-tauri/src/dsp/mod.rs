//! Signal processing: the chain every sample of system audio goes through.
//!
//! `chain` holds the processor itself; the building blocks (biquad filters,
//! the reverb and the dynamics stages) live in their own files so each one
//! can be read and tested on its own. Moving audio in and out of the system
//! is `routing`'s job.

mod biquad;
mod chain;
mod dynamics;
mod reverb;

pub use chain::{Processor, EFFECT_NAMES};

pub const SAMPLE_RATE: u32 = 48000;
pub const CHANNELS: u8 = 2;
pub(crate) const FFT_SIZE: usize = 512;

/// Center frequencies for the 10 EQ bands (Hz).
pub(crate) const EQ_FREQUENCIES: [f32; 10] = [
    32.0, 64.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0,
];

/// Corner frequency of the HyperBass low-shelf (Hz).
pub(crate) const BASS_SHELF_FREQ: f32 = 110.0;
/// Maximum low-shelf boost at HyperBass = 100 (dB). Deliberately moderate:
/// the bass-heavy EQ presets already add up to +10 dB down low, and the two
/// stack.
pub(crate) const BASS_SHELF_MAX_DB: f32 = 6.0;
/// Crossover of the one-pole high-band split feeding the Fidelity exciter (Hz).
pub(crate) const FIDELITY_CROSSOVER: f32 = 3000.0;

/// Smoothing coefficient for a one-pole envelope with the given time constant.
#[inline]
pub(crate) fn time_coef(seconds: f32, sample_rate: f32) -> f32 {
    1.0 - (-1.0 / (seconds * sample_rate)).exp()
}

/// Tiny constant mixed into recursive feedback paths so decaying tails settle
/// to zero rather than into denormal floats, which trap to microcode on x86
/// and can cost 10–100x per operation — enough to cause audible dropouts.
pub(crate) const ANTI_DENORMAL: f32 = 1e-20;

/// Values below this are flushed to zero in decaying one-pole states, which
/// would otherwise sink into denormals during silence (slow on x86).
pub(crate) const DENORMAL_FLUSH: f32 = 1e-25;
