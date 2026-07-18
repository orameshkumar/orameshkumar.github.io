# Video Transcriber

Fully local speech-to-text system. No internet or API key required after setup.  
Supports single files, batch folders, and live audio capture (meetings, calls, YouTube).

---

## Prerequisites

| # | Tool | Version | Install |
|---|------|---------|---------|
| 1 | Python | 3.12+ | https://www.python.org/downloads/ — check **Add Python to PATH** |
| 2 | FFmpeg | 8.x | `winget install ffmpeg` |

---

## Installation

```bash
cd C:\Ramesh\Infor\ClaudeCode\video-transcriber
pip install -r requirements.txt
```

### Dependencies (`requirements.txt`)

| Package | Purpose |
|---------|---------|
| `openai-whisper` | Local AI speech recognition (no API key needed) |
| `pyyaml` | Read/write `config.yaml` |
| `numpy` | Audio buffer mixing and normalisation |
| `customtkinter` | Modern dark-theme desktop GUI |
| `soundcard` | WASAPI loopback — captures system audio (Teams, YouTube, etc.) |
| `sounddevice` | PortAudio mic capture — works with Dell WH3024 and other headsets |

> **First run:** Whisper downloads the model automatically (~140 MB for `base`).  
> Subsequent runs use the local cache — no internet needed.

---

## Launch (GUI — recommended)

```bash
cd C:\Ramesh\Infor\ClaudeCode\video-transcriber
python gui.py
```

---

## Usage

### GUI tabs

| Tab | Use for |
|-----|---------|
| **File** | Transcribe a single video or audio file |
| **Folder** | Batch-transcribe all media files in a folder (recursive) |
| **Live Capture** | Capture system audio + mic in real time (meetings, calls, YouTube) |

### Command line

```bash
# Single file
python main.py path\to\video.mp4

# Folder (batch)
python main.py path\to\folder\

# Live capture
python capture.py

# List available audio devices
python capture.py --list-devices
```

---

## Configuration (`config.yaml`)

| Key | Default | Description |
|-----|---------|-------------|
| `whisper_model` | `base` | `tiny` / `base` / `small` / `medium` / `large` |
| `language` | `auto` | Language code (`en`, `fr`, …) or `auto` to detect |
| `chunk_duration_seconds` | `300` | Split media into N-second chunks for parallel processing |
| `max_transcription_workers` | `4` | Parallel transcription threads |
| `keep_intermediate_files` | `false` | Keep audio chunks after transcription |
| `capture.system_audio` | `true` | Capture speakers / headphones (loopback) |
| `capture.microphone` | `true` | Capture microphone input |
| `capture.system_volume` | `1.1` | System audio level in the mix |
| `capture.mic_volume` | `1.0` | Microphone level in the mix |
| `capture.sample_rate` | `16000` | Audio sample rate — do not change |
| `capture.output_prefix` | `capture` | Filename prefix for live capture output |

---

## Output

| Mode | Output file |
|------|------------|
| File | `output/{filename}_transcript.txt` |
| Folder | `output/{mirrored/path}_transcript.txt` + `transcription_report.txt` |
| Live Capture | `output/capture_{timestamp}_transcript.txt` |

---

## Supported formats

**Video:** `.mp4 .mkv .avi .mov .wmv .flv .webm .m4v .mpeg .mpg`  
**Audio:** `.mp3 .wav .aac .flac .ogg .m4a .wma`

---

## Live Capture — supported sources

| Source | Supported |
|--------|-----------|
| Microsoft Teams | Yes |
| Zoom | Yes |
| Google Meet | Yes |
| Webex | Yes |
| WhatsApp Desktop | Yes |
| YouTube / browser | Yes |
| Mobile phone calls | No (audio not routed through PC) |

> **Tip:** Play YouTube at 1.5x–2x speed to halve recording time.  
> Whisper handles time-stretched audio well up to 2x.

---

## Whisper model guide

| Model | Size | Speed | Best for |
|-------|------|-------|---------|
| `tiny` | ~39 MB | Fastest | Quick drafts |
| `base` | ~140 MB | Fast | General use (default) |
| `small` | ~460 MB | Medium | Accents, technical terms |
| `medium` | ~1.5 GB | Slow | Important recordings |
| `large` | ~2.9 GB | Slowest | Maximum accuracy |
