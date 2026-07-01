// Camera-based barcode/QR scanner using the browser's native BarcodeDetector API.
// Deliberately does NOT vendor or load any external decoding library — after
// real trouble getting a hand-written QR *encoder* correct, decoding via a
// third-party JS library carries the same category of risk (subtle bugs that
// look fine until tested against a real camera feed). BarcodeDetector is
// built into the browser engine itself on supporting devices, so there is no
// decoding logic to get wrong on our side.
//
// Supported: Chrome/Edge on Android and desktop, recent Chrome-based browsers.
// NOT supported: Safari/iOS as of this writing, older browsers. We detect
// support and show a clear message rather than silently failing.

/**
 * Opens a fullscreen camera scanner overlay. Resolves with the decoded text
 * on a successful scan, or null if the user cancels.
 */
export async function openBarcodeScanner() {
  if (!("BarcodeDetector" in window)) {
    alert(
      "Camera scanning isn't supported in this browser yet (this feature needs the BarcodeDetector API, currently available in Chrome/Edge on Android and desktop, but not yet in Safari/iOS). You can still type the Patient ID manually."
    );
    return null;
  }

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed; top:0;right:0;bottom:0;left:0; background: rgba(0,0,0,0.92); z-index: 1000;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
    `;
    overlay.innerHTML = `
      <video id="scanner-video" autoplay playsinline muted style="width:90%;max-width:420px;border-radius:12px;background:#000;"></video>
      <p style="color:white;margin-top:1rem;font-size:0.9rem;">Point the camera at a patient's barcode/QR code</p>
      <button id="scanner-cancel" style="margin-top:0.5rem;padding:0.5rem 1.2rem;border-radius:8px;border:none;background:#C25450;color:white;font-weight:600;cursor:pointer;">Cancel</button>
      <p id="scanner-error" style="color:#F0A09D;font-size:0.85rem;margin-top:0.75rem;display:none;"></p>
    `;
    document.body.appendChild(overlay);

    const video = overlay.querySelector("#scanner-video");
    const errorEl = overlay.querySelector("#scanner-error");
    let stream = null;
    let stopped = false;
    let detectInterval = null;

    function cleanup(result) {
      if (stopped) return;
      stopped = true;
      if (detectInterval) clearInterval(detectInterval);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      overlay.remove();
      resolve(result);
    }

    overlay.querySelector("#scanner-cancel").onclick = () => cleanup(null);

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        stream = s;
        video.srcObject = s;
        const detector = new BarcodeDetector({ formats: ["qr_code", "code_128", "ean_13", "code_39"] });
        detectInterval = setInterval(async () => {
          if (stopped) return;
          try {
            const barcodes = await detector.detect(video);
            if (barcodes.length > 0) {
              cleanup(barcodes[0].rawValue);
            }
          } catch (err) {
            // Detection errors on individual frames are common/transient (e.g. video not ready yet) — ignore and keep trying.
          }
        }, 350);
      })
      .catch((err) => {
        console.error("Camera access failed:", err);
        errorEl.textContent = "Couldn't access the camera. Check that you've granted camera permission to this site, and that no other app is using it.";
        errorEl.style.display = "block";
      });
  });
}

/**
 * Attaches a small camera icon button next to a search input, wired to open
 * the scanner and fill the input with the decoded value, then trigger the
 * input's own 'input' event so existing search logic runs automatically.
 */
export function attachScanButton(inputEl, options = {}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.title = "Scan barcode with camera";
  btn.setAttribute("aria-label", "Scan barcode with camera");
  btn.style.cssText = `
    border: 1px solid var(--line); background: white; border-radius: 7px;
    width: 38px; height: 38px; display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0; font-size: 1.1rem; line-height: 1;
  `;
  btn.innerHTML = "📷";
  btn.onclick = async () => {
    const result = await openBarcodeScanner();
    if (result) {
      inputEl.value = result;
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      if (options.onScan) options.onScan(result);
    }
  };
  return btn;
}
