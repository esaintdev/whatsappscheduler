const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { uploadsDir } = require('./paths');
const { getStatus, getGroups, logout, initWhatsApp } = require('./wa-client');
const { enqueueMessage } = require('./queue');
const { addJob, deleteJob, stopJob } = require('./scheduler');
const { getDB } = require('./database');
const { parseContacts, startBroadcast, getProgress, getHistory, stopBroadcast } = require('./broadcast');

// 1. WhatsApp Status
router.get('/status', (req, res) => {
  res.json(getStatus());
});

// 1b. Log out and clear the linked session
router.post('/logout', async (req, res) => {
  try {
    await logout();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
  // Start a fresh session so a new QR appears without a manual restart
  setTimeout(() => {
    initWhatsApp().catch((e) => console.error('re-init after logout failed:', e));
  }, 500);
  res.json({ ok: true, loggedOut: true });
});

// 2. Get Groups
router.get('/groups', async (req, res) => {
  try {
    const groups = await getGroups();
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Send Message Now
router.post('/send', async (req, res) => {
  const { groupId, groupName, message } = req.body;
  if (!groupId || !message) {
    return res.status(400).json({ error: 'groupId and message are required' });
  }

  try {
    // Add to rate-limited queue
    enqueueMessage(groupId, groupName || 'Unknown Group', message);
    res.json({ success: true, message: 'Message queued for sending' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Schedule Message
router.post('/schedule', (req, res) => {
  const { groupId, groupName, message, cronExpression } = req.body;
  if (!groupId || !message || !cronExpression) {
    return res.status(400).json({ error: 'groupId, message, and cronExpression are required' });
  }

  const job = addJob(groupId, groupName || 'Unknown Group', message, cronExpression);
  if (job) {
    res.json({ success: true, job });
  } else {
    res.status(400).json({ error: 'Failed to schedule job (invalid cron?)' });
  }
});

// 5. Get Scheduled Jobs
router.get('/jobs', (req, res) => {
  try {
    const db = getDB();
    const jobs = db.prepare('SELECT * FROM scheduled_jobs ORDER BY created_at DESC').all();
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Delete Scheduled Job
router.delete('/jobs/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    deleteJob(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Get Message History
router.get('/history', (req, res) => {
  try {
    const db = getDB();
    const history = db.prepare('SELECT * FROM message_history ORDER BY sent_at DESC LIMIT 50').all();
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 8. Parse a pasted list/CSV into valid, deduped phone numbers
router.post('/broadcast/parse', (req, res) => {
  try {
    const contacts = parseContacts((req.body || {}).input);
    res.json({ total: contacts.length, contacts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 9. Start a broadcast to a pasted list of numbers
router.post('/broadcast', async (req, res) => {
  const { contacts, message, image, delayMs, concurrency } = req.body || {};
  const numbers = parseContacts(contacts || '');
  if (numbers.length === 0) {
    return res.status(400).json({ error: 'No valid phone numbers found in the list.' });
  }
  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: 'Message text is required.' });
  }
  try {
    // Fire and forget; progress is tracked via /broadcast/progress
    startBroadcast({
      contacts: numbers,
      msg: message,
      image: image || null,
      delayMs: Math.max(500, Number(delayMs) || 3000),
      concurrency: Math.min(6, Math.max(1, Number(concurrency) || 2)),
    }).catch((e) => console.error('Broadcast failed:', e));
    res.json({ ok: true, started: numbers.length });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 10. Live broadcast progress
router.get('/broadcast/progress', (req, res) => {
  res.json(getProgress());
});

// 11. Broadcast history
router.get('/broadcast/history', (req, res) => {
  try {
    res.json(getHistory(Number(req.query.limit) || 100));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 12. Stop a running broadcast
router.post('/broadcast/stop', (req, res) => {
  stopBroadcast();
  res.json({ ok: true });
});

// 13. Upload an image (base64) -> returns a usable URL for a broadcast
router.post('/broadcast/media', (req, res) => {
  try {
    const dataUrl = ((req.body || {}).base64 || '').toString();
    const match = dataUrl.match(/^data:image\/([a-zA-Z0-9]+);base64,([\s\S]+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid image data. Upload a valid image.' });
    }
    let ext = match[1].toLowerCase();
    if (ext === 'jpeg') ext = 'jpg';
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length) return res.status(400).json({ error: 'Empty image.' });

    const dir = uploadsDir;
    fs.mkdirSync(dir, { recursive: true });
    const name = `bc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
    fs.writeFileSync(path.join(dir, name), buffer);

    res.json({ ok: true, url: `${req.protocol}://${req.get('host')}/uploads/${name}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
