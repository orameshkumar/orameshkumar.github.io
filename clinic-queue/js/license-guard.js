/**
 * License Guard for Patient Queue Management
 * 
 * Validates license keys (both perpetual and date-restricted) before allowing
 * page access. If no valid license is found, a blocking popup is shown.
 * 
 * Usage: Import this module at the top of any protected page's <script type="module">:
 *   import { ensureLicense } from "./js/license-guard.js";
 *   await ensureLicense();
 *   // ... rest of page logic
 */

const LICENSE_KEY = "clinic-queue-license";
const APP_SECRET = [80,97,116,105,101,110,116,81,117,101,117,101,77,97,110,97,103,101,109,101,110,116];

function _getSecretString(codes) {
  return codes.map(c => String.fromCharCode(c)).join("");
}

async function _hmacHex(message, secretCodes) {
  const secret = _getSecretString(secretCodes);
  const enc = new TextEncoder();
  const keyData = enc.encode(secret);
  const msgData = enc.encode(message);
  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += ("0" + bytes[i].toString(16)).slice(-2);
  }
  return hex;
}

/**
 * Validates a license key string.
 * Returns { valid: true } or { valid: false, reason: string }
 */
async function validateLicense(keyStr) {
  if (!keyStr || typeof keyStr !== "string" || !keyStr.trim()) {
    return { valid: false, reason: "No license key provided." };
  }

  let payload;
  try {
    const decoded = atob(keyStr.trim());
    payload = JSON.parse(decoded);
  } catch (e) {
    return { valid: false, reason: "Invalid license key format." };
  }

  if (!payload || typeof payload !== "object" || !payload.n || !payload.h) {
    return { valid: false, reason: "Invalid license key structure." };
  }

  // Determine if this is a date-restricted key or a perpetual key
  const isDateRestricted = !!(payload.f && payload.t);

  // Compute expected HMAC
  let signingInput;
  if (isDateRestricted) {
    signingInput = payload.n + payload.f + payload.t;
  } else {
    signingInput = payload.n;
  }

  const expectedHash = await _hmacHex(signingInput, APP_SECRET);
  if (expectedHash !== payload.h) {
    return { valid: false, reason: "License key signature is invalid. The key may have been tampered with." };
  }

  // For date-restricted keys, check date range
  if (isDateRestricted) {
    const today = new Date();
    const todayStr = today.getFullYear() + "-" +
      String(today.getMonth() + 1).padStart(2, "0") + "-" +
      String(today.getDate()).padStart(2, "0");

    if (todayStr < payload.f) {
      return { valid: false, reason: `License is not yet active. Valid from: ${payload.f}` };
    }
    if (todayStr > payload.t) {
      return { valid: false, reason: `License has expired. Valid until: ${payload.t}` };
    }
  }

  return { valid: true, payload };
}

function _getStoredLicense() {
  try {
    return localStorage.getItem(LICENSE_KEY) || "";
  } catch (e) {
    return "";
  }
}

function _storeLicense(keyStr) {
  try {
    localStorage.setItem(LICENSE_KEY, keyStr.trim());
  } catch (e) { /* fail silently */ }
}

/**
 * Shows a blocking license popup overlay and returns a Promise that resolves
 * only when a valid license key is entered.
 */
function _showLicensePopup(reason) {
  return new Promise((resolve) => {
    // Create overlay
    const overlay = document.createElement("div");
    overlay.id = "license-guard-overlay";
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(15, 76, 79, 0.95); z-index: 99999;
      display: flex; align-items: center; justify-content: center;
      padding: 1.5rem; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    `;

    overlay.innerHTML = `
      <div style="background: white; border-radius: 16px; padding: 2rem; max-width: 440px; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
        <div style="text-align: center; margin-bottom: 1.5rem;">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🔑</div>
          <h2 style="margin: 0 0 0.5rem; color: #0F4C4F; font-size: 1.3rem;">License Required</h2>
          <p style="margin: 0; color: #666; font-size: 0.9rem;">Patient Queue Management requires a valid license key to continue.</p>
        </div>
        <div id="license-guard-error" style="display: none; background: #FEE2E2; color: #991B1B; padding: 0.6rem 0.9rem; border-radius: 8px; font-size: 0.85rem; margin-bottom: 1rem;"></div>
        <div style="margin-bottom: 1rem;">
          <label for="license-guard-input" style="display: block; font-weight: 600; font-size: 0.85rem; color: #333; margin-bottom: 0.4rem;">License Key</label>
          <textarea id="license-guard-input" rows="3" placeholder="Paste your license key here…"
            style="width: 100%; padding: 0.7rem; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 0.9rem; font-family: monospace; resize: vertical; box-sizing: border-box;"></textarea>
        </div>
        <button id="license-guard-submit"
          style="width: 100%; padding: 0.75rem; background: #0F4C4F; color: white; border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer;">
          Activate License
        </button>
        <p style="text-align: center; margin: 1rem 0 0; font-size: 0.78rem; color: #999;">
          Contact your administrator for a license key.
        </p>
      </div>
    `;

    document.body.appendChild(overlay);

    const input = document.getElementById("license-guard-input");
    const errorBox = document.getElementById("license-guard-error");
    const submitBtn = document.getElementById("license-guard-submit");

    // Show initial reason if provided
    if (reason) {
      errorBox.textContent = reason;
      errorBox.style.display = "block";
    }

    async function handleSubmit() {
      const keyStr = input.value.trim();
      if (!keyStr) {
        errorBox.textContent = "Please enter a license key.";
        errorBox.style.display = "block";
        return;
      }

      submitBtn.textContent = "Validating…";
      submitBtn.disabled = true;

      const result = await validateLicense(keyStr);
      if (result.valid) {
        _storeLicense(keyStr);
        overlay.remove();
        resolve(true);
      } else {
        errorBox.textContent = result.reason;
        errorBox.style.display = "block";
        submitBtn.textContent = "Activate License";
        submitBtn.disabled = false;
        input.focus();
      }
    }

    submitBtn.addEventListener("click", handleSubmit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    });

    input.focus();
  });
}

/**
 * Main entry point — call this at the top of any protected page.
 * Blocks execution until a valid license is confirmed.
 */
export async function ensureLicense() {
  const stored = _getStoredLicense();

  if (stored) {
    const result = await validateLicense(stored);
    if (result.valid) return; // All good, proceed
    // Stored key is invalid or expired — show popup with reason
    await _showLicensePopup(result.reason);
  } else {
    // No stored key — show popup
    await _showLicensePopup(null);
  }
}

export { validateLicense };
