"""Batch processing — scan a folder, transcribe all media files, produce a report."""

import logging
import time
import traceback
from dataclasses import dataclass, field
from pathlib import Path

from splitter import split, get_duration
from extractor import extract_all
from transcriber import transcribe_all


@dataclass
class FileResult:
    path: Path
    status: str = "pending"       # pending | success | failed | skipped
    error: str = ""
    video_duration: float = 0.0
    elapsed: float = 0.0
    output_file: Path | None = None


def _fmt_time(seconds: float) -> str:
    seconds = int(seconds)
    h, m, s = seconds // 3600, (seconds % 3600) // 60, seconds % 60
    return f"{h:02d}:{m:02d}:{s:02d}"


def _progress_bar(done: int, total: int, width: int = 30) -> str:
    filled = int(width * done / total) if total else 0
    bar = "█" * filled + "░" * (width - filled)
    return f"[{bar}] {done}/{total}"


def discover_files(root: Path, extensions: list[str]) -> list[Path]:
    """Recursively find all supported media files under root."""
    found = []
    for ext in extensions:
        found.extend(root.rglob(f"*{ext}"))
        found.extend(root.rglob(f"*{ext.upper()}"))
    return sorted(set(found))


def _output_path(input_file: Path, input_root: Path, output_root: Path) -> Path:
    """Mirror the source directory structure under output_root."""
    relative = input_file.relative_to(input_root)
    return output_root / relative.parent / f"{input_file.stem}_transcript.txt"


def _process_one(
    input_file: Path,
    input_root: Path,
    output_root: Path,
    base_dir: Path,
    cfg: dict,
    logger: logging.Logger,
) -> FileResult:
    result = FileResult(path=input_file)
    start = time.time()

    chunk_duration: int = cfg["chunk_duration_seconds"]
    model_name: str = cfg["whisper_model"]
    language: str = cfg["language"]
    keep_intermediate: bool = cfg["keep_intermediate_files"]
    max_workers: int = cfg.get("max_transcription_workers", 4)

    chunk_dir = base_dir / cfg["dirs"]["chunks"] / input_file.stem
    audio_dir = base_dir / cfg["dirs"]["audio"] / input_file.stem
    out_file  = _output_path(input_file, input_root, output_root)
    out_file.parent.mkdir(parents=True, exist_ok=True)

    try:
        # Step 1 — split
        duration = get_duration(input_file)
        result.video_duration = duration
        if duration <= chunk_duration:
            chunk_paths = [input_file]
        else:
            chunk_paths = split(input_file, chunk_dir, chunk_duration)

        # Step 2 — extract audio
        audio_paths = extract_all(chunk_paths, audio_dir)
        if not audio_paths:
            raise RuntimeError("No audio streams found in any chunk.")

        # Step 3 — transcribe
        parts = transcribe_all(audio_paths, model_name, language, max_workers, chunk_duration)

        # Join and save
        transcript = "\n\n".join(p for p in parts if p.strip())
        out_file.write_text(transcript, encoding="utf-8")

        if not transcript.strip():
            result.status = "skipped"
            result.error = "Whisper produced no text — try a larger model."
            logger.warning(f"SKIPPED (empty transcript): {input_file}")
        else:
            result.status = "success"
            result.output_file = out_file
            logger.info(f"SUCCESS: {input_file} -> {out_file}")

    except Exception as e:
        result.status = "failed"
        result.error = str(e)
        logger.error(f"FAILED: {input_file}\n{traceback.format_exc()}")

    finally:
        if not keep_intermediate:
            for d in (chunk_dir, audio_dir):
                if d.exists():
                    import shutil
                    shutil.rmtree(d)

    result.elapsed = time.time() - start
    return result


def run_batch(
    input_root: Path,
    output_root: Path,
    base_dir: Path,
    cfg: dict,
    logger: logging.Logger,
) -> list[FileResult]:
    files = discover_files(input_root, cfg["supported_extensions"])
    total = len(files)

    if total == 0:
        logger.warning("No supported media files found.")
        print("⚠ No supported media files found in the folder.")
        return []

    print(f"\n  Found {total} file(s) to process.\n")
    results: list[FileResult] = []
    batch_start = time.time()

    for i, file in enumerate(files, start=1):
        print(f"\n{'─'*55}")
        print(f"  File {i}/{total}: {file.relative_to(input_root)}")
        print(f"{'─'*55}")
        logger.info(f"--- Processing {i}/{total}: {file}")

        result = _process_one(file, input_root, output_root, base_dir, cfg, logger)
        results.append(result)

        # --- Progress + ETA ---
        elapsed_total = time.time() - batch_start
        avg_per_file  = elapsed_total / i
        remaining     = (total - i) * avg_per_file
        success_count = sum(1 for r in results if r.status == "success")
        fail_count    = sum(1 for r in results if r.status == "failed")

        print(f"\n  {_progress_bar(i, total)}")
        print(f"  Elapsed : {_fmt_time(elapsed_total)}  |  ETA : {_fmt_time(remaining)}")
        print(f"  ✓ {success_count} succeeded   ✗ {fail_count} failed   {total - i} remaining")

    return results


def write_report(
    results: list[FileResult],
    output_root: Path,
    total_elapsed: float,
    logger: logging.Logger,
) -> Path:
    report_path = output_root / "transcription_report.txt"
    lines = []

    lines.append("=" * 65)
    lines.append("  VIDEO TRANSCRIPTION REPORT")
    lines.append("=" * 65)
    lines.append(f"  Total files     : {len(results)}")
    lines.append(f"  Succeeded       : {sum(1 for r in results if r.status == 'success')}")
    lines.append(f"  Failed          : {sum(1 for r in results if r.status == 'failed')}")
    lines.append(f"  Skipped         : {sum(1 for r in results if r.status == 'skipped')}")
    lines.append(f"  Total time      : {_fmt_time(total_elapsed)}")
    lines.append("=" * 65)
    lines.append("")

    for r in results:
        icon = {"success": "✓", "failed": "✗", "skipped": "⚠", "pending": "?"}.get(r.status, "?")
        lines.append(f"  {icon}  {r.path.name}")
        lines.append(f"      Status   : {r.status.upper()}")
        if r.video_duration:
            lines.append(f"      Duration : {_fmt_time(r.video_duration)}")
        lines.append(f"      Time     : {_fmt_time(r.elapsed)}")
        if r.output_file:
            lines.append(f"      Output   : {r.output_file}")
        if r.error:
            lines.append(f"      Error    : {r.error}")
        lines.append("")

    report_path.write_text("\n".join(lines), encoding="utf-8")
    logger.info(f"Report written to {report_path}")
    return report_path
