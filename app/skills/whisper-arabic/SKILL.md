# whisper-arabic

Arabic voice-to-text transcription skill for LeadJin H6.

## Purpose

Gives LeadJin the ability to transcribe Arabic speech (calls, voicemails,
voice notes, and recorded outreach) into clean text that feeds the lead
capture, enrichment, and outreach pipelines. Arabic is a
root/stem-based, diacritic-light language; off-the-shelf Whisper utterances
often hallucinate short vowels, so this skill pins a compact Arabic
configuration and a deterministic output format.

## What this skill covers

- **Input** - mono, 16 kHz, 16-bit PCM audio (any container Whisper accepts:
  wav, mp3, m4a, flac).
- **Model** - a compact Whisper checkpoint (tiny/base) tuned or prompted for
  Arabic, to keep transcription fast and private.
- **Language flag** - `language="ar"` forced; `task="transcribe"` (not
  translate) so only the spoken Arabic is returned.
- **Output** - JSON lines with `segment`, `to`, `text`, `language`.
- **Determinism** - `temperature=0.0`, `best_of=1` so repeated runs on the
  same audio return identical text.

## Files

| File | Role |
|---|---|
| `SKILL.md` | This file - capability, config, usage. |
| `scripts/transcribe.py` | CLI wrapper (Whisper Python) - transcribe a file to JSON lines. |
| `README.md` | Usage, model download, and dev setup. |

## Usage

```bash
# Transcribe an Arabic audio file to JSON lines
python3 scripts/transcribe.py --input "calls/lead-voicemail.mp3" --output "out.jsonl"

# Transcribe in-memory (FastAPI route)
curl -X POST http://localhost:3000/api/whisper-arabic -F "audio=@calls/lead-voicemail.mp3"
```

## Acceptance

- Output text is Arabic, lower-confidence segments marked `confidence < 0.5`.
- Same input on the same build yields byte-identical output.
- No short-vowel hallucination above the pinned threshold.

## Owner

LeadJin H6 (LeadJin lead module). Child of the LeadJin finish plan - EUP-648.
