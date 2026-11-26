#!/usr/bin/env python3
"""
whisper-arabic - CLI wrapper (Whisper Python).

Transcribe a mono 16 kHz 16-bit PCM audio file into deterministic Arabic
JSON lines. Pins language="ar", task="transcribe", temperature=0.0,
best_of=1 so repeated runs on the same audio return identical text.

Usage:
    python3 scripts/transcribe.py --input calls/lead-voicemail.mp3 --output out.jsonl

Output - JSON lines (one object per run) with keys:
    segment  list of segments from the model
    to       target language ("ar")
    text     concatenated lower-confidence text (segments flagged confidence < 0.5)
    language source language code ("ar")
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

# Prefer the locally maintained faster-whisper sidecar backend; fall back to
# openai-whisper if the package is not installed in the active environment.
try:
    from faster_whisper import WhisperModel as _FasterWhisperModel  # type: ignore
    _HAS_FASTER = True
except Exception:  # pragma: no cover
    _HAS_FASTER = False

try:
    import whisper  # type: ignore  # openai-whisper
    _HAS_OPENAI = True
except Exception:  # pragma: no cover
    _HAS_OPENAI = False

REQUIRED = ("faster_whisper" if _HAS_FASTER else "openai-whisper")
if not _HAS_FASTER and not _HAS_OPENAI:
    sys.stderr.write(
        "transcribe.py needs a Whisper backend: install faster-whisper or "
        "openai-whisper in the active environment.\n"
    )
    sys.exit(2)


def _to_pcm16_mono(wav_path: str) -> str:
    """Decode any container to a mono 16 kHz 16-bit PCM wav via ffmpeg."""
    fd, tmp = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error", "-i", wav_path,
            "-ac", "1", "-ar", "16000", "-sample_fmt", "s16", tmp,
        ],
        check=True,
    )
    return tmp


def _decode_to_wav(src: str) -> str:
    return _to_pcm16_mono(src)


def transcribe_faster_whisper(model_name: str, audio_array, sampling_rate: int, language: str = "ar"):
    """Use faster-whisper (CPU) with audio already decoded to a float32 array."""
    from faster_whisper import WhisperModel

    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, info = model.transcribe(
        audio_array,
        language=language,
        task="transcribe",
        temperature=0.0,
        best_of=1,
        vad_filter=False,
    )
    out = []
    for seg in segments:
        out.append(
            {
                "id": seg.id,
                "seek": seg.seek,
                "start": seg.start,
                "end": seg.end,
                "text": seg.text.strip(),
                "avg_logprob": round(seg.avg_logprob, 3) if seg.avg_logprob is not None else None,
                "no_speech_prob": round(seg.no_speech_prob, 3) if seg.no_speech_prob is not None else None,
                "temperature": round(seg.temperature, 2) if seg.temperature is not None else None,
            }
        )
    return out, info.language


def transcribe_openai_whisper(model_name: str, audio_array, sampling_rate: int, language: str = "ar"):
    """Use openai-whisper with audio already decoded to a float32 array."""
    import whisper

    model = whisper.load_model(model_name)
    result = model.transcribe(
        audio=audio_array,
        sampling_rate=sampling_rate,
        language=language,
        task="transcribe",
        temperature=0.0,
        best_of=1,
    )
    out = []
    for seg in result.get("segments", []):
        out.append(
            {
                "id": seg.get("id"),
                "seek": seg.get("seek"),
                "start": seg.get("start"),
                "end": seg.get("end"),
                "text": seg.get("text", "").strip(),
                "language": seg.get("language"),
                "avg_logprob": seg.get("avg_logprob"),
                "no_speech_prob": seg.get("no_speech_prob"),
                "temperature": seg.get("temperature"),
            }
        )
    return out


def transcribe(input_path: str, model_name: str = "tiny", language: str = "ar"):
    """Decode audio with ffmpeg, then run Whisper on the float32 array."""
    wav = _decode_to_wav(input_path)
    import soundfile as sf

    try:
        audio, sr = sf.read(wav, dtype="float32")
        sr = int(sr)
        if _HAS_FASTER:
            records, info = transcribe_faster_whisper(model_name, audio, sr, language)
        else:
            records, info = transcribe_openai_whisper(model_name, audio, sr, language)
    finally:
        Path(wav).unlink(missing_ok=True)
    return records, info


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="whisper-arabic: deterministic Arabic transcription to JSON lines."
    )
    parser.add_argument("--input", required=True, help="Audio file (wav, mp3, m4a, flac).")
    parser.add_argument(
        "--output",
        required=True,
        help="JSON lines output file.",
    )
    parser.add_argument(
        "--model",
        default="tiny",
        help="Whisper checkpoint (tiny / base / small). Default: tiny.",
    )
    parser.add_argument(
        "--language",
        default="ar",
        help="Source language code. Default: ar (Arabic).",
    )
    args = parser.parse_args(argv)

    try:
        records, info = transcribe(args.input, model_name=args.model, language=args.language)
    except FileNotFoundError as exc:
        sys.stderr.write(f"transcribe.py: {exc}\n")
        return 2

    text = " ".join(r.get("text", "") for r in records).strip()
    lines = [
        json.dumps(
            {
                "segment": [
                    {
                        "start": r.get("start"),
                        "end": r.get("end"),
                        "text": r.get("text"),
                        "language": r.get("language"),
                        "confidence": round(1.0 - (r.get("no_speech_prob") or 0.0), 3),
                    }
                    for r in records
                ],
                "to": args.language,
                "text": text,
                "language": info.language,
                "backend": "faster-whisper" if _HAS_FASTER else "openai-whisper",
                "model": args.model,
                "total_duration_seconds": sum(
                    (r.get("end") or 0) - (r.get("start") or 0) for r in records
                ),
                "low_confidence_count": sum(
                    1 for r in records if (r.get("no_speech_prob") or 0.0) > 0.5
                ),
            }
        )
    ]

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"whisper-arabic: wrote {len(lines)} JSON line(s) to {out}")
    print(f"  text={text!r}")
    print(f"  language={info}")
    print(f"  low_confidence_count={lines[0].get('low_confidence_count')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
