const { getSock } = require('./wa-client');
const { getDB } = require('./database');

const messageQueue = [];
let isProcessing = false;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MESSAGE_DELAY = parseInt(process.env.MESSAGE_DELAY_MS || '3000', 10);

function enqueueMessage(groupId, groupName, messageText) {
  return new Promise((resolve, reject) => {
    messageQueue.push({ groupId, groupName, messageText, resolve, reject });
    processQueue();
  });
}

async function processQueue() {
  if (isProcessing || messageQueue.length === 0) return;
  isProcessing = true;

  const db = getDB();

  while (messageQueue.length > 0) {
    const { groupId, groupName, messageText, resolve, reject } = messageQueue.shift();
    const sock = getSock();

    if (!sock) {
      db.prepare('INSERT INTO message_history (group_id, group_name, message, status, error_message) VALUES (?, ?, ?, ?, ?)').run(groupId, groupName, messageText, 'failed', 'WhatsApp client not connected');
      reject(new Error('WhatsApp client not connected'));
      continue;
    }

    try {
      await sock.sendMessage(groupId, { text: messageText });
      db.prepare('INSERT INTO message_history (group_id, group_name, message, status) VALUES (?, ?, ?, ?)').run(groupId, groupName, messageText, 'sent');
      resolve({ success: true });
    } catch (error) {
      console.error(`Failed to send message to ${groupId}:`, error);
      db.prepare('INSERT INTO message_history (group_id, group_name, message, status, error_message) VALUES (?, ?, ?, ?, ?)').run(groupId, groupName, messageText, 'failed', error.message);
      reject(error);
    }

    // Wait before sending the next message to avoid rate limits
    if (messageQueue.length > 0) {
      await delay(MESSAGE_DELAY);
    }
  }

  isProcessing = false;
}

module.exports = { enqueueMessage };
