const path = require('path');
const fs = require('fs');

/**
 * All stateful data lives under one directory so it can be mounted as a
 * persistent volume (e.g. Railway Volumes set DATA_DIR=/data).
 * With no DATA_DIR set, it stays in the project root — same as before.
 */
const ROOT = process.env.DATA_DIR || path.join(__dirname, '..');

const paths = {
  root: ROOT,
  authDir: path.join(ROOT, 'auth_info'),
  dbPath: path.join(ROOT, 'database.sqlite'),
  uploadsDir: path.join(ROOT, 'uploads'),
};

function ensureDirs() {
  for (const d of [paths.root, paths.authDir, paths.uploadsDir]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

module.exports = { ...paths, ensureDirs };