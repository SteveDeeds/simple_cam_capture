const db = require('./database.js');
const dbInstance = new db();

try {
    const crops = dbInstance.getAllSavedCrops(3, 0);
    console.log('Sample crop data:');
    
    crops.forEach((crop, i) => {
        console.log(`Crop ${i+1}:`);
        console.log(`  crop_folder: '${crop.crop_folder}'`);
        console.log(`  crop_filename: '${crop.crop_filename}'`);
        console.log(`  original_camera: '${crop.original_camera}'`);
        console.log('');
    });
} finally {
    dbInstance.close();
}
