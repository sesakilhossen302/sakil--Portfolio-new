const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.ico': 'image/x-icon',
};

function getSafeFilePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    decoded = urlPath.split('?')[0].split('#')[0];
  }

  // Normalize windows/posix paths
  const relativePath = decoded.replace(/^\/+/, '');
  const filePath = path.resolve(ROOT_DIR, relativePath);

  // Prevent directory traversal outside ROOT_DIR
  if (!filePath.startsWith(ROOT_DIR)) {
    return null;
  }
  return filePath;
}

const server = http.createServer((req, res) => {
  // Add permissive CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    return res.end('Method Not Allowed');
  }

  // Serve root index.html directly
  if (req.url === '/' || req.url === '') {
    const rootIndex = path.join(ROOT_DIR, 'index.html');
    return serveFile(rootIndex, req, res);
  }

  let filePath = getSafeFilePath(req.url);
  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Forbidden');
  }

  // Handle clean project routes: /project/:slug or /sakil.com/project/:slug
  if (!fs.existsSync(filePath)) {
    if (fs.existsSync(filePath + '.html')) {
      filePath = filePath + '.html';
    } else if (req.url.startsWith('/project/')) {
      const altPath = path.resolve(ROOT_DIR, 'sakil.com', req.url.slice(1) + '.html');
      if (fs.existsSync(altPath)) {
        filePath = altPath;
      }
    }
  }

  fs.stat(filePath, (err, stats) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end(`404 Not Found: ${req.url}`);
    }

    if (stats.isDirectory()) {
      if (!req.url.endsWith('/')) {
        res.writeHead(301, { Location: req.url + '/' });
        return res.end();
      }
      filePath = path.join(filePath, 'index.html');
      return serveFile(filePath, req, res);
    }

    serveFile(filePath, req, res, stats);
  });
});

function serveFile(filePath, req, res, preloadedStats) {
  const proceed = (stats) => {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const totalSize = stats.size;

    // Support HTTP Range requests (crucial for video/audio)
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (start >= totalSize || end >= totalSize || start > end) {
        res.writeHead(416, {
          'Content-Range': `bytes */${totalSize}`,
        });
        return res.end();
      }

      const chunkSize = end - start + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      });

      if (req.method === 'HEAD') return res.end();
      return fileStream.pipe(res);
    }

    res.writeHead(200, {
      'Content-Length': totalSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
    });

    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  };

  if (preloadedStats) {
    proceed(preloadedStats);
  } else {
    fs.stat(filePath, (err, stats) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('404 Not Found');
      }
      proceed(stats);
    });
  }
}

function startServer(port) {
  server.listen(port, () => {
    const localUrl = `http://localhost:${port}/`;
    console.log(`\n==================================================`);
    console.log(`🚀 Server successfully running!`);
    console.log(`🔗 Local URL: ${localUrl}`);
    console.log(`📂 Serving:   ${ROOT_DIR}`);
    console.log(`💡 Press Ctrl+C to stop the server`);
    console.log(`==================================================\n`);

    // Automatically open the default browser on Windows
    if (process.platform === 'win32') {
      exec(`start ${localUrl}`);
    } else if (process.platform === 'darwin') {
      exec(`open ${localUrl}`);
    } else {
      exec(`xdg-open ${localUrl}`);
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} in use, trying ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });
}

startServer(PORT);
