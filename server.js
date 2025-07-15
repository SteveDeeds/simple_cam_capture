const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const sharp = require('sharp');
const TrafficCameraDB = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database
const db = new TrafficCameraDB();

// Basic security middleware
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

// Serve the crop dashboard page
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'crop-dashboard.html'));
});

// Serve the crop review page - redirect to preserve query parameters
app.get('/crop-review', (req, res) => {
    const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    res.redirect(`/crop-review2.html${queryString}`);
});

// Serve constants to frontend
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_MAX = 1000; // requests per window (much more generous)

app.use((req, res, next) => {
    // Skip rate limiting for localhost/development
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress;
    
    // Skip rate limiting for localhost
    if (clientIP === '::1' || clientIP?.includes('127.0.0.1')) {
        return next();
    }
    
    const now = Date.now();
    
    if (!rateLimitMap.has(clientIP)) {
        rateLimitMap.set(clientIP, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return next();
    }
    
    const clientData = rateLimitMap.get(clientIP);
    
    if (now > clientData.resetTime) {
        // Reset the window
        rateLimitMap.set(clientIP, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return next();
    }
    
    if (clientData.count >= RATE_LIMIT_MAX) {
        console.log(`Rate limit exceeded for IP: ${clientIP}, count: ${clientData.count}`);
        return res.status(429).json({ 
            error: 'Too many requests. Please try again later.',
            resetTime: new Date(clientData.resetTime).toISOString()
        });
    }
    
    clientData.count++;
    next();
});

// Cloud-friendly paths
const DATA_DIR = process.env.DATA_DIR || __dirname;
const CAPTURED_IMAGES_DIR = process.env.CAPTURED_IMAGES_DIR || path.join(__dirname, 'captured_images');
const SAVED_IMAGES_DIR = process.env.SAVED_IMAGES_DIR || path.join(__dirname, 'saved_images');

// Get client IP address
function getClientIP(req) {
    return req.headers['x-forwarded-for'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           req.ip;
}

// Ensure directories exist
function ensureDirectories() {
    [DATA_DIR, CAPTURED_IMAGES_DIR, SAVED_IMAGES_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
}

// Initialize database on startup
ensureDirectories();

// Migrate from old JSON database if it exists
const oldJsonPath = path.join(DATA_DIR, 'image_views.json');
if (fs.existsSync(oldJsonPath)) {
    console.log('Migrating from old JSON database...');
    db.migrateFromJSON(oldJsonPath);
    // Backup and remove old file
    fs.renameSync(oldJsonPath, oldJsonPath + '.backup');
    console.log('Migration complete. Old file backed up.');
}

// Serve static files (CSS, JS, images)
app.use(express.static('public'));
app.use('/images', express.static(CAPTURED_IMAGES_DIR));
app.use('/saved_images', express.static('saved_images'));

// Parse JSON bodies
app.use(express.json());

// Get list of all cameras
app.get('/api/cameras', (req, res) => {
    try {
        if (!fs.existsSync(CAPTURED_IMAGES_DIR)) {
            return res.json([]);
        }
        
        const cameras = fs.readdirSync(CAPTURED_IMAGES_DIR, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => ({
                name: dirent.name,
                displayName: dirent.name.replace(/_/g, ' ')
            }));
        
        res.json(cameras);
    } catch (error) {
        console.error('Error getting cameras:', error);
        res.status(500).json({ error: 'Failed to get cameras' });
    }
});

// Get images for a specific camera
app.get('/api/cameras/:cameraName/images', (req, res) => {
    try {
        const { cameraName } = req.params;
        const { limit = 50, offset = 0 } = req.query;
        
        const cameraDir = path.join(CAPTURED_IMAGES_DIR, cameraName);
        
        if (!fs.existsSync(cameraDir)) {
            return res.json([]);
        }

        let images = fs.readdirSync(cameraDir)
            .filter(file => file.match(/\.(jpg|jpeg|png|gif)$/i))
            .map(filename => {
                const filepath = path.join(cameraDir, filename);
                const stats = fs.statSync(filepath);
                
                // Get view stats from database
                const viewStats = db.getImageViewStats(cameraName, filename);
                
                return {
                    filename,
                    path: `/images/${cameraName}/${filename}`,
                    timestamp: stats.mtime,
                    size: stats.size,
                    viewCount: viewStats?.total_views || 0,
                    uniqueViewers: viewStats?.unique_viewers || 0,
                    lastViewedAt: viewStats?.last_viewed_at || null,
                    firstViewedAt: viewStats?.first_viewed_at || null
                };
            })
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Newest first
        
        // Apply pagination
        const total = images.length;
        images = images.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
        
        res.json({
            images,
            total,
            offset: parseInt(offset),
            limit: parseInt(limit)
        });
    } catch (error) {
        console.error('Error getting images:', error);
        res.status(500).json({ error: 'Failed to get images' });
    }
});

// Get latest image for each camera
app.get('/api/latest', (req, res) => {
    try {
        const capturedImagesDir = CAPTURED_IMAGES_DIR;
        
        if (!fs.existsSync(capturedImagesDir)) {
            return res.json([]);
        }
        
        const cameras = fs.readdirSync(capturedImagesDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory());
        
        const latestImages = cameras.map(camera => {
            const cameraDir = path.join(capturedImagesDir, camera.name);
            const images = fs.readdirSync(cameraDir)
                .filter(file => file.match(/\.(jpg|jpeg|png|gif)$/i))
                .map(filename => {
                    const filepath = path.join(cameraDir, filename);
                    const stats = fs.statSync(filepath);
                    return {
                        filename,
                        path: `/images/${camera.name}/${filename}`,
                        timestamp: stats.mtime
                    };
                })
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            return {
                camera: camera.name,
                displayName: camera.name.replace(/_/g, ' '),
                latestImage: images.length > 0 ? images[0] : null,
                imageCount: images.length
            };
        });
        
        res.json(latestImages);
    } catch (error) {
        console.error('Error getting latest images:', error);
        res.status(500).json({ error: 'Failed to get latest images' });
    }
});

// Get statistics
app.get('/api/stats', (req, res) => {
    try {
        const capturedImagesDir = CAPTURED_IMAGES_DIR;
        
        if (!fs.existsSync(capturedImagesDir)) {
            return res.json({
                totalCameras: 0,
                totalImages: 0,
                totalSize: 0,
                totalViews: 0,
                uniqueViewers: 0,
                totalCrops: 0
            });
        }
        
        const cameras = fs.readdirSync(capturedImagesDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory());
        
        let totalImages = 0;
        let totalSize = 0;
        
        cameras.forEach(camera => {
            const cameraDir = path.join(capturedImagesDir, camera.name);
            const images = fs.readdirSync(cameraDir)
                .filter(file => file.match(/\.(jpg|jpeg|png|gif)$/i));
            
            totalImages += images.length;
            
            images.forEach(image => {
                const filepath = path.join(cameraDir, image);
                const stats = fs.statSync(filepath);
                totalSize += stats.size;
            });
        });

        // Get database stats
        const dbStats = db.getStats();
        
        res.json({
            totalCameras: cameras.length,
            totalImages,
            totalSize,
            totalSizeMB: Math.round(totalSize / (1024 * 1024) * 100) / 100,
            totalViews: dbStats.totalViews,
            uniqueViewers: dbStats.uniqueViewers,
            totalCrops: dbStats.totalCrops
        });
    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({ error: 'Failed to get statistics' });
    }
});

// Track image view
app.post('/api/track-view', (req, res) => {
    try {
        const { cameraName, filename } = req.body;
        
        if (!cameraName || !filename) {
            return res.status(400).json({ error: 'Missing cameraName or filename' });
        }
        
        const clientIP = getClientIP(req);
        const userAgent = req.headers['user-agent'] || null;
        
        // Record the view in database
        db.recordImageView(cameraName, filename, clientIP, userAgent);
        
        // Get updated stats
        const stats = db.getImageViewStats(cameraName, filename);
        
        res.json({ 
            success: true, 
            viewCount: stats.total_views || 0,
            uniqueViewers: stats.unique_viewers || 0,
            lastViewedAt: stats.last_viewed_at
        });
        
    } catch (error) {
        console.error('Error tracking view:', error);
        res.status(500).json({ error: 'Failed to track view' });
    }
});

// Get least viewed images for a camera
app.get('/api/cameras/:cameraName/least-viewed', (req, res) => {
    try {
        const { cameraName } = req.params;
        const { limit = 10 } = req.query;
        
        // Get all images for this camera
        const cameraDir = path.join(CAPTURED_IMAGES_DIR, cameraName);
        
        if (!fs.existsSync(cameraDir)) {
            return res.json({ images: [] });
        }
        
        const allImages = fs.readdirSync(cameraDir)
            .filter(file => /\.(jpg|jpeg|png|gif)$/i.test(file))
            .map(filename => {
                const filepath = path.join(cameraDir, filename);
                const stats = fs.statSync(filepath);
                
                // Get view stats from database
                const viewStats = db.getImageViewStats(cameraName, filename);
                
                return {
                    filename: filename,
                    path: `/images/${cameraName}/${filename}`,
                    timestamp: stats.mtime.toISOString(),
                    size: stats.size,
                    viewCount: viewStats?.total_views || 0,
                    uniqueViewers: viewStats?.unique_viewers || 0,
                    lastViewedAt: viewStats?.last_viewed_at || null
                };
            });
        
        // Sort by view count (ascending) then by timestamp (newest first)
        const sortedImages = allImages.sort((a, b) => {
            if (a.viewCount !== b.viewCount) {
                return a.viewCount - b.viewCount; // Least viewed first
            }
            return new Date(b.timestamp) - new Date(a.timestamp); // Newest first for ties
        });
        
        const limitedImages = sortedImages.slice(0, parseInt(limit));
        
        res.json({ 
            images: limitedImages,
            totalImages: allImages.length,
            camera: cameraName
        });
        
    } catch (error) {
        console.error('Error getting least viewed images:', error);
        res.status(500).json({ error: 'Failed to get least viewed images' });
    }
});

// Save an image to a special "saved" folder
app.post('/api/save-image', async (req, res) => {
    try {
        const { imagePath, cameraName, timestamp, coordinates } = req.body;
        
        if (!imagePath || !cameraName || !coordinates) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Create saved images directory structure
        const savedDir = SAVED_IMAGES_DIR;
        const savedCameraDir = path.join(savedDir, cameraName);
        
        if (!fs.existsSync(savedDir)) {
            fs.mkdirSync(savedDir);
        }
        if (!fs.existsSync(savedCameraDir)) {
            fs.mkdirSync(savedCameraDir);
        }
        
        // Get the source image path
        // Images are served via /images/ but stored in captured_images/
        // imagePath comes as "/images/camera_name/filename.jpg"
        const imagePathWithoutPrefix = imagePath.replace(/^\/images\//, '');
        const sourceImagePath = path.join(CAPTURED_IMAGES_DIR, imagePathWithoutPrefix);
        
        if (!fs.existsSync(sourceImagePath)) {
            return res.status(404).json({ error: 'Source image not found' });
        }
        
        // Get image metadata
        const imageMetadata = await sharp(sourceImagePath).metadata();
        const { width: imageWidth, height: imageHeight } = imageMetadata;
        
        // Calculate crop area (10% of image width around the click point)
        const cropSize = Math.round(imageWidth * 0.1);
        const halfCrop = cropSize / 2;
        
        // Convert relative coordinates to absolute pixels
        const centerX = Math.round(coordinates.x * imageWidth);
        const centerY = Math.round(coordinates.y * imageHeight);
        
        // Calculate crop bounds, ensuring we don't go outside image
        const left = Math.round(Math.max(0, Math.min(centerX - halfCrop, imageWidth - cropSize)));
        const top = Math.round(Math.max(0, Math.min(centerY - halfCrop, imageHeight - cropSize)));
        const actualCropSize = Math.round(Math.min(cropSize, imageWidth - left, imageHeight - top));
        
        // Create filename with timestamp and coordinates
        const originalFilename = path.basename(imagePath);
        const ext = path.extname(originalFilename);
        const base = path.basename(originalFilename, ext);
        const coordStr = `_x${Math.round(coordinates.x * 100)}_y${Math.round(coordinates.y * 100)}`;
        const savedFilename = `${base}${coordStr}_crop${ext}`;
        const savedImagePath = path.join(savedCameraDir, savedFilename);
        
        // Crop and save the image
        await sharp(sourceImagePath)
            .extract({ 
                left: left, 
                top: top, 
                width: actualCropSize, 
                height: actualCropSize 
            })
            .toFile(savedImagePath);
        
        // Save metadata to file
        const metadataPath = path.join(savedCameraDir, `${path.basename(savedFilename, ext)}.json`);
        const metadata = {
            originalPath: imagePath,
            cameraName,
            timestamp: timestamp || new Date().toISOString(),
            coordinates: coordinates,
            cropArea: {
                left: left,
                top: top,
                width: actualCropSize,
                height: actualCropSize
            },
            originalImageSize: {
                width: imageWidth,
                height: imageHeight
            },
            savedAt: new Date().toISOString(),
            savedByIP: getClientIP(req)
        };
        
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        
        // Save to database
        const cropData = {
            originalCamera: cameraName,
            originalFilename: path.basename(imagePath),
            originalPath: imagePath,
            cropFilename: savedFilename,
            cropFolder: path.relative(__dirname, savedCameraDir),
            clickX: coordinates.x,
            clickY: coordinates.y,
            cropLeft: left,
            cropTop: top,
            cropWidth: actualCropSize,
            cropHeight: actualCropSize,
            originalWidth: imageWidth,
            originalHeight: imageHeight,
            savedByIP: getClientIP(req),
            originalTimestamp: timestamp,
            savedAt: new Date().toISOString(),
            metadata: metadata,
            migratedFromJson: false
        };
        
        db.saveCropRecord(cropData);
        
        res.json({ 
            success: true, 
            savedPath: path.relative(__dirname, savedImagePath),
            filename: savedFilename,
            cropArea: metadata.cropArea
        });
        
    } catch (error) {
        console.error('Error saving image:', error);
        res.status(500).json({ error: 'Failed to save image: ' + error.message });
    }
});

// New database-powered endpoints

// Get detailed view information for an image
app.get('/api/images/:cameraName/:filename/views', (req, res) => {
    try {
        const { cameraName, filename } = req.params;
        const viewStats = db.getImageViewStats(cameraName, filename);
        
        res.json(viewStats);
    } catch (error) {
        console.error('Error getting image views:', error);
        res.status(500).json({ error: 'Failed to get image views' });
    }
});

// Get all saved crops
app.get('/api/saved-crops', (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;
        const crops = db.getAllSavedCrops(parseInt(limit), parseInt(offset));
        
        res.json({
            crops: crops,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('Error getting saved crops:', error);
        res.status(500).json({ error: 'Failed to get saved crops' });
    }
});

// Get saved crops for a specific image
app.get('/api/images/:cameraName/:filename/crops', (req, res) => {
    try {
        const { cameraName, filename } = req.params;
        const crops = db.getSavedCropsForImage(cameraName, filename);
        
        res.json({ crops });
    } catch (error) {
        console.error('Error getting image crops:', error);
        res.status(500).json({ error: 'Failed to get image crops' });
    }
});

// Get comprehensive database statistics
app.get('/api/db-stats', (req, res) => {
    try {
        const stats = db.getStats();
        res.json(stats);
    } catch (error) {
        console.error('Error getting database stats:', error);
        res.status(500).json({ error: 'Failed to get database stats' });
    }
});

// Get statistics for a specific camera
app.get('/api/cameras/:cameraName/stats', async (req, res) => {
    try {
        const { cameraName } = req.params;
        // Decode the camera name from URL encoding
        const decodedCameraName = decodeURIComponent(cameraName);
        
        // Get all images for this camera
        const cameraImages = await getCameraImages(decodedCameraName);
        
        if (!cameraImages || cameraImages.length === 0) {
            return res.json({
                totalImages: 0,
                unviewedImages: 0,
                lastImage: null,
                viewStats: {
                    totalViews: 0,
                    uniqueViewers: 0
                }
            });
        }
        
        // Get view statistics for all images from this camera
        const imageStatsPromises = cameraImages.map(async (image) => {
            try {
                const stats = db.getImageViewStats(decodedCameraName, image.filename);
                return {
                    filename: image.filename,
                    path: image.path,
                    timestamp: image.timestamp,
                    views: stats.total_views || 0,
                    uniqueViewers: stats.unique_viewers || 0
                };
            } catch (error) {
                return {
                    filename: image.filename,
                    path: image.path,
                    timestamp: image.timestamp,
                    views: 0,
                    uniqueViewers: 0
                };
            }
        });
        
        const imageStats = await Promise.all(imageStatsPromises);
        
        // Calculate summary statistics
        const totalImages = imageStats.length;
        const unviewedImages = imageStats.filter(img => img.views === 0).length;
        const lastImage = imageStats.length > 0 ? imageStats[imageStats.length - 1] : null;
        
        const totalViews = imageStats.reduce((sum, img) => sum + img.views, 0);
        const totalUniqueViewers = Math.max(...imageStats.map(img => img.uniqueViewers), 0);
        
        res.json({
            totalImages,
            unviewedImages,
            lastImage,
            viewStats: {
                totalViews,
                uniqueViewers: totalUniqueViewers
            },
            images: imageStats
        });
        
    } catch (error) {
        console.error('Error getting camera stats:', error);
        res.status(500).json({ error: 'Failed to get camera statistics' });
    }
});

// Helper function to get images for a specific camera
async function getCameraImages(cameraName) {
    try {
        const cameraDir = path.join(CAPTURED_IMAGES_DIR, cameraName);
        
        if (!fs.existsSync(cameraDir)) {
            return [];
        }
        
        const files = await fs.promises.readdir(cameraDir);
        const imageFiles = files
            .filter(file => /\.(jpg|jpeg|png)$/i.test(file))
            .map(file => {
                const filePath = path.join(cameraDir, file);
                const stats = fs.statSync(filePath);
                return {
                    filename: file,
                    path: `/images/${cameraName}/${file}`,
                    timestamp: stats.mtime,
                    size: stats.size
                };
            })
            .sort((a, b) => a.timestamp - b.timestamp);
        
        return imageFiles;
    } catch (error) {
        console.error(`Error getting images for camera ${cameraName}:`, error);
        return [];
    }
}

// Crop Review API Endpoints

// Get unreviewed crops
app.get('/api/crops/unreviewed', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const crops = db.getUnreviewedCrops(limit);
        console.log(`🔍 DEBUG: Raw unreviewed crops from DB: ${crops.length}`);
        
        // Filter out test data and crops without valid file paths
        const validCrops = crops.filter(crop => {
            const hasFolder = !!crop.crop_folder;
            const hasFilename = !!crop.crop_filename;
            const notTestCamera = !crop.crop_folder?.includes('test_camera');
            const notTestImage = !crop.crop_filename?.includes('test_image');
            
            return hasFolder && hasFilename && notTestCamera && notTestImage;
        });
        
        console.log(`🔍 DEBUG: Valid crops after filtering: ${validCrops.length}`);
        
        // Add metadata about filtered crops for better user feedback
        const response = {
            crops: validCrops,
            metadata: {
                total_found: crops.length,
                valid_crops: validCrops.length,
                filtered_out: crops.length - validCrops.length,
                has_only_test_data: crops.length > 0 && validCrops.length === 0
            }
        };
        
        // For backward compatibility, if limit=1 and we want just the array
        if (parseInt(req.query.limit) === 1) {
            res.json(validCrops);
        } else {
            res.json(response);
        }
    } catch (error) {
        console.error('Error getting unreviewed crops:', error);
        res.status(500).json({ error: 'Failed to get unreviewed crops' });
    }
});

// Get the most recent crop (regardless of review status)
app.get('/api/crops/most-recent', (req, res) => {
    try {
        const crop = db.getMostRecentCrop();
        
        if (!crop) {
            return res.status(404).json({ error: 'No crops found' });
        }
        
        res.json(crop);
    } catch (error) {
        console.error('Error getting most recent crop:', error);
        res.status(500).json({ error: 'Failed to get most recent crop' });
    }
});

// Get a specific crop by ID
app.get('/api/crops/:cropId', (req, res) => {
    try {
        const { cropId } = req.params;
        const cropData = db.getSavedCropById(parseInt(cropId));
        
        if (!cropData) {
            return res.status(404).json({ error: 'Crop not found' });
        }
        
        res.json(cropData);
    } catch (error) {
        console.error('Error getting crop:', error);
        res.status(500).json({ error: 'Failed to get crop' });
    }
});

// Get review for a specific crop
app.get('/api/crops/:cropId/review', (req, res) => {
    try {
        const { cropId } = req.params;
        const cropData = db.getSavedCropById(parseInt(cropId));
        
        if (!cropData) {
            return res.status(404).json({ error: 'Crop not found' });
        }
        
        const review = db.getCropReview(parseInt(cropId));
        
        // If review exists, get factors data
        let factors = null;
        if (review) {
            const positiveFactors = db.getPositiveFactorsForReview(review.id);
            const negativeFactors = db.getNegativeFactorsForReview(review.id);
            factors = {
                positive: positiveFactors,
                negative: negativeFactors
            };
        }
        
        // Return both crop data and review data with factors
        res.json({
            crop: cropData,
            review: review || null,
            factors: factors
        });
    } catch (error) {
        console.error('Error getting crop review:', error);
        res.status(500).json({ error: 'Failed to get crop review' });
    }
});

// Save or update crop review with factors support
app.post('/api/crops/:cropId/review', (req, res) => {
    try {
        const { cropId } = req.params;
        const { 
            notes, 
            is_jonathan, 
            activities, 
            top_clothing, 
            reviewed_at,
            positive_factors = [],
            negative_factors = []
        } = req.body;
        const reviewedByIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress;
        
        // Save the basic review data
        const result = db.saveCropReview(
            parseInt(cropId),
            notes,
            is_jonathan,
            activities,
            top_clothing,
            reviewedByIP,
            reviewed_at
        );
        
        // Get the review ID (either newly created or existing)
        const review = db.getCropReview(parseInt(cropId));
        if (review) {
            // Set factors for this review
            db.setFactorsForReview(review.id, positive_factors, negative_factors);
        }
        
        res.json({ 
            success: true, 
            cropId: parseInt(cropId),
            changes: result.changes,
            factors_updated: true
        });
    } catch (error) {
        console.error('Error saving crop review:', error);
        res.status(500).json({ error: 'Failed to save crop review' });
    }
});

// Delete a crop
app.delete('/api/crops/:cropId', (req, res) => {
    try {
        const { cropId } = req.params;
        console.log(`🗑️ DELETE request for crop ID: ${cropId}`);
        
        const result = db.deleteCrop(parseInt(cropId));
        console.log(`🗑️ Delete result:`, result);
        
        if (result.changes > 0) {
            console.log(`✅ Crop ${cropId} deleted successfully`);
            res.json({ 
                success: true, 
                message: 'Crop deleted successfully',
                cropId: parseInt(cropId)
            });
        } else {
            console.log(`❌ Crop ${cropId} not found in database`);
            res.status(404).json({ error: 'Crop not found' });
        }
    } catch (error) {
        console.error('Error deleting crop:', error);
        res.status(500).json({ error: 'Failed to delete crop' });
    }
});

// Get crop statistics for dashboard
app.get('/api/crop-stats', (req, res) => {
    try {
        const stats = db.getCropReviewStats();
        
        // Map database field names to expected frontend field names
        const formattedStats = stats ? {
            total_crops: stats.total_crops || 0,
            total_reviews: stats.total_reviews || 0,
            classified_crops: stats.classified_crops || 0,
            reviewed_crops: stats.classified_crops || 0, // alias for compatibility
            unreviewed_crops: stats.never_reviewed || 0, // map never_reviewed to unreviewed_crops
            never_reviewed: stats.never_reviewed || 0,
            partial_reviews: stats.partial_reviews || 0,
            jonathan_yes: 0, // placeholder - could be calculated if needed
            jonathan_maybe: 0, // placeholder
            jonathan_no: 0 // placeholder
        } : {
            total_crops: 0,
            reviewed_crops: 0,
            unreviewed_crops: 0,
            jonathan_yes: 0,
            jonathan_maybe: 0,
            jonathan_no: 0
        };
        
        res.json(formattedStats);
    } catch (error) {
        console.error('Error getting crop statistics:', error);
        res.status(500).json({ error: 'Failed to get crop statistics' });
    }
});

// Get filtered crops for dashboard
app.get('/api/crops-filtered', (req, res) => {
    try {
        const { page = 1, limit = 50, status, jonathan, activity, clothing } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        
        // Build filters object
        const filters = {};
        if (status && status !== 'all') filters.status = status;
        if (jonathan && jonathan !== 'all') filters.jonathan = jonathan;
        if (activity && activity !== 'all') filters.activity = activity;
        if (clothing && clothing !== 'all') filters.clothing = clothing;
        
        console.log('🔍 SERVER DEBUG: Filtering crops with:', { filters, limit: parseInt(limit), offset });
        
        // Get filtered crops
        const crops = db.getFilteredCrops(filters, parseInt(limit), offset);
        const totalCount = db.getFilteredCropsCount(filters);
        
        res.json({
            crops: crops || [],
            totalCount: totalCount || 0,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil((totalCount || 0) / parseInt(limit))
        });
    } catch (error) {
        console.error('Error getting filtered crops:', error);
        res.status(500).json({ error: 'Failed to get filtered crops' });
    }
});

// Factors API Endpoints

// Get all factors
app.get('/api/factors', (req, res) => {
    try {
        const factors = db.getAllFactors();
        res.json(factors);
    } catch (error) {
        console.error('Error getting factors:', error);
        res.status(500).json({ error: 'Failed to get factors' });
    }
});

// Get factors by type
app.get('/api/factors/:type', (req, res) => {
    try {
        const { type } = req.params;
        if (type !== 'positive' && type !== 'negative') {
            return res.status(400).json({ error: 'Type must be "positive" or "negative"' });
        }
        
        const factors = db.getFactorsByType(type);
        res.json(factors);
    } catch (error) {
        console.error('Error getting factors by type:', error);
        res.status(500).json({ error: 'Failed to get factors by type' });
    }
});

// Create a new factor
app.post('/api/factors', (req, res) => {
    try {
        const { name, type, description } = req.body;
        
        if (!name || !type) {
            return res.status(400).json({ error: 'Name and type are required' });
        }
        
        if (type !== 'positive' && type !== 'negative') {
            return res.status(400).json({ error: 'Type must be "positive" or "negative"' });
        }
        
        const result = db.createFactor(name, type, description);
        
        res.json({
            success: true,
            factor_id: result.lastInsertRowid,
            message: 'Factor created successfully'
        });
    } catch (error) {
        console.error('Error creating factor:', error);
        if (error.message.includes('UNIQUE constraint failed')) {
            res.status(409).json({ error: 'A factor with this name already exists' });
        } else {
            res.status(500).json({ error: 'Failed to create factor' });
        }
    }
});

// Update a factor
app.put('/api/factors/:factorId', (req, res) => {
    try {
        const { factorId } = req.params;
        const { name, type, description } = req.body;
        
        if (!name || !type) {
            return res.status(400).json({ error: 'Name and type are required' });
        }
        
        if (type !== 'positive' && type !== 'negative') {
            return res.status(400).json({ error: 'Type must be "positive" or "negative"' });
        }
        
        const result = db.updateFactor(parseInt(factorId), name, type, description);
        
        if (result.changes > 0) {
            res.json({
                success: true,
                factor_id: parseInt(factorId),
                message: 'Factor updated successfully'
            });
        } else {
            res.status(404).json({ error: 'Factor not found' });
        }
    } catch (error) {
        console.error('Error updating factor:', error);
        if (error.message.includes('UNIQUE constraint failed')) {
            res.status(409).json({ error: 'A factor with this name already exists' });
        } else {
            res.status(500).json({ error: 'Failed to update factor' });
        }
    }
});

// Delete a factor
app.delete('/api/factors/:factorId', (req, res) => {
    try {
        const { factorId } = req.params;
        const result = db.deleteFactor(parseInt(factorId));
        
        if (result.changes > 0) {
            res.json({
                success: true,
                factor_id: parseInt(factorId),
                message: 'Factor deleted successfully'
            });
        } else {
            res.status(404).json({ error: 'Factor not found' });
        }
    } catch (error) {
        console.error('Error deleting factor:', error);
        res.status(500).json({ error: 'Failed to delete factor' });
    }
});

// --- Server Startup ---

// Define paths for SSL certificates
const keyPath = path.join(__dirname, 'certs', 'localhost+2-key.pem');
const certPath = path.join(__dirname, 'certs', 'localhost+2.pem');

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    // HTTPS mode
    const httpsOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
    };
    https.createServer(httpsOptions, app).listen(PORT, () => {
        console.log(`✅ Traffic Camera Viewer running in HTTPS mode on https://localhost:${PORT}`);
    });
} else {
    // Fallback to HTTP mode
    console.warn('⚠️  SSL certificates not found in /certs directory. Running in HTTP mode.');
    console.warn('   To enable HTTPS, run `mkcert -install` and `mkcert localhost 127.0.0.1 ::1` in a "certs" folder.');
    app.listen(PORT, () => {
        console.log(`Traffic Camera Viewer running on http://localhost:${PORT}`);
    });
}

module.exports = app;
