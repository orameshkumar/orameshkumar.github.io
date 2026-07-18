"""Transcribe audio files using OpenAI Whisper (runs fully locally)."""

from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import threading
import whisper


_thread_local = threading.local()
_print_lock = threading.Lock()


def _load_model(model_name: str) -> whisper.Whisper:
    """Load a per-thread model instance — Whisper is not thread-safe with a shared model."""
    if not hasattr(_thread_local, "models"):
        _thread_local.models = {}
    if model_name not in _thread_local.models:
        with _print_lock:
            print(f"  [whisper] loading model '{model_name}' for thread {threading.current_thread().name}…")
        _thread_local.models[model_name] = whisper.load_model(model_name)
    return _thread_local.models[model_name]


def _format_time(seconds: float) -> str:
    """Convert seconds to HH:MM:SS format."""
    seconds = int(seconds)
    h = seconds // 3600
    m = (seconds % 3600) // 60
    s = seconds % 60
    return f"{h:02d}:{m:02d}:{s:02d}"


def transcribe_file(audio_path: Path, model_name: str, language: str, time_offset: float = 0.0) -> str:
    """
    Transcribe a single audio file and return timestamped text.
    time_offset shifts all segment timestamps to absolute video time.
    """
    model = _load_model(model_name)

    kwargs: dict = {"fp16": False}
    if language != "auto":
        kwargs["language"] = language

    result = model.transcribe(str(audio_path), **kwargs)

    lines = []
    for segment in result["segments"]:
        start = _format_time(segment["start"] + time_offset)
        end   = _format_time(segment["end"]   + time_offset)
        text  = segment["text"].strip()
        if text:
            lines.append(f"[{start} --> {end}]  {text}")

    return "\n".join(lines)


def transcribe_all(
    audio_paths: list[Path],
    model_name: str,
    language: str,
    max_workers: int = 4,
    chunk_duration: int = 0,
) -> list[str]:
    """Transcribe all audio files in parallel, returning results in original order."""
    total = len(audio_paths)
    results: dict[int, str] = {}
    completed = 0

    def _worker(index: int, path: Path) -> tuple[int, str]:
        offset = index * chunk_duration
        text = transcribe_file(path, model_name, language, time_offset=offset)
        return index, text

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(_worker, i, path): i
            for i, path in enumerate(audio_paths)
        }
        for future in as_completed(futures):
            index, text = future.result()
            results[index] = text
            completed += 1
            with _print_lock:
                print(f"  [transcribe] {completed}/{total} done: {audio_paths[index].name}")

    return [results[i] for i in range(total)]
