# Security Recommendations for Home Hosting

## Basic Security Headers
Add to your server.js before routes:

```javascript
// Security middleware
app.use((req, res, next) => {
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    
    // Prevent MIME sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // XSS protection
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    next();
});
```

## Rate Limiting
```bash
npm install express-rate-limit
```

Add to server.js:
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP'
});

app.use(limiter);
```

## Environment Variables for Production
Create `.env` file:
```
NODE_ENV=production
PORT=3000
CAPTURED_IMAGES_DIR=/home/data/captured_images
SAVED_IMAGES_DIR=/home/data/saved_images
DB_FILE=/home/data/image_views.json
```

## Firewall Rules
- Only allow port 3000 (or whatever you use)
- Block all other ports
- Consider using Cloudflare Tunnel to avoid opening any ports

## Monitoring
- Check logs regularly
- Monitor disk space (images grow over time)
- Set up alerts for high CPU/memory usage

## Backup Strategy
- Regular backup of image_views.json database
- Consider backing up recent images
- Test restore procedures
