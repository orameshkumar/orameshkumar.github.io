"""
Live audio capture + transcription.

  - System audio  : soundcard WASAPI loopback (Teams video, browser, etc.)
  - Microphone    : sounddevice PortAudio (works with Dell WH3024 and other headsets)

Usage:
    python capture.py
    python capture.py --config config.yaml
    python capture.py --list-devices

Press Ctrl+C to stop recording and start transcription.
"""

import argparse
import subprocess
import sys
import threading
import time
import wave
from datetime import datetime
from pathlib import Path

import numpy as np
import soundcard as sc
import sounddevice as sd
import yaml


# ---------------------------------------------
#  Config
# ---------------------------------------------

def load_config(config_path: Path) -> dict:
    with open(config_path, "r") as f:
        return yaml.safe_load(f)


def check_dependencies() -> None:
    for tool in ("ffmpeg", "ffprobe"):
        result = subprocess.run([tool, "-version"], capture_output=True)
        if result.returncode != 0:
            sys.exit(
                f"Error: '{tool}' not found on PATH.\n"
                "Install it with:  winget install ffmpeg"
            )


# ---------------------------------------------
#  Device discovery
# ---------------------------------------------

def get_all_loopbacks() -> list:
    """Return all WASAPI loopback devices (soundcard)."""
    return [m for m in sc.all_microphones(include_loopback=True) if m.isloopback]


def get_all_mics() -> list:
    """Return all input devices via sounddevice (PortAudio) — avoids soundcard headset bug."""
    mics = []
    for d in sd.query_devices():
        if d["max_input_channels"] > 0 and d["name"] not in (
            "Microsoft Sound Mapper - Input",
            "Primary Sound Capture Driver",
        ):
            mics.append(d)
    return mics


def get_loopback_device(preferred_name: str = ""):
    """
    Return the best loopback device.
    Prefers preferred_name if given, otherwise matches the default speaker,
    otherwise returns the first loopback found.
    """
    loopbacks = get_all_loopbacks()
    if not loopbacks:
        return None
    if preferred_name:
        for lb in loopbacks:
            if preferred_name.lower() in lb.name.lower():
                return lb
    # Match the default speaker by name
    try:
        default_spk = sc.default_speaker().name
        for lb in loopbacks:
            if lb.name == default_spk:
                return lb
    except Exception:
        pass
    return loopbacks[0]


def get_mic_device(preferred_name: str = ""):
    """Return the best microphone device dict (sounddevice)."""
    mics = get_all_mics()
    if not mics:
        return None
    if preferred_name:
        for m in mics:
            if preferred_name.lower() in m["name"].lower():
                return m
    # Prefer headset mic
    for m in mics:
        name_lc = m["name"].lower()
        if "headset" in name_lc or "headphone" in name_lc:
            return m
    return mics[0]


def list_devices() -> None:
    print("\nAvailable audio devices:\n")
    try:
        default_spk = sc.default_speaker().name
    except Exception:
        default_spk = ""
    print("  Loopback (system audio capture):")
    for lb in get_all_loopbacks():
        tag = "  <-- default speaker (recommended)" if lb.name == default_spk else ""
        print(f"    [loopback]  {lb.name}{tag}")
    print()
    print("  Microphones (via PortAudio):")
    for m in get_all_mics():
        print(f"    [mic] [{m['index']}]  {m['name']}")
    print()


# ---------------------------------------------
#  Recording
# ---------------------------------------------

_stop_event = threading.Event()


def _show_timer() -> None:
    start = time.time()
    while not _stop_event.is_set():
        elapsed = int(time.time() - start)
        h, m, s = elapsed // 3600, (elapsed % 3600) // 60, elapsed % 60
        print(f"\r  [REC] {h:02d}:{m:02d}:{s:02d}  (press Ctrl+C to stop)", end="", flush=True)
        time.sleep(1)
    print()


def _record_loopback(device, sample_rate: int, chunk_frames: int,
                     buf: list, stop: threading.Event) -> None:
    """Record from a soundcard WASAPI loopback device."""
    try:
        with device.recorder(samplerate=sample_rate, channels=1, blocksize=chunk_frames) as rec:
            while not stop.is_set():
                data = rec.record(numframes=chunk_frames)
                buf.append(data.copy())
    except Exception as e:
        print(f"\n  [warn] loopback recorder error ({device.name}): {e}")


def _record_mic_sd(device_info: dict, sample_rate: int, chunk_frames: int,
                   buf: list, stop: threading.Event) -> None:
    """Record from a microphone via sounddevice (PortAudio) — handles headset formats."""
    device_index = device_info["index"]
    try:
        # blocksize=0 lets PortAudio choose its own buffer — read() then blocks correctly
        with sd.InputStream(device=device_index, samplerate=sample_rate,
                            channels=1, dtype="float32") as stream:
            while not stop.is_set():
                data, _ = stream.read(chunk_frames)
                buf.append(data.copy())
    except Exception as e:
        print(f"\n  [warn] mic recorder error ({device_info['name']}): {e}")


def record_audio(
    wav_path: Path,
    capture_cfg: dict,
    loopback_device,
    mic_device,
) -> float:
    """
    Record system audio (soundcard loopback) and/or mic (sounddevice),
    mix them, save as 16-bit mono WAV.
    Returns actual recorded duration in seconds.
    """
    sample_rate  = int(capture_cfg.get("sample_rate", 16000))
    system_vol   = float(capture_cfg.get("system_volume", 1.0))
    mic_vol      = float(capture_cfg.get("mic_volume", 1.0))
    chunk_frames = sample_rate // 4   # 250ms chunks

    use_system = capture_cfg.get("system_audio", True) and loopback_device is not None
    use_mic    = capture_cfg.get("microphone", True)   and mic_device is not None

    sys_buf: list[np.ndarray] = []
    mic_buf: list[np.ndarray] = []
    # Use the module-level _stop_event so the GUI can stop via cap_module._stop_event.set()
    _stop_event.clear()
    threads = []

    if use_system:
        t = threading.Thread(
            target=_record_loopback,
            args=(loopback_device, sample_rate, chunk_frames, sys_buf, _stop_event),
            daemon=True,
        )
        t.start()
        threads.append(t)

    if use_mic:
        t = threading.Thread(
            target=_record_mic_sd,
            args=(mic_device, sample_rate, chunk_frames, mic_buf, _stop_event),
            daemon=True,
        )
        t.start()
        threads.append(t)

    timer = threading.Thread(target=_show_timer, daemon=True)
    timer.start()

    try:
        while not _stop_event.is_set():
            time.sleep(0.1)
    except KeyboardInterrupt:
        _stop_event.set()

    for t in threads:
        t.join(timeout=2)
    _stop_event.set()   # ensure timer exits too
    timer.join()

    # Assemble buffers
    sys_audio = np.concatenate(sys_buf, axis=0).flatten() if sys_buf else None
    mic_audio = np.concatenate(mic_buf, axis=0).flatten() if mic_buf else None

    print(f"  [capture] loopback frames : {len(sys_audio) if sys_audio is not None else 0}")
    print(f"  [capture] mic frames      : {len(mic_audio) if mic_audio is not None else 0}")

    def _normalise(audio: np.ndarray) -> np.ndarray:
        peak = np.abs(audio).max()
        return audio / peak if peak > 0 else audio

    if sys_audio is not None and mic_audio is not None:
        sys_norm = _normalise(sys_audio)
        mic_norm = _normalise(mic_audio)
        max_len  = max(len(sys_norm), len(mic_norm))
        sys_norm = np.pad(sys_norm, (0, max_len - len(sys_norm)))
        mic_norm = np.pad(mic_norm, (0, max_len - len(mic_norm)))
        mixed = sys_norm * system_vol + mic_norm * mic_vol
    elif sys_audio is not None:
        mixed = _normalise(sys_audio) * system_vol
    elif mic_audio is not None:
        mixed = _normalise(mic_audio) * mic_vol
    else:
        # Nothing recorded — write silence so downstream doesn't crash
        mixed = np.zeros(sample_rate, dtype=np.float32)

    # Final normalise to 95% to avoid clipping
    peak = np.abs(mixed).max()
    if peak > 0:
        mixed = mixed / peak * 0.95
    pcm = (mixed * 32767).astype(np.int16)

    wav_path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(wav_path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm.tobytes())

    return len(pcm) / sample_rate


# ---------------------------------------------
#  CLI entry point
# ---------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Capture audio and transcribe.")
    parser.add_argument("--config", default="config.yaml")
    parser.add_argument("--list-devices", action="store_true")
    args = parser.parse_args()

    check_dependencies()

    if args.list_devices:
        list_devices()
        return

    config_path = Path(args.config).resolve()
    cfg         = load_config(config_path)
    capture_cfg = cfg.get("capture", {})
    base_dir    = config_path.parent
    output_dir  = base_dir / cfg["dirs"]["output"]
    output_dir.mkdir(parents=True, exist_ok=True)

    loopback = get_loopback_device() if capture_cfg.get("system_audio", True) else None
    mic      = get_mic_device()      if capture_cfg.get("microphone", True)    else None

    print(f"\n{'='*55}")
    print(f"  Live Capture")
    print(f"{'='*55}")
    print(f"  System audio : {'OK  ' + loopback.name if loopback else 'NOT FOUND'}")
    mic_name = mic['name'] if mic else 'NOT FOUND'
    print(f"  Microphone   : {'OK  ' + mic_name if mic else 'NOT FOUND'}")
    print(f"  Model        : {cfg['whisper_model']}")
    print(f"  Language     : {cfg['language']}")
    print(f"{'='*55}\n")

    if not loopback and not mic:
        sys.exit("Error: no audio devices found. Run --list-devices to debug.")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    prefix    = capture_cfg.get("output_prefix", "capture")
    wav_path  = base_dir / cfg["dirs"]["audio"] / f"{prefix}_{timestamp}.wav"
    wav_path.parent.mkdir(parents=True, exist_ok=True)

    print("  Press ENTER when ready, then play your video.")
    print("  Press Ctrl+C when done to stop and transcribe.\n")
    input("  -> Press ENTER to start recording...")
    print()

    captured_duration = record_audio(wav_path, capture_cfg, loopback, mic)

    if not wav_path.exists() or wav_path.stat().st_size < 1024:
        sys.exit("\nError: recording file is empty -- nothing was captured.")

    print(f"\n  Recording saved: {wav_path.name}  ({captured_duration:.0f}s captured)")

    print(f"\n{'='*55}")
    print("  Transcribing captured audio...")
    print(f"{'='*55}\n")

    from splitter import get_duration, split
    from transcriber import transcribe_all

    chunk_dur   = cfg["chunk_duration_seconds"]
    model_name  = cfg["whisper_model"]
    language    = cfg["language"]
    max_workers = cfg.get("max_transcription_workers", 4)
    keep        = cfg["keep_intermediate_files"]
    chunk_dir   = base_dir / cfg["dirs"]["chunks"] / wav_path.stem

    t_start         = time.time()
    actual_duration = get_duration(wav_path)
    chunk_paths     = [wav_path] if actual_duration <= chunk_dur else split(wav_path, chunk_dir, chunk_dur)

    parts      = transcribe_all(chunk_paths, model_name, language, max_workers, chunk_dur)
    transcript = "\n\n".join(p for p in parts if p.strip())

    out_file = output_dir / f"{prefix}_{timestamp}_transcript.txt"
    out_file.write_text(transcript, encoding="utf-8")

    if not keep:
        if chunk_dir.exists():
            import shutil
            shutil.rmtree(chunk_dir)
        wav_path.unlink(missing_ok=True)

    elapsed = time.time() - t_start
    speed   = actual_duration / elapsed if elapsed > 0 else 0

    print(f"\n{'='*55}")
    print(f"  Captured length  : {int(actual_duration // 60)}m {int(actual_duration % 60)}s")
    print(f"  Processing time  : {int(elapsed // 60)}m {int(elapsed % 60)}s")
    print(f"  Speed            : {speed:.1f}x realtime")
    print(f"{'='*55}")

    if not transcript.strip():
        print("\n  WARNING: transcript is empty -- try a larger model in config.yaml.")
    else:
        print(f"\n  Done! Transcript saved to:\n  {out_file}\n")


if __name__ == "__main__":
    main()
