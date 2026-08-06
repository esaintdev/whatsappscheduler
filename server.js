require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./src/database');
const { initWhatsApp } = require('./src/wa-client');
const { initScheduler } = require('./src/scheduler');
const apiRoutes = require('./src/api');
const { uploadsDir } = require('./src/paths');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// API Routes
app.use('/api', apiRoutes);


async function startServer() {
  try {
    // 1. Initialize SQLite Database
    console.log('Initializing database...');
    initDB();

    // 2. Initialize WhatsApp Client
    console.log('Initializing WhatsApp Client...');
    await initWhatsApp();

    // 3. Initialize Node-Cron Scheduler
    console.log('Initializing Scheduler...');
    initScheduler();

    // 4. Start HTTP Server
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
