const crypto = require('crypto');
const db = require('../db');

/**
 * Hash an agent API key using SHA-256
 */
const hashApiKey = (apiKey) => {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
};

/**
 * Register or update an agent
 */
const registerAgent = async (req, res) => {
  const { id, name, description, endpoint, skills, tags, schema_in, schema_out } = req.body;
  const userId = req.user.id;

  if (!id || !name || !endpoint) {
    return res.status(400).json({ error: 'Agent ID, name, and endpoint are required.' });
  }

  // Validate agent ID format (e.g., must be like namespace/agent-name, no special characters except / and -)
  const idRegex = /^[a-z0-9-]+\/[a-z0-9-]+$/;
  if (!idRegex.test(id)) {
    return res.status(400).json({ 
      error: 'Agent ID must be in format "namespace/agent-name" (lowercase letters, numbers, and dashes only, separated by a single slash).' 
    });
  }

  try {
    // Check if agent already exists
    const existingAgentRes = await db.query('SELECT * FROM agents WHERE id = $1', [id]);
    const exists = existingAgentRes.rows.length > 0;

    let apiKey = null;
    let apiKeyHash = null;

    if (exists) {
      const existingAgent = existingAgentRes.rows[0];
      // Check ownership
      if (existingAgent.user_id !== userId) {
        return res.status(403).json({ error: 'Permission denied. You do not own this Agent.' });
      }

      // If updating, we keep the old hash unless rotating
      apiKeyHash = existingAgent.api_key_hash;
      if (req.body.rotate_token) {
        apiKey = 'sbio_tkn_' + crypto.randomBytes(24).toString('hex');
        apiKeyHash = hashApiKey(apiKey);
      }

      // Update agent
      await db.query(
        `UPDATE agents 
         SET name = $1, description = $2, endpoint = $3, skills = $4, tags = $5, 
             schema_in = $6, schema_out = $7, api_key_hash = $8
         WHERE id = $9`,
        [
          name, 
          description || existingAgent.description, 
          endpoint, 
          skills || existingAgent.skills, 
          tags || existingAgent.tags, 
          schema_in ? JSON.stringify(schema_in) : existingAgent.schema_in, 
          schema_out ? JSON.stringify(schema_out) : existingAgent.schema_out, 
          apiKeyHash,
          id
        ]
      );

      return res.json({
        message: 'Agent updated successfully.',
        agent: { id, name, endpoint },
        token: apiKey // Will be null unless rotated
      });
    } else {
      // Create a brand new agent
      apiKey = 'sbio_tkn_' + crypto.randomBytes(24).toString('hex');
      apiKeyHash = hashApiKey(apiKey);

      await db.query(
        `INSERT INTO agents (id, user_id, name, description, endpoint, api_key_hash, skills, tags, schema_in, schema_out)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          id,
          userId,
          name,
          description || null,
          endpoint,
          apiKeyHash,
          skills || [],
          tags || [],
          schema_in ? JSON.stringify(schema_in) : '{}',
          schema_out ? JSON.stringify(schema_out) : '{}'
        ]
      );

      return res.status(201).json({
        message: 'Agent registered successfully.',
        agent: { id, name, endpoint },
        token: apiKey // Return plain token ONCE
      });
    }
  } catch (error) {
    console.error('Agent registration error:', error);
    res.status(500).json({ error: 'Internal server error during agent registration.' });
  }
};

/**
 * List, search, and filter agents
 */
const listAgents = async (req, res) => {
  const { q, skill, tag, limit = 20, offset = 0 } = req.query;

  try {
    let queryText = 'SELECT id, user_id, name, description, endpoint, skills, tags, schema_in, schema_out, status, created_at FROM agents WHERE status = \'active\'';
    const queryParams = [];

    // Add search filter (name, description, id)
    if (q) {
      queryParams.push(`%${q}%`);
      queryText += ` AND (name ILIKE $${queryParams.length} OR description ILIKE $${queryParams.length} OR id ILIKE $${queryParams.length})`;
    }

    // Add skill filter (GIN array intersection/contains)
    if (skill) {
      queryParams.push([skill]);
      queryText += ` AND skills @> $${queryParams.length}`;
    }

    // Add tag filter
    if (tag) {
      queryParams.push([tag]);
      queryText += ` AND tags @> $${queryParams.length}`;
    }

    // Add pagination
    queryParams.push(parseInt(limit));
    queryText += ` ORDER BY created_at DESC LIMIT $${queryParams.length}`;

    queryParams.push(parseInt(offset));
    queryText += ` OFFSET $${queryParams.length}`;

    const agentsRes = await db.query(queryText, queryParams);

    // Get total count for pagination headers
    const countRes = await db.query('SELECT COUNT(*) FROM agents WHERE status = \'active\'');
    const totalCount = parseInt(countRes.rows[0].count);

    res.json({
      agents: agentsRes.rows,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('List agents error:', error);
    res.status(500).json({ error: 'Internal server error fetching agents.' });
  }
};

/**
 * Get detailed information about an agent
 */
const getAgentById = async (req, res) => {
  const { id } = req.params;

  try {
    const agentRes = await db.query(
      'SELECT id, user_id, name, description, endpoint, skills, tags, schema_in, schema_out, status, created_at FROM agents WHERE id = $1',
      [id]
    );

    if (agentRes.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found.' });
    }

    res.json({ agent: agentRes.rows[0] });
  } catch (error) {
    console.error('Get agent error:', error);
    res.status(500).json({ error: 'Internal server error fetching agent details.' });
  }
};

/**
 * Delete an agent
 */
const deleteAgent = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    // Find agent first to check ownership
    const agentRes = await db.query('SELECT user_id FROM agents WHERE id = $1', [id]);

    if (agentRes.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found.' });
    }

    if (agentRes.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Permission denied. You do not own this Agent.' });
    }

    await db.query('DELETE FROM agents WHERE id = $1', [id]);
    res.json({ message: 'Agent deleted successfully.' });
  } catch (error) {
    console.error('Delete agent error:', error);
    res.status(500).json({ error: 'Internal server error deleting agent.' });
  }
};

module.exports = {
  registerAgent,
  listAgents,
  getAgentById,
  deleteAgent,
  hashApiKey
};
