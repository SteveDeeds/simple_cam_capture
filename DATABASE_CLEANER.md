# Database Cleaner Tool

A comprehensive Python tool for checking and maintaining the integrity of the Traffic Camera System database.

## Features

### 🔍 **Integrity Checks**
- **Orphaned Records**: Database records pointing to non-existent files
- **Missing Files**: Referenced files that don't exist on disk
- **Broken Foreign Keys**: Invalid relationships between tables
- **Incomplete Records**: Records with missing required data

### 📊 **What It Checks**

1. **Saved Crops Table** (`saved_crops`)
   - Verifies crop image files exist
   - Checks original image references
   - Finds incomplete records

2. **Crop Reviews Table** (`crop_reviews`)
   - Finds reviews for deleted crops
   - Validates foreign key relationships

3. **Factors Tables** (`crop_review_positive_factors`, `crop_review_negative_factors`)
   - Checks for orphaned factor assignments
   - Validates both review and factor references

4. **Image Views Table** (`image_views`)
   - Finds view records for deleted images
   - Checks file existence

5. **File System**
   - Identifies orphaned crop files
   - Finds unreferenced captured images
   - Excludes test data automatically

## Usage

### 🔍 **Scan Only (Safe)**
```bash
python database_cleaner.py --scan
```

### 🧹 **Clean Database (Requires Confirmation)**
```bash
python database_cleaner.py --clean --confirm
```

### 📄 **Save Report to File**
```bash
python database_cleaner.py --scan --report integrity_report.json
```

### ⚙️ **Custom Paths**
```bash
python database_cleaner.py --scan \
    --db "path/to/database.db" \
    --captured-dir "path/to/captured_images" \
    --saved-dir "path/to/saved_images"
```

## Command Line Options

| Option | Description |
|--------|-------------|
| `--scan` | Scan database for integrity issues (read-only) |
| `--clean` | Clean orphaned records (requires `--confirm`) |
| `--confirm` | Confirm destructive operations |
| `--db PATH` | Path to database file (default: `traffic_cameras.db`) |
| `--captured-dir PATH` | Path to captured images (default: `captured_images`) |
| `--saved-dir PATH` | Path to saved images (default: `saved_images`) |
| `--report FILE` | Save detailed report to JSON file |

## Safety Features

- **Read-only by default**: Scanning never modifies data
- **Confirmation required**: Cleaning requires explicit `--confirm` flag
- **Test data exclusion**: Automatically skips files with 'test_camera' or 'test_image'
- **Backup recommendation**: Always backup your database before cleaning

## Sample Output

```
🔍 Scanning database integrity...
📁 Checking saved_crops table...
📋 Checking crop_reviews table...
🏷️ Checking factors relationships...
👁️ Checking image_views table...
🗃️ Checking for orphaned files...

============================================================
📊 DATABASE INTEGRITY REPORT
============================================================

📈 Summary Statistics:
  • Total records checked: 1,247
  • Total files checked: 3,891
  • Orphaned records: 5
  • Missing files: 12
  • Orphaned files: 8
  • Broken foreign keys: 3

🚨 Total Issues Found: 28

🔍 Detailed Issues:

  📋 Missing Crop Files (12 issues):
    1. {'crop_id': 145, 'expected_path': 'saved_images/camera1/missing.jpg', ...}
    2. {'crop_id': 289, 'expected_path': 'saved_images/camera2/missing.jpg', ...}
    ...

  📋 Orphaned Crop Reviews (3 issues):
    1. {'review_id': 67, 'crop_id': 999, 'reviewed_at': '2025-01-10', ...}
    ...
```

## What Gets Cleaned

### ✅ **Safe to Remove**
- Crop reviews for deleted crops
- Factor assignments for deleted reviews
- Image view records for deleted images
- Incomplete crop records (missing paths)

### ⚠️ **Files Not Touched**
- The tool **never deletes files** - only database records
- Test data is automatically excluded
- Only removes database references to missing files

## Requirements

- Python 3.6+
- No additional packages required (uses only standard library)

## Best Practices

1. **Backup First**: Always backup your database before running `--clean`
2. **Scan Regularly**: Run `--scan` periodically to monitor database health
3. **Review Reports**: Check detailed reports before cleaning
4. **Test Environment**: Try on a copy of your database first

## Exit Codes

- `0`: Success
- `1`: Error occurred

## Troubleshooting

### Database Locked Error
```bash
# Stop the Node.js server first
# Then run the cleaner
python database_cleaner.py --scan
```

### Permission Errors
```bash
# Make sure you have read/write access to:
# - Database file
# - Image directories
# - Current directory (for reports)
```

### Large Number of Issues
```bash
# Start with scan only to understand the scope
python database_cleaner.py --scan --report full_report.json

# Review the report before cleaning
# Clean in small batches if needed
```
