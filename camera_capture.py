import json
import os
import time
import hashlib
import requests
from datetime import datetime
from pathlib import Path
from PIL import Image
import io
import logging

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('camera_capture.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class CameraCapture:
    def __init__(self, config_file='config.json'):
        """Initialize the camera capture system."""
        self.config_file = config_file
        self.cameras = self.load_config()
        self.output_dir = Path('captured_images')
        self.output_dir.mkdir(exist_ok=True)
        self.last_image_hashes = {}
        
    def load_config(self):
        """Load camera configuration from config file."""
        try:
            with open(self.config_file, 'r') as f:
                config = json.load(f)
            return config.get('cameras', [])
        except Exception as e:
            logger.error(f"Failed to load config: {e}")
            return []
    
    def get_camera_name(self, camera_config):
        """Get camera name from config or extract from URL."""
        # If camera_config is a dict with name, use it
        if isinstance(camera_config, dict) and 'name' in camera_config:
            return camera_config['name']
        
        # Fallback to URL-based naming for backward compatibility
        url = camera_config.get('url') if isinstance(camera_config, dict) else camera_config
        
        # Extract meaningful part from URL
        if 'kirklandwa.gov' in url:
            # Extract camera name from Kirkland URLs
            name = url.split('/')[-1].replace('PTZ.jpg', '').replace('.jpg', '')
        elif 'redmond.gov' in url:
            # Extract camera number from Redmond URLs
            name = f"redmond_cam_{url.split('/')[-1].split('.')[0]}"
        else:
            # Fallback: use hash of URL
            name = f"camera_{hashlib.md5(url.encode()).hexdigest()[:8]}"
        
        # Clean up name for folder creation
        name = "".join(c for c in name if c.isalnum() or c in ('-', '_')).strip()
        return name
    
    def calculate_image_hash(self, image_data):
        """Process image for similarity comparison."""
        try:
            # Open image and convert to grayscale for comparison
            img = Image.open(io.BytesIO(image_data))
            img = img.convert('L')  # Convert to grayscale
            
            # Use reasonable resolution for pixel comparison
            # Higher resolution preserves more detail for traffic cameras
            img = img.resize((256, 256))
            
            # Return the pixel data as a list for direct comparison
            pixels = list(img.getdata())
            return pixels
            
        except Exception as e:
            logger.error(f"Failed to process image: {e}")
            return None
    
    def images_similar(self, pixels1, pixels2, threshold=0.9999):
        """Check if two images are similar by comparing pixels directly."""
        if pixels1 is None or pixels2 is None:
            return False
        
        if len(pixels1) != len(pixels2):
            return False
        
        # Count identical pixels
        identical_pixels = 0
        total_pixels = len(pixels1)
        
        for i in range(total_pixels):
            if pixels1[i] == pixels2[i]:
                identical_pixels += 1
        
        # Calculate similarity as percentage of identical pixels
        similarity = identical_pixels / total_pixels
        is_similar = similarity >= threshold
        
        if not is_similar:
            different_pixels = total_pixels - identical_pixels
            logger.info(f"Images differ in {different_pixels}/{total_pixels} pixels, similarity: {similarity:.4f}")
        
        return is_similar
    
    def download_image(self, url, timeout=30):
        """Download image from URL."""
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            response = requests.get(url, timeout=timeout, headers=headers)
            response.raise_for_status()
            return response.content
        except Exception as e:
            logger.error(f"Failed to download from {url}: {e}")
            return None
    
    def save_image(self, camera_name, image_data, timestamp):
        """Save image to appropriate folder."""
        try:
            camera_dir = self.output_dir / camera_name
            camera_dir.mkdir(exist_ok=True)
            
            filename = f"{timestamp.strftime('%Y%m%d_%H%M%S')}.jpg"
            filepath = camera_dir / filename
            
            with open(filepath, 'wb') as f:
                f.write(image_data)
            
            logger.info(f"Saved image: {filepath}")
            return True
        except Exception as e:
            logger.error(f"Failed to save image for {camera_name}: {e}")
            return False
    
    def capture_camera(self, camera_config):
        """Capture image from a single camera - single attempt only."""
        # Handle both old (string) and new (dict) format
        if isinstance(camera_config, dict):
            url = camera_config['url']
            camera_name = camera_config.get('name') or self.get_camera_name(camera_config)
        else:
            url = camera_config
            camera_name = self.get_camera_name(camera_config)
        
        logger.info(f"Capturing from {camera_name}")
        
        # Download image
        image_data = self.download_image(url)
        if image_data is None:
            logger.warning(f"Download failed for {camera_name}, will try again next cycle")
            return False
        
        # Process image for pixel comparison
        current_pixels = self.calculate_image_hash(image_data)
        if current_pixels is None:
            logger.warning(f"Image processing failed for {camera_name}, will try again next cycle")
            return False
        
        # Check similarity with last image
        last_pixels = self.last_image_hashes.get(camera_name)
        if last_pixels and self.images_similar(current_pixels, last_pixels):
            logger.info(f"Image from {camera_name} is too similar to previous (99.99% threshold), skipping save")
            return False
        elif last_pixels:
            logger.info(f"Image from {camera_name} is different enough from previous, will save")
        else:
            logger.info(f"First image from {camera_name}, will save")
        
        # Save new image
        timestamp = datetime.now()
        if self.save_image(camera_name, image_data, timestamp):
            self.last_image_hashes[camera_name] = current_pixels
            logger.info(f"Successfully captured and saved new image from {camera_name}")
            return True
        else:
            logger.warning(f"Save failed for {camera_name}, will try again next cycle")
            return False
    
    def capture_all_cameras(self):
        """Capture images from all cameras."""
        logger.info(f"Starting capture cycle for {len(self.cameras)} cameras")
        successful = 0
        
        for camera_config in self.cameras:
            try:
                if self.capture_camera(camera_config):
                    successful += 1
            except Exception as e:
                camera_name = self.get_camera_name(camera_config)
                logger.error(f"Unexpected error capturing from {camera_name}: {e}")
        
        logger.info(f"Capture cycle complete: {successful}/{len(self.cameras)} successful")
        return successful
    
    def run_continuous(self, interval=30):
        """Run continuous capture every interval seconds."""
        logger.info(f"Starting continuous capture with {interval}s interval")
        
        while True:
            try:
                start_time = time.time()
                self.capture_all_cameras()
                
                # Calculate sleep time to maintain interval
                elapsed = time.time() - start_time
                sleep_time = max(0, interval - elapsed)
                
                if sleep_time > 0:
                    logger.info(f"Waiting {sleep_time:.1f}s until next capture cycle")
                    time.sleep(sleep_time)
                else:
                    logger.warning(f"Capture cycle took {elapsed:.1f}s, longer than {interval}s interval")
                    
            except KeyboardInterrupt:
                logger.info("Stopping capture (Ctrl+C pressed)")
                break
            except Exception as e:
                logger.error(f"Unexpected error in main loop: {e}")
                time.sleep(10)  # Wait before retrying

def main():
    """Main entry point."""
    capture = CameraCapture()
    
    if not capture.cameras:
        logger.error("No cameras configured. Please check config.json")
        return
    
    logger.info(f"Loaded {len(capture.cameras)} cameras")
    
    # Create camera folders
    for camera_config in capture.cameras:
        camera_name = capture.get_camera_name(camera_config)
        camera_dir = capture.output_dir / camera_name
        camera_dir.mkdir(exist_ok=True)
        logger.info(f"Created directory for camera: {camera_name}")
    
    # Start continuous capture
    capture.run_continuous(interval=30)

if __name__ == "__main__":
    main()
