"""Split a video/audio file into fixed-duration chunks using FFmpeg."""

import subprocess
import math
from pathlib import Path


def get_duration(input_path: Path) -> float:
    """Return media duration in seconds via ffprobe."""
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(input_path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    output = result.stdout.strip()
    if not output:
        raise RuntimeError(f"ffprobe returned no duration for: {input_path}\nstderr: {result.stderr.strip()}")
    return float(output)


def split(input_path: Path, chunk_dir: Path, chunk_duration: int) -> list[Path]:
    """
    Split input_path into chunks of chunk_duration seconds.
    Returns list of chunk file paths in order.
    """
    chunk_dir.mkdir(parents=True, exist_ok=True)

    duration = get_duration(input_path)
    num_chunks = math.ceil(duration / chunk_duration)
    suffix = input_path.suffix
    chunks: list[Path] = []

    print(f"  Total duration : {duration:.1f}s")
    print(f"  Chunk duration : {chunk_duration}s")
    print(f"  Chunks to create: {num_chunks}")

    for i in range(num_chunks):
        start = i * chunk_duration
        chunk_path = chunk_dir / f"chunk_{i:04d}{suffix}"

        result = subprocess.run(
            [
                "ffmpeg", "-y",
                "-ss", str(start),
                "-i", str(input_path),
                "-t", str(chunk_duration),
                "-c", "copy",
                str(chunk_path),
            ],
            capture_output=True,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"ffmpeg failed on chunk {i + 1}:\n{result.stderr.decode(errors='replace').strip()}"
            )
        chunks.append(chunk_path)
        print(f"  [split] chunk {i + 1}/{num_chunks}: {chunk_path.name}")

    return chunks
