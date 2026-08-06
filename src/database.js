const Database = require('better-sqlite3');
const path = require('path');
const { dbPath, ensureDirs } = require('./paths');

let db;

function initDB() {
  ensureDirs();
  db = new Database(dbPath);

  // Create tables if they don't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id TEXT NOT NULL,
      group_name TEXT,
      message TEXT NOT NULL,
      cron_expression TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS message_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id TEXT NOT NULL,
      group_name TEXT,
      message TEXT NOT NULL,
      status TEXT NOT NULL, -- 'sent', 'failed'
      error_message TEXT,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS broadcast_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign TEXT NOT NULL,
      contact TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL, -- 'sent', 'failed'
      error_message TEXT,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function getDB() {
  if (!db) {
    throw new Error("Database not initialized");
  }
  return db;
}

module.exports = {
  initDB,
  getDB
};
