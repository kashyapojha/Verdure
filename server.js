const express = require('express');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2');
const cors = require('cors');
const app = express();
const port = 3030;

// Database connection
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'nbh05@', // your MySQL password
    database: 'project'
});

connection.connect(err => {
    if (err) throw err;
    console.log('Connected to database');
});

// Middleware
app.use(express.json());
app.use(cors({ origin: '*', credentials: true }));
app.use(express.static(path.join(__dirname, 'public')));
// Log requests to assets1 so we can trace frontend fetches
app.use((req, res, next) => {
    if (req.path && req.path.startsWith('/assets1/')) {
        const ip = req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
        console.log(`[ASSET REQUEST] ${req.method} ${req.originalUrl} from ${ip} referer=${req.get('referer')}`);
        res.on('finish', () => {
            console.log(`[ASSET RESPONSE] ${req.method} ${req.originalUrl} -> ${res.statusCode}`);
        });
    }
    next();
});

// Serve model assets from public/assets1
app.use('/assets1', express.static(path.join(__dirname, 'public', 'assets1')));

// ------------------------
// SEARCH route
// ------------------------
app.get('/search', (req, res) => {
    const searchTerm = req.query.term ? req.query.term.toLowerCase() : '';
    const term = `%${searchTerm}%`;

    const query = `
        SELECT p.plant_id, p.scientific_name, p.description, p.type_id, f.type_name, 
               cn.common_name, r.region_name
        FROM plant p
        LEFT JOIN common_names cn ON p.plant_id = cn.plant_id
        LEFT JOIN regions r ON p.plant_id = r.plant_id
        LEFT JOIN types f ON p.type_id = f.type_id
        WHERE LOWER(p.scientific_name) LIKE ?
           OR LOWER(cn.common_name) LIKE ?
    `;

    connection.query(query, [term, term], (err, results) => {
        if (err) {
            console.error('Search query error:', err.sqlMessage);
            return res.status(500).json({ message: 'Database query failed' });
        }

        if (!results.length) return res.json({ message: 'Plant not found' });

        // Combine duplicates for same plant_id
        const plantsMap = {};
        results.forEach(row => {
            if (!plantsMap[row.plant_id]) {
                const modelFileName = `${row.plant_id.toLowerCase()}.gltf`;
                const modelRelPath = `/assets1/${row.plant_id.toLowerCase()}/${modelFileName}`;
                const modelFolder = path.join(__dirname, 'public', 'assets1', row.plant_id.toLowerCase());
                const modelFullPath = path.join(modelFolder, modelFileName);

                // gather asset files (images, bin, etc.) present in the folder
                let assetFiles = [];
                let previewImage = null;
                try {
                    if (fs.existsSync(modelFolder)) {
                        assetFiles = fs.readdirSync(modelFolder);
                        // prefer exact plant jpg/png matching, otherwise first image
                        const imgs = assetFiles.filter(f => /\.(jpe?g|png|webp)$/i.test(f));
                        if (imgs.length) {
                            const exact = imgs.find(f => f.toLowerCase().includes(row.plant_id.toLowerCase()));
                            previewImage = exact || imgs[0];
                        }
                    }
                } catch (e) {
                    console.warn('asset listing failed', e);
                }

                // determine bin and image files
                const binFile = assetFiles.find(f => /\.bin$/i.test(f));
                const binRel = binFile ? `/assets1/${row.plant_id.toLowerCase()}/${binFile}` : null;
                const imageFile = previewImage;
                const imageRel = imageFile ? `/assets1/${row.plant_id.toLowerCase()}/${imageFile}` : null;

                plantsMap[row.plant_id] = {
                    plant_id: row.plant_id,
                    scientific_name: row.scientific_name,
                    description: row.description,
                    type_id: row.type_id,
                    type_name: row.type_name,
                    common_names: row.common_name ? [row.common_name] : [],
                    regions: row.region_name ? [row.region_name] : [],
                    model_path: modelRelPath,
                    model_file: modelFileName,
                    bin_file: binRel,
                    image_file: imageRel,
                    model_exists: fs.existsSync(modelFullPath),
                    asset_files: assetFiles,
                    preview_image: previewImage ? `/assets1/${row.plant_id.toLowerCase()}/${previewImage}` : null
                };
            } else {
                if (row.common_name && !plantsMap[row.plant_id].common_names.includes(row.common_name)) {
                    plantsMap[row.plant_id].common_names.push(row.common_name);
                }
                if (row.region_name && !plantsMap[row.plant_id].regions.includes(row.region_name)) {
                    plantsMap[row.plant_id].regions.push(row.region_name);
                }
            }
        });

        res.json(Object.values(plantsMap));
    });
});

// ------------------------
// FILTER route
// ------------------------
app.post('/api/filter', (req, res) => {
    const filters = req.body.filters || [];
    if (!filters.length) return res.json([]);

    const filterMap = {
        digestive: 'Digestive health',
        immunity: 'Immunity',
        skin: 'Skin care',
        hair: 'Hair care',
        eye: 'Eye health',
        respiratory: 'Respiratory health',
        heart: 'Heart health',
        reproductive: 'Reproductive health',
        other: 'Other medicinal uses'
    };

    const benefitTypes = filters.map(f => filterMap[f]).filter(Boolean);
    if (!benefitTypes.length) return res.json([]);

    const placeholders = benefitTypes.map(() => '?').join(',');

    // Fetch rows including common names, regions and uses; we'll aggregate rows per plant_id
    const query = `
        SELECT p.plant_id, p.scientific_name, p.description, p.type_id, f.type_name,
               cn.common_name, r.region_name, u.uses AS use_text
        FROM plant p
        JOIN health_benefits hb ON p.plant_id = hb.plant_id
        LEFT JOIN types f ON p.type_id = f.type_id
        LEFT JOIN common_names cn ON p.plant_id = cn.plant_id
        LEFT JOIN regions r ON p.plant_id = r.plant_id
        LEFT JOIN uses u ON p.plant_id = u.plant_id
        WHERE hb.benefit_value = 1 AND hb.benefit_type IN (${placeholders})
    `;

    connection.query(query, benefitTypes, (err, results) => {
        if (err) {
            console.error('Filter query error:', err.sqlMessage);
            return res.status(500).json({ message: 'Database query failed' });
        }

        if (!results.length) return res.json([]);

        const plantsMap = {};
        results.forEach(row => {
            if (!plantsMap[row.plant_id]) {
                const modelFileName = `${row.plant_id.toLowerCase()}.gltf`;
                const modelRelPath = `/assets1/${row.plant_id.toLowerCase()}/${modelFileName}`;
                const modelFolder = path.join(__dirname, 'public', 'assets1', row.plant_id.toLowerCase());
                const modelFullPath = path.join(modelFolder, modelFileName);

                // gather asset files (images, bin, etc.) present in the folder
                let assetFiles = [];
                let previewImage = null;
                try {
                    if (fs.existsSync(modelFolder)) {
                        assetFiles = fs.readdirSync(modelFolder);
                        // prefer exact plant jpg/png matching, otherwise first image
                        const imgs = assetFiles.filter(f => /\.(jpe?g|png|webp)$/i.test(f));
                        if (imgs.length) {
                            const exact = imgs.find(f => f.toLowerCase().includes(row.plant_id.toLowerCase()));
                            previewImage = exact || imgs[0];
                        }
                    }
                } catch (e) {
                    console.warn('asset listing failed', e);
                }

                plantsMap[row.plant_id] = {
                    plant_id: row.plant_id,
                    scientific_name: row.scientific_name,
                    description: row.description,
                    type_id: row.type_id,
                    type_name: row.type_name,
                    common_names: row.common_name ? [row.common_name] : [],
                    regions: row.region_name ? [row.region_name] : [],
                    uses: row.use_text ? [row.use_text] : [],
                    model_path: modelRelPath,
                    model_exists: fs.existsSync(modelFullPath),
                    asset_files: assetFiles,
                    preview_image: previewImage ? `/assets1/${row.plant_id.toLowerCase()}/${previewImage}` : null
                };
            } else {
                if (row.common_name && !plantsMap[row.plant_id].common_names.includes(row.common_name)) {
                    plantsMap[row.plant_id].common_names.push(row.common_name);
                }
                if (row.region_name && !plantsMap[row.plant_id].regions.includes(row.region_name)) {
                    plantsMap[row.plant_id].regions.push(row.region_name);
                }
                if (row.use_text && !plantsMap[row.plant_id].uses.includes(row.use_text)) {
                    plantsMap[row.plant_id].uses.push(row.use_text);
                }
            }
        });

        res.json(Object.values(plantsMap));
    });
});

// Start server
app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
