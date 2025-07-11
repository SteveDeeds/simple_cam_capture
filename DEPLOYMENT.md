# Traffic Camera App Deployment Guide

## 🚀 Quick Deployment Options

### Option 1: Railway (Recommended for your use case)
1. **Sign up**: Create account at railway.app
2. **Connect repo**: Link your GitHub repository
3. **Add storage**: Attach a volume for persistent files
4. **Deploy**: Railway auto-deploys from your repo

**Cost**: ~$5-10/month for your storage needs

### Option 2: DigitalOcean App Platform
1. **Create account**: Sign up at digitalocean.com
2. **Create app**: Use "Deploy from GitHub"
3. **Add storage**: Attach a managed volume
4. **Configure**: Set environment variables

**Cost**: ~$12/month for basic app + storage

### Option 3: Heroku + AWS S3
1. **Deploy app**: Push to Heroku
2. **Add storage**: Use AWS S3 for images
3. **Modify code**: Update to use S3 instead of local files

**Cost**: ~$7/month + S3 storage costs

## 🔧 Pre-Deployment Checklist

### 1. Environment Variables
Create these in your hosting platform:
```
NODE_ENV=production
PORT=3000
CAPTURED_IMAGES_DIR=/app/data/captured_images
SAVED_IMAGES_DIR=/app/data/saved_images
DB_FILE=/app/data/image_views.json
```

### 2. Package.json Scripts
Ensure you have:
```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  }
}
```

### 3. Dockerfile (if using containerization)
Use the provided Dockerfile for container deployment.

## 📊 Storage Strategy

### Current Size: ~600MB-1GB
- **Images**: 95% of storage
- **Database**: <1MB
- **App code**: <10MB

### Optimization Options:
1. **Image compression**: Reduce quality slightly
2. **Old file cleanup**: Delete images older than X days
3. **External storage**: Move to cloud storage (S3, Cloudinary)

## 🔄 Migration to Firebase (Future)

Your current JSON database structure is Firebase-ready:
```javascript
// Current structure
{
  "views": {
    "camera_name/filename": { ... }
  }
}

// Firebase structure (same!)
database.ref('views/camera_name_filename').set({ ... })
```

## 💡 Cost Optimization Tips

### 1. Image Management
```javascript
// Add to server.js - Auto cleanup old files
function cleanupOldImages() {
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
  // Delete files older than maxAge
}
```

### 2. Image Compression
```javascript
// Modify camera capture to compress
await sharp(buffer)
  .jpeg({ quality: 70 }) // Reduce quality
  .toFile(outputPath);
```

### 3. Storage Monitoring
```javascript
// Add storage usage endpoint
app.get('/api/storage-usage', (req, res) => {
  // Calculate and return storage stats
});
```

## 🎯 Recommended Deployment Path

For your specific needs (1GB storage, growing files):

1. **Start with Railway**: Easy setup, good for prototyping
2. **Monitor costs**: Track storage growth
3. **Optimize**: Implement file cleanup and compression
4. **Scale**: Move to DigitalOcean if you need more control

## 📝 Next Steps

1. Choose a hosting platform
2. Set up deployment pipeline
3. Configure environment variables
4. Test with a small dataset
5. Implement monitoring and cleanup

Would you like help with any specific deployment option?
