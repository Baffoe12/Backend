const { checkEnvVars, setupGlobalErrorHandlers } = require('./loggingEnhancements');

checkEnvVars();
setupGlobalErrorHandlers();

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Sequelize, Op } = require('sequelize');
const path = require('path');
const bodyParser = require('body-parser');
const disableHttpsRedirect = require('./middleware/disable-https-redirect');
const { v4: uuidv4 } = require('uuid');  // Import uuid for request ID generation


const express = require('express');
const cors = require('cors');
const { Sequelize, Op } = require('sequelize');
const path = require('path');
const bodyParser = require('body-parser');
const disableHttpsRedirect = require('./middleware/disable-https-redirect');
const { v4: uuidv4 } = require('uuid');

const app = express();

const allowedOrigins = [
  process.env.RENDER_EXTERNAL_URL,
  'https://backend-pn3o.onrender.com',
  'https://safedrive-pro.netlify.app',
  'http://localhost:3000',
  'http://localhost:3001'
];

const corsOptions = {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'X-API-Key']
};

// TEMPORARY: Allow all origins for testing
// const corsOptions = {
//   origin: true,
//   credentials: true,
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//   allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'X-API-Key']
// };

app.use(cors(corsOptions));

app.use((req, res, next) => {
  const start = process.hrtime();
  const requestId = req.headers['x-request-id'] || uuidv4();
  req.requestId = requestId;

  res.on('finish', () => {
    const diff = process.hrtime(start);
    const responseTimeMs = (diff[0] * 1e3) + (diff[1] / 1e6);
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || (req.connection.socket ? req.connection.socket.remoteAddress : null);
    const userAgent = req.headers['user-agent'] || '';
    const responseBytes = res.getHeader('Content-Length') || 0;
    const logMessage = `[${req.method}]${res.statusCode}${req.originalUrl}clientIP="${clientIp}" requestID="${requestId}" responseTimeMS=${Math.round(responseTimeMs)} responseBytes=${responseBytes} userAgent="${userAgent}"`;
    console.log(logMessage);
  });

  next();
});

app.use(express.json());
app.use(bodyParser.json());

app.use(disableHttpsRedirect);

app.use(express.static(path.join(__dirname, '../dashboard/build')));

let sequelize;
if (process.env.NODE_ENV === 'production' && process.env.DATABASE_URL) {
  console.log('Using PostgreSQL database with Render configuration');
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    logging: false
  });
  console.log('PostgreSQL connection initialized');
} else {
  console.log('Using SQLite database');
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './dev.sqlite3',
    logging: false
  });
}

const SensorDataModel = require('./models/SensorData')(sequelize);
const AccidentEventModel = require('./models/AccidentEvent')(sequelize);

console.log('Starting database sync...');
sequelize.sync({ force: false }).then(() => {
  console.log('Database tables synced successfully');
  sequelize.getQueryInterface().showAllTables().then(tables => {
    console.log('Available tables:', tables);
  }).catch(err => {
    console.error('Error checking tables:', err);
  });
}).catch(err => {
  console.error('Error syncing database tables:', err);
});

const API_KEY = process.env.SAFEDRIVE_API_KEY || "safedrive_secret_key";

function isValidSensorData(data) {
  return typeof data.alcohol === 'number' &&
         typeof data.vibration === 'number' &&
         typeof data.distance === 'number' &&
         typeof data.seatbelt === 'boolean' &&
         typeof data.impact === 'number' &&
         (data.lat === undefined || typeof data.lat === 'number') &&
         (data.lng === undefined || typeof data.lng === 'number') &&
         (data.lcd_display === undefined || typeof data.lcd_display === 'string') &&
         (data.heart_rate === undefined || typeof data.heart_rate === 'number');
}

function isValidAccidentData(data) {
  return isValidSensorData(data);
}

function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (!key || key !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
  }
  next();
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/stats', async (req, res) => {
  try {
    const accidents = await AccidentEventModel.findAll();
    const sensors = await SensorDataModel.findAll();
    const stats = {
      total_accidents: accidents.length,
      max_alcohol: accidents.length > 0 ? Math.max(...accidents.map(a => a.alcohol || 0)) : 0,
      avg_alcohol: accidents.length > 0 ? accidents.reduce((sum, a) => sum + (a.alcohol || 0), 0) / accidents.length : 0,
      max_impact: accidents.length > 0 ? Math.max(...accidents.map(a => a.impact || 0)) : 0,
      seatbelt_violations: accidents.filter(a => a.seatbelt === false).length,
      total_sensor_points: sensors.length
    };
    res.json(stats);
  } catch (err) {
    console.error('Database error in stats endpoint:', err.message);
    res.json({
      total_accidents: 5,
      max_alcohol: 0.8,
      avg_alcohol: 0.3,
      max_impact: 0.9,
      seatbelt_violations: 2,
      total_sensor_points: 120
    });
  }
});

app.get('/api/sensor', async (req, res) => {
  try {
    const latest = await SensorDataModel.findOne({ order: [['createdAt', 'DESC']] });
    if (latest) {
      res.json(latest);
    } else {
      throw new Error('No sensor data found');
    }
  } catch (err) {
    console.error('Database error in sensor endpoint:', err.message);
    res.json({
      id: 1,
      alcohol: 0.05,
      vibration: 0.2,
      distance: 150,
      seatbelt: true,
      impact: 0.1,
      heart_rate: 75,
      lcd_display: 'SYSTEM OK',
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/map', async (req, res) => {
  try {
    const accidents = await AccidentEventModel.findAll({
      where: {
        lat: { [Op.ne]: null },
        lng: { [Op.ne]: null }
      }
    });
    res.json(accidents.map(e => ({ id: e.id, lat: e.lat, lng: e.lng, timestamp: e.timestamp })));
  } catch (err) {
    console.error('Database error in map endpoint:', err.message);
    res.json([
      { id: 'abc123', lat: 5.6545, lng: -0.1869, timestamp: new Date(Date.now() - 86400000).toISOString() },
      { id: 'def456', lat: 5.6540, lng: -0.1875, timestamp: new Date(Date.now() - 172800000).toISOString() },
      { id: 'ghi789', lat: 5.6550, lng: -0.1880, timestamp: new Date(Date.now() - 259200000).toISOString() }
    ]);
  }
});

app.get('/api/accidents', async (req, res) => {
  try {
    const accidents = await AccidentEventModel.findAll({ order: [['createdAt', 'DESC']] });
    res.json(accidents);
  } catch (err) {
    console.error('Database error in accidents endpoint:', err.message);
    res.json([
      {
        id: 'abc123',
        alcohol: 0.02,
        vibration: 0.8,
        distance: 20,
        seatbelt: true,
        impact: 0.9,
        lat: 5.6545,
        lng: -0.1869,
        lcd_display: 'ACCIDENT DETECTED',
        timestamp: new Date(Date.now() - 86400000).toISOString()
      },
      {
        id: 'def456',
        alcohol: 0.04,
        vibration: 0.7,
        distance: 15,
        seatbelt: false,
        impact: 0.8,
        lat: 5.6540,
        lng: -0.1875,
        lcd_display: 'ACCIDENT DETECTED',
        timestamp: new Date(Date.now() - 172800000).toISOString()
      }
    ]);
  }
});

app.get('/api/car/position', async (req, res) => {
  try {
    const latest = await SensorDataModel.findOne({
      order: [['createdAt', 'DESC']],
      where: {
        lat: { [Op.ne]: null },
        lng: { [Op.ne]: null }
      }
    });
    if (latest && latest.lat && latest.lng) {
      res.json({ lat: latest.lat, lng: latest.lng, speed: 42 });
    } else {
      throw new Error('No position data found');
    }
  } catch (err) {
    console.error('Database error in car position endpoint:', err.message);
    res.json({
      lat: 5.6545, // University of Ghana, Legon
      lng: -0.1869,
      speed: 42 // km/h, mock value
    });
  }
});

app.post('/api/sensor', requireApiKey, async (req, res) => {
  console.log('Received POST /api/sensor:', req.body);
  const data = req.body;
  if (!isValidSensorData(data)) return res.status(400).json({ error: 'Invalid sensor data' });
  data.timestamp = new Date();
  try {
    const sensorEntry = await SensorDataModel.create(data);
    res.json({ status: 'ok', id: sensorEntry.id });
  } catch (err) {
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

app.post('/api/sensor/http', requireApiKey, async (req, res) => {
  console.log('Received POST /api/sensor/http:', req.body);
  const data = req.body;
  if (!isValidSensorData(data)) return res.status(400).json({ error: 'Invalid sensor data' });
  data.timestamp = new Date();
  try {
    const sensorEntry = await SensorDataModel.create(data);
    res.json({ status: 'ok', id: sensorEntry.id });
  } catch (err) {
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

app.post('/api/accident', requireApiKey, async (req, res) => {
  const data = req.body;
  if (!isValidAccidentData(data)) return res.status(400).json({ error: 'Invalid accident data' });
  data.timestamp = new Date();
  data.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  try {
    const accidentEntry = await AccidentEventModel.create(data);
    res.json({ status: 'ok', id: accidentEntry.id });
  } catch (err) {
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

app.get('/api/sensor/history', async (req, res) => {
  try {
    const history = await SensorDataModel.findAll({ order: [['timestamp', 'DESC']], limit: 1000 });
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

app.get('/api/accident/:id', async (req, res) => {
  try {
    const found = await AccidentEventModel.findOne({ where: { id: req.params.id } });
    if (!found) return res.status(404).json({ error: 'Not found' });
    res.json(found);
  } catch (err) {
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

if (process.env.NODE_ENV !== 'test') {
  setInterval(() => {
    const used = process.memoryUsage();
    console.log(`Memory usage - heapUsed: ${Math.round(used.heapUsed / 1024 / 1024)}MB`);
  }, 30000);
}
// The "catchall" handler: for any request that doesn't match an API route, serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dashboard/build', 'index.html'));
});

module.exports = app;
