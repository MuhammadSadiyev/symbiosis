const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const db = require('./db');

// Import controllers
const authController = require('./controllers/auth');
const agentsController = require('./controllers/agents');
const logsController = require('./controllers/logs');

// Import middleware
const { authenticateUser } = require('./middleware/auth');
const { authLimiter, apiLimiter, logLimiter } = require('./middleware/rateLimit');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable JSON trust proxy for correct rate limiting on Railway/Cloud
app.set('trust proxy', 1);

// Global Middlewares
app.use(cors());
app.use(compression());
app.use(express.json());

// Serve Web Dashboard Static Files
app.use(express.static(path.join(__dirname, 'public')));

// ---------------- API ROUTES ----------------

// Developer Authentication
app.post('/api/auth/signup', authLimiter, authController.signup);
app.post('/api/auth/login', authLimiter, authController.login);
app.get('/api/auth/me', authenticateUser, authController.getMe);

// Middleware to handle IDs with slashes decoded by Railway/Nginx
const handleSlashId = (req, res, next) => {
  if (req.params.namespace) {
    req.params.id = req.params.namespace + '/' + req.params.id;
  }
  next();
};

// Agent Registry CRUD
app.get('/api/agents', apiLimiter, agentsController.listAgents);
app.get('/api/agents/:id', apiLimiter, agentsController.getAgentById);
app.get('/api/agents/:namespace/:id', apiLimiter, handleSlashId, agentsController.getAgentById);
app.post('/api/agents', apiLimiter, authenticateUser, agentsController.registerAgent);
app.delete('/api/agents/:id', apiLimiter, authenticateUser, agentsController.deleteAgent);
app.delete('/api/agents/:namespace/:id', apiLimiter, authenticateUser, handleSlashId, agentsController.deleteAgent);
app.post('/api/agents/:id/ping', apiLimiter, agentsController.pingAgent);
app.post('/api/agents/:namespace/:id/ping', apiLimiter, handleSlashId, agentsController.pingAgent);

// Telemetry & Logs
app.post('/api/logs', logLimiter, logsController.createLog);
app.get('/api/logs', apiLimiter, logsController.getLogs);
app.get('/api/agents/:id/logs', apiLimiter, logsController.getAgentLogs);

// System Telemetry Statistics (For Dashboard Widgets)
app.get('/api/stats', apiLimiter, async (req, res) => {
  try {
    const agentsCount = await db.query('SELECT COUNT(*) FROM agents WHERE status = \'active\'');
    const logsCount = await db.query('SELECT COUNT(*) FROM logs');
    const developersCount = await db.query('SELECT COUNT(*) FROM users');
    
    // Count active agents in last hour (agents that sent logs)
    const activeAgentsRes = await db.query(
      `SELECT COUNT(DISTINCT agent_id) 
       FROM logs 
       WHERE timestamp > NOW() - INTERVAL '1 hour'`
    );

    res.json({
      total_agents: parseInt(agentsCount.rows[0].count),
      total_logs: parseInt(logsCount.rows[0].count),
      total_developers: parseInt(developersCount.rows[0].count),
      active_agents_1h: parseInt(activeAgentsRes.rows[0].count)
    });
  } catch (error) {
    console.error('Stats query error:', error);
    res.status(500).json({ error: 'Failed to retrieve stats.' });
  }
});

// Serve public/index.html for any client-side routes (Single Page App)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize database schema and start server
const startServer = async () => {
  try {
    // Attempt DB schema creation
    await db.initDb();
    
    app.listen(PORT, () => {
      console.log(`===================================================`);
      console.log(`🚀 Symbiosis Backend Registry running on port ${PORT}`);
      console.log(`🌍 Dashboard available at http://localhost:${PORT}`);
      console.log(`===================================================`);
    });
  } catch (err) {
    console.error('CRITICAL: Server failed to start due to database initialization error:', err);
    process.exit(1);
  }
};

startServer();
