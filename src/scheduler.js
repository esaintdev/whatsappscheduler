const cron = require('node-cron');
const { getDB } = require('./database');
const { enqueueMessage } = require('./queue');

const activeJobs = new Map(); // Store active cron tasks

function initScheduler() {
  const db = getDB();
  // Load all active jobs from DB and schedule them
  const jobs = db.prepare('SELECT * FROM scheduled_jobs WHERE is_active = 1').all();
  
  jobs.forEach(job => {
    scheduleJob(job);
  });
}

function scheduleJob(job) {
  // Validate cron expression
  if (!cron.validate(job.cron_expression)) {
    console.error(`Invalid cron expression for job ${job.id}: ${job.cron_expression}`);
    return false;
  }

  const task = cron.schedule(job.cron_expression, () => {
    console.log(`Executing scheduled job ${job.id} for group ${job.group_id}`);
    enqueueMessage(job.group_id, job.group_name, job.message)
      .catch(err => console.error(`Scheduled job ${job.id} failed:`, err));
  });

  activeJobs.set(job.id, task);
  return true;
}

function addJob(groupId, groupName, message, cronExpression) {
  const db = getDB();
  const info = db.prepare(
    'INSERT INTO scheduled_jobs (group_id, group_name, message, cron_expression) VALUES (?, ?, ?, ?)'
  ).run(groupId, groupName, message, cronExpression);

  const job = {
    id: info.lastInsertRowid,
    group_id: groupId,
    group_name: groupName,
    message: message,
    cron_expression: cronExpression,
    is_active: 1
  };

  const success = scheduleJob(job);
  return success ? job : null;
}

function deleteJob(jobId) {
  const db = getDB();
  db.prepare('DELETE FROM scheduled_jobs WHERE id = ?').run(jobId);
  
  const task = activeJobs.get(jobId);
  if (task) {
    task.stop();
    activeJobs.delete(jobId);
  }
}

function stopJob(jobId) {
  const db = getDB();
  db.prepare('UPDATE scheduled_jobs SET is_active = 0 WHERE id = ?').run(jobId);
  
  const task = activeJobs.get(jobId);
  if (task) {
    task.stop();
    activeJobs.delete(jobId);
  }
}

module.exports = {
  initScheduler,
  addJob,
  deleteJob,
  stopJob
};
