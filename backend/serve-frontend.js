const path = require('path');
const express = require('express');

module.exports = function setupFrontend(app) {
  const frontendPath = path.join(__dirname, 'frontend');
  app.use(express.static(frontendPath));
  
  // For SPA: serve index.html for any non-API route
  app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
};