# Video Transcriber

Transcribes any video or audio file locally using FFmpeg + OpenAI Whisper.

## Prerequisites

1. **Python 3.9+**
2. **FFmpeg** — must be on your PATH  
   Download: https://ffmpeg.org/download.html  
   Windows quick install: `winget install ffmpeg`

3. **Python dependencies**
   ```bash
   pip install -r requirements.txt
   ```

## Usage

```bash
python main.py path/to/video.mp4
```

With a custom config file:
```bash
python main.py path/to/video.mp4 --config my_config.yaml
```

## Configuration (`config.yaml`)

| Key | Default | Description |
|-----|---------|-------------|
| `chunk_duration_seconds` | `300` | Chunk size (120 = 2 min, 300 = 5 min, etc.) |
| `whisper_model` | `base` | `tiny` / `base` / `small` / `medium` / `large` |
| `language` | `auto` | Language code (`en`, `fr`, …) or `auto` to detect |
| `keep_intermediate_files` | `false` | Keep chunk & audio files after transcription |

## Output

`output/<filename>_transcript.txt` — clean joined transcript, no timestamps.

## Supported Formats

Video: `.mp4 .mkv .avi .mov .wmv .flv .webm .m4v .mpeg .mpg`  
Audio: `.mp3 .wav .aac .flac .ogg .m4a .wma`
