var AuthUI = (function() {
  'use strict';

  // ─── State ───
  var _onUnlockCallback = null;
  var _biometricAutoTriggered = false;

  // ─── 3.9 Error Display ───
  function showError(message) {
    var errorEl = document.getElementById('auth-error-message');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    }
  }

  function clearError() {
    var errorEl = document.getElementById('auth-error-message');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }

  // ─── 3.10 Hide Lock Screen ───
  function hideLockScreen() {
    var overlay = document.getElementById('auth-lock-screen');
    if (overlay) {
      overlay.setAttribute('hidden', '');
      overlay.innerHTML = '';
    }
    // Trigger app initialization continuation
    if (typeof _onUnlockCallback === 'function') {
      _onUnlockCallback();
    }
  }

  // ─── 3.11 Auto-trigger biometric ───
  function _autoTriggerBiometric() {
    if (_biometricAutoTriggered) return;
    _biometricAutoTriggered = true;

    setTimeout(function() {
      _handleBiometricAuth();
    }, 500);
  }

  // ─── Biometric Auth Handler ───
  async function _handleBiometricAuth() {
    clearError();
    try {
      var result = await AuthWebAuthn.verify();
      if (result.success) {
        Auth.unlock();
        Auth.startSessionTimer();
        hideLockScreen();
      } else {
        var errorMsg = (result.error && result.error.message) ? result.error.message : 'Biometric authentication failed. Please use your password.';
        showError(errorMsg);
      }
    } catch (e) {
      showError('Biometric authentication failed. Please use your password.');
    }
  }

  // ─── Lock Screen Submit Handler ───
  async function _handleLockScreenSubmit() {
    var input = document.getElementById('auth-password-input');
    if (!input) return;

    var password = input.value;
    if (!password) {
      showError('Please enter your password.');
      return;
    }

    clearError();

    var isValid = await Auth.verifyPassword(password);
    if (isValid) {
      Auth.unlock();
      Auth.startSessionTimer();
      hideLockScreen();
    } else {
      showError('Incorrect password. Please try again.');
      input.value = '';
      input.focus();
    }
  }

  // ─── 3.2 & 3.3 & 3.4 Render Lock Screen ───
  function renderLockScreen() {
    _biometricAutoTriggered = false;

    var overlay = document.getElementById('auth-lock-screen');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'auth-lock-screen';
      overlay.className = 'auth-overlay';
      document.body.insertBefore(overlay, document.body.firstChild);
    }

    overlay.removeAttribute('hidden');
    overlay.innerHTML = '';

    // App name with lock icon
    var titleEl = document.createElement('h1');
    titleEl.className = 'auth-app-title';
    titleEl.textContent = '\uD83D\uDD12 Pay Up Partners';
    overlay.appendChild(titleEl);

    // Password input
    var inputEl = document.createElement('input');
    inputEl.type = 'password';
    inputEl.id = 'auth-password-input';
    inputEl.className = 'auth-password-input';
    inputEl.placeholder = 'Enter password';
    inputEl.setAttribute('autocomplete', 'current-password');
    inputEl.setAttribute('aria-label', 'Password');
    overlay.appendChild(inputEl);

    // Error area
    var errorEl = document.createElement('p');
    errorEl.id = 'auth-error-message';
    errorEl.className = 'auth-error-message';
    errorEl.style.display = 'none';
    errorEl.setAttribute('role', 'alert');
    overlay.appendChild(errorEl);

    // Submit button
    var submitBtn = document.createElement('button');
    submitBtn.id = 'auth-submit-btn';
    submitBtn.className = 'auth-submit-btn btn-primary';
    submitBtn.textContent = 'Unlock';
    submitBtn.type = 'button';
    overlay.appendChild(submitBtn);

    // 3.3 Biometric button (only if biometrics are enabled and credential exists)
    var showBiometric = Auth.isBiometricEnabled() && AuthWebAuthn.hasCredential();
    if (showBiometric) {
      var biometricBtn = document.createElement('button');
      biometricBtn.id = 'auth-biometric-btn';
      biometricBtn.className = 'auth-biometric-btn';
      biometricBtn.textContent = '\uD83D\uDC46';
      biometricBtn.type = 'button';
      biometricBtn.setAttribute('aria-label', 'Unlock with fingerprint');
      overlay.appendChild(biometricBtn);

      // 3.4 Biometric button tap
      biometricBtn.addEventListener('click', function() {
        _handleBiometricAuth();
      });
    }

    // 3.4 Submit button click
    submitBtn.addEventListener('click', function() {
      _handleLockScreenSubmit();
    });

    // 3.4 Enter key press
    inputEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        _handleLockScreenSubmit();
      }
    });

    // Focus the password input
    setTimeout(function() {
      inputEl.focus();
    }, 100);

    // 3.11 Auto-trigger biometric prompt
    if (showBiometric) {
      _autoTriggerBiometric();
    }
  }

  // ─── 3.5 & 3.6 First Launch Setup ───
  function renderFirstLaunchSetup() {
    var overlay = document.getElementById('auth-setup-modal');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'auth-setup-modal';
      overlay.className = 'auth-overlay';
      document.body.insertBefore(overlay, document.body.firstChild);
    }

    overlay.removeAttribute('hidden');
    overlay.innerHTML = '';

    // Setup form container
    var formContainer = document.createElement('div');
    formContainer.className = 'auth-setup-form';

    // Welcome message
    var welcomeTitle = document.createElement('h2');
    welcomeTitle.className = 'auth-setup-title';
    welcomeTitle.textContent = '\uD83D\uDD12 Secure Your App';
    formContainer.appendChild(welcomeTitle);

    var welcomeMsg = document.createElement('p');
    welcomeMsg.className = 'auth-setup-message';
    welcomeMsg.textContent = 'Welcome to Pay Up Partners! Set up a password to protect your financial data.';
    formContainer.appendChild(welcomeMsg);

    // Password input
    var pwdLabel = document.createElement('label');
    pwdLabel.className = 'auth-label';
    pwdLabel.setAttribute('for', 'auth-setup-password');
    pwdLabel.textContent = 'Password';
    formContainer.appendChild(pwdLabel);

    var pwdInput = document.createElement('input');
    pwdInput.type = 'password';
    pwdInput.id = 'auth-setup-password';
    pwdInput.className = 'auth-password-input';
    pwdInput.placeholder = 'Create a password';
    pwdInput.setAttribute('autocomplete', 'new-password');
    pwdInput.setAttribute('aria-label', 'Create password');
    formContainer.appendChild(pwdInput);

    // Confirm input
    var confirmLabel = document.createElement('label');
    confirmLabel.className = 'auth-label';
    confirmLabel.setAttribute('for', 'auth-setup-confirm');
    confirmLabel.textContent = 'Confirm Password';
    formContainer.appendChild(confirmLabel);

    var confirmInput = document.createElement('input');
    confirmInput.type = 'password';
    confirmInput.id = 'auth-setup-confirm';
    confirmInput.className = 'auth-password-input';
    confirmInput.placeholder = 'Confirm your password';
    confirmInput.setAttribute('autocomplete', 'new-password');
    confirmInput.setAttribute('aria-label', 'Confirm password');
    formContainer.appendChild(confirmInput);

    // Minimum length hint
    var hint = document.createElement('small');
    hint.className = 'auth-hint';
    hint.textContent = 'Minimum 4 characters';
    formContainer.appendChild(hint);

    // Error area
    var errorEl = document.createElement('p');
    errorEl.id = 'auth-setup-error';
    errorEl.className = 'auth-error-message';
    errorEl.style.display = 'none';
    errorEl.setAttribute('role', 'alert');
    formContainer.appendChild(errorEl);

    // Save button
    var saveBtn = document.createElement('button');
    saveBtn.id = 'auth-setup-save-btn';
    saveBtn.className = 'auth-submit-btn btn-primary';
    saveBtn.textContent = 'Save Password';
    saveBtn.type = 'button';
    formContainer.appendChild(saveBtn);

    overlay.appendChild(formContainer);

    // 3.6 Form validation and submission
    saveBtn.addEventListener('click', async function() {
      var password = pwdInput.value;
      var confirm = confirmInput.value;
      var setupError = document.getElementById('auth-setup-error');

      // Clear previous error
      if (setupError) {
        setupError.style.display = 'none';
        setupError.textContent = '';
      }

      // Validate minimum length
      if (!password || password.length < 4) {
        if (setupError) {
          setupError.textContent = 'Password must be at least 4 characters.';
          setupError.style.display = 'block';
        }
        pwdInput.focus();
        return;
      }

      // Validate match
      if (password !== confirm) {
        if (setupError) {
          setupError.textContent = 'Passwords do not match.';
          setupError.style.display = 'block';
        }
        confirmInput.focus();
        return;
      }

      // Set password
      var result = await Auth.setPassword(password);
      if (result.success) {
        Auth.unlock();
        // Hide setup modal
        overlay.setAttribute('hidden', '');
        overlay.innerHTML = '';
        // Start session timer and continue app init
        Auth.startSessionTimer();
        if (typeof _onUnlockCallback === 'function') {
          _onUnlockCallback();
        }
      } else {
        if (setupError) {
          setupError.textContent = result.error || 'Failed to set password. Please try again.';
          setupError.style.display = 'block';
        }
      }
    });

    // Focus first input
    setTimeout(function() {
      pwdInput.focus();
    }, 100);
  }

  // ─── 3.7 Render Auth Settings ───
  function renderAuthSettings() {
    var container = document.getElementById('auth-settings-container');
    if (!container) return;

    container.innerHTML = '';

    // Change Password button
    var changePwdBtn = document.createElement('button');
    changePwdBtn.id = 'auth-change-password-btn';
    changePwdBtn.className = 'btn-primary auth-settings-btn';
    changePwdBtn.textContent = 'Change Password';
    changePwdBtn.type = 'button';
    container.appendChild(changePwdBtn);

    // Change Password form area (initially hidden)
    var changePwdForm = document.createElement('div');
    changePwdForm.id = 'auth-change-password-form';
    changePwdForm.className = 'auth-change-password-form';
    changePwdForm.style.display = 'none';
    container.appendChild(changePwdForm);

    // Biometric toggle (conditionally shown)
    _renderBiometricToggle(container);

    // Timeout dropdown
    var timeoutGroup = document.createElement('div');
    timeoutGroup.className = 'form-group auth-settings-group';

    var timeoutLabel = document.createElement('label');
    timeoutLabel.setAttribute('for', 'auth-timeout-select');
    timeoutLabel.textContent = 'Auto-lock Timeout';
    timeoutGroup.appendChild(timeoutLabel);

    var timeoutSelect = document.createElement('select');
    timeoutSelect.id = 'auth-timeout-select';
    timeoutSelect.className = 'auth-timeout-select';

    var timeoutOptions = [
      { value: '1', text: '1 minute' },
      { value: '5', text: '5 minutes' },
      { value: '15', text: '15 minutes' },
      { value: '30', text: '30 minutes' },
      { value: '0', text: 'Never' }
    ];

    var currentTimeout = Auth.getTimeoutMinutes();
    timeoutOptions.forEach(function(opt) {
      var optionEl = document.createElement('option');
      optionEl.value = opt.value;
      optionEl.textContent = opt.text;
      if (parseInt(opt.value, 10) === currentTimeout) {
        optionEl.selected = true;
      }
      timeoutSelect.appendChild(optionEl);
    });

    timeoutGroup.appendChild(timeoutSelect);
    container.appendChild(timeoutGroup);

    // Event: Change Password button
    changePwdBtn.addEventListener('click', function() {
      _renderChangePasswordForm();
    });

    // Event: Timeout change
    timeoutSelect.addEventListener('change', function() {
      Auth.setTimeoutMinutes(parseInt(timeoutSelect.value, 10));
      Auth.startSessionTimer();
    });
  }

  // ─── Biometric Toggle Render ───
  function _renderBiometricToggle(container) {
    // Only show if WebAuthn is potentially available
    if (!AuthWebAuthn.isSecureContext()) return;

    var biometricGroup = document.createElement('div');
    biometricGroup.id = 'auth-biometric-toggle-group';
    biometricGroup.className = 'theme-toggle-group auth-settings-group';

    var biometricLabel = document.createElement('label');
    biometricLabel.setAttribute('for', 'auth-biometric-toggle');
    biometricLabel.textContent = 'Biometric Unlock';
    biometricGroup.appendChild(biometricLabel);

    var switchLabel = document.createElement('label');
    switchLabel.className = 'theme-switch';

    var biometricCheckbox = document.createElement('input');
    biometricCheckbox.type = 'checkbox';
    biometricCheckbox.id = 'auth-biometric-toggle';
    biometricCheckbox.checked = Auth.isBiometricEnabled();
    biometricCheckbox.setAttribute('aria-label', 'Toggle biometric unlock');

    var slider = document.createElement('span');
    slider.className = 'theme-slider';

    switchLabel.appendChild(biometricCheckbox);
    switchLabel.appendChild(slider);
    biometricGroup.appendChild(switchLabel);

    container.appendChild(biometricGroup);

    // Check availability asynchronously and hide if not supported
    AuthWebAuthn.isAvailable().then(function(available) {
      if (!available) {
        biometricGroup.style.display = 'none';
      }
    });

    // Event: Biometric toggle
    biometricCheckbox.addEventListener('change', async function() {
      if (biometricCheckbox.checked) {
        // Enabling: enroll via WebAuthn
        var enrollResult = await AuthWebAuthn.enroll();
        if (enrollResult.success) {
          Auth.setBiometricEnabled(true);
        } else {
          biometricCheckbox.checked = false;
          var errorMsg = (enrollResult.error && enrollResult.error.message) ? enrollResult.error.message : 'Failed to enable biometric authentication.';
          alert(errorMsg);
        }
      } else {
        // Disabling: remove credential
        AuthWebAuthn.removeCredential();
        Auth.setBiometricEnabled(false);
      }
    });
  }

  // ─── 3.8 Change Password Flow UI ───
  function _renderChangePasswordForm() {
    var formContainer = document.getElementById('auth-change-password-form');
    if (!formContainer) return;

    formContainer.style.display = 'block';
    formContainer.innerHTML = '';

    // Current password
    var currentLabel = document.createElement('label');
    currentLabel.className = 'auth-label';
    currentLabel.setAttribute('for', 'auth-current-password');
    currentLabel.textContent = 'Current Password';
    formContainer.appendChild(currentLabel);

    var currentInput = document.createElement('input');
    currentInput.type = 'password';
    currentInput.id = 'auth-current-password';
    currentInput.className = 'auth-password-input';
    currentInput.placeholder = 'Enter current password';
    currentInput.setAttribute('autocomplete', 'current-password');
    formContainer.appendChild(currentInput);

    // New password
    var newLabel = document.createElement('label');
    newLabel.className = 'auth-label';
    newLabel.setAttribute('for', 'auth-new-password');
    newLabel.textContent = 'New Password';
    formContainer.appendChild(newLabel);

    var newInput = document.createElement('input');
    newInput.type = 'password';
    newInput.id = 'auth-new-password';
    newInput.className = 'auth-password-input';
    newInput.placeholder = 'Enter new password';
    newInput.setAttribute('autocomplete', 'new-password');
    formContainer.appendChild(newInput);

    // Confirm new password
    var confirmLabel = document.createElement('label');
    confirmLabel.className = 'auth-label';
    confirmLabel.setAttribute('for', 'auth-confirm-new-password');
    confirmLabel.textContent = 'Confirm New Password';
    formContainer.appendChild(confirmLabel);

    var confirmInput = document.createElement('input');
    confirmInput.type = 'password';
    confirmInput.id = 'auth-confirm-new-password';
    confirmInput.className = 'auth-password-input';
    confirmInput.placeholder = 'Confirm new password';
    confirmInput.setAttribute('autocomplete', 'new-password');
    formContainer.appendChild(confirmInput);

    // Hint
    var hint = document.createElement('small');
    hint.className = 'auth-hint';
    hint.textContent = 'Minimum 4 characters';
    formContainer.appendChild(hint);

    // Error area
    var errorEl = document.createElement('p');
    errorEl.id = 'auth-change-password-error';
    errorEl.className = 'auth-error-message';
    errorEl.style.display = 'none';
    errorEl.setAttribute('role', 'alert');
    formContainer.appendChild(errorEl);

    // Buttons
    var btnGroup = document.createElement('div');
    btnGroup.className = 'form-actions';

    var saveBtn = document.createElement('button');
    saveBtn.id = 'auth-change-password-save';
    saveBtn.className = 'btn-primary';
    saveBtn.textContent = 'Save';
    saveBtn.type = 'button';
    btnGroup.appendChild(saveBtn);

    var cancelBtn = document.createElement('button');
    cancelBtn.id = 'auth-change-password-cancel';
    cancelBtn.className = 'btn-secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.type = 'button';
    btnGroup.appendChild(cancelBtn);

    formContainer.appendChild(btnGroup);

    // Event: Save
    saveBtn.addEventListener('click', async function() {
      var currentPwd = currentInput.value;
      var newPwd = newInput.value;
      var confirmPwd = confirmInput.value;

      // Clear error
      errorEl.style.display = 'none';
      errorEl.textContent = '';

      // Validate new password length
      if (!newPwd || newPwd.length < 4) {
        errorEl.textContent = 'New password must be at least 4 characters.';
        errorEl.style.display = 'block';
        newInput.focus();
        return;
      }

      // Validate match
      if (newPwd !== confirmPwd) {
        errorEl.textContent = 'New passwords do not match.';
        errorEl.style.display = 'block';
        confirmInput.focus();
        return;
      }

      // Attempt change
      var result = await Auth.changePassword(currentPwd, newPwd);
      if (result.success) {
        formContainer.style.display = 'none';
        formContainer.innerHTML = '';
        alert('Password changed successfully.');
      } else {
        errorEl.textContent = result.error || 'Failed to change password.';
        errorEl.style.display = 'block';
      }
    });

    // Event: Cancel
    cancelBtn.addEventListener('click', function() {
      formContainer.style.display = 'none';
      formContainer.innerHTML = '';
    });

    // Focus first input
    currentInput.focus();
  }

  // ─── Set unlock callback ───
  function setOnUnlockCallback(callback) {
    if (typeof callback === 'function') {
      _onUnlockCallback = callback;
    }
  }

  // ─── Public API ───
  return {
    renderLockScreen: renderLockScreen,
    renderFirstLaunchSetup: renderFirstLaunchSetup,
    renderAuthSettings: renderAuthSettings,
    showError: showError,
    clearError: clearError,
    hideLockScreen: hideLockScreen,
    setOnUnlockCallback: setOnUnlockCallback
  };
})();
