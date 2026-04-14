const fs = require('fs');
const path = require('path');
const http = require('http');

const dist = '/app/dist';
const PORT = process.env.PORT || 3000;

const mime = {
  'html': 'text/html',
  'js': 'application/javascript',
  'css': 'text/css',
  'png': 'image/png',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'svg': 'image/svg+xml',
  'ico': 'image/x-icon',
  'json': 'application/json',
  'woff': 'font/woff',
  'woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  // Clean URL
  let url = req.url.split('?')[0];
  
  // Default to index.html for SPA routing
  let filePath = path.join(dist, url === '/' ? 'index.html' : url);
  
  // Fallback to index.html for SPA routing (when file not found)
  if (!fs.existsSync(filePath)) {
    filePath = path.join(dist, 'index.html');
  }
  
  const ext = path.extname(filePath).slice(1);
  const contentType = mime[ext] || 'text/plain';
  
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`Static server running on port ${PORT}`);
});