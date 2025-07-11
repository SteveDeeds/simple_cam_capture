# Cloudflare Tunnel Setup Guide

## Why Cloudflare Tunnel?
- **No port forwarding needed** - keeps your home network secure
- **Free SSL certificate** - automatic HTTPS
- **DDoS protection** - Cloudflare shields your home IP
- **Custom domain** - professional looking URL
- **No public IP exposure** - your home IP stays hidden

## Step-by-Step Setup

### 1. Install Cloudflared
Download from: https://github.com/cloudflare/cloudflared/releases
```powershell
# Windows - download cloudflared.exe and put in your project folder
```

### 2. Authenticate with Cloudflare
```powershell
.\cloudflared.exe tunnel login
```
This opens a browser to authenticate with your Cloudflare account (free signup if needed).

### 3. Create a Tunnel
```powershell
.\cloudflared.exe tunnel create traffic-cameras
```
This creates a tunnel and gives you a tunnel ID.

### 4. Create Configuration File
Create `config.yml` in your project directory:
```yaml
tunnel: YOUR_TUNNEL_ID
credentials-file: C:\Users\YourUser\.cloudflared\YOUR_TUNNEL_ID.json

ingress:
  - hostname: traffic-cameras.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

### 5. Create DNS Record
```powershell
.\cloudflared.exe tunnel route dns traffic-cameras traffic-cameras.yourdomain.com
```

### 6. Run the Tunnel
```powershell
.\cloudflared.exe tunnel run traffic-cameras
```

### 7. Start Your App
In another terminal:
```powershell
node server.js
```

Your app is now accessible at: `https://traffic-cameras.yourdomain.com`
