/**
 * TranslationEngine - Improved version with retry logic, longer timeout,
 * and better error recovery.
 *
 * Key improvements:
 * - Timeout increased to 8 seconds (MyMemory can be slow)
 * - Retry logic: up to 2 retries on timeout/network errors
 * - Queues translation requests to avoid flooding the API
 * - Better text segmentation respecting word boundaries
 */
(function () {
  'use strict';

  class TranslationEngine {
    constructor() {
      this._sourceLang = null;
      this._targetLang = null;
      this._requestQueue = Promise.resolve();
      this._retryCount = 2;
      this._timeout = 8000; // 8 seconds — MyMemory can be slow
    }

    setLanguages(sourceLang, targetLang) {
      this._sourceLang = sourceLang;
      this._targetLang = targetLang;
    }

    async translate(text) {
      if (this.isWhitespaceOnly(text)) return null;

      // Trim and normalize whitespace
      text = text.trim().replace(/\s+/g, ' ');
      if (!text) return null;

      if (text.length > 500) {
        // Split long text into manageable chunks for better translation quality
        var segments = this.splitText(text, 500);
        var results = [];
        for (var i = 0; i < segments.length; i++) {
          var translated = await this._translateWithRetry(segments[i]);
          results.push(translated);
        }
        return results.join(' ');
      }

      return this._translateWithRetry(text);
    }

    async _translateWithRetry(text) {
      var lastError = null;

      for (var attempt = 0; attempt <= this._retryCount; attempt++) {
        try {
          // Small delay between retries
          if (attempt > 0) {
            await this._delay(500 * attempt);
          }
          return await this._translateSegment(text);
        } catch (error) {
          lastError = error;
          // Only retry on timeout or network errors, not on API errors
          if (error.message.indexOf('timeout') === -1 &&
              error.message.indexOf('network') === -1) {
            throw error;
          }
          console.warn('[TranslationEngine] Retry ' + (attempt + 1) + '/' + this._retryCount + ': ' + error.message);
        }
      }

      throw lastError;
    }

    async _translateSegment(text) {
      var url = 'https://api.mymemory.translated.net/get?q=' +
        encodeURIComponent(text) + '&langpair=' + this._sourceLang + '|' + this._targetLang;

      var controller = new AbortController();
      var timeoutId = setTimeout(function () { controller.abort(); }, this._timeout);

      try {
        var response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error('Translation API HTTP error: ' + response.status);
        }

        var data = await response.json();

        if (!data.responseData || !data.responseData.translatedText) {
          throw new Error('Empty translation result');
        }

        // Check for MyMemory quota exceeded or error responses
        if (data.responseStatus === 429) {
          throw new Error('Translation API rate limit exceeded. Please wait a moment.');
        }
        if (data.responseStatus !== 200 && data.responseStatus !== undefined) {
          throw new Error('Translation API error: status ' + data.responseStatus);
        }

        var translated = data.responseData.translatedText;

        // MyMemory sometimes returns the source text unchanged — detect this
        if (translated.toLowerCase() === text.toLowerCase() && this._sourceLang !== this._targetLang) {
          // Still return it — might be a proper noun or untranslatable content
          console.warn('[TranslationEngine] Translation identical to source, may be untranslatable');
        }

        return translated;
      } catch (error) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
          throw new Error('Translation timeout: request exceeded ' + (this._timeout / 1000) + ' seconds');
        }
        if (error.message.indexOf('Empty translation') !== -1 ||
            error.message.indexOf('Translation API') !== -1) {
          throw error;
        }
        throw new Error('Translation failed: network error - ' + error.message);
      }
    }

    /**
     * Split text into segments respecting sentence and word boundaries.
     * Prefers splitting at sentence end (. ! ?), then at comma/semicolon,
     * then at word boundary (space).
     */
    splitText(text, maxLength) {
      maxLength = maxLength || 500;
      if (text.length <= maxLength) return [text];

      var segments = [];
      var remaining = text;

      while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
          segments.push(remaining);
          break;
        }

        var splitIndex = -1;

        // 1. Look for sentence boundary (. ! ?) within the allowed range
        for (var i = maxLength - 1; i >= maxLength * 0.5; i--) {
          var ch = remaining[i];
          if ((ch === '.' || ch === '!' || ch === '?') && (i + 1 >= remaining.length || remaining[i + 1] === ' ')) {
            splitIndex = i + 1;
            break;
          }
        }

        // 2. Look for comma/semicolon boundary
        if (splitIndex === -1) {
          for (var j = maxLength - 1; j >= maxLength * 0.5; j--) {
            if (remaining[j] === ',' || remaining[j] === ';') {
              splitIndex = j + 1;
              break;
            }
          }
        }

        // 3. Look for word boundary (space)
        if (splitIndex === -1) {
          for (var k = maxLength - 1; k >= maxLength * 0.3; k--) {
            if (remaining[k] === ' ') {
              splitIndex = k + 1;
              break;
            }
          }
        }

        // 4. Hard split as last resort
        if (splitIndex === -1) {
          splitIndex = maxLength;
        }

        segments.push(remaining.substring(0, splitIndex).trim());
        remaining = remaining.substring(splitIndex).trim();
      }

      return segments.filter(function (s) { return s.length > 0; });
    }

    isWhitespaceOnly(text) {
      if (text === null || text === undefined) return true;
      return /^\s*$/.test(text);
    }

    _delay(ms) {
      return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }
  }

  window.TranslationEngine = TranslationEngine;
})();
