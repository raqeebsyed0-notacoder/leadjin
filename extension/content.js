/**
 * LEADJIN Extension — LinkedIn Content Script
 * Injects "Add to LEADJIN" button on LinkedIn profile pages.
 * Extracts name, title, company, and LinkedIn URL.
 */

(function () {
  'use strict';

  // Only run on profile pages
  if (!window.location.pathname.startsWith('/in/')) return;

  let injected = false;

  function extractProfile() {
    // D-03: Hardened selectors with multiple fallbacks
    const name = (
      document.querySelector('h1.inline.t-24')?.innerText?.trim() ||
      document.querySelector('h1.t-24')?.innerText?.trim() ||
      document.querySelector('h1')?.innerText?.trim() ||
      ''
    );
    
    const title = (
      document.querySelector('.text-body-medium.break-words')?.innerText?.trim() ||
      document.querySelector('.text-body-medium')?.innerText?.trim() ||
      document.querySelector('[data-testid="profile-position"]')?.innerText?.trim() ||
      ''
    );

    // Company: look in experience section or top card with multiple fallbacks
    let company = '';
    const companySelectors = [
      '.pvs-list__item--line-separated .t-bold span[aria-hidden="true"]',
      '.pv-entity__company-details span[aria-hidden="true"]',
      '[data-testid="experience-entity"] .t-bold span[aria-hidden="true"]',
      '.experience-item__company-name',
      '.profile-section-card__subtitle'
    ];
    for (const selector of companySelectors) {
      const el = document.querySelector(selector);
      if (el) { company = el.innerText.trim(); break; }
    }

    // Fallback: try the subtitle under name
    if (!company) {
      const subSelectors = ['.text-body-small', '.pv-text-details__left-panel .text-body-small', '.top-card-layout__headline'];
      for (const selector of subSelectors) {
        const sub = document.querySelectorAll(selector);
        for (const el of sub) {
          const text = el.innerText.trim();
          if (text && !text.includes('·') && text.length < 80) { company = text; break; }
        }
        if (company) break;
      }
    }

    // D-04: Fix trailing slash in lead IDs
    const pathId = window.location.pathname
      .replace(/^\/in\//, '')  // Remove leading /in/
      .replace(/\/$/, '')       // Remove trailing slash
      .replace(/\//g, '_');     // Replace any remaining slashes with underscores

    return {
      lead_id: `li_${pathId}`,
      name,
      title,
      company,
      linkedin: window.location.href,
      source: 'linkedin_extension',
      lead_score: 50,
      status: 'NEW',
    };
  }

  function injectButton() {
    if (injected || document.getElementById('leadjin-capture-btn')) return;
    if (!window.location.pathname.startsWith('/in/')) return;

    // Wait for the profile header to load
    const nameEl = document.querySelector('h1');
    if (!nameEl) return;

    // D-03: Hardened injection selectors with multiple fallbacks
    const actionsContainer = (
      document.querySelector('.pvs-profile-actions') ||
      document.querySelector('.pv-top-card-v2-ctas') ||
      document.querySelector('.profile-actions') ||
      document.querySelector('[data-testid="profile-actions"]') ||
      document.querySelector('.top-card-layout__cta-container') ||
      nameEl.closest('section')?.querySelector('.ph5') ||
      nameEl.closest('section')?.querySelector('.flex-row') ||
      nameEl.parentElement?.querySelector('.flex-row')
    );

    if (!actionsContainer) return;

    const btn = document.createElement('button');
    btn.id = 'leadjin-capture-btn';
    btn.textContent = '+ LEADJIN';
    btn.style.cssText = `
      display:inline-flex;align-items:center;gap:6px;
      padding:8px 16px;border-radius:24px;
      background:#3182ce;color:#fff;border:none;
      font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;
      cursor:pointer;margin-left:8px;transition:opacity 0.2s;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    `;
    btn.onmouseenter = () => btn.style.opacity = '0.85';
    btn.onmouseleave = () => btn.style.opacity = '1';

    btn.addEventListener('click', async () => {
      btn.textContent = 'Saving...';
      btn.disabled = true;

      const lead = extractProfile();

      chrome.runtime.sendMessage({ type: 'ADD_LEAD', lead }, (response) => {
        if (chrome.runtime.lastError || response?.error) {
          btn.textContent = 'Failed';
          btn.style.background = '#ef4444';
          setTimeout(() => { btn.textContent = '+ LEADJIN'; btn.style.background = '#3182ce'; btn.disabled = false; }, 2000);
        } else {
          btn.textContent = 'Saved!';
          btn.style.background = '#10b981';
          setTimeout(() => { btn.textContent = '+ LEADJIN'; btn.style.background = '#3182ce'; btn.disabled = false; }, 2000);
        }
      });
    });

    actionsContainer.appendChild(btn);
    injected = true;
  }

  // Retry injection — LinkedIn is SPA, DOM loads late
  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;
    injectButton();
    if (injected || attempts > 20) clearInterval(interval);
  }, 500);

  // Re-run on navigation (LinkedIn SPA)
  let lastPath = window.location.pathname;
  let navInterval = null;
  
  const navObserver = new MutationObserver(() => {
    if (window.location.pathname !== lastPath) {
      lastPath = window.location.pathname;
      injected = false;
      attempts = 0;
      if (navInterval) clearInterval(navInterval);
      if (window.location.pathname.startsWith('/in/')) {
        let navAttempts = 0;
        navInterval = setInterval(() => {
          navAttempts++;
          injectButton();
          if (injected || navAttempts > 20) {
            clearInterval(navInterval);
            navInterval = null;
          }
        }, 500);
      }
    }
  });
  navObserver.observe(document.body, { childList: true, subtree: true });
})();
