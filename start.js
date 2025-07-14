const os = require('os');

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    
    for (const interfaceName in interfaces) {
        const networkInterface = interfaces[interfaceName];
        
        for (const connection of networkInterface) {
            // Skip internal (loopback) and non-IPv4 addresses
            if (connection.family === 'IPv4' && !connection.internal) {
                return connection.address;
            }
        }
    }
    
    return 'localhost';
}

console.log('=== Traffic Camera Server Setup ===');
console.log(`Local IP Address: ${getLocalIP()}`);
console.log(`Server will run on: https://${getLocalIP()}:3000`);
console.log(`\nFor port forwarding, use:`);
console.log(`- Internal IP: ${getLocalIP()}`);
console.log(`- Internal Port: 3000`);
console.log(`- External Port: 3000 (or your choice)`);
console.log(`\nStarting server...`);

// Start the main server
require('./server.js');
