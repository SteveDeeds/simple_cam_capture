# Factors Database Design Implementation

## Overview

This document describes the new factors-based database design that has been implemented to replace the individual boolean columns approach for crop review factors.

## Database Schema Changes

### New Tables

#### 1. `factors` Table
Stores all possible factors that can be used to classify crop reviews.

```sql
CREATE TABLE "factors" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK(type IN ('positive', 'negative')),
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes:**
- `idx_factors_type` on `type`
- `idx_factors_name` on `name`

#### 2. `crop_review_positive_factors` Junction Table
Links crop reviews to factors that suggest the person IS Jonathan.

```sql
CREATE TABLE "crop_review_positive_factors" (
    crop_review_id INTEGER NOT NULL,
    factor_id INTEGER NOT NULL,
    PRIMARY KEY (crop_review_id, factor_id),
    FOREIGN KEY (crop_review_id) REFERENCES crop_reviews(id) ON DELETE CASCADE,
    FOREIGN KEY (factor_id) REFERENCES factors(id) ON DELETE CASCADE
);
```

**Indexes:**
- `idx_positive_factors_review` on `crop_review_id`
- `idx_positive_factors_factor` on `factor_id`

#### 3. `crop_review_negative_factors` Junction Table
Links crop reviews to factors that suggest the person is NOT Jonathan.

```sql
CREATE TABLE "crop_review_negative_factors" (
    crop_review_id INTEGER NOT NULL,
    factor_id INTEGER NOT NULL,
    PRIMARY KEY (crop_review_id, factor_id),
    FOREIGN KEY (crop_review_id) REFERENCES crop_reviews(id) ON DELETE CASCADE,
    FOREIGN KEY (factor_id) REFERENCES factors(id) ON DELETE CASCADE
);
```

**Indexes:**
- `idx_negative_factors_review` on `crop_review_id`
- `idx_negative_factors_factor` on `factor_id`

## Backward Compatibility

- All existing columns in `crop_reviews` table remain unchanged
- The existing `is_jonathan`, `activities`, and `top_clothing` columns continue to work
- The new factors system is additive and doesn't break existing functionality

## Initial Seed Data

The system automatically seeds the `factors` table with 18 initial factors:

### Positive Factors (8)
- blue shirt
- riding a bike
- waiting for bus
- at bus stop
- tall person
- dark hair
- backpack
- casual clothing

### Negative Factors (10)
- red shirt
- yellow shirt
- white shirt
- driving car
- short person
- blonde hair
- formal clothing
- child
- elderly person
- woman

## Database API Methods

### Factor Management
- `createFactor(name, type, description)` - Create a new factor
- `updateFactor(id, name, type, description)` - Update an existing factor
- `deleteFactor(id)` - Delete a factor (also removes all associations)
- `getFactorById(id)` - Get a specific factor
- `getFactorByName(name)` - Get a factor by name
- `getAllFactors()` - Get all factors
- `getFactorsByType(type)` - Get factors by type ('positive' or 'negative')

### Factor Assignment
- `addFactorToReview(cropReviewId, factorId, isPositive)` - Assign a factor to a review
- `removeFactorFromReview(cropReviewId, factorId)` - Remove a factor from a review
- `setFactorsForReview(cropReviewId, positiveFactorIds, negativeFactorIds)` - Set all factors at once
- `getPositiveFactorsForReview(cropReviewId)` - Get positive factors for a review
- `getNegativeFactorsForReview(cropReviewId)` - Get negative factors for a review
- `getAllFactorsForReview(cropReviewId)` - Get all factors with assignment status

## Benefits

1. **Scalability**: New factors can be added without schema changes
2. **Flexibility**: Same factor can be marked as positive or negative for different reviews
3. **Data Integrity**: Proper foreign key relationships ensure consistency
4. **Performance**: Indexed junction tables provide fast lookups
5. **Maintainability**: Single source of truth for factor definitions

## Usage Example

```javascript
const db = new TrafficCameraDB();

// Create a new factor
const result = db.createFactor('wearing glasses', 'positive', 'Person is wearing glasses');

// Get a crop review and assign factors
const cropReview = db.getCropReview(123);
const blueShirtFactor = db.getFactorByName('blue shirt');
const tallPersonFactor = db.getFactorByName('tall person');

// Assign positive factors
db.addFactorToReview(cropReview.id, blueShirtFactor.id, true);
db.addFactorToReview(cropReview.id, tallPersonFactor.id, true);

// Get all factors for the review
const allFactors = db.getAllFactorsForReview(cropReview.id);
```

## Migration

The migration is automatic and happens when the database is initialized:

1. New tables are created if they don't exist
2. Initial factors are seeded automatically
3. Existing data remains unchanged
4. No manual migration steps required

## Next Steps

This implementation provides the foundation for:

1. Building a UI to manage factors
2. Integrating factor selection into the crop review interface
3. Creating analytics and reporting based on factors
4. Machine learning training data based on factor combinations
