const http = require('http');

const data = JSON.stringify({ username: 'testadmin', password: 'MyTestPass123!' });

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/auth/super-login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, res => {
  let responseData = '';
  res.on('data', chunk => responseData += chunk);
  res.on('end', () => console.log('Response:', responseData));
});

req.on('error', error => console.error('Error:', error));
req.write(data);
req.end();
