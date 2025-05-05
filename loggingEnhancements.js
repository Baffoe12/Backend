/**
 * loggingEnhancements.js
 * Add this module to enhance error logging and environment variable checks.
 */

function checkEnvVars() {
  const requiredVars = ['DATABASE_URL', 'SAFEDRIVE_API_KEY', 'NODE_ENV'];
  requiredVars.forEach((key) => {
    if (!process.env[key]) {
      console.error(`ERROR: Environment variable ${key} is not set.`);
    } else {
      console.log(`Environment variable ${key} is set.`);
    }
  });
}

function setupGlobalErrorHandlers() {
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });
}

module.exports = {
  checkEnvVars,
  setupGlobalErrorHandlers,
};
