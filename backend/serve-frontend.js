const path = require('path');
const express = require('express');
const logger = require('./logger');

module.exports = function setupFrontend(app) {
  const frontendPath = path.join(__dirname, 'frontend');
  
  // Custom static file serving with logging for index.html requests
  app.use(express.static(frontendPath));
  
  // For SPA: serve index.html for any non-API route
  app.get(/^\/(?!api).*/, async (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    await logger.info(`Frontend page requested: ${req.path} from IP ${ip}`, 'FRONTEND');
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
};