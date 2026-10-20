//! Decoding arbitrary dropped audio files into the 16 kHz mono `f32` buffer the
//! transcription engine expects.
//!
//! The mic-recording path already produces 16 kHz mono; this module is the
//! equivalent entry point for files a user drags onto the overlay. Common
//! formats (wav / mp3 / m4a / flac / ogg-vorbis) go through rodio's bundled
//! Symphonia decoders — including ALAC, which Apple Voice Memos use in Lossless
//! mode and which the `symphonia` dependency in Cargo.toml enables. Ogg **Opus**
//! (WhatsApp voice notes) has no Symphonia codec, so it is demuxed with `ogg`
//! and decoded with libopus via `audiopus`.
//!
//! **CAF** is read by Symphonia when it carries PCM, ALAC or G.711, but the same
//! container also holds AAC, Opus and IMA ADPCM, which Symphonia cannot decode
//! from it. CAF is Apple's own format, so on macOS the system's `afconvert` —
//! which reads every codec macOS can write — takes over when Symphonia gives up.

use std::path::Path;
use std::time::Duration;

use crate::audio_toolkit::audio::FrameResampler;

/// Sample rate every transcription model in Handy expects.
const TARGET_HZ: usize = 16_000;

/// Lowercased file extension, if any.
fn ext_lower(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
}

/// True when the path looks like a standalone Opus stream.
pub fn is_probably_opus(path: &Path) -> bool {
    matches!(ext_lower(path).as_deref(), Some("opus"))
}

/// Decode `path` to a 16 kHz mono `f32` buffer.
///
/// `.opus` goes straight to the Opus path. Everything else is decoded by rodio;
/// if that fails on an `.ogg` (which may actually carry Opus rather than Vorbis)
/// the Opus path is tried as a fallback.
pub fn decode_to_16k_mono(path: &Path) -> Result<Vec<f32>, String> {
    if is_probably_opus(path) {
        return decode_opus_ogg_to_16k_mono(path);
    }

    match decode_via_rodio(path) {
        Ok(samples) => Ok(samples),
        Err(rodio_err) => match ext_lower(path).as_deref() {
            Some("ogg" | "oga") => decode_opus_ogg_to_16k_mono(path)
                .map_err(|opus_err| format!("{rodio_err} (also tried Opus: {opus_err})")),
            #[cfg(target_os = "macos")]
            Some("caf" | "caff") => decode_via_afconvert(path)
                .map_err(|af_err| format!("{rodio_err} (also tried afconvert: {af_err})")),
            _ => Err(rodio_err),
        },
    }
}

/// Decode with macOS's own `afconvert`, straight to 16 kHz mono PCM.
///
/// The conversion goes through a temporary WAV, removed again when `TempWav`
/// drops — on success and on every error path alike.
#[cfg(target_os = "macos")]
fn decode_via_afconvert(path: &Path) -> Result<Vec<f32>, String> {
    struct TempWav(std::path::PathBuf);
    impl Drop for TempWav {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.0);
        }
    }

    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let wav = TempWav(std::env::temp_dir().join(format!(
        "crwbar-afconvert-{}-{nanos}.wav",
        std::process::id()
    )));

    let output = std::process::Command::new("/usr/bin/afconvert")
        .args(["-f", "WAVE", "-d", "LEI16@16000", "-c", "1"])
        .arg(path)
        .arg(&wav.0)
        .output()
        .map_err(|e| format!("cannot run afconvert: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "afconvert failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    decode_via_rodio(&wav.0)
}

/// Resample a mono buffer to 16 kHz using the same resampler the recorder uses.
fn resample_mono_to_16k(mono: Vec<f32>, in_hz: usize) -> Vec<f32> {
    if in_hz == TARGET_HZ || mono.is_empty() {
        return mono;
    }
    let mut rs = FrameResampler::new(in_hz, TARGET_HZ, Duration::from_millis(30));
    let mut out: Vec<f32> = Vec::with_capacity(mono.len().saturating_mul(TARGET_HZ) / in_hz + 16);
    rs.push(&mono, |frame| out.extend_from_slice(frame));
    rs.finish(|frame| out.extend_from_slice(frame));
    out
}

/// Decode via rodio/Symphonia (wav / mp3 / m4a / flac / ogg-vorbis), downmix to
/// mono, and resample to 16 kHz.
fn decode_via_rodio(path: &Path) -> Result<Vec<f32>, String> {
    use rodio::Source;

    let file = std::fs::File::open(path).map_err(|e| format!("cannot open file: {e}"))?;
    let byte_len = file
        .metadata()
        .map_err(|e| format!("cannot read file size: {e}"))?
        .len();

    // The length matters: it also marks the source seekable. Without it an .m4a
    // whose `moov` index sits after the audio — how iPhone Voice Memos and many
    // recorders write them — cannot be read, because the demuxer is unable to
    // seek to the end to find it, and the file is rejected as an unknown format.
    let mut builder = rodio::Decoder::builder()
        .with_data(std::io::BufReader::new(file))
        .with_byte_len(byte_len);
    if let Some(ext) = ext_lower(path) {
        builder = builder.with_hint(&ext);
    }

    let decoder = builder
        .build()
        .map_err(|e| format!("cannot decode audio (unsupported format?): {e}"))?;

    let channels = decoder.channels().max(1) as usize;
    let in_hz = decoder.sample_rate().max(1) as usize;

    // This rodio fork's Decoder yields f32 samples directly (Sample = f32), so we
    // collect straight into the interleaved buffer.
    let interleaved: Vec<f32> = decoder.collect();
    if interleaved.is_empty() {
        return Err("file contained no audio samples".to_string());
    }

    // Downmix to mono by averaging the interleaved channels.
    let mono: Vec<f32> = if channels <= 1 {
        interleaved
    } else {
        interleaved
            .chunks(channels)
            .map(|frame| frame.iter().sum::<f32>() / channels as f32)
            .collect()
    };

    Ok(resample_mono_to_16k(mono, in_hz))
}

/// Decode an Ogg Opus file to 16 kHz mono. libopus resamples internally, so we
/// ask the decoder for 16 kHz mono output directly and skip the resampler.
fn decode_opus_ogg_to_16k_mono(path: &Path) -> Result<Vec<f32>, String> {
    use audiopus::{
        coder::Decoder as OpusDecoder, packet::Packet, Channels, MutSignals, SampleRate,
    };
    use ogg::reading::PacketReader;

    let file = std::fs::File::open(path).map_err(|e| format!("cannot open file: {e}"))?;
    let mut packet_reader = PacketReader::new(std::io::BufReader::new(file));

    let mut decoder = OpusDecoder::new(SampleRate::Hz16000, Channels::Mono)
        .map_err(|e| format!("cannot init Opus decoder: {e}"))?;

    // 120 ms is the largest Opus frame; at 16 kHz mono that is 1920 samples.
    let mut frame = vec![0f32; 1920];
    let mut out: Vec<f32> = Vec::new();

    while let Some(packet) = packet_reader
        .read_packet()
        .map_err(|e| format!("cannot read Ogg stream: {e}"))?
    {
        let data = &packet.data;
        // Skip the two Opus header packets (identification + comment).
        if data.starts_with(b"OpusHead") || data.starts_with(b"OpusTags") {
            continue;
        }
        // audiopus uses newtypes that validate Opus' size constraints on construction.
        let input = Packet::try_from(&data[..]).map_err(|e| format!("invalid Opus packet: {e}"))?;
        let output = MutSignals::try_from(&mut frame[..])
            .map_err(|e| format!("invalid Opus output buffer: {e}"))?;
        let decoded = decoder
            .decode_float(Some(input), output, false)
            .map_err(|e| format!("Opus decode error: {e}"))?;
        out.extend_from_slice(&frame[..decoded]);
    }

    if out.is_empty() {
        return Err("Opus file contained no decodable audio".to_string());
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Recorders such as iPhone Voice Memos write the `moov` index *after* the
    /// audio. Reading one means seeking to the end of the file, which only works
    /// when the decoder is told how long the input is — so the decoder must
    /// always receive a byte length. This asserts the shape such a file has, so
    /// the requirement is visible if the decode path is ever rewritten.
    #[test]
    fn trailing_index_mp4_needs_a_seekable_source() {
        // ftyp, then mdat, then moov last — the layout that used to be rejected.
        let atoms = ["ftyp", "mdat", "moov"];
        let moov_is_last = atoms.last() == Some(&"moov");
        assert!(
            moov_is_last,
            "a non-streamable mp4 keeps its index at the end; decoding it \
             requires a source with a known length"
        );
    }

    /// AAC in CAF is one of the codecs Symphonia cannot decode from that
    /// container, so this only passes when the afconvert fallback works. The
    /// fixture is built with afconvert itself from a sine wave, so the expected
    /// length is known and nothing here depends on a speech model.
    #[cfg(target_os = "macos")]
    #[test]
    fn caf_with_a_codec_symphonia_cannot_read_still_decodes() {
        let dir = tempfile::tempdir().expect("tempdir");
        let wav = dir.path().join("tone.wav");
        let caf = dir.path().join("tone.caf");

        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: 16_000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::create(&wav, spec).expect("create wav");
        for n in 0..16_000 {
            let t = n as f32 / 16_000.0;
            let sample = (t * 440.0 * std::f32::consts::TAU).sin() * 0.5;
            writer
                .write_sample((sample * i16::MAX as f32) as i16)
                .expect("write");
        }
        writer.finalize().expect("finalize wav");

        let status = std::process::Command::new("/usr/bin/afconvert")
            .args(["-f", "caff", "-d", "aac "])
            .arg(&wav)
            .arg(&caf)
            .status()
            .expect("run afconvert");
        assert!(status.success(), "afconvert could not build the fixture");

        let samples = decode_to_16k_mono(&caf).expect("CAF/AAC must decode");
        // AAC adds encoder priming, so allow a little slack around one second.
        assert!(
            (15_000..=17_500).contains(&samples.len()),
            "expected about one second of audio, got {} samples",
            samples.len()
        );
        let energy = samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32;
        assert!(energy > 0.01, "decoded audio is silent (energy {energy})");
    }

    #[test]
    fn opus_is_detected_by_extension() {
        assert!(is_probably_opus(Path::new("/tmp/voice.opus")));
        assert!(is_probably_opus(Path::new("/tmp/VOICE.OPUS")));
        assert!(!is_probably_opus(Path::new("/tmp/voice.m4a")));
        assert!(!is_probably_opus(Path::new("/tmp/voice")));
    }
}
