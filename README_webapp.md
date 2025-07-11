# Traffic Camera Viewer - Node.js Web Application

A modern web application to view and browse captured traffic camera images from the Python capture system.

## Features

- **Overview Dashboard**: See latest images from all cameras at a glance
- **Individual Camera View**: Browse all images from specific cameras with pagination
- **Image Modal**: Click any image to view it in full size
- **Real-time Stats**: Monitor total cameras, images, and storage usage
- **Auto-refresh**: Automatically updates every 30 seconds
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Modern UI**: Clean, intuitive interface with smooth animations

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

The application provides several REST API endpoints:

- `GET /api/cameras` - List all available cameras
- `GET /api/cameras/:name/images` - Get images for a specific camera (with pagination)
- `GET /api/latest` - Get latest image from each camera
- `GET /api/stats` - Get system statistics

### Web Interface

1. **Overview Tab**: 
   - Shows latest image from each camera
   - Displays image count and last update time
   - Click any image to view full size

2. **All Cameras Tab**:
   - Select a camera from dropdown
   - Browse all images with pagination (20 per page)
   - View image details (filename, timestamp, size)

3. **Timeline Tab**:
   - Placeholder for future timeline functionality

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
