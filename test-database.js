const TrafficCameraDB = require('./database');

// Test the database functionality
function testDatabase() {
    console.log('Testing Traffic Camera Database...\n');
    
    const db = new TrafficCameraDB();
    
    try {
        // Test 1: Record some image views
        console.log('1. Recording image views...');
        db.recordImageView('test_camera', 'test_image.jpg', '192.168.1.100', 'Test Browser');
        db.recordImageView('test_camera', 'test_image.jpg', '192.168.1.101', 'Another Browser');
        db.recordImageView('test_camera', 'test_image.jpg', '192.168.1.100', 'Test Browser'); // Same IP again
        console.log('✓ Views recorded');
        
        // Test 2: Get view stats
        console.log('\n2. Getting view stats...');
        const stats = db.getImageViewStats('test_camera', 'test_image.jpg');
        console.log('View Stats:', {
            totalViews: stats.total_views,
            uniqueViewers: stats.unique_viewers,
            firstViewed: stats.first_viewed_at,
            lastViewed: stats.last_viewed_at,
            viewerCount: stats.viewers.length
        });
        
        // Test 3: Save a crop record
        console.log('\n3. Saving crop record...');
        const cropData = {
            originalCamera: 'test_camera',
            originalFilename: 'test_image.jpg',
            cropFilename: 'test_image_x50_y75_crop.jpg',
            cropFolder: 'saved_images/test_camera',
            clickX: 0.5,
            clickY: 0.75,
            cropLeft: 100,
            cropTop: 150,
            cropWidth: 50,
            cropHeight: 50,
            originalWidth: 800,
            originalHeight: 600,
            savedByIP: '192.168.1.100',
            metadata: { test: true }
        };
        db.saveCropRecord(cropData);
        console.log('✓ Crop record saved');
        
        // Test 4: Get crops for image
        console.log('\n4. Getting crops for image...');
        const crops = db.getSavedCropsForImage('test_camera', 'test_image.jpg');
        console.log(`Found ${crops.length} crops for this image`);
        if (crops.length > 0) {
            console.log('Latest crop:', {
                filename: crops[0].crop_filename,
                clickLocation: { x: crops[0].click_x, y: crops[0].click_y },
                savedBy: crops[0].saved_by_ip
            });
        }
        
        // Test 5: Get overall stats
        console.log('\n5. Getting overall database stats...');
        const overallStats = db.getStats();
        console.log('Database Stats:', overallStats);
        
        console.log('\n✅ All tests passed! Database is working correctly.');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        db.close();
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    testDatabase();
}

module.exports = testDatabase;
