# Simple Port Forwarding Setup Guide

## 🏠 Make Your Traffic Camera App Accessible from the Internet

### Step 1: Find Your Computer's Local IP Address

**On Windows:**
```powershell
ipconfig
```
Look for "IPv4 Address" - it will be something like `192.168.1.100` or `10.0.0.50`

**Alternative method:**
1. Press Windows + R
2. Type `cmd` and press Enter
3. Type `ipconfig` and press Enter

### Step 2: Find Your Router's Admin Interface

**Common router addresses (try these in your browser):**
- `http://192.168.1.1`
- `http://192.168.0.1` 
- `http://10.0.0.1`
- `http://192.168.1.254`

**Login credentials are usually:**
- Username: `admin`, Password: `admin`
- Username: `admin`, Password: `password`
- Check the label on your router for defaults

### Step 3: Set Up Port Forwarding

**Look for these menu items in your router:**
- "Port Forwarding"
- "Virtual Servers"
- "Applications & Gaming"
- "NAT/Gaming"
- "Advanced" → "Port Forwarding"

**Create a new rule:**
- **Service Name:** Traffic Cameras
- **Internal IP:** Your computer's IP from Step 1 (e.g., `192.168.1.100`)
- **Internal Port:** `3000`
- **External Port:** `3000` (or choose a different one like `8080`)
- **Protocol:** TCP
- **Enable:** Yes/On

### Step 4: Find Your Public IP Address

**Visit one of these websites:**
- https://whatismyip.com
- https://ipinfo.io
- https://www.whatismyipaddress.com

**Your public IP will look like:** `73.123.45.67`

### Step 5: Test Your Setup

1. **Start your traffic camera server:**
   ```powershell
   cd "c:\Users\stdeeds\Documents\GitHub\simple_cam_capture"
   node server.js
   ```

2. **Test locally first:**
   - Open browser to `http://localhost:3000`
   - Make sure it works

3. **Test from outside:**
   - Use your phone's mobile data (not WiFi)
   - Go to `http://YOUR_PUBLIC_IP:3000`
   - Or ask a friend to try it

### Step 6: Share Your Traffic Camera System

**Your public URL will be:**
```
http://YOUR_PUBLIC_IP:3000
```

**Example:**
```
http://73.123.45.67:3000
```

## 🔧 Troubleshooting

### If it doesn't work:

1. **Check Windows Firewall:**
   ```powershell
   # Allow Node.js through firewall
   netsh advfirewall firewall add rule name="Traffic Camera App" dir=in action=allow protocol=TCP localport=3000
   ```

2. **Verify port forwarding:**
   - Use online port checker: https://www.yougetsignal.com/tools/open-ports/
   - Enter your public IP and port 3000

3. **Check router settings:**
   - Make sure the rule is enabled
   - Some routers need a restart after adding rules
   - Check if there's a "Gaming Mode" or "DMZ" option

4. **ISP restrictions:**
   - Some ISPs block residential port forwarding
   - Try a different external port (like 8080 or 8888)
   - Contact your ISP if needed

## 🛡️ Security Tips

1. **Change the default port:**
   - Use port 8080 or 8888 instead of 3000
   - Update your server: `const PORT = process.env.PORT || 8080;`

2. **Monitor access:**
   - Check your router logs for unusual activity
   - Consider setting up basic authentication

3. **Keep your system updated:**
   - Regular Windows updates
   - Update Node.js and npm packages

## 📱 Mobile Access

Your traffic camera system will work great on phones:
- Responsive design works on all screen sizes
- Touch-friendly zoom and click features
- Works on both iOS and Android

## 🔄 Keeping It Running

**To keep the server running 24/7:**
1. **Use PM2 (recommended):**
   ```powershell
   npm install -g pm2
   pm2 start server.js --name "traffic-cameras"
   pm2 startup
   pm2 save
   ```

2. **Or create a Windows service**
3. **Or use Task Scheduler to restart on boot**
