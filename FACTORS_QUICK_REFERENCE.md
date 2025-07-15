# Factors System Quick Reference

## Overview

The factors system provides a flexible way to classify crops based on visual attributes. Instead of fixed boolean columns, factors can be:
- Added, removed, or modified without database schema changes
- Assigned as positive (suggests target person) or negative (suggests not target person)
- Used for advanced filtering and analytics

## Quick Actions

### View Current Factors
```bash
node manage-factors.js list
```

### Add Better Default Factors
```bash
node manage-factors.js seed-better
```
This adds more thoughtful, less presumptive factors.

### Add New Factor
```bash
node manage-factors.js add "factor name" positive "description"
node manage-factors.js add "factor name" negative "description"
```

### Update Existing Factor
```bash
node manage-factors.js update ID "new name" positive "new description"
```

### Delete Factor (removes all associations!)
```bash
node manage-factors.js delete ID
```

## Recommended Factor Categories

### Physical Appearance
- Height indicators: `tall stature`, `short stature`
- Hair: `dark hair`, `blonde hair`, `gray hair`
- Age: `child or youth`, `elderly person`
- Gender: `appears to be female`, `appears to be male`

### Clothing
- Colors: `blue shirt`, `red shirt`, `dark clothing`
- Style: `casual attire`, `formal business attire`, `athletic wear`
- Accessories: `carrying backpack`, `wearing hat`, `wearing glasses`

### Activities
- Transportation: `riding bicycle`, `driving vehicle`, `walking`
- Context: `waiting at bus stop`, `working/maintenance`, `with group of people`
- Work: `wearing high-visibility clothing`, `using tools`

### Context Clues
- Location: `at intersection`, `near building entrance`
- Time indicators: `rush hour behavior`, `casual weekend activity`
- Interactions: `talking on phone`, `with children`, `with pets`

## Factor Assignment Logic

### Positive Factors
Use for attributes that suggest the person IS your target individual:
- Known clothing preferences
- Typical activities or routes  
- Physical characteristics that match
- Behavioral patterns

### Negative Factors  
Use for attributes that suggest the person is NOT your target individual:
- Clearly different physical characteristics
- Unlikely activities or contexts
- Demographic mismatches

### Avoid Over-specific Factors
❌ Don't create: `blue nike shirt with white logo`
✅ Instead use: `blue shirt` + `athletic wear`

## Database Direct Access

If you prefer using DB Browser for SQLite:

1. Download from https://sqlitebrowser.org/
2. Open `traffic_cameras.db`
3. Browse to `factors` table
4. Edit directly:
   - `id`: Auto-generated primary key
   - `name`: Unique factor name (e.g., "blue shirt")
   - `type`: Either "positive" or "negative"  
   - `description`: Optional longer description
   - `created_at`/`updated_at`: Timestamps (auto-managed)

## API Usage

### Get All Factors
```javascript
fetch('/api/factors').then(r => r.json())
```

### Create Factor Programmatically
```javascript
fetch('/api/factors', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'wearing sunglasses',
    type: 'positive',
    description: 'Person is wearing sunglasses'
  })
})
```

## Review Interface

In the crop review interface:
- Factors are grouped by type (positive/negative)
- Click to assign/remove factors from a crop
- Multiple factors can be assigned to the same crop
- Changes auto-save as you work

## Best Practices

1. **Start Simple**: Use broad categories, refine later
2. **Be Descriptive**: Use clear, unambiguous factor names
3. **Stay Consistent**: Use similar naming patterns
4. **Regular Review**: Periodically review and consolidate similar factors
5. **Document Intent**: Use descriptions to clarify borderline cases

## Migration Notes

- Existing `is_jonathan`, `activities`, and `top_clothing` columns remain functional
- Factors system is additive - old data continues to work
- Can gradually transition from old columns to factors-based approach
- Factor assignments are linked to crop review IDs, not crop IDs directly
