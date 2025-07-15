const Database = require('better-sqlite3');
const path = require('path');
const { JONATHAN_OPTIONS, ACTIVITY_OPTIONS, CLOTHING_OPTIONS, DB_CONSTRAINTS } = require('./constants');

class TrafficCameraDB {
    constructor(dbPath = null) {
        const defaultPath = path.join(__dirname, 'traffic_cameras.db');
        this.dbPath = dbPath || process.env.DB_PATH || defaultPath;
        this.db = new Database(this.dbPath);
        this.init();
    }

    init() {
        // Enable foreign keys and WAL mode for better performance
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
        
        this.createTables();
        this.migrateSchema(); // Add schema migrations
        this.createIndexes();
        this.prepareStatements();
    }

    createTables() {
        // Image views table - tracks every view
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS image_views (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                camera_name TEXT NOT NULL,
                filename TEXT NOT NULL,
                viewer_ip TEXT NOT NULL,
                viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                user_agent TEXT
            )
        `);

        // Image stats table - summary for performance
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS image_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                camera_name TEXT NOT NULL,
                filename TEXT NOT NULL,
                total_views INTEGER DEFAULT 0,
                unique_viewers INTEGER DEFAULT 0,
                first_viewed_at DATETIME,
                last_viewed_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(camera_name, filename)
            )
        `);

        // Saved crops table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS saved_crops (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                original_camera TEXT NOT NULL,
                original_filename TEXT NOT NULL,
                original_path TEXT,
                crop_filename TEXT NOT NULL,
                crop_folder TEXT NOT NULL,
                click_x REAL NOT NULL,
                click_y REAL NOT NULL,
                crop_left INTEGER NOT NULL,
                crop_top INTEGER NOT NULL,
                crop_width INTEGER NOT NULL,
                crop_height INTEGER NOT NULL,
                original_width INTEGER NOT NULL,
                original_height INTEGER NOT NULL,
                saved_by_ip TEXT,
                original_timestamp TEXT,
                saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                metadata TEXT,
                migrated_from_json BOOLEAN DEFAULT FALSE
            )
        `);

        // Viewer sessions table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS viewer_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT UNIQUE NOT NULL,
                ip_address TEXT NOT NULL,
                user_agent TEXT,
                first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
                page_views INTEGER DEFAULT 1
            )
        `);

        // Crop reviews table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS crop_reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                crop_id INTEGER NOT NULL,
                notes TEXT,
                is_jonathan TEXT CHECK(is_jonathan IN (${DB_CONSTRAINTS.JONATHAN})),
                activities TEXT,
                top_clothing TEXT CHECK(top_clothing IN (${DB_CONSTRAINTS.CLOTHING})),
                reviewed_by_ip TEXT,
                reviewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (crop_id) REFERENCES saved_crops(id),
                UNIQUE(crop_id)
            )
        `);
    }

    createIndexes() {
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_image_views_camera_file ON image_views(camera_name, filename);
            CREATE INDEX IF NOT EXISTS idx_image_views_ip ON image_views(viewer_ip);
            CREATE INDEX IF NOT EXISTS idx_image_views_date ON image_views(viewed_at);
            CREATE INDEX IF NOT EXISTS idx_image_stats_camera_file ON image_stats(camera_name, filename);
            CREATE INDEX IF NOT EXISTS idx_saved_crops_original ON saved_crops(original_camera, original_filename);
        `);
    }

    prepareStatements() {
        // Prepared statements for better performance
        this.statements = {
            // Image views
            insertView: this.db.prepare(`
                INSERT INTO image_views (camera_name, filename, viewer_ip, user_agent)
                VALUES (?, ?, ?, ?)
            `),
            
            getViewsByImage: this.db.prepare(`
                SELECT viewer_ip, viewed_at, user_agent
                FROM image_views
                WHERE camera_name = ? AND filename = ?
                ORDER BY viewed_at DESC
            `),

            // Image stats
            upsertImageStats: this.db.prepare(`
                INSERT INTO image_stats (camera_name, filename, total_views, unique_viewers, first_viewed_at, last_viewed_at, updated_at)
                VALUES (?, ?, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT(camera_name, filename) DO UPDATE SET
                    total_views = total_views + 1,
                    unique_viewers = (
                        SELECT COUNT(DISTINCT viewer_ip) 
                        FROM image_views 
                        WHERE camera_name = excluded.camera_name AND filename = excluded.filename
                    ),
                    last_viewed_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
            `),

            getImageStats: this.db.prepare(`
                SELECT * FROM image_stats
                WHERE camera_name = ? AND filename = ?
            `),

            getAllImageStats: this.db.prepare(`
                SELECT * FROM image_stats
                ORDER BY total_views ASC, last_viewed_at DESC
            `),

            // Saved crops
            insertSavedCrop: this.db.prepare(`
                INSERT INTO saved_crops (
                    original_camera, original_filename, original_path, crop_filename, crop_folder,
                    click_x, click_y, crop_left, crop_top, crop_width, crop_height,
                    original_width, original_height, saved_by_ip, original_timestamp, saved_at, metadata, migrated_from_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `),

            getSavedCrops: this.db.prepare(`
                SELECT * FROM saved_crops
                WHERE original_camera = ? AND original_filename = ?
                ORDER BY saved_at DESC
            `),

            getAllSavedCrops: this.db.prepare(`
                SELECT * FROM saved_crops
                ORDER BY saved_at DESC
                LIMIT ? OFFSET ?
            `),

            getSavedCropById: this.db.prepare(`
                SELECT * FROM saved_crops
                WHERE id = ?
            `),

            deleteCropReview: this.db.prepare(`
                DELETE FROM crop_reviews
                WHERE crop_id = ?
            `),

            deletePositiveFactorsForReview: this.db.prepare(`
                DELETE FROM crop_review_positive_factors
                WHERE crop_review_id = ?
            `),

            deleteNegativeFactorsForReview: this.db.prepare(`
                DELETE FROM crop_review_negative_factors
                WHERE crop_review_id = ?
            `),

            deleteCrop: this.db.prepare(`
                DELETE FROM saved_crops
                WHERE id = ?
            `),

            // Sessions
            upsertSession: this.db.prepare(`
                INSERT INTO viewer_sessions (session_id, ip_address, user_agent, last_seen, page_views)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP, 1)
                ON CONFLICT(session_id) DO UPDATE SET
                    last_seen = CURRENT_TIMESTAMP,
                    page_views = page_views + 1
            `),

            // Crop reviews
            upsertCropReview: this.db.prepare(`
                INSERT INTO crop_reviews (crop_id, notes, is_jonathan, activities, top_clothing, reviewed_by_ip, reviewed_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(crop_id) DO UPDATE SET
                    notes = excluded.notes,
                    is_jonathan = excluded.is_jonathan,
                    activities = excluded.activities,
                    top_clothing = excluded.top_clothing,
                    reviewed_by_ip = excluded.reviewed_by_ip,
                    reviewed_at = excluded.reviewed_at,
                    updated_at = CURRENT_TIMESTAMP
            `),

            getCropReview: this.db.prepare(`
                SELECT * FROM crop_reviews
                WHERE crop_id = ?
            `),

            getUnreviewedCrops: this.db.prepare(`
                SELECT sc.*, cr.notes, cr.reviewed_at
                FROM saved_crops sc
                LEFT JOIN crop_reviews cr ON sc.id = cr.crop_id
                WHERE cr.crop_id IS NULL
                ORDER BY sc.saved_at ASC
                LIMIT ?
            `),

            getMostRecentCrop: this.db.prepare(`
                SELECT sc.*, cr.notes, cr.reviewed_at
                FROM saved_crops sc
                LEFT JOIN crop_reviews cr ON sc.id = cr.crop_id
                WHERE sc.crop_folder IS NOT NULL AND sc.crop_filename IS NOT NULL 
                  AND sc.crop_folder NOT LIKE '%test_camera%' AND sc.crop_filename NOT LIKE '%test_image%'
                ORDER BY sc.saved_at DESC
                LIMIT 1
            `),

            getReviewedCrops: this.db.prepare(`
                SELECT sc.*, cr.notes, cr.reviewed_at
                FROM saved_crops sc
                INNER JOIN crop_reviews cr ON sc.id = cr.crop_id
                WHERE cr.crop_id IS NOT NULL
                ORDER BY cr.reviewed_at DESC
                LIMIT ?
            `),

            getCropReviewStats: this.db.prepare(`
                SELECT 
                    COUNT(*) as total_crops,
                    COUNT(cr.crop_id) as total_reviews,
                    COUNT(CASE WHEN cr.crop_id IS NOT NULL THEN 1 END) as classified_crops,
                    COUNT(CASE WHEN cr.crop_id IS NULL AND sc.crop_folder IS NOT NULL AND sc.crop_filename IS NOT NULL 
                               AND sc.crop_folder NOT LIKE '%test_camera%' AND sc.crop_filename NOT LIKE '%test_image%' THEN 1 END) as never_reviewed,
                    0 as partial_reviews
                FROM saved_crops sc
                LEFT JOIN crop_reviews cr ON sc.id = cr.crop_id
                WHERE sc.crop_folder IS NOT NULL AND sc.crop_filename IS NOT NULL 
                  AND sc.crop_folder NOT LIKE '%test_camera%' AND sc.crop_filename NOT LIKE '%test_image%'
            `),

            // Basic prepared statements (dynamic ones are in methods below)
            getBasicFilteredCrops: this.db.prepare(`
                SELECT sc.*, cr.notes, cr.is_jonathan, cr.activities, cr.top_clothing, cr.reviewed_at
                FROM saved_crops sc
                LEFT JOIN crop_reviews cr ON sc.id = cr.crop_id
                ORDER BY sc.saved_at DESC
                LIMIT ? OFFSET ?
            `),

            getBasicFilteredCropsCount: this.db.prepare(`
                SELECT COUNT(*) as total
                FROM saved_crops sc
                LEFT JOIN crop_reviews cr ON sc.id = cr.crop_id
            `),

            // Dashboard methods
            getFilteredCrops: this.db.prepare(`
                SELECT sc.*, cr.notes, cr.is_jonathan, cr.activities, cr.top_clothing, cr.reviewed_at
                FROM saved_crops sc
                LEFT JOIN crop_reviews cr ON sc.id = cr.crop_id
            `),

            getFilteredCropsCount: this.db.prepare(`
                SELECT COUNT(*) as total
                FROM saved_crops sc
                LEFT JOIN crop_reviews cr ON sc.id = cr.crop_id
            `),

            // Factors table prepared statements
            insertFactor: this.db.prepare(`
                INSERT INTO factors (name, type, description, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `),

            updateFactor: this.db.prepare(`
                UPDATE factors 
                SET name = ?, type = ?, description = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `),

            deleteFactor: this.db.prepare(`
                DELETE FROM factors WHERE id = ?
            `),

            getFactorById: this.db.prepare(`
                SELECT * FROM factors WHERE id = ?
            `),

            getFactorByName: this.db.prepare(`
                SELECT * FROM factors WHERE name = ?
            `),

            getAllFactors: this.db.prepare(`
                SELECT * FROM factors ORDER BY type, name
            `),

            getFactorsByType: this.db.prepare(`
                SELECT * FROM factors WHERE type = ? ORDER BY name
            `),

            // Factor junction table prepared statements
            addPositiveFactor: this.db.prepare(`
                INSERT OR IGNORE INTO crop_review_positive_factors (crop_review_id, factor_id)
                VALUES (?, ?)
            `),

            removePositiveFactor: this.db.prepare(`
                DELETE FROM crop_review_positive_factors 
                WHERE crop_review_id = ? AND factor_id = ?
            `),

            addNegativeFactor: this.db.prepare(`
                INSERT OR IGNORE INTO crop_review_negative_factors (crop_review_id, factor_id)
                VALUES (?, ?)
            `),

            removeNegativeFactor: this.db.prepare(`
                DELETE FROM crop_review_negative_factors 
                WHERE crop_review_id = ? AND factor_id = ?
            `),

            getPositiveFactorsForReview: this.db.prepare(`
                SELECT f.* FROM factors f
                JOIN crop_review_positive_factors crpf ON f.id = crpf.factor_id
                WHERE crpf.crop_review_id = ?
                ORDER BY f.name
            `),

            getNegativeFactorsForReview: this.db.prepare(`
                SELECT f.* FROM factors f
                JOIN crop_review_negative_factors crnf ON f.id = crnf.factor_id
                WHERE crnf.crop_review_id = ?
                ORDER BY f.name
            `),

            getAllFactorsForReview: this.db.prepare(`
                SELECT 
                    f.*,
                    CASE WHEN crpf.factor_id IS NOT NULL THEN 'positive'
                         WHEN crnf.factor_id IS NOT NULL THEN 'negative'
                         ELSE NULL END as selected_type
                FROM factors f
                LEFT JOIN crop_review_positive_factors crpf ON f.id = crpf.factor_id AND crpf.crop_review_id = ?
                LEFT JOIN crop_review_negative_factors crnf ON f.id = crnf.factor_id AND crnf.crop_review_id = ?
                ORDER BY f.type, f.name
            `)
        };
    }

    // Public methods
    recordImageView(cameraName, filename, viewerIP, userAgent = null) {
        const transaction = this.db.transaction(() => {
            // Insert the view record
            this.statements.insertView.run(cameraName, filename, viewerIP, userAgent);
            
            // Update stats
            this.statements.upsertImageStats.run(cameraName, filename);
        });
        
        return transaction();
    }

    getImageViewStats(cameraName, filename) {
        const stats = this.statements.getImageStats.get(cameraName, filename);
        const viewers = this.statements.getViewsByImage.all(cameraName, filename);
        
        return {
            ...stats,
            viewers: viewers
        };
    }

    getAllImageStats() {
        return this.statements.getAllImageStats.all();
    }

    saveCropRecord(cropData) {
        const {
            originalCamera, originalFilename, originalPath, cropFilename, cropFolder,
            clickX, clickY, cropLeft, cropTop, cropWidth, cropHeight,
            originalWidth, originalHeight, savedByIP, originalTimestamp, savedAt, metadata, migratedFromJson
        } = cropData;

        // Ensure all parameters are properly formatted
        const params = [
            originalCamera || '',
            originalFilename || '',
            originalPath || null,
            cropFilename || '',
            cropFolder || '',
            clickX || 0,
            clickY || 0,
            Math.round(cropLeft || 0),  // Ensure integer
            Math.round(cropTop || 0),   // Ensure integer
            Math.round(cropWidth || 0), // Ensure integer
            Math.round(cropHeight || 0), // Ensure integer
            Math.round(originalWidth || 0), // Ensure integer
            Math.round(originalHeight || 0), // Ensure integer
            savedByIP || null,
            originalTimestamp || null,
            savedAt || new Date().toISOString(),
            JSON.stringify(metadata || {}),
            migratedFromJson ? 1 : 0
        ];

        return this.statements.insertSavedCrop.run(...params);
    }

    getSavedCropsForImage(cameraName, filename) {
        return this.statements.getSavedCrops.all(cameraName, filename);
    }

    getAllSavedCrops(limit = 50, offset = 0) {
        return this.statements.getAllSavedCrops.all(limit, offset);
    }

    getSavedCropById(cropId) {
        return this.statements.getSavedCropById.get(cropId);
    }

    deleteCrop(cropId) {
        // Delete in proper order to handle foreign key relationships
        const transaction = this.db.transaction(() => {
            // First, get the crop review ID if it exists
            const review = this.statements.getCropReview.get(cropId);
            
            if (review) {
                // Delete factors for the review
                this.statements.deletePositiveFactorsForReview.run(review.id);
                this.statements.deleteNegativeFactorsForReview.run(review.id);
                
                // Delete the review itself
                this.statements.deleteCropReview.run(cropId);
            }
            
            // Finally, delete the crop
            return this.statements.deleteCrop.run(cropId);
        });
        
        return transaction();
    }

    recordSession(sessionId, ipAddress, userAgent) {
        return this.statements.upsertSession.run(sessionId, ipAddress, userAgent);
    }

    // Crop review methods
    saveCropReview(cropId, notes, isJonathan, activities, topClothing, reviewedByIP, reviewedAt) {
        return this.statements.upsertCropReview.run(
            cropId,
            notes || null,
            isJonathan || null,
            activities || null,
            topClothing || null,
            reviewedByIP || null,
            reviewedAt || new Date().toISOString()
        );
    }

    getCropReview(cropId) {
        return this.statements.getCropReview.get(cropId);
    }

    getUnreviewedCrops(limit = 50) {
        return this.statements.getUnreviewedCrops.all(limit);
    }

    getMostRecentCrop() {
        return this.statements.getMostRecentCrop.get();
    }

    getReviewedCrops(limit = 50) {
        return this.statements.getReviewedCrops.all(limit);
    }

    getCropReviewStats() {
        return this.statements.getCropReviewStats.get();
    }

    // Factors management methods
    createFactor(name, type, description = null) {
        return this.statements.insertFactor.run(name, type, description);
    }

    updateFactor(id, name, type, description = null) {
        return this.statements.updateFactor.run(name, type, description, id);
    }

    deleteFactor(id) {
        // First remove all references to this factor from junction tables
        const transaction = this.db.transaction(() => {
            this.db.prepare('DELETE FROM crop_review_positive_factors WHERE factor_id = ?').run(id);
            this.db.prepare('DELETE FROM crop_review_negative_factors WHERE factor_id = ?').run(id);
            return this.statements.deleteFactor.run(id);
        });
        
        return transaction();
    }

    getFactorById(id) {
        return this.statements.getFactorById.get(id);
    }

    getFactorByName(name) {
        return this.statements.getFactorByName.get(name);
    }

    getAllFactors() {
        return this.statements.getAllFactors.all();
    }

    getFactorsByType(type) {
        return this.statements.getFactorsByType.all(type);
    }

    // Factor assignment methods for crop reviews
    addFactorToReview(cropReviewId, factorId, isPositive) {
        if (isPositive) {
            // Remove from negative if it exists, then add to positive
            this.statements.removeNegativeFactor.run(cropReviewId, factorId);
            return this.statements.addPositiveFactor.run(cropReviewId, factorId);
        } else {
            // Remove from positive if it exists, then add to negative
            this.statements.removePositiveFactor.run(cropReviewId, factorId);
            return this.statements.addNegativeFactor.run(cropReviewId, factorId);
        }
    }

    removeFactorFromReview(cropReviewId, factorId) {
        const transaction = this.db.transaction(() => {
            this.statements.removePositiveFactor.run(cropReviewId, factorId);
            this.statements.removeNegativeFactor.run(cropReviewId, factorId);
        });
        
        return transaction();
    }

    getPositiveFactorsForReview(cropReviewId) {
        return this.statements.getPositiveFactorsForReview.all(cropReviewId);
    }

    getNegativeFactorsForReview(cropReviewId) {
        return this.statements.getNegativeFactorsForReview.all(cropReviewId);
    }

    getAllFactorsForReview(cropReviewId) {
        return this.statements.getAllFactorsForReview.all(cropReviewId, cropReviewId);
    }

    setFactorsForReview(cropReviewId, positiveFactorIds = [], negativeFactorIds = []) {
        const transaction = this.db.transaction(() => {
            // Clear existing factors for this review
            this.db.prepare('DELETE FROM crop_review_positive_factors WHERE crop_review_id = ?').run(cropReviewId);
            this.db.prepare('DELETE FROM crop_review_negative_factors WHERE crop_review_id = ?').run(cropReviewId);
            
            // Add positive factors
            positiveFactorIds.forEach(factorId => {
                this.statements.addPositiveFactor.run(cropReviewId, factorId);
            });
            
            // Add negative factors
            negativeFactorIds.forEach(factorId => {
                this.statements.addNegativeFactor.run(cropReviewId, factorId);
            });
        });
        
        return transaction();
    }

    // Utility methods
    getStats() {
        const totalViews = this.db.prepare('SELECT COUNT(*) as count FROM image_views').get().count;
        const uniqueViewers = this.db.prepare('SELECT COUNT(DISTINCT viewer_ip) as count FROM image_views').get().count;
        const totalImages = this.db.prepare('SELECT COUNT(*) as count FROM image_stats').get().count;
        const totalCrops = this.db.prepare('SELECT COUNT(*) as count FROM saved_crops').get().count;
        
        return {
            totalViews,
            uniqueViewers,
            totalImages,
            totalCrops
        };
    }

    // Migration from JSON database
    migrateFromJSON(jsonPath) {
        try {
            const fs = require('fs');
            const oldData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            
            if (oldData.views) {
                Object.entries(oldData.views).forEach(([imageKey, viewData]) => {
                    const [cameraName, filename] = imageKey.split('/');
                    if (cameraName && filename && viewData.count > 0) {
                        // Create fake view records to maintain count
                        for (let i = 0; i < viewData.count; i++) {
                            this.statements.insertView.run(
                                cameraName, 
                                filename.replace(/_/g, '.'), // Convert back from Firebase format
                                'migrated-data',
                                'migration'
                            );
                        }
                        this.statements.upsertImageStats.run(cameraName, filename.replace(/_/g, '.'));
                    }
                });
            }
            
            console.log('Migration from JSON completed successfully');
        } catch (error) {
            console.error('Migration failed:', error);
        }
    }

    migrateSchema() {
        // Check if we need to add new columns to existing tables
        try {
            // Check if original_path column exists
            const columns = this.db.prepare("PRAGMA table_info(saved_crops)").all();
            const columnNames = columns.map(col => col.name);
            
            if (!columnNames.includes('original_path')) {
                console.log('🔄 Adding original_path column to saved_crops table...');
                this.db.exec('ALTER TABLE saved_crops ADD COLUMN original_path TEXT');
            }
            
            if (!columnNames.includes('original_timestamp')) {
                console.log('🔄 Adding original_timestamp column to saved_crops table...');
                this.db.exec('ALTER TABLE saved_crops ADD COLUMN original_timestamp TEXT');
            }
            
            if (!columnNames.includes('migrated_from_json')) {
                console.log('🔄 Adding migrated_from_json column to saved_crops table...');
                this.db.exec('ALTER TABLE saved_crops ADD COLUMN migrated_from_json BOOLEAN DEFAULT FALSE');
            }
            
            // Check if archived_path column exists in image_stats table
            const imageStatsColumns = this.db.prepare("PRAGMA table_info(image_stats)").all();
            const imageStatsColumnNames = imageStatsColumns.map(col => col.name);
            
            if (!imageStatsColumnNames.includes('archived_path')) {
                console.log('🔄 Adding archived_path column to image_stats table...');
                this.db.exec('ALTER TABLE image_stats ADD COLUMN archived_path TEXT');
            }

            // Create factors table if it doesn't exist
            const factorsTable = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='factors'").all();
            if (factorsTable.length === 0) {
                console.log('🔄 Creating factors table...');
                this.db.exec(`
                    CREATE TABLE factors (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL UNIQUE,
                        type TEXT NOT NULL CHECK(type IN ('positive', 'negative')),
                        description TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                
                // Create indexes for the factors table
                this.db.exec(`
                    CREATE INDEX IF NOT EXISTS idx_factors_type ON factors(type);
                    CREATE INDEX IF NOT EXISTS idx_factors_name ON factors(name);
                `);
                
                console.log('✅ Created factors table with indexes');
                
                // Seed the factors table with initial common factors
                console.log('🌱 Seeding factors table with initial data...');
                const initialFactors = [
                    // Positive factors (suggesting it's Jonathan)
                    { name: 'blue shirt', type: 'positive', description: 'Person is wearing a blue shirt' },
                    { name: 'riding a bike', type: 'positive', description: 'Person is riding a bicycle' },
                    { name: 'waiting for bus', type: 'positive', description: 'Person appears to be waiting for a bus' },
                    { name: 'at bus stop', type: 'positive', description: 'Person is at or near a bus stop' },
                    { name: 'tall person', type: 'positive', description: 'Person appears to be tall' },
                    { name: 'dark hair', type: 'positive', description: 'Person has dark colored hair' },
                    { name: 'backpack', type: 'positive', description: 'Person is wearing or carrying a backpack' },
                    { name: 'casual clothing', type: 'positive', description: 'Person is dressed casually' },
                    
                    // Negative factors (suggesting it's not Jonathan)
                    { name: 'red shirt', type: 'negative', description: 'Person is wearing a red shirt' },
                    { name: 'yellow shirt', type: 'negative', description: 'Person is wearing a yellow shirt' },
                    { name: 'white shirt', type: 'negative', description: 'Person is wearing a white shirt' },
                    { name: 'driving car', type: 'negative', description: 'Person is driving a car' },
                    { name: 'short person', type: 'negative', description: 'Person appears to be short' },
                    { name: 'blonde hair', type: 'negative', description: 'Person has blonde colored hair' },
                    { name: 'formal clothing', type: 'negative', description: 'Person is dressed formally' },
                    { name: 'child', type: 'negative', description: 'Person appears to be a child' },
                    { name: 'elderly person', type: 'negative', description: 'Person appears to be elderly' },
                    { name: 'woman', type: 'negative', description: 'Person appears to be a woman' }
                ];
                
                const insertFactorStmt = this.db.prepare(`
                    INSERT INTO factors (name, type, description, updated_at)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                `);
                
                initialFactors.forEach(factor => {
                    try {
                        insertFactorStmt.run(factor.name, factor.type, factor.description);
                    } catch (error) {
                        // Factor might already exist, skip
                        console.log(`⚠️  Factor '${factor.name}' already exists, skipping...`);
                    }
                });
                
                console.log('✅ Seeded factors table with initial data');
            }

            // Create crop_review_positive_factors junction table if it doesn't exist
            const positiveFactorsTable = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='crop_review_positive_factors'").all();
            if (positiveFactorsTable.length === 0) {
                console.log('🔄 Creating crop_review_positive_factors junction table...');
                this.db.exec(`
                    CREATE TABLE crop_review_positive_factors (
                        crop_review_id INTEGER NOT NULL,
                        factor_id INTEGER NOT NULL,
                        PRIMARY KEY (crop_review_id, factor_id),
                        FOREIGN KEY (crop_review_id) REFERENCES crop_reviews(id) ON DELETE CASCADE,
                        FOREIGN KEY (factor_id) REFERENCES factors(id) ON DELETE CASCADE
                    )
                `);
                
                // Create indexes for the junction table
                this.db.exec(`
                    CREATE INDEX IF NOT EXISTS idx_positive_factors_review ON crop_review_positive_factors(crop_review_id);
                    CREATE INDEX IF NOT EXISTS idx_positive_factors_factor ON crop_review_positive_factors(factor_id);
                `);
                
                console.log('✅ Created crop_review_positive_factors junction table with indexes');
            }

            // Create crop_review_negative_factors junction table if it doesn't exist
            const negativeFactorsTable = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='crop_review_negative_factors'").all();
            if (negativeFactorsTable.length === 0) {
                console.log('🔄 Creating crop_review_negative_factors junction table...');
                this.db.exec(`
                    CREATE TABLE crop_review_negative_factors (
                        crop_review_id INTEGER NOT NULL,
                        factor_id INTEGER NOT NULL,
                        PRIMARY KEY (crop_review_id, factor_id),
                        FOREIGN KEY (crop_review_id) REFERENCES crop_reviews(id) ON DELETE CASCADE,
                        FOREIGN KEY (factor_id) REFERENCES factors(id) ON DELETE CASCADE
                    )
                `);
                
                // Create indexes for the junction table
                this.db.exec(`
                    CREATE INDEX IF NOT EXISTS idx_negative_factors_review ON crop_review_negative_factors(crop_review_id);
                    CREATE INDEX IF NOT EXISTS idx_negative_factors_factor ON crop_review_negative_factors(factor_id);
                `);
                
                console.log('✅ Created crop_review_negative_factors junction table with indexes');
            }
            
            // Check if crop_reviews table exists
            const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='crop_reviews'").all();
            if (tables.length === 0) {
                console.log('🔄 Creating crop_reviews table...');
                this.db.exec(`
                    CREATE TABLE crop_reviews (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        crop_id INTEGER NOT NULL,
                        notes TEXT,
                        is_jonathan TEXT CHECK(is_jonathan IN (${DB_CONSTRAINTS.JONATHAN})),
                        activities TEXT,
                        top_clothing TEXT CHECK(top_clothing IN (${DB_CONSTRAINTS.CLOTHING})),
                        reviewed_by_ip TEXT,
                        reviewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (crop_id) REFERENCES saved_crops(id),
                        UNIQUE(crop_id)
                    )
                `);
            } else {
                // Add new columns to existing crop_reviews table
                const reviewColumns = this.db.prepare("PRAGMA table_info(crop_reviews)").all();
                const reviewColumnNames = reviewColumns.map(col => col.name);
                
                if (!reviewColumnNames.includes('is_jonathan')) {
                    console.log('🔄 Adding is_jonathan column to crop_reviews table...');
                    this.db.exec(`ALTER TABLE crop_reviews ADD COLUMN is_jonathan TEXT CHECK(is_jonathan IN (${DB_CONSTRAINTS.JONATHAN}))`);
                }
                
                if (!reviewColumnNames.includes('activities')) {
                    console.log('🔄 Adding activities column to crop_reviews table...');
                    this.db.exec('ALTER TABLE crop_reviews ADD COLUMN activities TEXT');
                    
                    // Migrate existing individual activity columns to the new activities column
                    if (reviewColumnNames.includes('waiting_for_bus') || reviewColumnNames.includes('riding_bike') || reviewColumnNames.includes('working')) {
                        console.log('🔄 Migrating individual activity columns to activities column...');
                        this.db.exec(`
                            UPDATE crop_reviews SET activities = (
                                SELECT json_group_array(activity) FROM (
                                    SELECT 'waiting for a bus' as activity WHERE waiting_for_bus = 'yes'
                                    UNION ALL
                                    SELECT 'riding a bike' as activity WHERE riding_bike = 'yes'
                                    UNION ALL
                                    SELECT 'working' as activity WHERE working = 'yes'
                                ) WHERE crop_id = crop_reviews.crop_id
                            ) WHERE activities IS NULL
                        `);
                    }
                }
                
                if (!reviewColumnNames.includes('top_clothing')) {
                    console.log('🔄 Adding top_clothing column to crop_reviews table...');
                    this.db.exec(`ALTER TABLE crop_reviews ADD COLUMN top_clothing TEXT CHECK(top_clothing IN (${DB_CONSTRAINTS.CLOTHING}))`);
                }
                
                // Remove old individual activity columns if they exist
                if (reviewColumnNames.includes('waiting_for_bus') || reviewColumnNames.includes('riding_bike') || reviewColumnNames.includes('working')) {
                    console.log('🔄 Note: Old individual activity columns (waiting_for_bus, riding_bike, working) are deprecated. Data has been migrated to the activities column.');
                }
                
                // Remove classification column if it exists (we don't use it anymore)
                if (reviewColumnNames.includes('classification')) {
                    console.log('🔄 Removing deprecated classification column from crop_reviews table...');
                    
                    // SQLite doesn't support DROP COLUMN, so we need to recreate the table
                    this.db.exec(`
                        CREATE TABLE crop_reviews_new (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            crop_id INTEGER NOT NULL,
                            notes TEXT,
                            is_jonathan TEXT CHECK(is_jonathan IN (${DB_CONSTRAINTS.JONATHAN})),
                            activities TEXT,
                            top_clothing TEXT CHECK(top_clothing IN (${DB_CONSTRAINTS.CLOTHING})),
                            reviewed_by_ip TEXT,
                            reviewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (crop_id) REFERENCES saved_crops(id),
                            UNIQUE(crop_id)
                        )
                    `);
                    
                    // Copy data from old table to new table (excluding classification)
                    this.db.exec(`
                        INSERT INTO crop_reviews_new (
                            id, crop_id, notes, is_jonathan, activities, top_clothing, 
                            reviewed_by_ip, reviewed_at, created_at, updated_at
                        )
                        SELECT 
                            id, crop_id, notes, is_jonathan, activities, top_clothing,
                            reviewed_by_ip, reviewed_at, created_at, updated_at
                        FROM crop_reviews
                    `);
                    
                    // Drop old table and rename new table
                    this.db.exec('DROP TABLE crop_reviews');
                    this.db.exec('ALTER TABLE crop_reviews_new RENAME TO crop_reviews');
                    
                    console.log('✅ Classification column successfully removed from crop_reviews table');
                }
            }
            
        } catch (error) {
            // Table might not exist yet, which is fine
            console.log('Schema migration skipped (table may not exist yet)');
        }
    }

    // Dashboard methods
    getFilteredCrops(filters, limit = 50, offset = 0) {
        console.log('🔍 DB DEBUG: getFilteredCrops called with:', { filters, limit, offset });
        
        let baseQuery = `
            SELECT sc.*, cr.notes, cr.is_jonathan, cr.activities, cr.top_clothing, cr.reviewed_at
            FROM saved_crops sc
            LEFT JOIN crop_reviews cr ON sc.id = cr.crop_id
        `;
        
        let whereConditions = [];
        let params = [];
        
        // Apply filters
        if (filters.status && filters.status !== 'all') {
            switch (filters.status) {
                case 'unreviewed':
                    whereConditions.push('cr.crop_id IS NULL');
                    break;
                case 'reviewed':
                    whereConditions.push('cr.crop_id IS NOT NULL');
                    break;
                case 'classified':
                    whereConditions.push('cr.crop_id IS NOT NULL');
                    break;
            }
        }
        
        if (filters.jonathan && filters.jonathan !== 'all') {
            whereConditions.push('cr.is_jonathan = ?');
            params.push(filters.jonathan);
        }
        
        if (filters.activity && filters.activity !== 'all') {
            whereConditions.push('cr.activities LIKE ?');
            params.push(`%"${filters.activity}"%`);
        }
        
        if (filters.clothing && filters.clothing !== 'all') {
            whereConditions.push('cr.top_clothing = ?');
            params.push(filters.clothing);
        }
        
        if (whereConditions.length > 0) {
            baseQuery += ' WHERE ' + whereConditions.join(' AND ');
        }
        
        baseQuery += ' ORDER BY sc.saved_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        
        console.log('📝 DB DEBUG: Final SQL query:', baseQuery);
        console.log('📋 DB DEBUG: Query parameters:', params);
        
        const stmt = this.db.prepare(baseQuery);
        const results = stmt.all(...params);
        
        console.log('📊 DB DEBUG: Query returned', results.length, 'results');
        if (results.length > 0) {
            console.log('📁 DB DEBUG: First result crop paths:', {
                crop_folder: results[0].crop_folder,
                crop_filename: results[0].crop_filename,
                original_camera: results[0].original_camera,
                original_filename: results[0].original_filename
            });
        }
        
        return results;
    }

    getFilteredCropsCount(filters) {
        console.log('🔍 DB DEBUG: getFilteredCropsCount called with:', filters);
        
        let baseQuery = `
            SELECT COUNT(*) as total
            FROM saved_crops sc
            LEFT JOIN crop_reviews cr ON sc.id = cr.crop_id
        `;
        
        let whereConditions = [];
        let params = [];
        
        // Apply same filters as getFilteredCrops
        if (filters.status && filters.status !== 'all') {
            switch (filters.status) {
                case 'unreviewed':
                    whereConditions.push('cr.crop_id IS NULL');
                    break;
                case 'reviewed':
                    whereConditions.push('cr.crop_id IS NOT NULL');
                    break;
                case 'classified':
                    whereConditions.push('cr.crop_id IS NOT NULL');
                    break;
            }
        }
        
        if (filters.jonathan && filters.jonathan !== 'all') {
            whereConditions.push('cr.is_jonathan = ?');
            params.push(filters.jonathan);
        }
        
        if (filters.activity && filters.activity !== 'all') {
            whereConditions.push('cr.activities LIKE ?');
            params.push(`%"${filters.activity}"%`);
        }
        
        if (filters.clothing && filters.clothing !== 'all') {
            whereConditions.push('cr.top_clothing = ?');
            params.push(filters.clothing);
        }
        
        if (whereConditions.length > 0) {
            baseQuery += ' WHERE ' + whereConditions.join(' AND ');
        }
        
        console.log('📝 DB DEBUG: Count SQL query:', baseQuery);
        console.log('📋 DB DEBUG: Count parameters:', params);
        
        const stmt = this.db.prepare(baseQuery);
        const result = stmt.get(...params);
        
        console.log('📊 DB DEBUG: Count result:', result);
        
        return result.total;
    }

    close() {
        this.db.close();
    }
}

module.exports = TrafficCameraDB;
