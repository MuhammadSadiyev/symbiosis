const crypto = require('crypto');
const db = require('../db');
const { hashApiKey } = require('./agents');

/**
 * Log an agent transaction or operation.
 * Requires Agent Token in headers: x-agent-token
 */
const createLog = async (req, res) => {
  const { message, type = 'info', caller_agent_id = null, payload = {} } = req.body;
  const agentToken = req.headers['x-agent-token'];

  if (!agentToken) {
    return res.status(401).json({ error: 'Authentication required. Please provide "x-agent-token" header.' });
  }

  if (!message) {
    return res.status(400).json({ error: 'Log message is required.' });
  }

  const validTypes = ['info', 'call', 'error'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: `Invalid log type. Must be one of: ${validTypes.join(', ')}` });
  }

  try {
    // Hash token to compare with DB
    const tokenHash = hashApiKey(agentToken);

    // Look up agent
    const agentRes = await db.query(
      'SELECT id, name FROM agents WHERE api_key_hash = $1',
      [tokenHash]
    );

    if (agentRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid agent token.' });
    }

    const agentId = agentRes.rows[0].id;

    // Optional: verify caller agent exists if specified
    if (caller_agent_id) {
      const callerCheck = await db.query('SELECT id FROM agents WHERE id = $1', [caller_agent_id]);
      if (callerCheck.rows.length === 0) {
        return res.status(400).json({ error: `Caller agent "${caller_agent_id}" does not exist.` });
      }
    }

    // Insert log
    const logRes = await db.query(
      `INSERT INTO logs (agent_id, caller_agent_id, type, message, payload)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, agent_id, caller_agent_id, type, message, payload, timestamp`,
      [agentId, caller_agent_id || null, type, message, JSON.stringify(payload)]
    );

    res.status(201).json({
      message: 'Log entry saved.',
      log: logRes.rows[0]
    });
  } catch (error) {
    console.error('Create log error:', error);
    res.status(500).json({ error: 'Internal server error saving log.' });
  }
};

/**
 * Fetch recent system-wide logs (paginated)
 */
const getLogs = async (req, res) => {
  const { limit = 50, offset = 0 } = req.query;

  try {
    const cappedLimit = Math.min(parseInt(limit), 100); // Prevent loading too many rows at once
    
    // Select logs and join agents to display friendly names
    const logsRes = await db.query(
      `SELECT 
        l.id, l.agent_id, l.caller_agent_id, l.type, l.message, l.payload, l.timestamp,
        a.name as agent_name,
        c.name as caller_name
       FROM logs l
       JOIN agents a ON l.agent_id = a.id
       LEFT JOIN agents c ON l.caller_agent_id = c.id
       ORDER BY l.timestamp DESC 
       LIMIT $1 OFFSET $2`,
      [cappedLimit, parseInt(offset)]
    );

    res.json({ logs: logsRes.rows });
  } catch (error) {
    console.error('Fetch logs error:', error);
    res.status(500).json({ error: 'Internal server error fetching logs.' });
  }
};

/**
 * Fetch logs for a specific agent
 */
const getAgentLogs = async (req, res) => {
  const { id } = req.params;
  const { limit = 50, offset = 0 } = req.query;

  try {
    const cappedLimit = Math.min(parseInt(limit), 100);

    const logsRes = await db.query(
      `SELECT 
        l.id, l.agent_id, l.caller_agent_id, l.type, l.message, l.payload, l.timestamp,
        a.name as agent_name,
        c.name as caller_name
       FROM logs l
       JOIN agents a ON l.agent_id = a.id
       LEFT JOIN agents c ON l.caller_agent_id = c.id
       WHERE l.agent_id = $1 OR l.caller_agent_id = $1
       ORDER BY l.timestamp DESC
       LIMIT $2 OFFSET $3`,
      [id, cappedLimit, parseInt(offset)]
    );

    res.json({ logs: logsRes.rows });
  } catch (error) {
    console.error('Fetch agent logs error:', error);
    res.status(500).json({ error: 'Internal server error fetching agent logs.' });
  }
};

module.exports = {
  createLog,
  getLogs,
  getAgentLogs
};
