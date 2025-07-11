# Traffic Camera Capture System

This application automatically captures images from traffic cameras at regular intervals, avoiding duplicate images based on similarity detection.

## Features

- Captures images from multiple traffic cameras every 30 seconds
- Detects similar images (99.99% similarity threshold) and skips saving them
- No retries - failed captures will be attempted again on the next cycle
- Saves images to organized folders by camera name
- Logs all activities to both console and log file
- Robust error handling and recovery

## Setup

1. Install Python dependencies:
   ```
   pip install -r requirements.txt
   ```

2. Ensure `config.json` contains your camera URLs in the format:
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

Run the camera capture system:
```
python camera_capture.py
```

The program will:
- Create a `captured_images` folder with subfolders for each camera
- Start capturing images every 30 seconds
- Log activities to `camera_capture.log`
- Continue running until stopped with Ctrl+C

## Output Structure

```
captured_images/
├── 98th_Ave_116th_St/
│   ├── 20250710_143022.jpg
│   ├── 20250710_143122.jpg
│   └── ...
├── 132nd_St_108th_Ave/
│   ├── 20250710_143025.jpg
│   └── ...
└── ...
```

## Configuration

- **Capture Interval**: 30 seconds
- **Similarity Threshold**: 99.99%
- **Retry Logic**: No retries - failed captures attempted on next cycle
- **Image Format**: JPEG

## Logging

All activities are logged to:
- Console output
- `camera_capture.log` file

Log levels include INFO, WARNING, and ERROR messages for monitoring system health.
