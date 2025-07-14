const https = require('https');

const options = {
  host: 'localhost',
  port: process.env.PORT || 3000,
  path: '/api/stats',
  timeout: 2000,
  // Allow self-signed certificates for local development
  rejectUnauthorized: false
};

const request = https.request(options, (res) => {
  if (res.statusCode === 200) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

request.on('error', () => {
  process.exit(1);
});

request.end();
