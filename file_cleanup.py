import os
import sqlite3
import logging
import shutil
from pathlib import Path
from datetime import datetime, timedelta
import time

# Set up logging, consistent with camera_capture.py
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('file_cleanup.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

def find_old_files(directory: str | Path, hours: int) -> list[Path]:
    """
    Finds files in a directory and its subdirectories older than a specified
    number of hours based on their modification time.

    Args:
        directory: The path (string or Path object) to the directory to search.
        hours: The age in hours to consider a file "old".

    Returns:
        A list of Path objects for files older than the specified age.
    """
    search_path = Path(directory)
    if not search_path.is_dir():
        logger.error(f"Directory not found at '{directory}'")
        return []

    # Calculate the time threshold for what is considered "old"
    now = datetime.now()
    time_threshold = now - timedelta(hours=hours)

    logger.info(f"Searching for files in '{search_path}'...")
    logger.info(f"Finding files older than {hours} hours (modified before {time_threshold.strftime('%Y-%m-%d %H:%M:%S')}).")

    old_files = []
    # Use rglob to recursively find all files in all subdirectories
    for file_path in search_path.rglob('*'):
        if file_path.is_file():
            try:
                # Get the file's modification time as a datetime object
                mod_time = datetime.fromtimestamp(file_path.stat().st_mtime)

                # Check if the file is older than the threshold
                if mod_time < time_threshold:
                    old_files.append(file_path)
            except FileNotFoundError:
                # File might have been deleted during the scan, so we skip it
                logger.warning(f"File not found during scan, skipping: {file_path}")
                continue

    return old_files

def filter_files_by_rule(file_paths: list[Path], db_path: Path, rule: dict) -> tuple[list[Path], dict]:
    """
    Gathers statistics and filters files based on a single cleanup rule.

    A file is marked for moving if it matches the provided rule.

    Args:
        file_paths: A list of Path objects to check.
        db_path: The path to the SQLite database.
        rule: A rule dictionary. The dict must contain 'age_hours',
              'min_views', and 'max_crops'.

    Returns:
        A tuple containing:
        - A list of Path objects that meet the criteria for moving.
        - A dictionary with summary statistics of the initial file set.
    """
    summary_stats = {'total_in_db': 0, 'with_multiple_views': 0, 'with_crops': 0}
    if not file_paths:
        return [], summary_stats

    if not db_path.is_file():
        logger.error(f"Database not found at '{db_path}'. Cannot filter files.")
        return [], summary_stats

    filenames_to_check = [p.name for p in file_paths]
    path_map = {p.name: p for p in file_paths}

    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        placeholders = ','.join('?' for _ in filenames_to_check)
        # This query gets view and crop counts for all candidate files in one go.
        query = f"""
            SELECT
                s.filename,
                s.total_views,
                COUNT(c.id) as crop_count
            FROM
                image_stats s
            LEFT JOIN
                saved_crops c ON s.filename = c.original_filename
            WHERE
                s.filename IN ({placeholders})
            GROUP BY
                s.filename
        """

        params = filenames_to_check
        logger.info(f"Querying DB for stats on {len(filenames_to_check)} files...")
        cursor.execute(query, params)

        db_results = cursor.fetchall()
        summary_stats['total_in_db'] = len(db_results)

        # Create a lookup map for file stats from the database.
        # This allows us to efficiently find stats for any given filename.
        stats_map = {filename: {'views': total_views, 'crops': crop_count}
                     for filename, total_views, crop_count in db_results}

        files_to_move = []
        now = datetime.now()

        # Iterate through ALL candidate files from the filesystem scan.
        # This is crucial for correctly handling files that have no database entry.
        for file_path in file_paths:
            filename = file_path.name

            # Get stats from our map, or default to 0 if no DB entry exists.
            file_stats = stats_map.get(filename, {'views': 0, 'crops': 0})
            total_views = file_stats['views']
            crop_count = file_stats['crops']

            # Gather summary stats across all candidate files
            if total_views >= rule['min_views']:
                summary_stats['with_multiple_views'] += 1
            if crop_count > 0:
                summary_stats['with_crops'] += 1

            # Check the file against the rule.
            try:
                mod_time = datetime.fromtimestamp(file_path.stat().st_mtime)
                age_hours = (now - mod_time).total_seconds() / 3600
            except FileNotFoundError:
                continue  # Skip if file was deleted since scan

            if (age_hours >= rule['age_hours'] and
                total_views >= rule['min_views'] and
                crop_count <= rule['max_crops']):
                files_to_move.append(file_path)

        return list(set(files_to_move)), summary_stats

    except sqlite3.Error as e:
        logger.error(f"Database error: {e}")
        return [], summary_stats
    finally:
        if conn:
            conn.close()

def move_files_and_update_records(files_to_move: list[Path], db_path: Path, archive_drive: str = "G:", dry_run: bool = True):
    """
    Moves files from the filesystem to an archive drive and updates their records in the database.
    Uses a transaction to ensure atomicity.

    Args:
        files_to_move: A list of Path objects to move.
        db_path: The path to the SQLite database.
        archive_drive: The drive letter to move files to (default: "G:").
        dry_run: If True, only log what would be moved without performing actions.
    """
    if not files_to_move:
        logger.info("No files to move.")
        return

    # Ensure archive drive exists
    archive_path = Path(archive_drive)
    if not dry_run and not archive_path.exists():
        logger.error(f"Archive drive {archive_drive} not found. Cannot move files.")
        return

    if dry_run:
        logger.info(f"[DRY RUN] The following files would be moved to {archive_drive} and their DB records updated:")
        logger.info(f"[DRY RUN] NOTE: Files that fail to move would be DELETED to prevent main drive from filling up.")

        total_size_bytes = 0
        for f in files_to_move:
            try:
                total_size_bytes += f.stat().st_size
            except FileNotFoundError:
                logger.warning(f"Could not stat file for size calculation (it may have been deleted already): {f}")
                continue

        logger.info(f"[DRY RUN] Total: {len(files_to_move)} files, {format_bytes(total_size_bytes)} to be moved. To execute, set DRY_RUN = False.")
        return

    logger.warning("---[ LIVE RUN ]---")
    logger.warning(f"Preparing to move {len(files_to_move)} files to {archive_drive} and update their database records.")

    # Create archive directory structure
    archive_base = archive_path / "archived_camera_images"
    
    # --- Step 1: Move files from filesystem with a delay to reduce I/O load ---
    logger.info(f"Moving files to {archive_base}...")
    moved_count = 0
    space_moved_bytes = 0
    successful_moves = []
    failed_moves = []
    
    for file_path in files_to_move:
        try:
            file_size = file_path.stat().st_size
            
            # Preserve the original directory structure
            relative_path = file_path.relative_to(file_path.parent.parent)  # Remove the base captured_images part
            destination = archive_base / relative_path
            
            # Create destination directory if it doesn't exist
            destination.parent.mkdir(parents=True, exist_ok=True)
            
            # Move the file
            shutil.move(str(file_path), str(destination))
            logger.info(f"Moved file: {file_path} -> {destination}")
            moved_count += 1
            space_moved_bytes += file_size
            successful_moves.append(file_path.name)

            # Add the requested delay to free up I/O for other processes
            time.sleep(0.1)  # 100ms delay

        except FileNotFoundError:
            logger.warning(f"File not found (may have been deleted by another process): {file_path}")
            continue
        except Exception as e:
            logger.error(f"Error moving file {file_path}: {e}. Will delete to prevent main drive from filling up.")
            failed_moves.append(file_path)
            continue  # Continue to the next file
    
    # --- Step 1.5: Delete files that failed to move to prevent filling up main drive ---
    deleted_count = 0
    space_freed_bytes = 0
    failed_deletes = []
    
    if failed_moves:
        logger.warning(f"Deleting {len(failed_moves)} files that failed to move to prevent main drive from filling up...")
        
        for file_path in failed_moves:
            try:
                file_size = file_path.stat().st_size
                file_path.unlink()
                logger.info(f"Deleted file that failed to move: {file_path}")
                deleted_count += 1
                space_freed_bytes += file_size
                
                # Small delay to reduce I/O impact
                time.sleep(0.05)
                
            except FileNotFoundError:
                logger.warning(f"File already gone: {file_path}")
                continue
            except Exception as e:
                logger.error(f"Critical: Could not delete file {file_path}: {e}. Manual intervention may be required.")
                failed_deletes.append(file_path)
                continue
        
        if failed_deletes:
            logger.error(f"CRITICAL: {len(failed_deletes)} files could not be moved OR deleted. Manual cleanup required to prevent main drive from filling up:")
            for file_path in failed_deletes:
                logger.error(f"  - {file_path}")
        
        if deleted_count > 0:
            logger.info(f"Deleted {deleted_count} files that couldn't be moved, freed {format_bytes(space_freed_bytes)}")
    
    # Also delete database records for files that were deleted instead of moved
    if deleted_count > 0:
        deleted_filenames = [f.name for f in failed_moves if f not in failed_deletes]
        if deleted_filenames:
            conn = None
            try:
                conn = sqlite3.connect(db_path, timeout=10)
                with conn:
                    cursor = conn.cursor()
                    params = [(name,) for name in deleted_filenames]
                    cursor.executemany("DELETE FROM image_stats WHERE filename = ?", params)
                    stats_deleted_count = cursor.rowcount
                    cursor.executemany("DELETE FROM saved_crops WHERE original_filename = ?", params)
                    crops_deleted_count = cursor.rowcount
                    logger.info(f"DB cleanup: Deleted {stats_deleted_count} image_stats and {crops_deleted_count} saved_crops records for deleted files.")
            except sqlite3.Error as e:
                logger.error(f"Database error during cleanup of deleted file records: {e}")
            finally:
                if conn:
                    conn.close()

    # --- Step 2: Update database records for successfully moved files ---
    if successful_moves:
        # For executemany, we need a list of tuples
        params = [(f"{archive_drive}/archived_camera_images/...", name) for name in successful_moves]

        conn = None
        try:
            # Use a timeout to prevent indefinite waiting if the DB is locked
            conn = sqlite3.connect(db_path, timeout=10)
            with conn:
                cursor = conn.cursor()
                # Update the file path in image_stats to indicate it's archived
                cursor.executemany("UPDATE image_stats SET archived_path = ? WHERE filename = ?", params)
                stats_updated_count = cursor.rowcount
                logger.info(f"DB transaction successful: Updated {stats_updated_count} image_stats records with archive paths.")
        except sqlite3.Error as e:
            logger.error(f"A database error occurred during record update: {e}. Files were moved but database not updated.")
        finally:
            if conn:
                conn.close()

    logger.info(f"---[ LIVE RUN COMPLETE ]---")
    logger.info(f"Successfully moved {moved_count} of {len(files_to_move)} targeted files to {archive_drive}, totaling {format_bytes(space_moved_bytes)}.")
    if deleted_count > 0:
        logger.info(f"Deleted {deleted_count} files that couldn't be moved, freed {format_bytes(space_freed_bytes)}.")
    if len(failed_deletes) > 0:
        logger.error(f"WARNING: {len(failed_deletes)} files could not be moved or deleted and may fill up the main drive!")

def get_disk_usage(drive_path: str | Path) -> dict:
    """
    Get disk usage statistics for a given drive.
    
    Args:
        drive_path: Path to the drive (e.g., "G:" or "G:/")
    
    Returns:
        Dictionary with 'total', 'used', 'free' space in bytes and 'percent_used'
    """
    try:
        drive = Path(drive_path)
        if not drive.exists():
            logger.error(f"Drive {drive_path} not found")
            return {'total': 0, 'used': 0, 'free': 0, 'percent_used': 0}
        
        total, used, free = shutil.disk_usage(drive)
        percent_used = (used / total) * 100 if total > 0 else 0
        
        return {
            'total': total,
            'used': used,
            'free': free,
            'percent_used': percent_used
        }
    except Exception as e:
        logger.error(f"Error getting disk usage for {drive_path}: {e}")
        return {'total': 0, 'used': 0, 'free': 0, 'percent_used': 0}

def format_bytes(size_bytes: int) -> str:
    """Converts bytes to a human-readable string (KB, MB, GB)."""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    if size_bytes < 1024**2:
        return f"{size_bytes / 1024:.2f} KB"
    if size_bytes < 1024**3:
        return f"{size_bytes / 1024**2:.2f} MB"
    return f"{size_bytes / 1024**3:.2f} GB"

def find_oldest_archived_files(archive_path: str | Path, limit: int = 100) -> list[Path]:
    """
    Find the oldest files in the archive directory.
    
    Args:
        archive_path: Path to the archive directory
        limit: Maximum number of files to return
    
    Returns:
        List of Path objects sorted by modification time (oldest first)
    """
    archive_dir = Path(archive_path)
    if not archive_dir.exists():
        logger.warning(f"Archive directory {archive_path} does not exist")
        return []
    
    all_files = []
    for file_path in archive_dir.rglob('*'):
        if file_path.is_file():
            try:
                mod_time = file_path.stat().st_mtime
                all_files.append((mod_time, file_path))
            except (FileNotFoundError, OSError):
                continue  # Skip files that can't be accessed
    
    # Sort by modification time (oldest first) and return up to limit
    all_files.sort(key=lambda x: x[0])
    return [file_path for _, file_path in all_files[:limit]]

def cleanup_archive_space(archive_drive: str = "G:", target_free_gb: float = 5.0, max_cleanup_gb: float = 10.0, dry_run: bool = True) -> dict:
    """
    Clean up old archived files to free space when the archive drive is getting full.
    
    Args:
        archive_drive: The archive drive letter (e.g., "G:")
        target_free_gb: Target free space in GB to maintain
        max_cleanup_gb: Maximum amount of data to delete in one cleanup session (GB)
        dry_run: If True, only simulate the cleanup
    
    Returns:
        Dictionary with cleanup statistics
    """
    logger.info(f"--- Archive Space Cleanup for {archive_drive} ---")
    
    # Get current disk usage
    disk_usage = get_disk_usage(archive_drive)
    if disk_usage['total'] == 0:
        logger.error(f"Cannot access drive {archive_drive}")
        return {'deleted_count': 0, 'space_freed': 0, 'error': 'Drive not accessible'}
    
    free_gb = disk_usage['free'] / (1024**3)
    target_free_bytes = target_free_gb * (1024**3)
    max_cleanup_bytes = max_cleanup_gb * (1024**3)
    
    logger.info(f"Current free space: {format_bytes(disk_usage['free'])} ({free_gb:.2f} GB)")
    logger.info(f"Target free space: {format_bytes(target_free_bytes)} ({target_free_gb:.2f} GB)")
    logger.info(f"Disk usage: {disk_usage['percent_used']:.1f}%")
    
    # Check if cleanup is needed
    if disk_usage['free'] >= target_free_bytes:
        logger.info(f"Archive drive has sufficient free space ({free_gb:.2f} GB >= {target_free_gb:.2f} GB). No cleanup needed.")
        return {'deleted_count': 0, 'space_freed': 0, 'message': 'No cleanup needed'}
    
    space_needed = target_free_bytes - disk_usage['free']
    space_to_free = min(space_needed, max_cleanup_bytes)
    
    logger.warning(f"Archive drive needs cleanup. Need to free {format_bytes(space_to_free)}")
    
    # Find archived files directory
    archive_base = Path(archive_drive) / "archived_camera_images"
    if not archive_base.exists():
        logger.info(f"No archived files found at {archive_base}")
        return {'deleted_count': 0, 'space_freed': 0, 'message': 'No archived files to clean'}
    
    # Find oldest files
    logger.info("Finding oldest archived files...")
    oldest_files = find_oldest_archived_files(archive_base, limit=1000)  # Look at up to 1000 oldest files
    
    if not oldest_files:
        logger.warning("No archived files found to clean")
        return {'deleted_count': 0, 'space_freed': 0, 'message': 'No files found to clean'}
    
    # Calculate which files to delete
    files_to_delete = []
    cumulative_size = 0
    
    for file_path in oldest_files:
        try:
            file_size = file_path.stat().st_size
            if cumulative_size + file_size <= space_to_free:
                files_to_delete.append(file_path)
                cumulative_size += file_size
            else:
                break  # Stop when we've found enough files to delete
        except (FileNotFoundError, OSError):
            continue  # Skip files that can't be accessed
    
    if not files_to_delete:
        logger.warning("No suitable files found for deletion")
        return {'deleted_count': 0, 'space_freed': 0, 'message': 'No suitable files for deletion'}
    
    logger.info(f"Planning to delete {len(files_to_delete)} oldest archived files to free {format_bytes(cumulative_size)}")
    
    if dry_run:
        logger.info(f"[DRY RUN] Would delete {len(files_to_delete)} files totaling {format_bytes(cumulative_size)}")
        logger.info(f"[DRY RUN] Oldest file to delete: {files_to_delete[0]} (modified: {datetime.fromtimestamp(files_to_delete[0].stat().st_mtime)})")
        if len(files_to_delete) > 1:
            logger.info(f"[DRY RUN] Newest file to delete: {files_to_delete[-1]} (modified: {datetime.fromtimestamp(files_to_delete[-1].stat().st_mtime)})")
        return {'deleted_count': 0, 'space_freed': 0, 'would_delete': len(files_to_delete), 'would_free': cumulative_size}
    
    # Actually delete the files
    deleted_count = 0
    space_freed = 0
    
    logger.warning(f"[LIVE RUN] Deleting {len(files_to_delete)} oldest archived files...")
    
    for file_path in files_to_delete:
        try:
            file_size = file_path.stat().st_size
            file_path.unlink()
            deleted_count += 1
            space_freed += file_size
            
            if deleted_count % 50 == 0:  # Log progress every 50 files
                logger.info(f"Deleted {deleted_count}/{len(files_to_delete)} files, freed {format_bytes(space_freed)}")
            
            # Small delay to reduce I/O impact
            time.sleep(0.05)  # 50ms delay
            
        except (FileNotFoundError, OSError) as e:
            logger.warning(f"Could not delete file {file_path}: {e}")
            continue
    
    logger.info(f"Archive cleanup complete: Deleted {deleted_count} files, freed {format_bytes(space_freed)}")
    
    # Check final disk usage
    final_disk_usage = get_disk_usage(archive_drive)
    final_free_gb = final_disk_usage['free'] / (1024**3)
    logger.info(f"Final free space: {format_bytes(final_disk_usage['free'])} ({final_free_gb:.2f} GB)")
    
    return {
        'deleted_count': deleted_count,
        'space_freed': space_freed,
        'final_free_gb': final_free_gb,
        'cleanup_successful': final_disk_usage['free'] >= target_free_bytes
    }

def main():
    # --- Configuration ---
    SCRIPT_DIR = Path(__file__).resolve().parent
    TARGET_DIR = SCRIPT_DIR / "captured_images"
    DB_PATH = SCRIPT_DIR / "traffic_cameras.db"
    ARCHIVE_DRIVE = "G:"
    DRY_RUN = False  # SAFETY FIRST: Set to False to perform actual moves.
    RUN_INTERVAL_HOURS = 3
    
    # Archive space management settings
    ARCHIVE_TARGET_FREE_GB = 5.0      # Keep at least 5GB free on archive drive
    ARCHIVE_MAX_CLEANUP_GB = 10.0     # Don't delete more than 10GB in one cleanup session
    CHECK_ARCHIVE_SPACE = True        # Enable archive space monitoring

    # --- Define Cleanup Rules ---
    # A file will be moved if it matches ANY of these rules.
    CLEANUP_RULES = [
        {
            "description": "Older than 9h, no crops",
            "age_hours": 6,
            "min_views": 0,
            "max_crops": 0,
        },
    ]
    # --------------------------

    logger.info("--- Starting File Cleanup Utility ---")
    if DRY_RUN:
        logger.warning("DRY RUN is ENABLED. No files or records will be moved.")
    else:
        logger.warning("DRY RUN is DISABLED. Files WILL be moved to archive.")

    if not CLEANUP_RULES:
        logger.warning("No cleanup rules defined. Exiting.")
        return

    try:
        while True:
            logger.info("--- Starting new cleanup cycle ---")
            
            # Check archive drive space first
            if CHECK_ARCHIVE_SPACE:
                logger.info("--- Checking archive drive space ---")
                cleanup_stats = cleanup_archive_space(
                    archive_drive=ARCHIVE_DRIVE,
                    target_free_gb=ARCHIVE_TARGET_FREE_GB,
                    max_cleanup_gb=ARCHIVE_MAX_CLEANUP_GB,
                    dry_run=DRY_RUN
                )
                
                if cleanup_stats.get('deleted_count', 0) > 0:
                    logger.info(f"Archive cleanup freed {format_bytes(cleanup_stats['space_freed'])} by deleting {cleanup_stats['deleted_count']} old files")
                elif cleanup_stats.get('would_delete', 0) > 0:
                    logger.info(f"[DRY RUN] Archive cleanup would free {format_bytes(cleanup_stats['would_free'])} by deleting {cleanup_stats['would_delete']} old files")
            
            # Process cleanup rules for moving files to archive
            for i, rule in enumerate(CLEANUP_RULES):
                logger.info(f"Processing Rule {i+1}: {rule.get('description', 'No description')}")

                candidate_files = find_old_files(TARGET_DIR, rule['age_hours'])

                if candidate_files:
                    logger.info(f"Found {len(candidate_files)} files older than {rule['age_hours']} hours. Now checking against the current rule...")

                    files_to_move, summary = filter_files_by_rule(
                        file_paths=candidate_files,
                        db_path=DB_PATH,
                        rule=rule
                    )
                    logger.info(f"--- Analysis of {len(candidate_files)} candidate files ---")
                    logger.info(f"  - Found {summary['total_in_db']} files with records in the database.")
                    logger.info(f"  - {summary['with_multiple_views']} files have at least {rule['min_views']} view(s).")
                    logger.info(f"  - {summary['with_crops']} files have saved crops.")
                    logger.info("---------------------------------")

                    move_files_and_update_records(files_to_move, DB_PATH, ARCHIVE_DRIVE, dry_run=DRY_RUN)

                else:
                    logger.info(f"No files older than {rule['age_hours']} hours were found for this rule.")

            logger.info(f"--- Cleanup cycle finished. Waiting for {RUN_INTERVAL_HOURS} hours. ---")
            time.sleep(RUN_INTERVAL_HOURS * 60 * 60)

    except KeyboardInterrupt:
        logger.info("--- File Cleanup Utility Stopped by user (Ctrl+C) ---")

if __name__ == "__main__":
    main()