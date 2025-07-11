// Shared constants for the traffic camera application

const JONATHAN_OPTIONS = ['could be', 'can\'t tell', 'no'];
const ACTIVITY_OPTIONS = [
    'waiting for a bus', 
    'riding a bike', 
    'working',
    'walking with someone',
    'walking a dog',
    'wearing a backpack'
];
const CLOTHING_OPTIONS = ['long sleeves', 'short sleeves', 'can\'t tell'];

// Database constraint strings (properly escaped for SQL)
const DB_CONSTRAINTS = {
    JONATHAN: JONATHAN_OPTIONS.map(opt => `'${opt.replace(/'/g, "''")}'`).join(', '),
    CLOTHING: CLOTHING_OPTIONS.map(opt => `'${opt.replace(/'/g, "''")}'`).join(', ')
};

module.exports = {
    JONATHAN_OPTIONS,
    ACTIVITY_OPTIONS,
    CLOTHING_OPTIONS,
    DB_CONSTRAINTS
};
