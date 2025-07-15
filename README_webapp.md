# Traffic Camera Viewer & Crop Review System

A modern web application for viewing captured traffic camera images and reviewing cropped areas using a flexible factors-based classification system.

## Features

### Image Viewing & Cropping
- **Overview Dashboard**: See latest images from all cameras at a glance
- **Individual Camera View**: Browse all images from specific cameras with pagination
- **Interactive Cropping**: Click and drag to crop areas of interest from images
- **Image Modal**: Click any image to view it in full size
- **Real-time Stats**: Monitor total cameras, images, and storage usage
- **Auto-refresh**: Automatically updates every 30 seconds
- **Responsive Design**: Works on desktop, tablet, and mobile devices

### Crop Review System
- **Factors-Based Classification**: Use predefined or custom factors to classify crops
- **Positive/Negative Factors**: Assign factors that suggest whether a person is the target individual
- **Image Enhancement**: Auto-sharpen and enhance crops for better visibility
- **Auto-save**: Automatically saves reviews as you make changes
- **Review Dashboard**: Browse and filter all crops with advanced search
- **Keyboard Shortcuts**: Speed up review process with keyboard navigation

### Database & Analytics
- **SQLite Database**: Robust local storage with proper indexing
- **Migration Support**: Backward-compatible schema migrations
- **Statistical Analysis**: Track review progress and factor usage
- **Export Capabilities**: API endpoints for data export and analysis

## Prerequisites

- Node.js (v14 or higher)
- npm (Node Package Manager)
- Running Python camera capture system that creates the `captured_images` folder

## Installation

1. Install Node.js dependencies:
```bash
   npm install
   ```

2. For development with auto-restart:
```bash
   npm install -g nodemon
   ```

## Usage

### Start the Web Server

```bash
npm start
```

Or for development mode with auto-restart:
```bash
npm run dev
```

The application will be available at: `http://localhost:3000`

### API Endpoints

#### Core Image API
- `GET /api/cameras` - List all available cameras
- `GET /api/cameras/:name/images` - Get images for a specific camera (with pagination)
- `GET /api/latest` - Get latest image from each camera
- `GET /api/stats` - Get system statistics

#### Crop Management API
- `POST /api/crops` - Save a new crop from an image
- `GET /api/crops` - Get all saved crops (with pagination and filters)
- `GET /api/crops/:id` - Get a specific crop by ID
- `DELETE /api/crops/:id` - Delete a crop and its files
- `GET /api/crops/unreviewed` - Get crops that haven't been reviewed yet

#### Review & Classification API
- `POST /api/crops/:id/review` - Save or update a crop review
- `GET /api/crops/:id/review` - Get existing review for a crop
- `GET /api/review/stats` - Get review statistics

#### Factors Management API
- `GET /api/factors` - Get all classification factors
- `GET /api/factors/:type` - Get factors by type (positive/negative)
- `POST /api/factors` - Create a new factor
- `PUT /api/factors/:id` - Update an existing factor
- `DELETE /api/factors/:id` - Delete a factor

### Web Interface

#### Main Pages
1. **Home Page** (`/`): 
   - Shows latest image from each camera
   - Interactive cropping interface
   - Click any image to view full size or create crops

2. **Crop Review** (`/crop-review.html`):
   - Review queue for unreviewed crops
   - Factors-based classification system
   - Image enhancement and filtering
   - Keyboard shortcuts for efficient review

3. **Dashboard** (`/dashboard.html`):
   - Browse all crops with advanced filtering
   - Search by classification, activity, clothing, etc.
   - Pagination and sorting options
   - Export capabilities

#### Factors-Based Classification

The system uses a flexible factors approach:

- **Positive Factors**: Attributes suggesting the person IS the target individual
- **Negative Factors**: Attributes suggesting the person is NOT the target individual
- **Neutral Factors**: Informational attributes for filtering

Example factors:
- `blue shirt` (positive) - Person is wearing a blue shirt
- `riding bicycle` (positive) - Person is riding a bicycle  
- `child or youth` (negative) - Person appears to be a child
- `driving vehicle` (negative) - Person is driving a car

#### Managing Factors

Factors can be managed through:

1. **Database Browser** (recommended for bulk edits):
   ```bash
   # Download from https://sqlitebrowser.org/
   # Open traffic_cameras.db and edit the 'factors' table
   ```

2. **Command Line Tool**:
   ```bash
   # List all factors
   node manage-factors.js list
   
   # Add new factor
   node manage-factors.js add "wearing glasses" positive "Person is wearing glasses"
   
   # Update existing factor
   node manage-factors.js update 1 "light blue shirt" positive "Person is wearing a light blue shirt"
   
   # Seed better default factors
   node manage-factors.js seed-better
   ```

3. **API Endpoints** (for programmatic access):
   ```javascript
   // Get all factors
   fetch('/api/factors')
   
   // Create new factor
   fetch('/api/factors', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       name: 'wearing glasses',
       type: 'positive', 
       description: 'Person is wearing glasses'
     })
   })
   ```

## File Structure

```
├── server.js              # Express.js server
├── package.json           # Node.js dependencies
├── public/                # Static web files
│   ├── index.html         # Main web page
│   ├── style.css          # Styles and responsive design
│   └── script.js          # Client-side JavaScript
├── captured_images/       # Images from Python capture system
│   ├── Camera_Name_1/     # Individual camera folders
│   │   ├── 20250710_143022.jpg
│   │   └── ...
│   └── Camera_Name_2/
└── README.md              # This file
```

## Configuration

### Port Configuration
Default port is 3000. To change:
```bash
PORT=8080 npm start
```

### Images Per Page
Edit `imagesPerPage` variable in `public/script.js` to change pagination size.

### Auto-refresh Interval
Edit the interval in `startAutoRefresh()` function in `public/script.js` (default: 30 seconds).

## Development

### Adding New Features

1. **Server-side**: Add new routes in `server.js`
2. **Client-side**: Add new functionality in `public/script.js`
3. **Styling**: Update `public/style.css`
4. **UI**: Modify `public/index.html`

### API Development
The application uses Express.js with a RESTful API design. All API endpoints return JSON responses.

## Troubleshooting

### No Images Showing
- Ensure the Python camera capture system is running
- Check that `captured_images` folder exists
- Verify camera folders contain `.jpg` files

### Server Won't Start
- Check if port 3000 is available
- Verify Node.js is installed: `node --version`
- Install dependencies: `npm install`

### Images Not Loading
- Check browser console for errors
- Verify image file permissions
- Ensure static file serving is working

## Future Enhancements

- Timeline view with time-based filtering
- Image comparison tools
- Export functionality
- Real-time notifications for new images
- Camera configuration management
- Image analytics and statistics
- Mobile app version

## Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge
- Mobile browsers (iOS Safari, Chrome Mobile)

## Performance Notes

- Images are served statically for best performance
- Pagination prevents loading too many images at once
- Auto-refresh is optimized to only update visible content
- Image thumbnails could be added for faster loading in future versions
