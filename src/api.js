const express = require('express');
const router = express.Router();
const { getStatus, getGroups } = require('./wa-client');
const { enqueueMessage } = require('./queue');
const { addJob, deleteJob, stopJob } = require('./scheduler');
const { getDB } = require('./database');

// 1. WhatsApp Status
router.get('/status', (req, res) => {
  res.json(getStatus());
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

module.exports = router;
