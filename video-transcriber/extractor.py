"""Extract mono 16 kHz WAV audio from a media file using FFmpeg."""

import subprocess
from pathlib import Path


def has_audio_stream(input_path: Path) -> bool:
    """Return True if the file has at least one audio stream with valid duration."""
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-select_streams", "a",
            "-show_entries", "stream=codec_type",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(input_path),
        ],
        capture_output=True,
        text=True,
    )
    return bool(result.stdout.strip())


def extract(input_path: Path, audio_dir: Path) -> Path:
    """
    Extract audio from input_path as a 16 kHz mono WAV.
    Returns the path to the WAV file.
    """
    audio_dir.mkdir(parents=True, exist_ok=True)
    out_path = audio_dir / (input_path.stem + ".wav")

    result = subprocess.run(
        [
            "ffmpeg", "-y",
            "-i", str(input_path),
            "-vn",                  # drop video stream
            "-acodec", "pcm_s16le", # 16-bit PCM
            "-ar", "16000",         # 16 kHz — optimal for Whisper
            "-ac", "1",             # mono
            str(out_path),
        ],
        capture_output=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"ffmpeg audio extraction failed for {input_path.name}:\n"
            f"{result.stderr.decode(errors='replace').strip()}"
        )
    return out_path


def extract_all(chunk_paths: list[Path], audio_dir: Path) -> list[Path]:
    audio_paths: list[Path] = []
    for i, chunk in enumerate(chunk_paths):
        if not has_audio_stream(chunk):
            print(f"  [audio] skipping {chunk.name} — no audio stream (empty chunk)")
            continue
        wav = extract(chunk, audio_dir)
        audio_paths.append(wav)
        print(f"  [audio] extracted {i + 1}/{len(chunk_paths)}: {wav.name}")
    return audio_paths
