# Database Schema for Traffic Camera System

## Tables Design

### 1. image_views
Tracks each time an image is viewed
```sql
CREATE TABLE image_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    camera_name TEXT NOT NULL,
    filename TEXT NOT NULL,
    viewer_ip TEXT NOT NULL,
    viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_agent TEXT,
    UNIQUE(camera_name, filename, viewer_ip, DATE(viewed_at))
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
    saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT
);
```

### 4. viewer_sessions
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
CREATE INDEX idx_image_views_camera_file ON image_views(camera_name, filename);
CREATE INDEX idx_image_views_ip ON image_views(viewer_ip);
CREATE INDEX idx_image_views_date ON image_views(viewed_at);
CREATE INDEX idx_image_stats_camera_file ON image_stats(camera_name, filename);
CREATE INDEX idx_saved_crops_original ON saved_crops(original_camera, original_filename);
```
