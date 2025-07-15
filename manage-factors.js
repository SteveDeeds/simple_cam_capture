#!/usr/bin/env node

/**
 * Factors Management CLI Tool
 * 
 * This script provides an easy command-line interface for managing factors
 * in the traffic camera crop review system.
 * 
 * Usage:
 *   node manage-factors.js list
 *   node manage-factors.js add "factor name" positive "description"
 *   node manage-factors.js update 1 "new name" positive "new description"  
 *   node manage-factors.js delete 1
 *   node manage-factors.js seed-better
 */

const TrafficCameraDB = require('./database.js');

function showUsage() {
    console.log(`
Factors Management CLI Tool

Usage:
  node manage-factors.js list                           - List all factors
  node manage-factors.js list positive                  - List positive factors
  node manage-factors.js list negative                  - List negative factors
  node manage-factors.js add "name" type "description"  - Add new factor
  node manage-factors.js update id "name" type "desc"   - Update factor
  node manage-factors.js delete id                      - Delete factor
  node manage-factors.js seed-better                    - Replace default factors with better ones

Examples:
  node manage-factors.js add "wearing glasses" positive "Person is wearing glasses"
  node manage-factors.js update 9 "red clothing" neutral "Person is wearing red clothing"
  node manage-factors.js delete 9

Types: positive, negative
`);
}

function listFactors(type = null) {
    const db = new TrafficCameraDB();
    
    try {
        let factors;
        if (type) {
            factors = db.getFactorsByType(type);
            console.log(`\n${type.toUpperCase()} Factors:`);
        } else {
            factors = db.getAllFactors();
            console.log('\nAll Factors:');
        }
        
        if (factors.length === 0) {
            console.log('No factors found.');
            return;
        }
        
        console.log('ID | Type     | Name                     | Description');
        console.log('---|----------|--------------------------|---------------------------');
        factors.forEach(factor => {
            const id = factor.id.toString().padEnd(2);
            const type = factor.type.padEnd(8);
            const name = factor.name.padEnd(24);
            const desc = (factor.description || '').substring(0, 25);
            console.log(`${id} | ${type} | ${name} | ${desc}`);
        });
        
    } finally {
        db.close();
    }
}

function addFactor(name, type, description) {
    if (!name || !type) {
        console.error('Error: Name and type are required');
        return;
    }
    
    if (!['positive', 'negative'].includes(type)) {
        console.error('Error: Type must be either "positive" or "negative"');
        return;
    }
    
    const db = new TrafficCameraDB();
    
    try {
        const result = db.createFactor(name, type, description);
        console.log(`✅ Added factor: "${name}" (${type}) with ID ${result.lastInsertRowid}`);
    } catch (error) {
        if (error.message.includes('UNIQUE constraint failed')) {
            console.error(`❌ Error: Factor "${name}" already exists`);
        } else {
            console.error(`❌ Error: ${error.message}`);
        }
    } finally {
        db.close();
    }
}

function updateFactor(id, name, type, description) {
    if (!id || !name || !type) {
        console.error('Error: ID, name and type are required');
        return;
    }
    
    if (!['positive', 'negative'].includes(type)) {
        console.error('Error: Type must be either "positive" or "negative"');
        return;
    }
    
    const db = new TrafficCameraDB();
    
    try {
        const existing = db.getFactorById(parseInt(id));
        if (!existing) {
            console.error(`❌ Error: Factor with ID ${id} not found`);
            return;
        }
        
        const result = db.updateFactor(parseInt(id), name, type, description);
        if (result.changes > 0) {
            console.log(`✅ Updated factor ID ${id}: "${name}" (${type})`);
        } else {
            console.log(`⚠️  No changes made to factor ID ${id}`);
        }
    } catch (error) {
        if (error.message.includes('UNIQUE constraint failed')) {
            console.error(`❌ Error: Factor name "${name}" already exists`);
        } else {
            console.error(`❌ Error: ${error.message}`);
        }
    } finally {
        db.close();
    }
}

function deleteFactor(id) {
    if (!id) {
        console.error('Error: ID is required');
        return;
    }
    
    const db = new TrafficCameraDB();
    
    try {
        const existing = db.getFactorById(parseInt(id));
        if (!existing) {
            console.error(`❌ Error: Factor with ID ${id} not found`);
            return;
        }
        
        console.log(`⚠️  About to delete factor: "${existing.name}" (${existing.type})`);
        console.log('⚠️  This will also remove all associations with crop reviews!');
        
        // Note: In a real CLI tool, you'd want to prompt for confirmation
        // For now, we'll proceed directly
        
        const result = db.deleteFactor(parseInt(id));
        if (result.changes > 0) {
            console.log(`✅ Deleted factor ID ${id}: "${existing.name}"`);
        } else {
            console.log(`⚠️  No changes made (factor may not exist)`);
        }
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
    } finally {
        db.close();
    }
}

function seedBetterFactors() {
    const db = new TrafficCameraDB();
    
    try {
        console.log('🌱 Seeding better factors...');
        
        // More thoughtful factors that are less presumptive
        const betterFactors = [
            // Positive factors - things that suggest it might be Jonathan
            { name: 'blue shirt', type: 'positive', description: 'Person is wearing a blue shirt (Jonathan often wears blue)' },
            { name: 'riding bicycle', type: 'positive', description: 'Person is riding a bicycle' },
            { name: 'waiting at bus stop', type: 'positive', description: 'Person appears to be waiting at a bus stop' },
            { name: 'tall stature', type: 'positive', description: 'Person appears to be tall' },
            { name: 'dark hair', type: 'positive', description: 'Person has dark colored hair' },
            { name: 'carrying backpack', type: 'positive', description: 'Person is wearing or carrying a backpack' },
            { name: 'casual attire', type: 'positive', description: 'Person is dressed casually' },
            { name: 'walking with purpose', type: 'positive', description: 'Person appears to be walking with purpose/direction' },
            
            // Factors that are neutral but informative (stored as negative for filtering)
            { name: 'driving vehicle', type: 'negative', description: 'Person is driving a car or vehicle' },
            { name: 'child or youth', type: 'negative', description: 'Person appears to be a child or very young' },
            { name: 'elderly person', type: 'negative', description: 'Person appears to be elderly' },
            { name: 'formal business attire', type: 'negative', description: 'Person is dressed in formal business clothing' },
            { name: 'very short stature', type: 'negative', description: 'Person appears to be significantly shorter than average' },
            { name: 'blonde or light hair', type: 'negative', description: 'Person has blonde or very light colored hair' },
            { name: 'appears to be female', type: 'negative', description: 'Person appears to be female based on visible characteristics' },
            
            // Additional contextual factors
            { name: 'working/maintenance', type: 'negative', description: 'Person appears to be doing work or maintenance' },
            { name: 'with group of people', type: 'negative', description: 'Person is with a group of people' },
            { name: 'wearing high-visibility clothing', type: 'negative', description: 'Person is wearing safety or high-visibility clothing' }
        ];
        
        // Add each factor, skipping if it already exists
        let added = 0;
        let skipped = 0;
        
        betterFactors.forEach(factor => {
            try {
                db.createFactor(factor.name, factor.type, factor.description);
                console.log(`  ✅ Added: ${factor.name}`);
                added++;
            } catch (error) {
                if (error.message.includes('UNIQUE constraint failed')) {
                    console.log(`  ⚠️  Skipped (exists): ${factor.name}`);
                    skipped++;
                } else {
                    console.error(`  ❌ Error adding ${factor.name}: ${error.message}`);
                }
            }
        });
        
        console.log(`\n🎉 Seeding complete! Added ${added} factors, skipped ${skipped} existing factors.`);
        console.log(`💡 Tip: Use "node manage-factors.js list" to see all factors.`);
        
    } finally {
        db.close();
    }
}

// Main execution
const args = process.argv.slice(2);
const command = args[0];

if (!command) {
    showUsage();
    process.exit(1);
}

switch (command.toLowerCase()) {
    case 'list':
        listFactors(args[1]);
        break;
    case 'add':
        addFactor(args[1], args[2], args[3]);
        break;
    case 'update':
        updateFactor(args[1], args[2], args[3], args[4]);
        break;
    case 'delete':
        deleteFactor(args[1]);
        break;
    case 'seed-better':
        seedBetterFactors();
        break;
    default:
        console.error(`Unknown command: ${command}`);
        showUsage();
        process.exit(1);
}
