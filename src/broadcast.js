const { getSock } = require('./wa-client');
const { getDB } = require('./database');

/**
 * Broadcast engine: sends a message (optionally with an image) to a list of
 * individual phone numbers, paced by a delay + small concurrency pool.
 * Fully independent from the group scheduler/queue — no shared mutable state.
 */

const progress = {
  running: false,
  campaign: null,
  total: 0,
  done: 0,
  sent: 0,
  failed: 0,
  lastError: null,
};

let numbers = [];       // array of plain digits (no jid yet)
let text = '';
let imageBuffer = null; // downloaded once, reused across sends
let stopFlag = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Extract valid E.164 phone numbers from free text / CSV.
 * Accepts "1 555 123 4567", "+2348012345678", "15551234567", CSV columns...
 * Dedupes. Returns a clean array of plain digits.
 */
function parseContacts(input) {
  const seen = new Set();
  const out = [];
  for (const raw of String(input || '').split(/\r?\n|,|;|\t/)) {
    const digits = raw.replace(/[^\d]/g, '');
    if (digits.length >= 10 && digits.length <= 15 && !seen.has(digits)) {
      seen.add(digits);
      out.push(digits);
    }
  }
  return out;
}

async function downloadImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to download image (HTTP ' + res.status + ')');
  return Buffer.from(await res.arrayBuffer());
}

function makeCampaignTag() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Start a broadcast. Numbers already validated via parseContacts().
 * Fire-and-forget: resolves once the run finishes (or is stopped).
 */
async function startBroadcast({ contacts, msg, image, delayMs, concurrency }) {
  if (progress.running) throw new Error('A broadcast is already running. Wait or Stop it first.');

  const sock = getSock();
  if (!sock) throw new Error('WhatsApp client not connected. Scan the QR first.');

  numbers = [...contacts];
  text = String(msg || '').trim();
  imageBuffer = image ? await downloadImage(image) : null;
  stopFlag = false;

  progress.running = true;
  progress.campaign = makeCampaignTag();
  progress.total = numbers.length;
  progress.done = progress.sent = progress.failed = 0;
  progress.lastError = null;

  const db = getDB();
  const insert = db.prepare(
    'INSERT INTO broadcast_history (campaign, contact, message, status, error_message) VALUES (?, ?, ?, ?, ?)',
  );

  let idx = 0;
  const worker = async () => {
    while (idx < numbers.length && !stopFlag) {
      const number = numbers[idx++];
      const jid = number + '@s.whatsapp.net';
      // Small random jitter keeps the cadence looking more human
      const wait = delayMs + Math.floor(Math.random() * Math.max(500, delayMs * 0.5));
      await sleep(wait);
      try {
        if (imageBuffer) {
          await sock.sendMessage(jid, { image: imageBuffer, caption: text });
        } else {
          await sock.sendMessage(jid, { text });
        }
        insert.run(progress.campaign, number, text, 'sent', null);
        progress.sent++;
      } catch (e) {
        insert.run(progress.campaign, number, text, 'failed', e.message);
        progress.failed++;
        progress.lastError = e.message;
      }
      progress.done++;
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  progress.running = false;
}

function getProgress() {
  return { ...progress };
}

function getHistory(limit) {
  const db = getDB();
  return db.prepare('SELECT * FROM broadcast_history ORDER BY id DESC LIMIT ?').all(limit || 100);
}

function stopBroadcast() {
  stopFlag = true;
}

module.exports = {
  parseContacts,
  startBroadcast,
  getProgress,
  getHistory,
  stopBroadcast,
};