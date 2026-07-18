"""
Video Transcriber — GUI
Run with: python gui.py
"""

import queue
import shutil
import subprocess
import sys
import threading
import time
import traceback
from datetime import datetime
from pathlib import Path

import customtkinter as ctk
import yaml
from tkinter import filedialog, messagebox

from splitter import get_duration, split
from extractor import extract_all
from transcriber import transcribe_all
from batch import discover_files, write_report, FileResult
import capture as cap_module

ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")

CONFIG_PATH = Path(__file__).parent / "config.yaml"


# ─── helpers ────────────────────────────────────────────────────────────────

def load_cfg() -> dict:
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)

def save_cfg(cfg: dict) -> None:
    with open(CONFIG_PATH, "w") as f:
        yaml.dump(cfg, f, default_flow_style=False, allow_unicode=True)

def fmt(seconds: float) -> str:
    s = int(seconds)
    return f"{s//3600:02d}:{(s%3600)//60:02d}:{s%60:02d}"

def cleanup(dirs: list[Path]) -> None:
    for d in dirs:
        if d.exists():
            shutil.rmtree(d)

def out_dir() -> Path:
    return Path(CONFIG_PATH.parent) / load_cfg()["dirs"]["output"]


# ─── App ────────────────────────────────────────────────────────────────────

class App(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("Video Transcriber")
        self.geometry("860x720")
        self.minsize(780, 600)
        self.resizable(True, True)

        self._log_queue: queue.Queue = queue.Queue()
        self._cancel_event    = threading.Event()
        self._worker_thread: threading.Thread | None = None
        self._scan_btn: ctk.CTkButton | None = None    # initialised in capture tab
        self._recording_active = False                  # True only during recording phase

        self.grid_rowconfigure(0, weight=1)
        self.grid_columnconfigure(0, weight=1)

        # Outer scrollable frame
        self._scroll = ctk.CTkScrollableFrame(self, label_text="")
        self._scroll.grid(row=0, column=0, sticky="nsew", padx=0, pady=0)
        self._scroll.grid_columnconfigure(0, weight=1)

        self._build_ui()
        self._load_config_into_ui()
        self._poll_log_queue()
        # Update button visibility whenever the tab changes
        self._tab.configure(command=self._on_tab_change)

    # ─── UI ─────────────────────────────────────────────────────────────────

    def _build_ui(self):
        s = self._scroll

        # Title
        ctk.CTkLabel(s, text="Video Transcriber",
                     font=ctk.CTkFont(size=20, weight="bold")
                     ).grid(row=0, column=0, padx=16, pady=(12, 6), sticky="w")

        # Tabs
        self._tab = ctk.CTkTabview(s, height=250)
        self._tab.grid(row=1, column=0, padx=16, pady=(0, 6), sticky="ew")
        for name in ("  File  ", "  Folder  ", "  Live Capture  "):
            self._tab.add(name)
        self._tab.set("  File  ")
        self._build_file_tab()
        self._build_folder_tab()
        self._build_capture_tab()

        # Config strip
        self._build_config_strip()

        # Action bar
        self._build_action_bar()

        # Progress
        self._build_progress()

        # Log
        self._build_log()

    # ─── File tab ───────────────────────────────────────────────────────────

    def _build_file_tab(self):
        t = self._tab.tab("  File  ")
        t.grid_columnconfigure(1, weight=1)

        ctk.CTkLabel(t, text="Input file:").grid(row=0, column=0, padx=10, pady=8, sticky="w")
        self._file_entry = ctk.CTkEntry(t, placeholder_text="Select a video or audio file…")
        self._file_entry.grid(row=0, column=1, padx=(0,6), pady=8, sticky="ew")
        ctk.CTkButton(t, text="Browse", width=76,
                      command=self._browse_file).grid(row=0, column=2, padx=(0,10))

        ctk.CTkLabel(t, text="Output folder:").grid(row=1, column=0, padx=10, pady=8, sticky="w")
        self._file_out_entry = ctk.CTkEntry(t, placeholder_text="Default: output/")
        self._file_out_entry.grid(row=1, column=1, padx=(0,6), pady=8, sticky="ew")
        ctk.CTkButton(t, text="Browse", width=76,
                      command=lambda: self._browse_dir(self._file_out_entry)
                      ).grid(row=1, column=2, padx=(0,10))

    # ─── Folder tab ─────────────────────────────────────────────────────────

    def _build_folder_tab(self):
        t = self._tab.tab("  Folder  ")
        t.grid_columnconfigure(1, weight=1)

        ctk.CTkLabel(t, text="Input folder:").grid(row=0, column=0, padx=10, pady=8, sticky="w")
        self._folder_entry = ctk.CTkEntry(t, placeholder_text="Select folder to scan recursively…")
        self._folder_entry.grid(row=0, column=1, padx=(0,6), pady=8, sticky="ew")
        ctk.CTkButton(t, text="Browse", width=76,
                      command=lambda: self._browse_dir(self._folder_entry)
                      ).grid(row=0, column=2, padx=(0,10))

        ctk.CTkLabel(t, text="Output folder:").grid(row=1, column=0, padx=10, pady=8, sticky="w")
        self._folder_out_entry = ctk.CTkEntry(t, placeholder_text="Default: output/")
        self._folder_out_entry.grid(row=1, column=1, padx=(0,6), pady=8, sticky="ew")
        ctk.CTkButton(t, text="Browse", width=76,
                      command=lambda: self._browse_dir(self._folder_out_entry)
                      ).grid(row=1, column=2, padx=(0,10))

        ctk.CTkLabel(t, text="Files found:").grid(row=2, column=0, padx=10, pady=8, sticky="w")
        self._files_found_label = ctk.CTkLabel(t, text="— (click START to scan)", anchor="w")
        self._files_found_label.grid(row=2, column=1, columnspan=2, sticky="w", padx=(0,6))

    # ─── Capture tab ────────────────────────────────────────────────────────

    def _build_capture_tab(self):
        t = self._tab.tab("  Live Capture  ")
        t.grid_columnconfigure(1, weight=1)

        # Toggles row
        self._sys_audio_var = ctk.BooleanVar(value=True)
        self._mic_var       = ctk.BooleanVar(value=True)
        ctk.CTkLabel(t, text="System audio:").grid(row=0, column=0, padx=10, pady=6, sticky="w")
        ctk.CTkSwitch(t, text="Capture speakers / headphones",
                      variable=self._sys_audio_var).grid(row=0, column=1, padx=6, pady=6, sticky="w")

        ctk.CTkLabel(t, text="Microphone:").grid(row=1, column=0, padx=10, pady=6, sticky="w")
        ctk.CTkSwitch(t, text="Capture mic input",
                      variable=self._mic_var).grid(row=1, column=1, padx=6, pady=6, sticky="w")

        # Volume sliders — compact row
        vol_frame = ctk.CTkFrame(t, fg_color="transparent")
        vol_frame.grid(row=2, column=0, columnspan=3, padx=10, pady=4, sticky="ew")
        vol_frame.grid_columnconfigure((1, 4), weight=1)

        ctk.CTkLabel(vol_frame, text="Speaker vol:").grid(row=0, column=0, padx=(0,4))
        self._sys_vol_slider = ctk.CTkSlider(vol_frame, from_=0.0, to=2.0, number_of_steps=20)
        self._sys_vol_slider.set(1.0)
        self._sys_vol_slider.grid(row=0, column=1, sticky="ew", padx=(0,4))
        self._sys_vol_label = ctk.CTkLabel(vol_frame, text="1.0", width=30)
        self._sys_vol_label.grid(row=0, column=2, padx=(0,16))
        self._sys_vol_slider.configure(command=lambda v: self._sys_vol_label.configure(text=f"{v:.1f}"))

        ctk.CTkLabel(vol_frame, text="Mic vol:").grid(row=0, column=3, padx=(0,4))
        self._mic_vol_slider = ctk.CTkSlider(vol_frame, from_=0.0, to=2.0, number_of_steps=20)
        self._mic_vol_slider.set(1.0)
        self._mic_vol_slider.grid(row=0, column=4, sticky="ew", padx=(0,4))
        self._mic_vol_label = ctk.CTkLabel(vol_frame, text="1.0", width=30)
        self._mic_vol_label.grid(row=0, column=5)
        self._mic_vol_slider.configure(command=lambda v: self._mic_vol_label.configure(text=f"{v:.1f}"))

        # Device selection row
        dev_frame = ctk.CTkFrame(t, fg_color="transparent")
        dev_frame.grid(row=3, column=0, columnspan=3, padx=10, pady=4, sticky="ew")
        dev_frame.grid_columnconfigure((1, 4), weight=1)

        ctk.CTkLabel(dev_frame, text="Speaker/Loopback:").grid(row=0, column=0, padx=(0,6))
        self._loopback_var = ctk.StringVar(value="-- click Scan --")
        self._loopback_menu = ctk.CTkOptionMenu(dev_frame, variable=self._loopback_var,
                                                values=["-- click Scan --"], width=220)
        self._loopback_menu.grid(row=0, column=1, padx=(0,14), sticky="ew")

        ctk.CTkLabel(dev_frame, text="Microphone:").grid(row=0, column=3, padx=(0,6))
        self._mic_select_var = ctk.StringVar(value="-- click Scan --")
        self._mic_menu = ctk.CTkOptionMenu(dev_frame, variable=self._mic_select_var,
                                           values=["-- click Scan --"], width=220)
        self._mic_menu.grid(row=0, column=4, padx=(0,14), sticky="ew")

        self._scan_btn = ctk.CTkButton(dev_frame, text="Scan Devices", width=110,
                                       command=self._scan_devices)
        self._scan_btn.grid(row=0, column=5)

        # Capture status
        self._capture_status_label = ctk.CTkLabel(
            t, text="Idle", anchor="w",
            font=ctk.CTkFont(weight="bold"), text_color="gray60")
        self._capture_status_label.grid(row=4, column=0, columnspan=3, padx=10, pady=(4,6), sticky="w")

    # ─── Config strip ────────────────────────────────────────────────────────

    def _build_config_strip(self):
        f = ctk.CTkFrame(self._scroll)
        f.grid(row=2, column=0, padx=16, pady=(0,6), sticky="ew")
        labels = ["Model:", "Language:", "Chunk (s):", "Workers:"]
        for i, lbl in enumerate(labels):
            ctk.CTkLabel(f, text=lbl).grid(row=0, column=i*2, padx=(12,4), pady=8)

        self._model_var = ctk.StringVar(value="base")
        ctk.CTkOptionMenu(f, variable=self._model_var,
                          values=["tiny","base","small","medium","large"],
                          width=90).grid(row=0, column=1, padx=(0,14))

        self._lang_entry = ctk.CTkEntry(f, width=65, placeholder_text="auto")
        self._lang_entry.grid(row=0, column=3, padx=(0,14))

        self._chunk_entry = ctk.CTkEntry(f, width=65, placeholder_text="300")
        self._chunk_entry.grid(row=0, column=5, padx=(0,14))

        self._workers_entry = ctk.CTkEntry(f, width=55, placeholder_text="4")
        self._workers_entry.grid(row=0, column=7, padx=(0,12))

    # ─── Action bar ─────────────────────────────────────────────────────────

    def _build_action_bar(self):
        f = ctk.CTkFrame(self._scroll, fg_color="transparent")
        f.grid(row=3, column=0, padx=16, pady=(0,4), sticky="ew")

        self._start_btn = ctk.CTkButton(
            f, text="START", width=110, height=36,
            font=ctk.CTkFont(size=14, weight="bold"),
            fg_color="#1f6aa5", hover_color="#144f7a",
            command=self._on_start)
        self._start_btn.grid(row=0, column=0, padx=(0,8))

        self._stop_rec_btn = ctk.CTkButton(
            f, text="STOP RECORDING", width=150, height=36,
            font=ctk.CTkFont(weight="bold"),
            fg_color="#b05000", hover_color="#7a3500",
            state="disabled", command=self._on_stop_recording)
        # Hidden initially — only shown when Live Capture tab is active
        self._stop_rec_btn.grid(row=0, column=1, padx=(0,8))
        self._stop_rec_btn.grid_remove()

        self._cancel_btn = ctk.CTkButton(
            f, text="CANCEL", width=90, height=36,
            fg_color="#8b0000", hover_color="#5a0000",
            state="disabled", command=self._on_cancel)
        self._cancel_btn.grid(row=0, column=2, padx=(0,20))

        ctk.CTkButton(f, text="Open Output Folder", width=150, height=36,
                      command=self._open_output).grid(row=0, column=3, padx=(0,8))

        # Output path
        cfg = load_cfg()
        out = str(Path(CONFIG_PATH.parent) / cfg["dirs"]["output"])
        self._outpath_label = ctk.CTkLabel(
            f, text=f"Output: {out}", text_color="gray55", anchor="w")
        self._outpath_label.grid(row=1, column=0, columnspan=5, pady=(4,0), sticky="w")

    # ─── Progress ───────────────────────────────────────────────────────────

    def _build_progress(self):
        f = ctk.CTkFrame(self._scroll)
        f.grid(row=4, column=0, padx=16, pady=(0,6), sticky="ew")
        f.grid_columnconfigure(1, weight=1)

        ctk.CTkLabel(f, text="Progress", font=ctk.CTkFont(weight="bold")
                     ).grid(row=0, column=0, columnspan=3, padx=12, pady=(8,2), sticky="w")

        self._progress_bar = ctk.CTkProgressBar(f, height=16)
        self._progress_bar.set(0)
        self._progress_bar.grid(row=1, column=0, columnspan=3, padx=12, pady=(0,4), sticky="ew")

        self._status_label = ctk.CTkLabel(f, text="Ready", anchor="w")
        self._status_label.grid(row=2, column=0, columnspan=2, padx=12, pady=(0,2), sticky="w")

        self._eta_label = ctk.CTkLabel(f, text="", anchor="e")
        self._eta_label.grid(row=2, column=2, padx=12, pady=(0,2), sticky="e")

        self._stats_label = ctk.CTkLabel(f, text="", anchor="w", text_color="gray65")
        self._stats_label.grid(row=3, column=0, columnspan=3, padx=12, pady=(0,8), sticky="w")

    # ─── Log ────────────────────────────────────────────────────────────────

    def _build_log(self):
        f = ctk.CTkFrame(self._scroll)
        f.grid(row=5, column=0, padx=16, pady=(0,16), sticky="ew")
        f.grid_columnconfigure(0, weight=1)

        hdr = ctk.CTkFrame(f, fg_color="transparent")
        hdr.grid(row=0, column=0, sticky="ew", padx=8, pady=(6,0))
        hdr.grid_columnconfigure(0, weight=1)
        ctk.CTkLabel(hdr, text="Log", font=ctk.CTkFont(weight="bold")
                     ).grid(row=0, column=0, sticky="w")
        ctk.CTkButton(hdr, text="Clear", width=56, height=24,
                      command=self._clear_log).grid(row=0, column=1)

        self._log_box = ctk.CTkTextbox(
            f, height=180,
            font=ctk.CTkFont(family="Courier New", size=11),
            state="disabled", wrap="word")
        self._log_box.grid(row=1, column=0, padx=8, pady=(4,8), sticky="ew")

    # ─── Config ─────────────────────────────────────────────────────────────

    def _load_config_into_ui(self):
        cfg = load_cfg()
        self._model_var.set(cfg.get("whisper_model", "base"))
        self._lang_entry.delete(0, "end"); self._lang_entry.insert(0, cfg.get("language", "auto"))
        self._chunk_entry.delete(0, "end"); self._chunk_entry.insert(0, str(cfg.get("chunk_duration_seconds", 300)))
        self._workers_entry.delete(0, "end"); self._workers_entry.insert(0, str(cfg.get("max_transcription_workers", 4)))
        cap = cfg.get("capture", {})
        self._sys_audio_var.set(cap.get("system_audio", True))
        self._mic_var.set(cap.get("microphone", True))
        self._sys_vol_slider.set(cap.get("system_volume", 1.0))
        self._mic_vol_slider.set(cap.get("mic_volume", 1.0))

    def _collect_config(self) -> dict:
        cfg = load_cfg()
        cfg["whisper_model"]             = self._model_var.get()
        cfg["language"]                  = self._lang_entry.get().strip() or "auto"
        cfg["chunk_duration_seconds"]    = int(self._chunk_entry.get().strip() or 300)
        cfg["max_transcription_workers"] = int(self._workers_entry.get().strip() or 4)
        cfg.setdefault("capture", {})
        cfg["capture"]["system_audio"]   = self._sys_audio_var.get()
        cfg["capture"]["microphone"]     = self._mic_var.get()
        cfg["capture"]["system_volume"]  = round(self._sys_vol_slider.get(), 2)
        cfg["capture"]["mic_volume"]     = round(self._mic_vol_slider.get(), 2)
        save_cfg(cfg)
        return cfg

    # ─── Browse ─────────────────────────────────────────────────────────────

    # tkinter filedialog hangs on Windows inside CTkScrollableFrame.
    # Workaround: call the native Windows dialog via PowerShell in a background thread,
    # then post the result back to the main thread with after().

    def _browse_file(self):
        threading.Thread(target=self._ps_pick_file, daemon=True).start()

    def _browse_dir(self, entry: ctk.CTkEntry):
        threading.Thread(target=self._ps_pick_dir, args=(entry,), daemon=True).start()

    def _ps_pick_file(self):
        # Use IFileOpenDialog (modern Explorer picker) — cleaner look, no legacy filename strip
        cmd = (
            "Add-Type -AssemblyName System.Windows.Forms; "
            "$d = New-Object System.Windows.Forms.OpenFileDialog; "
            "$d.Title = 'Select video or audio file'; "
            "$d.Filter = 'Media files|*.mp4;*.mkv;*.avi;*.mov;*.wmv;*.flv;*.webm;"
            "*.m4v;*.mpeg;*.mpg;*.mp3;*.wav;*.aac;*.flac;*.ogg;*.m4a;*.wma|All files|*.*'; "
            "$d.AutoUpgradeEnabled = $true; "
            "$d.DereferenceLinks = $true; "
            "$null = $d.ShowDialog(); "
            "Write-Output $d.FileName"
        )
        try:
            result = subprocess.run(
                ["powershell", "-NoProfile", "-NonInteractive", "-Command", cmd],
                capture_output=True, text=True, timeout=120
            )
            path = result.stdout.strip()
            print(f"[browse] file selected: {repr(path)}")
            if path:
                self.after(0, lambda: (
                    self._file_entry.delete(0, "end"),
                    self._file_entry.insert(0, path)
                ))
        except Exception as e:
            print(f"[browse] file dialog error: {e}")
            self.after(0, lambda: self._log(f"Browse error: {e}"))

    def _ps_pick_dir(self, entry: ctk.CTkEntry):
        cmd = (
            "Add-Type -AssemblyName System.Windows.Forms; "
            "$d = New-Object System.Windows.Forms.FolderBrowserDialog; "
            "$d.Description = 'Select folder'; "
            "$d.UseDescriptionForTitle = $true; "
            "$null = $d.ShowDialog(); "
            "Write-Output $d.SelectedPath"
        )
        try:
            result = subprocess.run(
                ["powershell", "-NoProfile", "-NonInteractive", "-Command", cmd],
                capture_output=True, text=True, timeout=120
            )
            path = result.stdout.strip()
            print(f"[browse] folder selected: {repr(path)}")
            if path:
                self.after(0, lambda: (
                    entry.delete(0, "end"),
                    entry.insert(0, path)
                ))
        except Exception as e:
            print(f"[browse] folder dialog error: {e}")
            self.after(0, lambda: self._log(f"Browse error: {e}"))

    def _scan_folder(self):
        folder = self._folder_entry.get().strip()
        if not folder or not Path(folder).is_dir():
            messagebox.showwarning("No folder", "Please select a valid folder first.")
            return
        files = discover_files(Path(folder), load_cfg()["supported_extensions"])
        self._files_found_label.configure(
            text=f"{len(files)} media file(s) found" if files else "No supported files found")

    def _scan_devices(self):
        if self._scan_btn:
            self._scan_btn.configure(state="disabled", text="Scanning…")
        self.after(50, self._do_scan_devices)

    def _do_scan_devices(self):
        loopbacks = cap_module.get_all_loopbacks()
        mics      = cap_module.get_all_mics()

        # Populate loopback dropdown
        lb_names = [d.name for d in loopbacks] if loopbacks else ["None found"]
        self._loopback_menu.configure(values=lb_names)
        best_lb = cap_module.get_loopback_device()
        self._loopback_var.set(best_lb.name if best_lb else lb_names[0])

        # Populate mic dropdown (sounddevice returns dicts, not objects)
        mic_names = [d["name"] for d in mics] if mics else ["None found"]
        self._mic_menu.configure(values=mic_names)
        best_mic = cap_module.get_mic_device()
        self._mic_select_var.set(best_mic["name"] if best_mic else mic_names[0])

        self._set_capture_status(
            f"Found {len(loopbacks)} loopback, {len(mics)} mic device(s)",
            "lightgreen" if (loopbacks or mics) else "red")
        if self._scan_btn:
            self._scan_btn.configure(state="normal", text="Scan Devices")

    # ─── Logging ─────────────────────────────────────────────────────────────

    def _log(self, msg: str, color: str = "white"):
        ts = datetime.now().strftime("%H:%M:%S")
        self._log_queue.put(f"[{ts}]  {msg}\n")

    def _poll_log_queue(self):
        try:
            while True:
                msg = self._log_queue.get_nowait()
                self._log_box.configure(state="normal")
                self._log_box.insert("end", msg)
                self._log_box.see("end")
                self._log_box.configure(state="disabled")
        except queue.Empty:
            pass
        self.after(100, self._poll_log_queue)

    def _clear_log(self):
        self._log_box.configure(state="normal")
        self._log_box.delete("1.0", "end")
        self._log_box.configure(state="disabled")

    # ─── Progress helpers ────────────────────────────────────────────────────

    def _set_progress(self, value: float, status: str = "", eta: str = "", stats: str = ""):
        self._progress_bar.set(min(max(value, 0), 1))
        if status: self._status_label.configure(text=status)
        if eta:    self._eta_label.configure(text=eta)
        if stats:  self._stats_label.configure(text=stats)

    def _set_capture_status(self, text: str, color: str = "gray60"):
        self._capture_status_label.configure(text=text, text_color=color)

    def _set_busy(self, busy: bool):
        self._start_btn.configure(state="disabled" if busy else "normal")
        self._cancel_btn.configure(state="normal" if busy else "disabled")
        self._stop_rec_btn.configure(state="disabled")  # managed separately during recording
        if self._scan_btn:
            self._scan_btn.configure(state="disabled" if busy else "normal")
        if not busy:
            self._recording_active = False
            self._set_capture_status("Idle — press START to begin", "gray60")

    # ─── Actions ────────────────────────────────────────────────────────────

    def _on_tab_change(self):
        mode = self._tab.get().strip()
        if mode == "Live Capture":
            self._stop_rec_btn.grid()      # show
        else:
            self._stop_rec_btn.grid_remove()  # hide

    def _on_start(self):
        mode = self._tab.get().strip()
        cfg  = self._collect_config()
        self._cancel_event.clear()
        self._set_busy(True)
        self._set_progress(0, "Starting…", "", "")
        self._clear_log()

        target = {"File": self._run_file,
                  "Folder": self._run_folder,
                  "Live Capture": self._run_capture}.get(mode)
        if target:
            self._worker_thread = threading.Thread(target=target, args=(cfg,), daemon=True)
            self._worker_thread.start()

    def _on_stop_recording(self):
        self._recording_active = False          # breaks the timer loop in _run_capture
        cap_module._stop_event.set()
        self._stop_rec_btn.configure(state="disabled")
        self._cancel_btn.configure(state="normal")
        self._set_progress(0.12, "Stopping recording…", "", "Finalising audio, please wait…")
        self._set_capture_status("Stopping… please wait", "orange")
        self._log("Stop recording requested — waiting for audio to finalise…")

    def _on_cancel(self):
        self._cancel_event.set()
        cap_module._stop_event.set()
        self._log("Cancelling…")
        self._status_label.configure(text="Cancelling…")

    def _on_done(self, success: bool, message: str = ""):
        self._set_busy(False)
        if success:
            self._set_progress(1.0, "Done!", "", message)
            self._log(f"Done: {message}")
        else:
            self._set_progress(self._progress_bar.get(), "Stopped", "", "")
            self._log(f"Stopped: {message}")

    def _open_output(self):
        d = out_dir()
        d.mkdir(parents=True, exist_ok=True)
        subprocess.Popen(f'explorer "{d}"')

    # ─── Worker: file ────────────────────────────────────────────────────────

    def _run_file(self, cfg: dict):
        try:
            input_path = Path(self._file_entry.get().strip())
            if not input_path.exists():
                self._log("Error: file not found.")
                self._on_done(False, "File not found"); return

            base_dir   = Path(CONFIG_PATH.parent)
            out_str    = self._file_out_entry.get().strip()
            output_dir = Path(out_str) if out_str else base_dir / cfg["dirs"]["output"]
            output_dir.mkdir(parents=True, exist_ok=True)
            chunk_dir  = base_dir / cfg["dirs"]["chunks"] / input_path.stem
            audio_dir  = base_dir / cfg["dirs"]["audio"]  / input_path.stem
            chunk_dur  = cfg["chunk_duration_seconds"]
            model      = cfg["whisper_model"]
            language   = cfg["language"]
            workers    = cfg["max_transcription_workers"]
            keep       = cfg["keep_intermediate_files"]

            self._log(f"Input: {input_path.name}  Model: {model}  Workers: {workers}")
            t_start = time.time()

            self._set_progress(0.05, "Step 1/3 — Splitting…")
            self._log("Step 1/3 — Splitting into chunks…")
            duration    = get_duration(input_path)
            chunk_paths = [input_path] if duration <= chunk_dur else split(input_path, chunk_dir, chunk_dur)
            self._log(f"  {len(chunk_paths)} chunk(s)")

            if self._cancel_event.is_set():
                self._on_done(False, "Cancelled"); return

            self._set_progress(0.2, "Step 2/3 — Extracting audio…")
            self._log("Step 2/3 — Extracting audio…")
            audio_paths = extract_all(chunk_paths, audio_dir)
            self._log(f"  {len(audio_paths)} audio file(s)")

            if self._cancel_event.is_set():
                self._on_done(False, "Cancelled"); return

            self._set_progress(0.3, "Step 3/3 — Transcribing…")
            self._log("Step 3/3 — Transcribing…")

            total       = len(audio_paths)
            results_map = {}
            completed   = [0]
            chunk_start = time.time()

            import transcriber as tr
            tr._load_model(model)

            from concurrent.futures import ThreadPoolExecutor, as_completed

            def _worker(idx, path):
                text = tr.transcribe_file(path, model, language, time_offset=idx * chunk_dur)
                return idx, text

            with ThreadPoolExecutor(max_workers=workers) as ex:
                futures = {ex.submit(_worker, i, p): i for i, p in enumerate(audio_paths)}
                for future in as_completed(futures):
                    if self._cancel_event.is_set(): break
                    idx, text = future.result()
                    results_map[idx] = text
                    completed[0] += 1
                    done    = completed[0]
                    elapsed = time.time() - chunk_start
                    avg     = elapsed / done
                    eta     = (total - done) * avg
                    self._set_progress(
                        0.3 + 0.65 * (done / total),
                        f"Transcribing chunk {done}/{total}…",
                        f"ETA: {fmt(eta)}",
                        f"Elapsed: {fmt(elapsed)}  Speed: {done * chunk_dur / elapsed:.1f}x")
                    self._log(f"  Chunk {done}/{total}: {audio_paths[idx].name}")

            if self._cancel_event.is_set():
                self._on_done(False, "Cancelled"); return

            parts      = [results_map.get(i, "") for i in range(total)]
            transcript = "\n\n".join(p for p in parts if p.strip())
            out_file   = output_dir / f"{input_path.stem}_transcript.txt"
            out_file.write_text(transcript, encoding="utf-8")
            if not keep: cleanup([chunk_dir, audio_dir])

            elapsed = time.time() - t_start
            speed   = duration / elapsed if elapsed > 0 else 0
            self._log(f"Video: {fmt(duration)}  Time: {fmt(elapsed)}  Speed: {speed:.1f}x")
            self._log(f"Saved: {out_file}")
            self._outpath_label.configure(text=f"Output: {out_file}")
            self._on_done(True, f"{fmt(duration)} transcribed in {fmt(elapsed)}")

        except Exception as e:
            self._log(f"ERROR: {e}")
            self._log(traceback.format_exc())
            self._on_done(False, str(e))

    # ─── Worker: folder ──────────────────────────────────────────────────────

    def _run_folder(self, cfg: dict):
        try:
            import logging
            from batch import _process_one

            input_root = Path(self._folder_entry.get().strip())
            if not input_root.is_dir():
                self._log("Error: folder not found.")
                self._on_done(False, "Folder not found"); return

            base_dir   = Path(CONFIG_PATH.parent)
            out_str    = self._folder_out_entry.get().strip()
            output_dir = Path(out_str) if out_str else base_dir / cfg["dirs"]["output"]
            output_dir.mkdir(parents=True, exist_ok=True)

            files = discover_files(input_root, cfg["supported_extensions"])
            total = len(files)
            if total == 0:
                self._log("No supported media files found.")
                self._on_done(False, "No files found"); return

            self._log(f"Found {total} file(s)")
            log_dir = base_dir / "logs"
            log_dir.mkdir(parents=True, exist_ok=True)
            logger = logging.getLogger("transcriber_gui")
            logger.setLevel(logging.DEBUG)
            if not logger.handlers:
                fh = logging.FileHandler(log_dir / "transcription.log", encoding="utf-8")
                fh.setFormatter(logging.Formatter("%(asctime)s %(levelname)-8s %(message)s"))
                logger.addHandler(fh)

            results     = []
            batch_start = time.time()

            for i, file in enumerate(files, 1):
                if self._cancel_event.is_set():
                    self._log("Cancelled."); break
                elapsed_total = time.time() - batch_start
                avg       = elapsed_total / i if i > 1 else 0
                remaining = (total - i) * avg
                self._set_progress(
                    (i - 1) / total,
                    f"File {i}/{total}: {file.name}",
                    f"ETA: {fmt(remaining)}" if i > 1 else "Calculating ETA…",
                    f"Elapsed: {fmt(elapsed_total)}  "
                    f"Success: {sum(1 for r in results if r.status=='success')}  "
                    f"Failed: {sum(1 for r in results if r.status=='failed')}")
                self._log(f"[{i}/{total}] {file.relative_to(input_root)}")
                result = _process_one(file, input_root, output_dir, base_dir, cfg, logger)
                results.append(result)
                color = "lightgreen" if result.status == "success" else "red" if result.status == "failed" else "orange"
                self._log(f"  -> {result.status.upper()} ({fmt(result.elapsed)})")
                if result.error: self._log(f"  Error: {result.error}")

            total_elapsed = time.time() - batch_start
            report_path   = write_report(results, output_dir, total_elapsed, logger)
            success = sum(1 for r in results if r.status == "success")
            failed  = sum(1 for r in results if r.status == "failed")
            self._log(f"Report: {report_path}")
            self._log(f"Total: {len(results)}  Success: {success}  Failed: {failed}  Time: {fmt(total_elapsed)}")
            self._outpath_label.configure(text=f"Output: {output_dir}")
            self._on_done(True, f"{success}/{total} files in {fmt(total_elapsed)}")

        except Exception as e:
            self._log(f"ERROR: {e}")
            self._log(traceback.format_exc())
            self._on_done(False, str(e))

    # ─── Worker: capture ────────────────────────────────────────────────────

    def _run_capture(self, cfg: dict):
        try:
            cap_cfg    = cfg.get("capture", {})
            base_dir   = Path(CONFIG_PATH.parent)
            output_dir = base_dir / cfg["dirs"]["output"]
            output_dir.mkdir(parents=True, exist_ok=True)

            selected_lb  = self._loopback_var.get()
            selected_mic = self._mic_select_var.get()
            loopback = cap_module.get_loopback_device(selected_lb)  if cap_cfg.get("system_audio", True) else None
            mic      = cap_module.get_mic_device(selected_mic)      if cap_cfg.get("microphone", True)    else None

            self._log(f"System audio: {'OK - ' + loopback.name if loopback else 'Not found (run Scan Devices first)'}")
            mic_name = mic["name"] if mic else None
            self._log(f"Microphone  : {'OK - ' + mic_name if mic_name else 'Not found'}")

            if not loopback and not mic:
                self._log("No audio devices found. Cannot capture.")
                self._on_done(False, "No audio devices"); return

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            prefix    = cap_cfg.get("output_prefix", "capture")
            wav_path  = base_dir / cfg["dirs"]["audio"] / f"{prefix}_{timestamp}.wav"
            wav_path.parent.mkdir(parents=True, exist_ok=True)

            self._log("Recording started. Click STOP RECORDING when done.")
            self._set_capture_status("Recording — play your video now", "#00aaff")
            self._set_progress(0.05, "Recording audio…", "", "Click STOP RECORDING when video ends")
            self._recording_active = True
            self._stop_rec_btn.configure(state="normal")
            self._cancel_btn.configure(state="disabled")
            cap_module._stop_event.clear()

            rec_result = [0.0]
            rec_error  = [None]
            rec_done   = threading.Event()

            def _do_record():
                try:
                    rec_result[0] = cap_module.record_audio(wav_path, cap_cfg, loopback, mic)
                except Exception as e:
                    rec_error[0] = e
                finally:
                    rec_done.set()

            threading.Thread(target=_do_record, daemon=True).start()

            rec_start = time.time()
            while not rec_done.is_set():
                if self._cancel_event.is_set():
                    cap_module._stop_event.set()
                    break
                # Only update timer while recording is still active (not after STOP clicked)
                if self._recording_active:
                    elapsed = time.time() - rec_start
                    self._set_progress(0.1, f"Recording…  {fmt(elapsed)}", "", "Click STOP RECORDING when video ends")
                    self._set_capture_status(f"Recording  {fmt(elapsed)} — play your video now", "#00aaff")
                time.sleep(0.2)

            rec_done.wait()          # wait for audio file to finish writing
            self._recording_active = False
            self._stop_rec_btn.configure(state="disabled")
            self._cancel_btn.configure(state="normal")
            self._cancel_event.clear()

            if rec_error[0]: raise rec_error[0]
            if not wav_path.exists() or wav_path.stat().st_size < 1024:
                self._log("Recording too short or empty.")
                self._set_capture_status("Nothing captured", "red")
                self._on_done(False, "Empty recording"); return

            rec_duration = rec_result[0]
            self._log(f"Captured {fmt(rec_duration)}")
            self._set_capture_status(f"Captured {fmt(rec_duration)} — transcribing…", "orange")
            self._set_progress(0.15, "Transcribing captured audio…", "", "Please wait…")

            chunk_dur = cfg["chunk_duration_seconds"]
            model     = cfg["whisper_model"]
            language  = cfg["language"]
            workers   = cfg["max_transcription_workers"]
            keep      = cfg["keep_intermediate_files"]
            chunk_dir = base_dir / cfg["dirs"]["chunks"] / wav_path.stem

            actual_dur  = get_duration(wav_path)
            chunk_paths = [wav_path] if actual_dur <= chunk_dur else split(wav_path, chunk_dir, chunk_dur)
            t_start     = time.time()
            parts       = transcribe_all(chunk_paths, model, language, workers, chunk_dur)
            transcript  = "\n\n".join(p for p in parts if p.strip())

            out_file = output_dir / f"{prefix}_{timestamp}_transcript.txt"
            out_file.write_text(transcript, encoding="utf-8")
            if not keep:
                cleanup([chunk_dir])
                wav_path.unlink(missing_ok=True)

            elapsed = time.time() - t_start
            speed   = actual_dur / elapsed if elapsed > 0 else 0
            self._log(f"Captured: {fmt(actual_dur)}  Time: {fmt(elapsed)}  Speed: {speed:.1f}x")
            self._log(f"Saved: {out_file}")
            self._set_capture_status(f"Done — {out_file.name}", "lightgreen")
            self._outpath_label.configure(text=f"Output: {out_file}")
            self._on_done(True, f"{fmt(actual_dur)} captured and transcribed")

        except Exception as e:
            self._log(f"ERROR: {e}")
            self._log(traceback.format_exc())
            self._on_done(False, str(e))


# ─── entry point ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    app = App()
    app.mainloop()
