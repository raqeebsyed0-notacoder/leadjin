/**
 * LEADJIN Extension — Background Service Worker
 * Handles follow-up reminders and backend sync with Bearer token auth.
 */

const API_BASE = 'http://localhost:3001';

async function getToken() {
  const { leadjinToken } = await chrome.storage.local.get('leadjinToken');
  return leadjinToken || null;
}

async function apiFetch(path, options = {}) {
  const token = await getToken();
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
}

// ── Alarm: Follow-up reminders ─────────────────────────────────────────────
chrome.alarms.create('check-followups', { periodInMinutes: 60 });

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === 'check-followups') {
    await checkFollowupReminders();
  }
});

async function checkFollowupReminders() {
  const token = await getToken();
  if (!token) return; // Not logged in — skip
  try {
    const res = await apiFetch('/api/leads');
    if (res.status === 401) {
      chrome.storage.local.remove('leadjinToken');
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
      return;
    }
    if (!res.ok) return;
    const leads = await res.json();
    if (!Array.isArray(leads)) return;
    const now = Date.now();

    for (const lead of leads) {
      if (!lead.last_contacted) continue;
      const lastContact = new Date(lead.last_contacted).getTime();
      const daysSince = (now - lastContact) / (1000 * 60 * 60 * 24);

      if (daysSince >= 7 && lead.status === 'CONTACTED') {
        showNotification(
          `Follow-up due: ${lead.name}`,
          `${lead.name} at ${lead.company} — ${Math.floor(daysSince)} days since last contact.`,
          lead.lead_id
        );
      }
    }
  } catch (err) {
    // Server not running — silent fail
  }
}

function showNotification(title, message, leadId) {
  chrome.notifications.create(`followup-${leadId}`, {
    type: 'basic',
    iconUrl: 'icons/icon-48.png',
    title,
    message,
    priority: 1,
  });
}

// ── Message handler from content/popup ────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'ADD_LEAD') {
    addLeadToBackend(msg.lead).then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (msg.type === 'GET_LEADS') {
    apiFetch('/api/leads')
      .then(r => {
        if (r.status === 401) {
          chrome.storage.local.remove('leadjinToken');
          chrome.action.setBadgeText({ text: '!' });
          chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
          return Promise.resolve([]);
        }
        return r.ok ? r.json() : Promise.resolve([]);
      })
      .then(leads => sendResponse({ leads: Array.isArray(leads) ? leads : [] }))
      .catch(() => sendResponse({ leads: [] }));
    return true;
  }
});

async function addLeadToBackend(lead) {
  const res = await apiFetch('/api/leads/sync', {
    method: 'POST',
    body: JSON.stringify({ leads: [lead] }),
  });
  if (res.status === 401) {
    chrome.storage.local.remove('leadjinToken');
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
    throw new Error('Session expired');
  }
  if (!res.ok) throw new Error(`Sync failed: ${res.status}`);
  return res.json();
}
