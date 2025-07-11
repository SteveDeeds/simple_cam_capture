const fs = require('fs');
const path = require('path');
const TrafficCameraDB = require('./database');

class SavedImagesMigrator {
    constructor() {
        this.db = new TrafficCameraDB();
        this.savedImagesDir = process.env.SAVED_IMAGES_DIR || path.join(__dirname, 'saved_images');
        this.stats = {
            totalFiles: 0,
            jsonFiles: 0,
            imageFiles: 0,
            migratedRecords: 0,
            errors: [],
            cameras: new Set()
        };
    }

    async migrate() {
        console.log('🚀 Starting migration of saved images to database...\n');
        console.log(`Scanning directory: ${this.savedImagesDir}\n`);

        if (!fs.existsSync(this.savedImagesDir)) {
            console.error(`❌ Saved images directory not found: ${this.savedImagesDir}`);
            return;
        }

        try {
            await this.scanDirectory(this.savedImagesDir);
            this.printSummary();
        } catch (error) {
            console.error('❌ Migration failed:', error);
        } finally {
            this.db.close();
        }
    }

    async scanDirectory(dirPath) {
        const items = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const item of items) {
            const fullPath = path.join(dirPath, item.name);

            if (item.isDirectory()) {
                console.log(`📁 Scanning camera folder: ${item.name}`);
                this.stats.cameras.add(item.name);
                await this.scanDirectory(fullPath);
            } else if (item.isFile()) {
                this.stats.totalFiles++;
                await this.processFile(fullPath, item.name);
            }
        }
    }

    async processFile(filePath, fileName) {
        const ext = path.extname(fileName).toLowerCase();

        if (ext === '.json') {
            this.stats.jsonFiles++;
            await this.processCropJsonFile(filePath, fileName);
        } else if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
            this.stats.imageFiles++;
            // Image files are processed when we find their corresponding JSON
        }
    }

    async processCropJsonFile(jsonPath, fileName) {
        try {
            const jsonContent = fs.readFileSync(jsonPath, 'utf8');
            const cropData = JSON.parse(jsonContent);

            // Validate required fields
            if (!this.validateCropData(cropData)) {
                this.stats.errors.push(`Invalid data structure in ${fileName}`);
                return;
            }

            // Extract data for database
            const dbRecord = this.convertToDbRecord(cropData, jsonPath, fileName);

            // Check if already migrated (avoid duplicates)
            if (await this.isAlreadyMigrated(dbRecord)) {
                console.log(`⏭️  Skipping ${fileName} (already migrated)`);
                return;
            }

            // Save to database
            this.db.saveCropRecord(dbRecord);
            this.stats.migratedRecords++;

            console.log(`✅ Migrated: ${fileName}`);
            console.log(`   Camera: ${dbRecord.originalCamera}`);
            console.log(`   Original: ${dbRecord.originalFilename}`);
            console.log(`   Crop: ${dbRecord.cropFilename}`);
            console.log(`   Click: (${Math.round(dbRecord.clickX * 100)}%, ${Math.round(dbRecord.clickY * 100)}%)`);
            console.log(`   Saved: ${dbRecord.savedAt}\n`);

        } catch (error) {
            this.stats.errors.push(`Failed to process ${fileName}: ${error.message}`);
            console.error(`❌ Error processing ${fileName}:`, error.message);
        }
    }

    validateCropData(data) {
        const required = ['originalPath', 'cameraName', 'coordinates', 'cropArea', 'originalImageSize', 'savedAt'];
        return required.every(field => data.hasOwnProperty(field));
    }

    convertToDbRecord(cropData, jsonPath, fileName) {
        // Extract original filename from path
        const originalFilename = path.basename(cropData.originalPath);
        
        // Get crop filename (remove .json extension, add .jpg)
        const cropFilename = fileName.replace('.json', '.jpg');
        
        // Get relative folder path
        const relativeFolderPath = path.relative(__dirname, path.dirname(jsonPath));

        return {
            originalCamera: cropData.cameraName,
            originalFilename: originalFilename,
            originalPath: cropData.originalPath,
            cropFilename: cropFilename,
            cropFolder: relativeFolderPath,
            clickX: cropData.coordinates.x,
            clickY: cropData.coordinates.y,
            cropLeft: cropData.cropArea.left,
            cropTop: cropData.cropArea.top,
            cropWidth: cropData.cropArea.width,
            cropHeight: cropData.cropArea.height,
            originalWidth: cropData.originalImageSize.width,
            originalHeight: cropData.originalImageSize.height,
            savedByIP: cropData.savedByIP || 'migrated-data',
            originalTimestamp: cropData.timestamp,
            savedAt: cropData.savedAt,
            metadata: {
                migratedFrom: jsonPath,
                originalJsonData: cropData
            },
            migratedFromJson: true
        };
    }

    async isAlreadyMigrated(dbRecord) {
        try {
            const existing = this.db.statements.getSavedCrops.all(
                dbRecord.originalCamera, 
                dbRecord.originalFilename
            );
            
            return existing.some(crop => 
                crop.crop_filename === dbRecord.cropFilename &&
                crop.migrated_from_json === 1
            );
        } catch (error) {
            return false;
        }
    }

    printSummary() {
        console.log('\n' + '='.repeat(50));
        console.log('📊 MIGRATION SUMMARY');
        console.log('='.repeat(50));
        console.log(`📁 Cameras processed: ${this.stats.cameras.size}`);
        console.log(`📄 Total files scanned: ${this.stats.totalFiles}`);
        console.log(`📝 JSON files found: ${this.stats.jsonFiles}`);
        console.log(`🖼️  Image files found: ${this.stats.imageFiles}`);
        console.log(`✅ Records migrated: ${this.stats.migratedRecords}`);
        console.log(`❌ Errors: ${this.stats.errors.length}`);

        if (this.stats.cameras.size > 0) {
            console.log('\n📷 Cameras found:');
            [...this.stats.cameras].sort().forEach(camera => {
                console.log(`   - ${camera.replace(/_/g, ' ')}`);
            });
        }

        if (this.stats.errors.length > 0) {
            console.log('\n❌ Errors encountered:');
            this.stats.errors.forEach(error => {
                console.log(`   - ${error}`);
            });
        }

        // Get final database stats
        const dbStats = this.db.getStats();
        console.log('\n📈 Updated Database Stats:');
        console.log(`   Total Views: ${dbStats.totalViews}`);
        console.log(`   Unique Viewers: ${dbStats.uniqueViewers}`);
        console.log(`   Total Images: ${dbStats.totalImages}`);
        console.log(`   Total Crops: ${dbStats.totalCrops}`);

        console.log('\n🎉 Migration complete!');
    }
}

// Command line interface
async function runMigration() {
    const migrator = new SavedImagesMigrator();
    await migrator.migrate();
}

// Export for use as module or run directly
if (require.main === module) {
    runMigration().catch(console.error);
}

module.exports = SavedImagesMigrator;
