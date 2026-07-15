/**
 * Camera Activator Module
 * Handles WebRTC camera access with rear-facing camera preference.
 * Detects device capabilities, requests permissions, and manages camera streams.
 */

var CameraActivator = (() => {
  let currentStream = null;

  // Minimum supported browser versions
  const MIN_BROWSER_VERSIONS = {
    Safari: 14,
    Chrome: 80,
    Firefox: 79
  };

  /**
   * Detects browser name and major version from user agent string.
   * @param {string} [ua] - User agent string (defaults to navigator.userAgent)
   * @returns {{ browserName: string, browserVersion: string }}
   */
  function detectBrowser(ua) {
    if (typeof ua === 'undefined') {
      ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    }

    let browserName = 'Unknown';
    let browserVersion = '0';

    if (/Firefox\/(\d+)/.test(ua)) {
      browserName = 'Firefox';
      browserVersion = ua.match(/Firefox\/(\d+)/)[1];
    } else if (/Edg\/(\d+)/.test(ua)) {
      // Edge (Chromium-based) - treat as Chrome-compatible
      browserName = 'Chrome';
      browserVersion = ua.match(/Edg\/(\d+)/)[1];
    } else if (/Chrome\/(\d+)/.test(ua) && !/Edg/.test(ua)) {
      browserName = 'Chrome';
      browserVersion = ua.match(/Chrome\/(\d+)/)[1];
    } else if (/Version\/(\d+).*Safari/.test(ua) && !/Chrome/.test(ua)) {
      browserName = 'Safari';
      browserVersion = ua.match(/Version\/(\d+)/)[1];
    }

    return { browserName, browserVersion };
  }

  /**
   * Checks if the detected browser meets minimum version requirements.
   * @param {string} browserName
   * @param {string} browserVersion
   * @returns {boolean}
   */
  function isBrowserVersionSupported(browserName, browserVersion) {
    const minVersion = MIN_BROWSER_VERSIONS[browserName];
    if (typeof minVersion === 'undefined') {
      // Unknown browser - not in our supported list
      return false;
    }
    return parseInt(browserVersion, 10) >= minVersion;
  }

  /**
   * Checks device capability for AR experience.
   * Returns a DeviceCapability object describing what the device supports.
   * @returns {object} DeviceCapability object
   */
  function checkSupport() {
    const { browserName, browserVersion } = detectBrowser();

    const supportsWebRTC = !!(
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia
    );

    const supportsWebGL = (() => {
      try {
        if (typeof document === 'undefined') return false;
        const canvas = document.createElement('canvas');
        return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
      } catch (e) {
        return false;
      }
    })();

    const browserSupported = supportsWebRTC && supportsWebGL && isBrowserVersionSupported(browserName, browserVersion);

    return {
      hasRearCamera: true, // Cannot reliably detect without requesting; assume true, handle NotFoundError on request
      supportsWebRTC,
      supportsWebGL,
      browserSupported,
      browserName,
      browserVersion
    };
  }

  /**
   * Requests camera permission from the user using rear-facing camera constraints.
   * @returns {Promise<MediaStream>} The camera media stream.
   * @throws {Error} With name property set to:
   *   - 'NotAllowedError' if permission is denied
   *   - 'NotFoundError' if no rear camera is available
   *   - 'NotSupportedError' if browser doesn't support camera access
   */
  async function requestPermission() {
    // Check if getUserMedia is supported
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const error = new Error('Browser does not support camera access. Please use a supported browser: Safari 14+, Chrome 80+, or Firefox 79+.');
      error.name = 'NotSupportedError';
      throw error;
    }

    const constraints = {
      video: {
        facingMode: 'environment'
      },
      audio: false
    };

    try {
      currentStream = await navigator.mediaDevices.getUserMedia(constraints);
      return currentStream;
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        const error = new Error(
          'Camera permission was denied. To use the AR experience, please enable camera access in your device settings:\n' +
          '• iOS: Settings > Safari > Camera > Allow\n' +
          '• Android: Settings > Apps > Browser > Permissions > Camera\n' +
          '• Desktop: Click the camera icon in the address bar'
        );
        error.name = 'NotAllowedError';
        throw error;
      }

      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        const error = new Error(
          'No rear-facing camera was found on this device. A rear camera is required for the AR experience. Please try on a mobile device with a rear camera.'
        );
        error.name = 'NotFoundError';
        throw error;
      }

      if (err.name === 'NotSupportedError' || err.name === 'NotReadableError') {
        const error = new Error(
          'Camera access is not supported in this browser. Please use one of these supported browsers:\n' +
          '• Safari 14 or later\n' +
          '• Chrome 80 or later\n' +
          '• Firefox 79 or later'
        );
        error.name = 'NotSupportedError';
        throw error;
      }

      // Re-throw any other errors with original name
      throw err;
    }
  }

  /**
   * Activates the rear-facing camera and attaches the stream to a video element.
   * Displays the camera feed in full-screen mode.
   * @param {string|HTMLVideoElement} videoElementOrSelector - CSS selector string or video element
   * @returns {Promise<MediaStream>} The active media stream
   * @throws {Error} If video element not found, or camera errors
   */
  async function activateRearCamera(videoElementOrSelector) {
    // Get or request the stream
    if (!currentStream) {
      await requestPermission();
    }

    // Resolve the video element
    let videoElement;
    if (typeof videoElementOrSelector === 'string') {
      if (typeof document !== 'undefined') {
        videoElement = document.querySelector(videoElementOrSelector);
      }
      if (!videoElement) {
        throw new Error('Video element not found: ' + videoElementOrSelector);
      }
    } else if (videoElementOrSelector && videoElementOrSelector.tagName === 'VIDEO') {
      videoElement = videoElementOrSelector;
    } else if (typeof document !== 'undefined') {
      // If no element provided, try to find a default video element
      videoElement = document.querySelector('#ar-camera-feed');
      if (!videoElement) {
        // Create a video element for the camera feed
        videoElement = document.createElement('video');
        videoElement.id = 'ar-camera-feed';
        videoElement.setAttribute('playsinline', '');
        videoElement.setAttribute('autoplay', '');
        videoElement.style.position = 'fixed';
        videoElement.style.top = '0';
        videoElement.style.left = '0';
        videoElement.style.width = '100%';
        videoElement.style.height = '100%';
        videoElement.style.objectFit = 'cover';
        videoElement.style.zIndex = '-1';
        document.body.appendChild(videoElement);
      }
    }

    if (!videoElement) {
      throw new Error('Could not resolve video element for camera feed.');
    }

    // Attach stream to video element
    videoElement.srcObject = currentStream;
    videoElement.setAttribute('playsinline', '');
    videoElement.setAttribute('autoplay', '');

    // Set full-screen display styles
    videoElement.style.width = '100%';
    videoElement.style.height = '100%';
    videoElement.style.objectFit = 'cover';

    // Play the video
    await videoElement.play();

    return currentStream;
  }

  /**
   * Stops the camera stream and releases resources.
   */
  function stopCamera() {
    if (currentStream) {
      currentStream.getTracks().forEach((track) => track.stop());
      currentStream = null;
    }
  }

  /**
   * Returns the current active media stream, or null if not active.
   * @returns {MediaStream|null}
   */
  function getStream() {
    return currentStream;
  }

  /**
   * Returns the error message for permission denied.
   * @returns {string}
   */
  function getPermissionDeniedMessage() {
    return (
      'Camera permission was denied. To use the AR experience, please enable camera access in your device settings:\n' +
      '• iOS: Settings > Safari > Camera > Allow\n' +
      '• Android: Settings > Apps > Browser > Permissions > Camera\n' +
      '• Desktop: Click the camera icon in the address bar'
    );
  }

  /**
   * Returns the error message for no rear camera.
   * @returns {string}
   */
  function getNoRearCameraMessage() {
    return 'No rear-facing camera was found on this device. A rear camera is required for the AR experience. Please try on a mobile device with a rear camera.';
  }

  /**
   * Returns the error message for unsupported browser with list of supported browsers.
   * @returns {string}
   */
  function getUnsupportedBrowserMessage() {
    return (
      'Your browser does not support the required camera features for this AR experience. Please use one of these supported browsers:\n' +
      '• Safari 14 or later\n' +
      '• Chrome 80 or later\n' +
      '• Firefox 79 or later'
    );
  }

  /**
   * Returns the list of supported browsers with minimum versions.
   * @returns {Array<{name: string, minVersion: number}>}
   */
  function getSupportedBrowsers() {
    return [
      { name: 'Safari', minVersion: 14 },
      { name: 'Chrome', minVersion: 80 },
      { name: 'Firefox', minVersion: 79 }
    ];
  }

  return {
    checkSupport,
    requestPermission,
    activateRearCamera,
    stopCamera,
    getStream,
    getPermissionDeniedMessage,
    getNoRearCameraMessage,
    getUnsupportedBrowserMessage,
    getSupportedBrowsers,
    // Expose for testing
    _detectBrowser: detectBrowser,
    _isBrowserVersionSupported: isBrowserVersionSupported
  };
})();

// Export for testing (CommonJS)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CameraActivator;
}
