# Traffic Camera Capture & Review System

This application automatically captures images from traffic cameras and provides a web-based interface for reviewing and classifying crops of people in the images using a flexible factors-based system.

## Features

### Camera Capture
- Captures images from multiple traffic cameras every 30 seconds
- Detects similar images (99.99% similarity threshold) and skips saving them
- No retries - failed captures will be attempted again on the next cycle
- Saves images to organized folders by camera name
- Logs all activities to both console and log file
- Robust error handling and recovery

### Web-Based Review System
- Crop areas of interest from captured images
- Review and classify crops using a flexible factors-based system
- Factors include visual attributes (clothing color, activities, physical traits)
- Support for both positive and negative factors
- Auto-save functionality during review
- Image enhancement and filtering for better visibility
- Dashboard for browsing and filtering reviewed crops

## Setup

### Python Dependencies
1. Install Python dependencies:
   ```
   pip install -r requirements.txt
   ```

### Node.js Dependencies  
2. Install Node.js dependencies for the web interface:
   ```
   npm install
   ```

### Configuration
3. Ensure `config.json` contains your camera URLs in the format:
   ```json
   {
     "cameras": [
       {
         "name": "Camera_Name", 
         "url": "https://example.com/camera1.jpg"
       }
     ]
   }
   ```

## Usage

### Start the Camera Capture System
```
python camera_capture.py
```

### Start the Web Server
```
npm start
```
or
```
node server.js
```

The web interface will be available at `http://localhost:3000`

### Available Web Pages
- **Main Interface** (`/`): View live camera feeds and crop areas of interest
- **Crop Review** (`/crop-review.html`): Review and classify saved crops using factors
- **Dashboard** (`/dashboard.html`): Browse and filter all crops with advanced search

## Factors-Based Classification System

The system uses a flexible factors-based approach for classifying crops:

### Factor Types
- **Positive Factors**: Attributes that suggest the person IS the target individual
- **Negative Factors**: Attributes that suggest the person is NOT the target individual

### Default Factors Include:
- **Clothing**: shirt colors, clothing style
- **Activities**: riding bike, waiting for bus, etc.
- **Physical Traits**: height, hair color, age appearance
- **Context**: location context, accessories

### Managing Factors
Factors can be managed through:
1. **Database Browser** (recommended for bulk edits)
2. **Command Line Scripts** (for programmatic updates)
3. **API Endpoints** (for web-based management - future feature)

## Database Schema

The system uses SQLite with the following key tables:
- `factors` - Stores all available classification factors
- `crop_reviews` - Stores review data for each crop
- `crop_review_positive_factors` - Links reviews to positive factors
- `crop_review_negative_factors` - Links reviews to negative factors
- `saved_crops` - Stores crop metadata and file locations

See `FACTORS_DATABASE_DESIGN.md` for detailed schema documentation.
