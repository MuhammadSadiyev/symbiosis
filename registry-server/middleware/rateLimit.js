const rateLimit = require('express-rate-limit');

// Limiter for authentication endpoints (signup/login)
const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 signup/login requests per minute
  message: {
    error: 'Too many authentication attempts from this IP, please try again after a minute.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limiter for standard API endpoints (listing, search)
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 100 requests per minute
  message: {
    error: 'Too many API requests from this IP, please slow down.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limiter for log sending (high throughput but protected)
const logLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 500, // Limit agent logs to 500 requests per minute per IP
  message: {
    error: 'Log limit exceeded. Agent is generating traffic too fast.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  authLimiter,
  apiLimiter,
  logLimiter
};
