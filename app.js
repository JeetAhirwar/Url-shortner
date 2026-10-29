/**
 * Shortly — app logic
 * 1. Mobile navigation toggle
 * 2. Form: validate → call CleanURI API → render result
 * 3. Persist shortened links in localStorage
 * 4. Copy short link to clipboard
 */
(function () {
  'use strict';

  /* ------------------------------------------
     1. Mobile navigation toggle
     ------------------------------------------ */
  const toggle = document.querySelector('.header__toggle');
  const nav = document.querySelector('.header__nav');

  function setMenu(open) {
    nav.classList.toggle('is-open', open);
    toggle.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  }

  toggle.addEventListener('click', () => {
    setMenu(!nav.classList.contains('is-open'));
  });

  // Close on Escape and when clicking outside
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) {
      setMenu(false);
      toggle.focus();
    }
  });

  document.addEventListener('click', (e) => {
    if (!nav.classList.contains('is-open')) return;
    if (e.target === toggle || toggle.contains(e.target)) return;
    if (nav.contains(e.target)) return;
    setMenu(false);
  });

  /* ------------------------------------------
     2. Form + API
     ------------------------------------------ */
  const form = document.querySelector('.form');
  const input = document.querySelector('.form__input');
  const errorEl = document.querySelector('.form__error');
  const submitBtn = document.querySelector('.form__submit');
  const resultsList = document.querySelector('#results-list');

  const STORAGE_KEY = 'shortly:links';
  let links = [];

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
    form.classList.add('has-error');
    input.setAttribute('aria-invalid', 'true');
  }

  function clearError() {
    errorEl.textContent = '';
    errorEl.hidden = true;
    form.classList.remove('has-error');
    input.removeAttribute('aria-invalid');
  }

  /**
   * Calls the CleanURI API and resolves with the shortened URL.
   * Rejects with a user-friendly error message.
   * Fetch is aborted after 12s so a hanging network fails visibly.
   */
  const API_URL = 'https://cleanuri.com/api/v1/shorten';
  const TIMEOUT_MS = 12000;

  function shortenUrl(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    return fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ url }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('The shortening service is unavailable right now. Please try again later.');
        }
        return response.json();
      })
      .then((data) => {
        if (data.result_url) return data.result_url;
        throw new Error(data.error || 'Something went wrong. Please try again.');
      })
      .catch((error) => {
        if (error.name === 'AbortError') {
          throw new Error('The request took too long. Please try again.');
        }
        if (error instanceof TypeError) {
          throw new Error('Network problem — please check your connection and try again.');
        }
        throw error;
      })
      .finally(() => clearTimeout(timeoutId));
  }

  function normalizeUrl(value) {
    const trimmed = value.trim();
    if (!trimmed) return trimmed;
    // Auto-prefix protocol so CleanURI accepts "example.com"
    return /^[a-z]+:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const raw = input.value.trim();
    if (!raw) {
      showError('Please add a link');
      return;
    }

    const url = normalizeUrl(raw);
    submitBtn.disabled = true;
    submitBtn.textContent = 'Shortening...';
    clearError();

    shortenUrl(url)
      .then((shortUrl) => {
        // Avoid duplicates — move existing entry to the top instead
        links = links.filter((link) => link.url !== url);
        links.unshift({ url, short: shortUrl });
        saveLinks();
        renderLinks();
      })
      .catch((error) => {
        showError(error.message);
      })
      .finally(() => {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Shorten It!';
      });
  });

  // Clear the error as soon as the user starts typing again
  input.addEventListener('input', clearError);

  /* ------------------------------------------
     3. localStorage persistence
     ------------------------------------------ */
  function loadLinks() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      links = Array.isArray(stored) ? stored : [];
    } catch {
      // Corrupted or unavailable storage (e.g. private mode) — start fresh
      links = [];
    }
    renderLinks();
  }

  function saveLinks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
    } catch {
      // Storage write failed — app still works for the current session
    }
  }

  /* ------------------------------------------
     4. Rendering + copy to clipboard
     ------------------------------------------ */
  function renderLinks() {
    resultsList.innerHTML = '';

    if (!links.length) {
      resultsList.hidden = true;
      return;
    }

    resultsList.hidden = false;

    links.forEach((link) => {
      const item = document.createElement('li');
      item.className = 'result-item';

      const original = document.createElement('p');
      original.className = 'result-item__url';
      original.textContent = link.url;

      const short = document.createElement('a');
      short.className = 'result-item__link';
      short.href = link.short;
      short.target = '_blank';
      short.rel = 'noopener';
      short.textContent = link.short;

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'result-item__copy';
      copyBtn.textContent = 'Copy';
      copyBtn.dataset.shortUrl = link.short;

      item.append(original, short, copyBtn);
      resultsList.append(item);
    });
  }

  // One delegated listener handles every Copy button, current and future
  resultsList.addEventListener('click', (event) => {
    const btn = event.target.closest('.result-item__copy');
    if (!btn) return;

    copyToClipboard(btn.dataset.shortUrl).then(() => {
      btn.textContent = 'Copied!';
      btn.classList.add('btn--copied');

      setTimeout(() => {
        btn.textContent = 'Copy';
        btn.classList.remove('btn--copied');
      }, 2000);
    });
  });

  /** navigator.clipboard requires HTTPS / localhost — fall back otherwise */
  function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(useLegacyCopy);
    }

    return useLegacyCopy(text);

    function useLegacyCopy(value) {
      return new Promise((resolve, reject) => {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.cssText = 'position:absolute;left:-9999px';
        document.body.append(textarea);
        textarea.select();

        try {
          document.execCommand('copy') ? resolve() : reject(new Error('Copy failed'));
        } finally {
          textarea.remove();
        }
      });
    }
  }

  loadLinks();
})();
