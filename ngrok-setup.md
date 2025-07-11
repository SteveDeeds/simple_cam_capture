# Quick Internet Access with Ngrok

## Setup (5 minutes)
1. Download ngrok from: https://ngrok.com/download
2. Sign up for free account at ngrok.com
3. Get your auth token from dashboard
4. Extract ngrok.exe to your project folder

## Commands
```powershell
# Authenticate (one time)
.\ngrok.exe authtoken YOUR_AUTH_TOKEN

# Start your server
node server.js

# In another terminal, expose it
.\ngrok.exe http 3000
```

## Result
Ngrok gives you URLs like:
- `https://abc123.ngrok.io` - accessible from anywhere
- Automatically includes HTTPS
- Free tier: 1 tunnel, random URLs

## Use Cases
- Quick demos
- Testing with friends
- Temporary access
- Development sharing
