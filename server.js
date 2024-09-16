const express = require('express');
const path = require('path');
const mysql = require('mysql2'); // Use mysql2 instead of mysql
const app = express();
const port = 5000;

// Database connection
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'nbh05@',
    database: 'vr_garden'
});

connection.connect((err) => {
    if (err) throw err;
    console.log('Connected to database');
});

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Search route to fetch plant details
app.get('/search', (req, res) => {
    const searchTerm = req.query.term;

    const query = `
        SELECT pt.plant_id, pt.scientific_name, pt.family, pt.uses, pt.region, pt.type, pt.description,
               cn.common_name, cn.common_name2, cn.common_name3, cn.common_name4
        FROM plant_table pt
        LEFT JOIN common_name cn ON pt.plant_id = cn.plant_id
        WHERE pt.scientific_name = ? 
        OR cn.common_name = ? 
        OR cn.common_name2 = ? 
        OR cn.common_name3 = ? 
        OR cn.common_name4 = ?`;

    connection.query(query, [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm], (error, results) => {
        if (error) {
            console.error('Database query failed:', error);
            return res.status(500).json({ message: 'Database query failed' });
        }

        if (results.length > 0) {
            // Send the plant details to the frontend
            res.json(results[0]);
        } else {
            console.log('Plant not found for search term:', searchTerm); // Log when plant is not found
            res.json({ message: 'Plant not found' });
        }
    });
});

// Filter route to fetch filtered plant details
app.post('/api/filter', (req, res) => {
    const filters = req.body.filters;
    
    // Build the SQL query dynamically based on the filters
    let query = 'SELECT pt.plant_id, pt.scientific_name, pt.family, pt.uses, pt.region, pt.type ' +
                'FROM plant_table pt ' +
                'JOIN fillter_table ft ON pt.plant_id = ft.plant_id ' +
                'WHERE ';

    // Construct the WHERE clause based on the filters
    const filterConditions = filters.map(filter => {
        switch (filter) {
            case 'digestive':
                return 'ft.digestive_health = "TRUE"';
            case 'immunity':
                return 'ft.immunity = "TRUE"';
            case 'skin':
                return 'ft.skin_care = "TRUE"';
            case 'hair':
                return 'ft.hair_care = "TRUE"';
            case 'eye':
                return 'ft.eye_health = "TRUE"';
            case 'respiratory':
                return 'ft.respiratory_health = "TRUE"';
            case 'heart':
                return 'ft.heart_health = "TRUE"';
            case 'reproductive':
                return 'ft.reproductive_health = "TRUE"';
            case 'other':
                return 'ft.other_medicinal_uses = "TRUE"';
            default:
                return '';
        }
    }).filter(condition => condition).join(' OR ');

    query += filterConditions;

    connection.query(query, (error, results) => {
        if (error) {
            console.error('Database query failed:', error);
            return res.status(500).json({ message: 'Database query failed' });
        }

        if (results.length > 0) {
            res.json(results);
        } else {
            res.json({ message: 'No results found' });
        }
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
