const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, isJidGroup, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const QRCode = require('qrcode');

let sock;
let currentQR = null;
let isConnected = false;

async function initWhatsApp() {
  const authDir = path.join(__dirname, '..', 'auth_info');
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  // Fetch the latest version directly from WA servers to avoid 405 errors
  const { version } = await fetchLatestBaileysVersion();
  console.log(`Connecting to WhatsApp Web v${version.join('.')}`);

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Mac OS', 'Chrome', '121.0.6167.159'], 
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      // Generate QR code data URL for the frontend
      currentQR = await QRCode.toDataURL(qr);
    }

    if (connection === 'close') {
      isConnected = false;
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed. Reconnecting:', shouldReconnect);
      
      if (shouldReconnect) {
        // Delay to prevent bombarding the server in a loop
        setTimeout(() => {
          initWhatsApp();
        }, 3000);
      } else {
        console.log('Logged out. Please delete auth_info folder and restart to scan new QR.');
        currentQR = null;
      }
    } else if (connection === 'open') {
      console.log('Connected to WhatsApp successfully!');
      isConnected = true;
      currentQR = null; // Clear QR once connected
    }
  });

  return sock;
}

function getSock() {
  return sock;
}

function getStatus() {
  return {
    isConnected,
    qr: currentQR
  };
}

async function getGroups() {
  if (!isConnected) return [];
  
  const groups = await sock.groupFetchAllParticipating();
  const groupList = Object.values(groups).map(group => ({
    id: group.id,
    name: group.subject
  }));
  return groupList;
}

module.exports = {
  initWhatsApp,
  getSock,
  getStatus,
  getGroups
};
