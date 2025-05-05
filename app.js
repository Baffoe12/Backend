const express = require('express');
const corsMiddleware = require('./middleware/cors');

const app = express();

// Middleware
app.use(corsMiddleware);
app.use(express.json());  // Add JSON parsing middleware

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ time: new Date().toISOString(), status: 'ok' });
});

// Sensor data endpoints
let lastSensorData = null;

app.post('/api/sensor', (req, res) => {
  try {
    lastSensorData = { ...req.body, timestamp: new Date().toISOString() };
    res.json({ status: 'ok' });
  } catch (error) {
    res.status(400).json({ error: 'Invalid sensor data' });
  }
});

app.get('/api/sensor', (req, res) => {
  if (!lastSensorData) {
    return res.status(404).json({ error: 'No sensor data available' });
  }
  res.json(lastSensorData);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});

app.get('/api/download/sensor', (req, res) => {
  if (!lastSensorData) {
  return res.status(404).json({ error: 'No sensor data available for download' });
  }
  res.json([lastSensorData]); // Return as array to simulate multiple records
  });

module.exports = app;