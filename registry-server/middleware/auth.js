const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'sbio_cloud_jwt_secret_key_12345!';

/**
 * Middleware to authenticate developer requests using JWT.
 * Expects header: Authorization: Bearer <token>
 */
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access denied. No authentication token provided.' });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET);

    // Fetch user from database
    const userRes = await db.query(
      'SELECT id, email, name, created_at FROM users WHERE id = $1',
      [decoded.id]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'User not found or token invalid.' });
    }

    // Attach user information to request object
    req.user = userRes.rows[0];
    next();
  } catch (error) {
    console.error('Authentication middleware error:', error.message);
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

module.exports = {
  authenticateUser,
  JWT_SECRET
};
