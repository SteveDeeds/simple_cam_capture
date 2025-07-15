# Database Schema for Traffic Camera System

## Overview

The database uses SQLite with a factors-based classification system for crop reviews. This design provides flexibility for adding new classification criteria without schema changes.

## Core Tables

### 1. image_views
Tracks each time an image is viewed
```sql
CREATE TABLE image_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    camera_name TEXT NOT NULL,
    filename TEXT NOT NULL,
    viewer_ip TEXT NOT NULL,
    viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_agent TEXT
);
```

### 2. image_stats
Summary stats for each image (for performance)
```sql
CREATE TABLE image_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    camera_name TEXT NOT NULL,
    filename TEXT NOT NULL,
    total_views INTEGER DEFAULT 0,
    unique_viewers INTEGER DEFAULT 0,
    first_viewed_at DATETIME,
    last_viewed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    archived_path TEXT,
    UNIQUE(camera_name, filename)
);
```

### 3. saved_crops
Tracks saved zoom/crop images
```sql
CREATE TABLE saved_crops (
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
);
```

### 4. crop_reviews
Stores review data for crops (maintains backward compatibility)
```sql
CREATE TABLE crop_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crop_id INTEGER NOT NULL,
    notes TEXT,
    is_jonathan TEXT CHECK(is_jonathan IN ('could be', 'can''t tell', 'no')),
    activities TEXT,
    top_clothing TEXT CHECK(top_clothing IN ('long sleeves', 'short sleeves', 'can''t tell')),
    reviewed_by_ip TEXT,
    reviewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (crop_id) REFERENCES saved_crops(id),
    UNIQUE(crop_id)
);
```

## Factors-Based Classification Tables

### 5. factors
Stores all available classification factors
```sql
CREATE TABLE factors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK(type IN ('positive', 'negative')),
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 6. crop_review_positive_factors
Junction table linking reviews to positive factors
```sql
CREATE TABLE crop_review_positive_factors (
    crop_review_id INTEGER NOT NULL,
    factor_id INTEGER NOT NULL,
    PRIMARY KEY (crop_review_id, factor_id),
    FOREIGN KEY (crop_review_id) REFERENCES crop_reviews(id) ON DELETE CASCADE,
    FOREIGN KEY (factor_id) REFERENCES factors(id) ON DELETE CASCADE
);
```

### 7. crop_review_negative_factors
Junction table linking reviews to negative factors
```sql
CREATE TABLE crop_review_negative_factors (
    crop_review_id INTEGER NOT NULL,
    factor_id INTEGER NOT NULL,
    PRIMARY KEY (crop_review_id, factor_id),
    FOREIGN KEY (crop_review_id) REFERENCES crop_reviews(id) ON DELETE CASCADE,
    FOREIGN KEY (factor_id) REFERENCES factors(id) ON DELETE CASCADE
);
```

### 8. viewer_sessions
Track unique visitors (optional)
```sql
CREATE TABLE viewer_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE NOT NULL,
    ip_address TEXT NOT NULL,
    user_agent TEXT,
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    page_views INTEGER DEFAULT 1
);
```

## Indexes for Performance
```sql
-- Core table indexes
CREATE INDEX idx_image_views_camera_file ON image_views(camera_name, filename);
CREATE INDEX idx_image_views_ip ON image_views(viewer_ip);
CREATE INDEX idx_image_views_date ON image_views(viewed_at);
CREATE INDEX idx_image_stats_camera_file ON image_stats(camera_name, filename);
CREATE INDEX idx_saved_crops_original ON saved_crops(original_camera, original_filename);

-- Factors table indexes
CREATE INDEX idx_factors_type ON factors(type);
CREATE INDEX idx_factors_name ON factors(name);

-- Junction table indexes
CREATE INDEX idx_positive_factors_review ON crop_review_positive_factors(crop_review_id);
CREATE INDEX idx_positive_factors_factor ON crop_review_positive_factors(factor_id);
CREATE INDEX idx_negative_factors_review ON crop_review_negative_factors(crop_review_id);
CREATE INDEX idx_negative_factors_factor ON crop_review_negative_factors(factor_id);
```

## Default Factors

The system includes 18 pre-seeded factors:

### Positive Factors (8)
- `blue shirt` - Person is wearing a blue shirt
- `riding a bike` - Person is riding a bicycle  
- `waiting for bus` - Person appears to be waiting for a bus
- `at bus stop` - Person is at or near a bus stop
- `tall person` - Person appears to be tall
- `dark hair` - Person has dark colored hair
- `backpack` - Person is wearing or carrying a backpack
- `casual clothing` - Person is dressed casually

### Negative Factors (10)
- `red shirt` - Person is wearing a red shirt
- `yellow shirt` - Person is wearing a yellow shirt
- `white shirt` - Person is wearing a white shirt
- `driving car` - Person is driving a car
- `short person` - Person appears to be short
- `blonde hair` - Person has blonde colored hair
- `formal clothing` - Person is dressed formally
- `child` - Person appears to be a child
- `elderly person` - Person appears to be elderly
- `woman` - Person appears to be a woman

## Data Relationships

```
saved_crops (1) ←→ (1) crop_reviews
                         ↓
                    (1) ←→ (M) crop_review_positive_factors ←→ (M) ←→ (1) factors
                         ↓
                    (1) ←→ (M) crop_review_negative_factors ←→ (M) ←→ (1) factors
```

## Migration Strategy

- All existing columns in `crop_reviews` are preserved for backward compatibility
- New factors system is additive - existing functionality continues to work
- Automatic migration creates new tables and seeds initial factors
- No manual intervention required for existing installations
## Managing Factors

### Using DB Browser for SQLite (Recommended)
1. Download from https://sqlitebrowser.org/
2. Open `traffic_cameras.db`
3. Navigate to the `factors` table
4. Edit factors directly in the browser

### Using Command Line Scripts
```bash
# View all factors
node -e "const db = require('./database.js'); const dbInstance = new db(); console.table(dbInstance.getAllFactors()); dbInstance.close();"

# Add a new factor
node -e "const db = require('./database.js'); const dbInstance = new db(); dbInstance.createFactor('wearing glasses', 'positive', 'Person is wearing glasses'); console.log('Factor added'); dbInstance.close();"

# Update a factor
node -e "const db = require('./database.js'); const dbInstance = new db(); dbInstance.updateFactor(1, 'light blue shirt', 'positive', 'Person is wearing a light blue shirt'); console.log('Factor updated'); dbInstance.close();"

# Delete a factor (careful - removes all associations)
node -e "const db = require('./database.js'); const dbInstance = new db(); dbInstance.deleteFactor(9); console.log('Factor deleted'); dbInstance.close();"
```

### Database API Methods
- `createFactor(name, type, description)` - Create new factor
- `updateFactor(id, name, type, description)` - Update existing factor  
- `deleteFactor(id)` - Delete factor and all associations
- `getAllFactors()` - Get all factors
- `getFactorsByType(type)` - Get factors by type
- `addFactorToReview(reviewId, factorId, isPositive)` - Assign factor to review
- `setFactorsForReview(reviewId, positiveIds, negativeIds)` - Set all factors at once
