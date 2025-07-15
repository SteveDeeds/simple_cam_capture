#!/usr/bin/env python3
"""
Database Cleaner Tool for Traffic Camera System

This tool checks for:
1. Orphaned database records (records that reference non-existent files)
2. Orphaned files (files that aren't referenced in the database)
3. Broken foreign key relationships
4. Missing crop images and original images

Usage:
    python database_cleaner.py --scan                    # Scan only (no changes)
    python database_cleaner.py --clean --confirm         # Clean orphaned records
    python database_cleaner.py --help                    # Show help
"""

import sqlite3
import os
import sys
import argparse
import json
from pathlib import Path
from typing import List, Dict, Set, Tuple
from collections import defaultdict

class DatabaseCleaner:
    def __init__(self, db_path: str = "traffic_cameras.db", 
                 captured_images_dir: str = "captured_images",
                 saved_images_dir: str = "saved_images"):
        self.db_path = db_path
        self.captured_images_dir = Path(captured_images_dir)
        self.saved_images_dir = Path(saved_images_dir)
        self.issues = defaultdict(list)
        self.stats = {
            'orphaned_records': 0,
            'missing_files': 0,
            'orphaned_files': 0,
            'broken_foreign_keys': 0,
            'total_files_checked': 0,
            'total_records_checked': 0
        }
    
    def connect_db(self) -> sqlite3.Connection:
        """Connect to the SQLite database"""
        if not os.path.exists(self.db_path):
            raise FileNotFoundError(f"Database file not found: {self.db_path}")
        return sqlite3.connect(self.db_path)
    
    def scan_database_integrity(self) -> Dict:
        """Scan the database for integrity issues"""
        print("🔍 Scanning database integrity...")
        
        with self.connect_db() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Check saved_crops table
            self._check_saved_crops(cursor)
            
            # Check crop_reviews table
            self._check_crop_reviews(cursor)
            
            # Check factors relationships
            self._check_factors_relationships(cursor)
            
            # Check image_views table
            self._check_image_views(cursor)
            
            # Check for orphaned files
            self._check_orphaned_files(cursor)
            
            # Check for incomplete/empty reviews
            self._check_incomplete_reviews(cursor)
        
        return self.issues
    
    def _check_saved_crops(self, cursor: sqlite3.Cursor):
        """Check saved_crops table for missing files and integrity"""
        print("📁 Checking saved_crops table...")
        
        cursor.execute("SELECT * FROM saved_crops")
        crops = cursor.fetchall()
        
        for crop in crops:
            self.stats['total_records_checked'] += 1
            crop_id = crop['id']
            
            # Check if crop file exists
            if crop['crop_folder'] and crop['crop_filename']:
                crop_path = Path(crop['crop_folder']) / crop['crop_filename']
                if not crop_path.exists():
                    self.issues['missing_crop_files'].append({
                        'crop_id': crop_id,
                        'expected_path': str(crop_path),
                        'camera': crop['original_camera'],
                        'saved_at': crop['saved_at']
                    })
                    self.stats['missing_files'] += 1
            
            # Check if original image exists (if path is specified)
            if crop['original_path']:
                # Convert /images/camera/file.jpg to captured_images/camera/file.jpg
                original_path = crop['original_path'].replace('/images/', 'captured_images/')
                original_full_path = Path(original_path)
                
                if not original_full_path.exists():
                    self.issues['missing_original_files'].append({
                        'crop_id': crop_id,
                        'expected_path': str(original_full_path),
                        'camera': crop['original_camera'],
                        'original_filename': crop['original_filename']
                    })
                    self.stats['missing_files'] += 1
            
            # Check for invalid/empty paths
            if not crop['crop_folder'] or not crop['crop_filename']:
                self.issues['incomplete_crop_records'].append({
                    'crop_id': crop_id,
                    'crop_folder': crop['crop_folder'],
                    'crop_filename': crop['crop_filename'],
                    'camera': crop['original_camera']
                })
                self.stats['orphaned_records'] += 1
    
    def _check_crop_reviews(self, cursor: sqlite3.Cursor):
        """Check crop_reviews table for orphaned records"""
        print("📋 Checking crop_reviews table...")
        
        cursor.execute("""
            SELECT cr.*, sc.id as crop_exists 
            FROM crop_reviews cr
            LEFT JOIN saved_crops sc ON cr.crop_id = sc.id
        """)
        reviews = cursor.fetchall()
        
        for review in reviews:
            self.stats['total_records_checked'] += 1
            
            if not review['crop_exists']:
                self.issues['orphaned_crop_reviews'].append({
                    'review_id': review['id'],
                    'crop_id': review['crop_id'],
                    'reviewed_at': review['reviewed_at'],
                    'notes': review['notes'][:100] if review['notes'] else None
                })
                self.stats['broken_foreign_keys'] += 1
    
    def _check_incomplete_reviews(self, cursor: sqlite3.Cursor):
        """Check for crop_reviews records that are essentially empty/meaningless"""
        print("📝 Checking for incomplete/empty review records...")
        
        cursor.execute("""
            SELECT cr.id, cr.crop_id, cr.notes, cr.is_jonathan, cr.activities, cr.top_clothing,
                   pf.factor_id as has_positive_factors,
                   nf.factor_id as has_negative_factors
            FROM crop_reviews cr
            LEFT JOIN crop_review_positive_factors pf ON cr.id = pf.crop_review_id
            LEFT JOIN crop_review_negative_factors nf ON cr.id = nf.crop_review_id
        """)
        
        reviews = cursor.fetchall()
        review_groups = {}
        
        # Group by review ID to check if each review has any meaningful data
        for review in reviews:
            review_id = review['id']
            if review_id not in review_groups:
                review_groups[review_id] = {
                    'crop_id': review['crop_id'],
                    'notes': review['notes'],
                    'is_jonathan': review['is_jonathan'],
                    'activities': review['activities'],
                    'top_clothing': review['top_clothing'],
                    'has_positive_factors': False,
                    'has_negative_factors': False
                }
            
            # Check if this review has any factors
            if review['has_positive_factors']:
                review_groups[review_id]['has_positive_factors'] = True
            if review['has_negative_factors']:
                review_groups[review_id]['has_negative_factors'] = True
        
        # Find reviews that are essentially empty
        for review_id, review_data in review_groups.items():
            self.stats['total_records_checked'] += 1
            
            # Check if this review has any meaningful content
            has_notes = review_data['notes'] and review_data['notes'].strip()
            has_jonathan = review_data['is_jonathan'] is not None
            has_activities = review_data['activities'] and review_data['activities'].strip()
            has_clothing = review_data['top_clothing'] and review_data['top_clothing'].strip()
            has_factors = review_data['has_positive_factors'] or review_data['has_negative_factors']
            
            # If ALL fields are empty/null, this is an incomplete review
            if not (has_notes or has_jonathan or has_activities or has_clothing or has_factors):
                self.issues['incomplete_reviews'].append({
                    'review_id': review_id,
                    'crop_id': review_data['crop_id'],
                    'issue': 'all_fields_empty'
                })
                self.stats['orphaned_records'] += 1

    def _check_factors_relationships(self, cursor: sqlite3.Cursor):
        """Check factors relationship tables for orphaned records"""
        print("🏷️ Checking factors relationships...")
        
        # Check positive factors
        cursor.execute("""
            SELECT pf.*, cr.id as review_exists, f.id as factor_exists
            FROM crop_review_positive_factors pf
            LEFT JOIN crop_reviews cr ON pf.crop_review_id = cr.id
            LEFT JOIN factors f ON pf.factor_id = f.id
        """)
        
        positive_factors = cursor.fetchall()
        for pf in positive_factors:
            self.stats['total_records_checked'] += 1
            
            if not pf['review_exists']:
                self.issues['orphaned_positive_factors'].append({
                    'factor_link_id': f"{pf['crop_review_id']}-{pf['factor_id']}",
                    'crop_review_id': pf['crop_review_id'],
                    'factor_id': pf['factor_id'],
                    'issue': 'review_not_found'
                })
                self.stats['broken_foreign_keys'] += 1
            
            if not pf['factor_exists']:
                self.issues['orphaned_positive_factors'].append({
                    'factor_link_id': f"{pf['crop_review_id']}-{pf['factor_id']}",
                    'crop_review_id': pf['crop_review_id'],
                    'factor_id': pf['factor_id'],
                    'issue': 'factor_not_found'
                })
                self.stats['broken_foreign_keys'] += 1
        
        # Check negative factors (similar logic)
        cursor.execute("""
            SELECT nf.*, cr.id as review_exists, f.id as factor_exists
            FROM crop_review_negative_factors nf
            LEFT JOIN crop_reviews cr ON nf.crop_review_id = cr.id
            LEFT JOIN factors f ON nf.factor_id = f.id
        """)
        
        negative_factors = cursor.fetchall()
        for nf in negative_factors:
            self.stats['total_records_checked'] += 1
            
            if not nf['review_exists']:
                self.issues['orphaned_negative_factors'].append({
                    'factor_link_id': f"{nf['crop_review_id']}-{nf['factor_id']}",
                    'crop_review_id': nf['crop_review_id'],
                    'factor_id': nf['factor_id'],
                    'issue': 'review_not_found'
                })
                self.stats['broken_foreign_keys'] += 1
            
            if not nf['factor_exists']:
                self.issues['orphaned_negative_factors'].append({
                    'factor_link_id': f"{nf['crop_review_id']}-{nf['factor_id']}",
                    'crop_review_id': nf['crop_review_id'],
                    'factor_id': nf['factor_id'],
                    'issue': 'factor_not_found'
                })
                self.stats['broken_foreign_keys'] += 1
    
    def _check_image_views(self, cursor: sqlite3.Cursor):
        """Check image_views table for orphaned records"""
        print("👁️ Checking image_views table...")
        
        # First check if image_views table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='image_views'")
        if not cursor.fetchone():
            print("  ℹ️ image_views table not found, skipping...")
            return
        
        try:
            # Get table structure to handle different column names
            cursor.execute("PRAGMA table_info(image_views)")
            columns = [col[1] for col in cursor.fetchall()]
            
            # Determine correct column names
            camera_col = None
            filename_col = None
            id_col = None
            
            # Check for various possible column names
            for col in ['camera_name', 'camera']:
                if col in columns:
                    camera_col = col
                    break
                    
            for col in ['filename', 'file_name']:
                if col in columns:
                    filename_col = col
                    break
                    
            for col in ['id', 'rowid']:
                if col in columns:
                    id_col = col
                    break
            
            if not camera_col or not filename_col:
                print(f"  ⚠️ Could not identify camera/filename columns. Available: {columns}")
                return
                
            cursor.execute("SELECT * FROM image_views")
            views = cursor.fetchall()
            
            for view in views:
                self.stats['total_records_checked'] += 1
                
                # Access by index position to avoid key issues
                row_dict = dict(view)
                camera_name = row_dict.get(camera_col, '')
                filename = row_dict.get(filename_col, '')
                view_id = row_dict.get(id_col, 'unknown') if id_col else 'unknown'
                
                if camera_name and filename:
                    image_path = self.captured_images_dir / camera_name / filename
                    
                    if not image_path.exists():
                        self.issues['orphaned_image_views'].append({
                            'view_id': view_id,
                            'camera_name': camera_name,
                            'filename': filename,
                            'expected_path': str(image_path),
                            'view_count': row_dict.get('view_count', 0),
                            'last_viewed': row_dict.get('last_viewed_at', 'unknown')
                        })
                        self.stats['orphaned_records'] += 1
                        
        except Exception as e:
            print(f"  ❌ Error checking image_views table: {e}")
            # Continue with other checks
    
    def _check_orphaned_files(self, cursor: sqlite3.Cursor):
        """Check for files that exist but aren't referenced in the database"""
        print("🗃️ Checking for orphaned files...")
        
        # Get all crop files referenced in database
        cursor.execute("SELECT crop_folder, crop_filename FROM saved_crops WHERE crop_folder IS NOT NULL AND crop_filename IS NOT NULL")
        referenced_crops = set()
        for row in cursor.fetchall():
            crop_folder = row['crop_folder'] if 'crop_folder' in row.keys() else row[0]
            crop_filename = row['crop_filename'] if 'crop_filename' in row.keys() else row[1]
            if crop_folder and crop_filename:
                crop_path = Path(crop_folder) / crop_filename
                referenced_crops.add(str(crop_path))
        
        # Get all image files referenced in database (handle different column names)
        try:
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='image_views'")
            if cursor.fetchone():
                # Try different possible column name combinations
                cursor.execute("PRAGMA table_info(image_views)")
                columns = [col[1] for col in cursor.fetchall()]
                
                camera_col = 'camera_name' if 'camera_name' in columns else 'camera'
                filename_col = 'filename' if 'filename' in columns else 'file_name'
                
                cursor.execute(f"SELECT {camera_col}, {filename_col} FROM image_views WHERE {camera_col} IS NOT NULL AND {filename_col} IS NOT NULL")
                referenced_images = set()
                for row in cursor.fetchall():
                    camera_name = row[0]
                    filename = row[1]
                    if camera_name and filename:
                        img_path = self.captured_images_dir / camera_name / filename
                        referenced_images.add(str(img_path))
            else:
                referenced_images = set()
        except Exception as e:
            print(f"  ⚠️ Could not check image references: {e}")
            referenced_images = set()
        
        # Scan saved_images directory
        if self.saved_images_dir.exists():
            for crop_file in self.saved_images_dir.rglob("*.jpg"):
                self.stats['total_files_checked'] += 1
                crop_path_str = str(crop_file)
                
                if crop_path_str not in referenced_crops:
                    # Skip test files
                    if 'test_camera' not in str(crop_file) and 'test_image' not in str(crop_file):
                        self.issues['orphaned_crop_files'].append({
                            'file_path': crop_path_str,
                            'size_bytes': crop_file.stat().st_size,
                            'modified': crop_file.stat().st_mtime
                        })
                        self.stats['orphaned_files'] += 1
        
        # Scan captured_images directory
        if self.captured_images_dir.exists():
            for img_file in self.captured_images_dir.rglob("*.jpg"):
                self.stats['total_files_checked'] += 1
                img_path_str = str(img_file)
                
                if img_path_str not in referenced_images:
                    # Only flag as orphaned if it's been there a while (not recently captured)
                    try:
                        file_age_hours = (os.path.getctime(str(img_file)) - os.path.getmtime(str(img_file))) / 3600
                        if file_age_hours > 24:  # Older than 24 hours
                            self.issues['orphaned_captured_images'].append({
                                'file_path': img_path_str,
                                'size_bytes': img_file.stat().st_size,
                                'modified': img_file.stat().st_mtime
                            })
                            self.stats['orphaned_files'] += 1
                    except Exception:
                        # If we can't check file age, skip it to be safe
                        pass
    
    def print_report(self):
        """Print a detailed report of found issues"""
        print("\n" + "="*60)
        print("📊 DATABASE INTEGRITY REPORT")
        print("="*60)
        
        print(f"\n📈 Summary Statistics:")
        print(f"  • Total records checked: {self.stats['total_records_checked']}")
        print(f"  • Total files checked: {self.stats['total_files_checked']}")
        print(f"  • Orphaned records: {self.stats['orphaned_records']}")
        print(f"  • Missing files: {self.stats['missing_files']}")
        print(f"  • Orphaned files: {self.stats['orphaned_files']}")
        print(f"  • Broken foreign keys: {self.stats['broken_foreign_keys']}")
        
        total_issues = sum(len(issues) for issues in self.issues.values())
        print(f"\n🚨 Total Issues Found: {total_issues}")
        
        if total_issues == 0:
            print("\n✅ No integrity issues found! Database is clean.")
            return
        
        print(f"\n🔍 Detailed Issues:")
        
        for issue_type, issue_list in self.issues.items():
            if issue_list:
                print(f"\n  📋 {issue_type.replace('_', ' ').title()} ({len(issue_list)} issues):")
                for i, issue in enumerate(issue_list[:5]):  # Show first 5 examples
                    print(f"    {i+1}. {issue}")
                
                if len(issue_list) > 5:
                    print(f"    ... and {len(issue_list) - 5} more")
    
    def clean_database(self, confirm: bool = False) -> bool:
        """Clean orphaned records from the database"""
        if not confirm:
            print("❌ Cleanup requires --confirm flag for safety")
            return False
        
        total_issues = sum(len(issues) for issues in self.issues.values())
        if total_issues == 0:
            print("✅ No issues to clean!")
            return True
        
        print(f"\n🧹 Cleaning {total_issues} database issues...")
        
        with self.connect_db() as conn:
            cursor = conn.cursor()
            cleaned = 0
            
            # Clean orphaned crop reviews
            if 'orphaned_crop_reviews' in self.issues:
                for review in self.issues['orphaned_crop_reviews']:
                    cursor.execute("DELETE FROM crop_reviews WHERE id = ?", (review['review_id'],))
                    cleaned += 1
                print(f"  🗑️ Removed {len(self.issues['orphaned_crop_reviews'])} orphaned crop reviews")
            
            # Clean incomplete/empty reviews (reviews with no meaningful data)
            if 'incomplete_reviews' in self.issues:
                for review in self.issues['incomplete_reviews']:
                    cursor.execute("DELETE FROM crop_reviews WHERE id = ?", (review['review_id'],))
                    cleaned += 1
                print(f"  🗑️ Removed {len(self.issues['incomplete_reviews'])} incomplete/empty review records")
            
            # Clean orphaned factor relationships
            if 'orphaned_positive_factors' in self.issues:
                for factor in self.issues['orphaned_positive_factors']:
                    cursor.execute("DELETE FROM crop_review_positive_factors WHERE crop_review_id = ? AND factor_id = ?", 
                                 (factor['crop_review_id'], factor['factor_id']))
                    cleaned += 1
                print(f"  🗑️ Removed {len(self.issues['orphaned_positive_factors'])} orphaned positive factors")
            
            if 'orphaned_negative_factors' in self.issues:
                for factor in self.issues['orphaned_negative_factors']:
                    cursor.execute("DELETE FROM crop_review_negative_factors WHERE crop_review_id = ? AND factor_id = ?", 
                                 (factor['crop_review_id'], factor['factor_id']))
                    cleaned += 1
                print(f"  🗑️ Removed {len(self.issues['orphaned_negative_factors'])} orphaned negative factors")
            
            # Clean orphaned image views
            if 'orphaned_image_views' in self.issues:
                for view in self.issues['orphaned_image_views']:
                    cursor.execute("DELETE FROM image_views WHERE id = ?", (view['view_id'],))
                    cleaned += 1
                print(f"  🗑️ Removed {len(self.issues['orphaned_image_views'])} orphaned image views")
            
            # Clean incomplete crop records
            if 'incomplete_crop_records' in self.issues:
                for crop in self.issues['incomplete_crop_records']:
                    cursor.execute("DELETE FROM saved_crops WHERE id = ?", (crop['crop_id'],))
                    cleaned += 1
                print(f"  🗑️ Removed {len(self.issues['incomplete_crop_records'])} incomplete crop records")
            
            # Clean missing crop files (database records that point to non-existent files)
            if 'missing_crop_files' in self.issues:
                for crop in self.issues['missing_crop_files']:
                    cursor.execute("DELETE FROM saved_crops WHERE id = ?", (crop['crop_id'],))
                    cleaned += 1
                print(f"  🗑️ Removed {len(self.issues['missing_crop_files'])} database records for missing crop files")
            
            # Clean orphaned crop files
            if 'orphaned_crop_files' in self.issues:
                for crop_file in self.issues['orphaned_crop_files']:
                    try:
                        os.remove(crop_file['file_path'])
                        cleaned += 1
                    except FileNotFoundError:
                        pass  # File already gone
                    except Exception as e:
                        print(f"  ⚠️ Could not delete {crop_file['file_path']}: {e}")
                print(f"  🗑️ Removed {len(self.issues['orphaned_crop_files'])} orphaned crop files")

            # Clean orphaned captured images (move to quarantine)
            if 'orphaned_captured_images' in self.issues:
                quarantine_dir = Path("quarantine_images")
                quarantine_dir.mkdir(exist_ok=True)
                
                for img_file in self.issues['orphaned_captured_images']:
                    try:
                        src_path = Path(img_file['file_path'])
                        dst_path = quarantine_dir / src_path.name
                        
                        # Ensure unique filename if collision
                        counter = 1
                        while dst_path.exists():
                            stem = src_path.stem
                            suffix = src_path.suffix
                            dst_path = quarantine_dir / f"{stem}_{counter}{suffix}"
                            counter += 1
                        
                        src_path.rename(dst_path)
                        cleaned += 1
                    except Exception as e:
                        print(f"  ⚠️ Could not quarantine {img_file['file_path']}: {e}")
                print(f"  📦 Quarantined {len(self.issues['orphaned_captured_images'])} orphaned captured images")

            conn.commit()
            print(f"\n✅ Cleaned {cleaned} database records")
        
        return True
    
    def save_report(self, filename: str = "database_integrity_report.json"):
        """Save the integrity report to a JSON file"""
        report = {
            'timestamp': os.getctime(self.db_path),
            'database_path': self.db_path,
            'statistics': self.stats,
            'issues': dict(self.issues)
        }
        
        with open(filename, 'w') as f:
            json.dump(report, f, indent=2, default=str)
        
        print(f"📄 Report saved to {filename}")

def main():
    parser = argparse.ArgumentParser(description="Traffic Camera Database Integrity Checker and Cleaner")
    parser.add_argument('--scan', action='store_true', help='Scan database for integrity issues')
    parser.add_argument('--clean', action='store_true', help='Clean orphaned records (requires --confirm)')
    parser.add_argument('--confirm', action='store_true', help='Confirm that you want to clean the database')
    parser.add_argument('--db', default='traffic_cameras.db', help='Path to database file')
    parser.add_argument('--captured-dir', default='captured_images', help='Path to captured images directory')
    parser.add_argument('--saved-dir', default='saved_images', help='Path to saved images directory')
    parser.add_argument('--report', help='Save report to JSON file')
    
    args = parser.parse_args()
    
    if not args.scan and not args.clean:
        parser.print_help()
        return
    
    try:
        cleaner = DatabaseCleaner(args.db, args.captured_dir, args.saved_dir)
        
        # Always scan first
        print("🚀 Starting database integrity scan...")
        cleaner.scan_database_integrity()
        cleaner.print_report()
        
        if args.report:
            cleaner.save_report(args.report)
        
        # Clean if requested
        if args.clean:
            success = cleaner.clean_database(args.confirm)
            if success:
                print("\n🔄 Re-scanning after cleanup...")
                cleaner.issues.clear()
                cleaner.stats = {k: 0 for k in cleaner.stats}
                cleaner.scan_database_integrity()
                cleaner.print_report()
    
    except Exception as e:
        print(f"❌ Error: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
