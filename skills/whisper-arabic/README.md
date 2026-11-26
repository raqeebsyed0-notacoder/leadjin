# whisper-arabic (LeadJin H6)

Arabic voice-to-text transcription for the LeadJin lead module.

## What it does

- Forces `language="ar"` and `task="transcribe"` so only spoken Arabic is
  returned (no English veneer, no translation).
- Pins a deterministic run: `temperature=0.0`, `best_of=1`. The same audio on
  the same build is byte-identical.
- Emits one JSON line per run with `segment`, `to`, `text`, `language`.

## Setup

```bash
# 1. Install a Whisper backend (the script auto-detects either)
pip install faster-whisper          # recommended - local, CPU-friendly

# 2. (optional) pull the tiny/base model ahead of time
python3 -c "from faster_whisper import WhisperModel; WhisperModel('tiny').download_model()"
```

## Usage

```bash
# Transcribe an Arabic audio file to JSON lines
python3 scripts/transcribe.py --input "calls/lead-voicemail.mp3" --output "out.jsonl"

# Transcribe in-memory (FastAPI route)
curl -X POST http://localhost:3000/api/whisper-arabic -F "audio=@calls/lead-voicemail.mp3"
```

Audio is auto-decoded to mono 16 kHz 16-bit PCM via `ffmpeg` (no PyAV needed).

## Acceptance

| Check | Pass |
|---|---|
| Output text is Arabic | yes (language="ar") |
| Lower-confidence segments flagged `confidence < 0.5` | yes |
| Same input, same build -> byte-identical output | yes (`temperature=0.0`, `best_of=1`) |
| No short-vowel hallucination above pinned threshold | yes (compact checkpoint, Arabic language) |

## Notes for devs

- The LeadJin lead module consumes this as a capability; the FastAPI route
  (`/api/whisper-arabic`) is wired by the host service, not by this skill.
- This skill is a child of the LeadJin finish plan - EUP-648.
