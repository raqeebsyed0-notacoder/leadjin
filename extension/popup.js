/**
 * LEADJIN Extension — Popup script
 * Auth-aware: stores Bearer token in chrome.storage, passes it on all API calls.
 */

const API_BASE = 'http://localhost:3001';

async function getToken() {
  const { leadjinToken } = await chrome.storage.local.get('leadjinToken');
  return leadjinToken || null;
}

async function apiFetch(path, options = {}) {
  const token = await getToken();
  
  // D-06: Add request timeout (8 seconds default)
  const timeoutMs = options.timeout || 8000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    
    // D-05: Clear token on 401 Unauthorized
    if (res.status === 401) {
      await chrome.storage.local.remove('leadjinToken');
    }
    
    return res;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function init() {
  const token = await getToken();
  if (!token) {
    showLoginView();
  } else {
    showDashboardView();
  }
}

function showLoginView() {
  const body = document.body;
  body.innerHTML = `
    <div style="padding:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;min-height:100vh;color:#fff;">
      <div style="margin-bottom:20px;">
        <span style="font-size:13px;font-weight:900;letter-spacing:0.2em;color:#3182ce;">LEADJIN</span>
      </div>
      <p style="font-size:10px;opacity:0.4;text-transform:uppercase;letter-spacing:0.2em;margin-bottom:16px;">Sign in to your account</p>
      <input id="email" type="email" placeholder="Email" style="width:100%;padding:10px 12px;background:rgba(49,130,206,0.08);border:1px solid rgba(49,130,206,0.2);border-radius:8px;color:#fff;font-size:12px;margin-bottom:8px;outline:none;box-sizing:border-box;" />
      <input id="password" type="password" placeholder="Password" style="width:100%;padding:10px 12px;background:rgba(49,130,206,0.08);border:1px solid rgba(49,130,206,0.2);border-radius:8px;color:#fff;font-size:12px;margin-bottom:12px;outline:none;box-sizing:border-box;" />
      <button id="login-btn" style="width:100%;padding:11px;background:#3182ce;color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.15em;cursor:pointer;">Sign In</button>
      <p id="login-error" style="font-size:10px;color:#ef4444;margin-top:8px;text-align:center;display:none;"></p>
    </div>
  `;

  document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const errEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');

    if (!email || !password) { errEl.textContent = 'Enter email and password.'; errEl.style.display = 'block'; return; }

    btn.textContent = 'Signing in...';
    btn.disabled = true;

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error('Invalid credentials');
      const data = await res.json();
      if (!data.token) throw new Error('No token returned');
      await chrome.storage.local.set({ leadjinToken: data.token });
      showDashboardView();
    } catch (err) {
      errEl.textContent = err.message || 'Login failed.';
      errEl.style.display = 'block';
      btn.textContent = 'Sign In';
      btn.disabled = false;
    }
  });

  document.getElementById('password').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('login-btn').click();
  });
}

async function showDashboardView() {
  const dot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const leadList = document.getElementById('lead-list');
  const tierBadge = document.getElementById('tier-badge');

  if (!dot) {
    // Re-render full UI if body was replaced
    document.body.innerHTML = `
      <div class="header" style="padding:16px 20px;border-bottom:1px solid rgba(49,130,206,0.2);display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:13px;font-weight:900;letter-spacing:0.2em;color:#3182ce;">LEADJIN</span>
        <span id="tier-badge" style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;padding:2px 8px;border-radius:9999px;background:rgba(49,130,206,0.15);color:#3182ce;">Basic</span>
      </div>
      <button id="open-app" style="display:block;width:calc(100% - 32px);margin:16px auto 0;padding:10px;background:#3182ce;color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.15em;cursor:pointer;">Open Full Dashboard →</button>
      <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.25em;color:rgba(255,255,255,0.4);padding:12px 20px 8px;">Recent Leads</div>
      <div id="lead-list" style="padding:0 12px 48px;"><div style="text-align:center;padding:32px 20px;font-size:11px;color:rgba(255,255,255,0.25);">Loading...</div></div>
      <div style="padding:8px 20px;font-size:9px;color:rgba(255,255,255,0.3);border-top:1px solid rgba(255,255,255,0.06);position:fixed;bottom:0;width:100%;background:#0a0a0a;display:flex;justify-content:space-between;align-items:center;">
        <span><span id="status-dot" style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#10b981;margin-right:5px;vertical-align:middle;"></span><span id="status-text">Connecting...</span></span>
        <button id="logout-btn" style="background:none;border:none;color:rgba(255,255,255,0.3);font-size:9px;cursor:pointer;text-transform:uppercase;letter-spacing:0.1em;">Sign out</button>
      </div>
    `;
    document.getElementById('open-app').addEventListener('click', () => chrome.tabs.create({ url: API_BASE }));
    document.getElementById('logout-btn').addEventListener('click', async () => {
      await chrome.storage.local.remove('leadjinToken');
      showLoginView();
    });
  }

  try {
    const res = await apiFetch('/api/health', { timeout: 3000 });
    if (!res.ok) throw new Error('Server error');
    document.getElementById('status-dot').style.background = '#10b981';
    document.getElementById('status-text').textContent = 'Connected';

    const meRes = await apiFetch('/api/auth/me');
    if (meRes.ok) {
      const me = await meRes.json();
      const badge = document.getElementById('tier-badge');
      const plan = me.subscription_plan || 'basic';
      badge.textContent = plan.charAt(0).toUpperCase() + plan.slice(1);
      if (plan !== 'basic') { badge.style.background = 'rgba(16,185,129,0.15)'; badge.style.color = '#10b981'; }
    } else if (meRes.status === 401) {
      // Token already cleared by apiFetch, just show login
      showLoginView();
      return;
    }

    const leadsRes = await apiFetch('/api/leads');
    if (leadsRes.status === 401) { showLoginView(); return; }
    const leads = await leadsRes.json();
    renderLeads(Array.isArray(leads) ? leads.slice(0, 5) : [], document.getElementById('lead-list'));
  } catch (err) {
    document.getElementById('status-dot').style.background = '#ef4444';
    document.getElementById('status-text').textContent = 'Cannot reach server';
    document.getElementById('lead-list').innerHTML = '<div style="text-align:center;padding:32px 20px;font-size:11px;color:rgba(255,255,255,0.25);line-height:1.6;">Start LEADJIN locally to see your leads.<br/>Run: npm run dev</div>';
  }
}

function renderLeads(leads, container) {
  if (!leads || leads.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:32px 20px;font-size:11px;color:rgba(255,255,255,0.25);line-height:1.6;">No leads yet.<br/>Visit a LinkedIn profile and click "Add to LEADJIN".</div>';
    return;
  }
  container.innerHTML = leads.map(lead => `
    <div style="padding:10px 12px;border-radius:10px;background:rgba(49,130,206,0.06);border:1px solid rgba(49,130,206,0.12);margin-bottom:6px;">
      <span style="float:right;font-size:10px;font-weight:700;color:#3182ce;background:rgba(49,130,206,0.1);padding:2px 7px;border-radius:6px;margin-top:1px;">${lead.lead_score || '—'}</span>
      <div style="font-size:12px;font-weight:600;">${escapeHtml(lead.name || 'Unknown')}</div>
      <div style="font-size:10px;color:rgba(255,255,255,0.45);margin-top:2px;">${escapeHtml(lead.title || '')}${lead.title && lead.company ? ' · ' : ''}${escapeHtml(lead.company || '')}</div>
    </div>
  `).join('');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

init();
