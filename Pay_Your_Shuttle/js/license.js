const License = (function () {
  'use strict';

  const LIMITS = {
    MAX_MEMBERS:     20,
    MAX_MONTHLY_FEE: 1000,
    MAX_GUEST_FEE:   1000
  };

  // ── License validation ───────────────────────────────
  // Checks localStorage for a valid license key.
  // Key format: base64(JSON) with HMAC — validated against shared secret.
  // Until real key validation is wired up, any stored key is treated as
  // licensed ONLY if it passes the length + format check below.
  function isLicensed() {
    try {
      var raw = localStorage.getItem('pys_license_key');
      if (!raw || raw.trim().length < 20) return false;
      // Must be valid base64 JSON containing { n, h } fields
      var decoded = JSON.parse(atob(raw.trim()));
      return !!(decoded && decoded.n && decoded.h && decoded.h.length === 64);
    } catch (e) {
      return false;
    }
  }

  function getMaxMembers()    { return isLicensed() ? Infinity : LIMITS.MAX_MEMBERS; }
  function getMaxMonthlyFee() { return isLicensed() ? Infinity : LIMITS.MAX_MONTHLY_FEE; }
  function getMaxGuestFee()   { return isLicensed() ? Infinity : LIMITS.MAX_GUEST_FEE; }

  // ── Banner ───────────────────────────────────────────
  function updateBanner() {
    var banner = document.getElementById('license-banner');
    if (!banner) return;
    if (isLicensed()) {
      banner.setAttribute('hidden', '');
    } else {
      banner.removeAttribute('hidden');
      var span = banner.querySelector('span');
      if (span) span.textContent =
        '⚠️ Unlicensed — max ' + LIMITS.MAX_MEMBERS + ' members · ' +
        'fee ≤ ₹' + LIMITS.MAX_MONTHLY_FEE + ' · guest fee ≤ ₹' + LIMITS.MAX_GUEST_FEE;
    }
  }

  // ── Limit checks ─────────────────────────────────────
  // Returns null if OK, error string if limit exceeded.

  async function checkMemberLimit() {
    if (isLicensed()) return null;
    var members = await DB.getAllMembers();
    var active  = members.filter(function (m) { return m.status !== 'inactive'; });
    if (active.length >= LIMITS.MAX_MEMBERS) {
      return 'Unlicensed limit reached: max ' + LIMITS.MAX_MEMBERS +
             ' active members. Activate a license to add more.';
    }
    return null;
  }

  // fee > MAX is blocked (MAX itself is allowed: ≤ MAX)
  function checkMonthlyFee(fee) {
    if (isLicensed()) return null;
    fee = parseFloat(fee) || 0;
    if (fee > LIMITS.MAX_MONTHLY_FEE) {
      return 'Unlicensed limit: monthly fee cannot exceed ₹' + LIMITS.MAX_MONTHLY_FEE +
             '. You entered ₹' + fee + '. Activate a license to remove this restriction.';
    }
    return null;
  }

  function checkGuestFee(fee) {
    if (isLicensed()) return null;
    fee = parseFloat(fee) || 0;
    if (fee > LIMITS.MAX_GUEST_FEE) {
      return 'Unlicensed limit: guest fee cannot exceed ₹' + LIMITS.MAX_GUEST_FEE +
             '. You entered ₹' + fee + '. Activate a license to remove this restriction.';
    }
    return null;
  }

  function init() { updateBanner(); }

  return {
    init, isLicensed, updateBanner,
    getMaxMembers, getMaxMonthlyFee, getMaxGuestFee,
    checkMemberLimit, checkMonthlyFee, checkGuestFee,
    LIMITS
  };
})();
