"""
Video Transcriber — entry point.

Usage:
    # Single file
    python main.py path/to/video.mp4

    # Entire folder (recursive)
    python main.py path/to/folder/

    # Custom config
    python main.py path/to/input --config my_config.yaml

Output:
    output/<filename>_transcript.txt         (single file)
    output/<mirrored/path>_transcript.txt    (folder mode)
    output/transcription_report.txt          (folder mode only)
    logs/transcription.log                   (folder mode only)
"""

import argparse
import logging
import shutil
import subprocess
import sys
import time
from pathlib import Path

import yaml

from splitter import split, get_duration
from extractor import extract_all
from transcriber import transcribe_all
from batch import run_batch, write_report


def check_dependencies() -> None:
    for tool in ("ffmpeg", "ffprobe"):
        result = subprocess.run([tool, "-version"], capture_output=True)
        if result.returncode != 0:
            sys.exit(
                f"Error: '{tool}' not found on PATH.\n"
                "Install it with:  winget install ffmpeg\n"
                "Then open a new terminal and try again."
            )


def load_config(config_path: Path) -> dict:
    with open(config_path, "r") as f:
        return yaml.safe_load(f)


def validate_file(input_path: Path, supported_extensions: list[str]) -> None:
    if not input_path.exists():
        sys.exit(f"Error: file not found — {input_path}")
    if input_path.suffix.lower() not in supported_extensions:
        sys.exit(
            f"Error: unsupported format '{input_path.suffix}'.\n"
            f"Supported: {', '.join(supported_extensions)}"
        )


def cleanup(dirs: list[Path]) -> None:
    for d in dirs:
        if d.exists():
            shutil.rmtree(d)


def setup_logger(log_dir: Path) -> logging.Logger:
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "transcription.log"
    logger = logging.getLogger("transcriber")
    logger.setLevel(logging.DEBUG)
    fh = logging.FileHandler(log_file, encoding="utf-8")
    fh.setFormatter(logging.Formatter("%(asctime)s  %(levelname)-8s  %(message)s"))
    logger.addHandler(fh)
    return logger


def fmt_time(seconds: float) -> str:
    seconds = int(seconds)
    h, m, s = seconds // 3600, (seconds % 3600) // 60, seconds % 60
    return f"{h:02d}:{m:02d}:{s:02d}"


# ─────────────────────────────────────────────
#  Single-file mode
# ─────────────────────────────────────────────
def process_single(input_path: Path, cfg: dict, base_dir: Path, output_dir: Path) -> None:
    validate_file(input_path, cfg["supported_extensions"])

    chunk_duration: int = cfg["chunk_duration_seconds"]
    model_name: str     = cfg["whisper_model"]
    language: str       = cfg["language"]
    keep_intermediate   = cfg["keep_intermediate_files"]
    max_workers: int    = cfg.get("max_transcription_workers", 4)

    chunk_dir  = base_dir / cfg["dirs"]["chunks"] / input_path.stem
    audio_dir  = base_dir / cfg["dirs"]["audio"]  / input_path.stem
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*55}")
    print(f"  Mode    : Single file")
    print(f"  Input   : {input_path.name}")
    print(f"  Model   : {model_name}")
    print(f"  Workers : {max_workers}")
    print(f"  Chunk   : {chunk_duration}s")
    print(f"  Language: {language}")
    print(f"{'='*55}\n")

    start_time = time.time()

    print("Step 1/3 — Splitting into chunks…")
    duration = get_duration(input_path)
    if duration <= chunk_duration:
        print("  File shorter than chunk duration — treating as single chunk.")
        chunk_paths = [input_path]
    else:
        chunk_paths = split(input_path, chunk_dir, chunk_duration)

    print("\nStep 2/3 — Extracting audio…")
    audio_paths = extract_all(chunk_paths, audio_dir)
    if not audio_paths:
        sys.exit("Error: no audio files to transcribe — all chunks were empty or had no audio stream.")

    print("\nStep 3/3 — Transcribing…")
    parts = transcribe_all(audio_paths, model_name, language, max_workers, chunk_duration)

    non_empty  = [p for p in parts if p.strip()]
    transcript = "\n\n".join(non_empty)
    out_file   = output_dir / f"{input_path.stem}_transcript.txt"
    out_file.write_text(transcript, encoding="utf-8")

    if not keep_intermediate:
        cleanup([chunk_dir, audio_dir])

    elapsed = time.time() - start_time
    speed   = duration / elapsed if elapsed > 0 else 0

    print(f"\n{'='*55}")
    print(f"  Video length     : {fmt_time(duration)}")
    print(f"  Processing time  : {fmt_time(elapsed)}")
    print(f"  Speed            : {speed:.1f}x realtime")
    print(f"{'='*55}")

    if not transcript.strip():
        print("\n⚠ Warning: transcript is empty — try a larger model in config.yaml.")
    else:
        print(f"\n✓ Done! Transcript saved to:\n  {out_file}\n")


# ─────────────────────────────────────────────
#  Folder (batch) mode
# ─────────────────────────────────────────────
def process_folder(input_root: Path, cfg: dict, base_dir: Path, output_dir: Path) -> None:
    if not input_root.is_dir():
        sys.exit(f"Error: folder not found — {input_root}")

    log_dir = base_dir / "logs"
    logger  = setup_logger(log_dir)

    print(f"\n{'='*55}")
    print(f"  Mode    : Batch folder")
    print(f"  Input   : {input_root}")
    print(f"  Output  : {output_dir}")
    print(f"  Log     : {log_dir / 'transcription.log'}")
    print(f"  Model   : {cfg['whisper_model']}")
    print(f"  Workers : {cfg.get('max_transcription_workers', 4)}")
    print(f"{'='*55}")

    logger.info(f"Batch started — input: {input_root}")
    batch_start = time.time()

    results = run_batch(input_root, output_dir, base_dir, cfg, logger)

    total_elapsed = time.time() - batch_start
    report_path   = write_report(results, output_dir, total_elapsed, logger)

    success = sum(1 for r in results if r.status == "success")
    failed  = sum(1 for r in results if r.status == "failed")
    skipped = sum(1 for r in results if r.status == "skipped")

    print(f"\n{'='*55}")
    print(f"  Batch complete!")
    print(f"  Total time  : {fmt_time(total_elapsed)}")
    print(f"  ✓ Succeeded : {success}")
    print(f"  ✗ Failed    : {failed}")
    print(f"  ⚠ Skipped   : {skipped}")
    print(f"{'='*55}")
    print(f"\n  Report : {report_path}")
    print(f"  Log    : {log_dir / 'transcription.log'}\n")

    logger.info(f"Batch finished — {success} succeeded, {failed} failed, {skipped} skipped.")


# ─────────────────────────────────────────────
#  Entry point
# ─────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(description="Transcribe video/audio files.")
    parser.add_argument("input", help="Path to a video/audio file OR a folder")
    parser.add_argument("--config", default="config.yaml", help="Path to config file")
    args = parser.parse_args()

    check_dependencies()

    input_path  = Path(args.input).resolve()
    config_path = Path(args.config).resolve()
    cfg         = load_config(config_path)
    base_dir    = config_path.parent
    output_dir  = base_dir / cfg["dirs"]["output"]

    if input_path.is_dir():
        process_folder(input_path, cfg, base_dir, output_dir)
    else:
        process_single(input_path, cfg, base_dir, output_dir)


if __name__ == "__main__":
    main()
