const path = require('path'); // Move this to the top
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const fs = require('fs');
const mysql = require('mysql2');
const { execFile } = require('child_process');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3030;
const PREDICTOR_URL = process.env.PREDICTOR_URL || 'http://localhost:5000/chat';

// CORS first so static files also carry Access-Control-Allow-Origin
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

// Serve frontend static files and model assets (Assets are under /assets1)
app.use(express.static(path.join(__dirname, '../Frontend')));
app.use('/assets1', express.static(path.join(__dirname, 'public', 'assets1')));
app.use('/assets1', express.static(path.join(__dirname, '..', 'Frontend', 'assets1')));
app.use('/imgs', express.static(path.join(__dirname, '..', 'Frontend', 'imgs')));

// Database connection
const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

connection.connect(err => {
    if (err) throw err;
    console.log('Connected to database');
});

// Standard asset URLs (frontend container serves these; backend Docker has no Frontend files)
function applyStandardAssetPaths(plantObj) {
    if (!plantObj || !plantObj.plant_id) return plantObj;
    const plantId = plantObj.plant_id.toLowerCase();
    const defaults = {
        model_path: `/assets1/${plantId}/${plantId}.gltf`,
        image_path: `/assets1/${plantId}/Image_0.jpg`,
        preview_image: `/assets1/${plantId}/Image_0.jpg`,
        pant_image: `/imgs/${plantObj.plant_id}.jpg`
    };
    for (const [key, value] of Object.entries(defaults)) {
        if (!plantObj[key]) plantObj[key] = value;
    }
    return plantObj;
}

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
                const plantId = row.plant_id.toLowerCase();
                const modelFileName = `${plantId}.gltf`;
                const modelRelPath = `/assets1/${plantId}/${modelFileName}`;
                const modelFullPathCandidates = [
                    path.join(__dirname, 'public', 'assets1', plantId, modelFileName),
                    path.join(__dirname, '..', 'Frontend', 'assets1', plantId, modelFileName)
                ];

                const folderCandidates = [
                    path.join(__dirname, 'public', 'assets1', plantId),
                    path.join(__dirname, '..', 'Frontend', 'assets1', plantId)
                ];

                let filesFound = new Set();
                let previewImage = null;
                folderCandidates.forEach(folder => {
                    try {
                        if (fs.existsSync(folder)) {
                            const files = fs.readdirSync(folder);
                            files.forEach(f => filesFound.add(f));
                            const imgs = files.filter(f => /\.(jpe?g|png|webp)$/i.test(f));
                            if (!previewImage && imgs.length) {
                                const exact = imgs.find(f => f.toLowerCase().includes(plantId));
                                previewImage = exact || imgs[0];
                            }
                        }
                    } catch (e) {
                        console.warn('asset listing failed for', folder, e);
                    }
                });

                const assetFiles = Array.from(filesFound).map(f => `/assets1/${plantId}/${f}`);
                const binFileName = Array.from(filesFound).find(f => /\.bin$/i.test(f));
                const binPath = binFileName ? `/assets1/${plantId}/${binFileName}` : null;
                const imagePath = previewImage ? `/assets1/${plantId}/${previewImage}` : null;
                const modelExists = modelFullPathCandidates.some(p => fs.existsSync(p));

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
                    bin_path: binPath,
                    image_path: imagePath,
                    model_exists: modelExists,
                    asset_files: assetFiles,
                    preview_image: imagePath
                };
                // add pant_image pointing to Frontend/imgs/<PLANTID>.jpg if present
                const pantImageCandidate = `/imgs/${row.plant_id}.jpg`;
                try {
                    const pantExists = fs.existsSync(path.join(__dirname, '..', 'Frontend', 'imgs', `${row.plant_id}.jpg`));
                    if (pantExists) plantsMap[row.plant_id].pant_image = pantImageCandidate;
                } catch (e) {
                    // ignore
                }
            } else {
                if (row.common_name && !plantsMap[row.plant_id].common_names.includes(row.common_name)) {
                    plantsMap[row.plant_id].common_names.push(row.common_name);
                }
                if (row.region_name && !plantsMap[row.plant_id].regions.includes(row.region_name)) {
                    plantsMap[row.plant_id].regions.push(row.region_name);
                }
            }
        });

        res.json(Object.values(plantsMap).map(applyStandardAssetPaths));
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
                const plantId = row.plant_id.toLowerCase();
                const modelFileName = `${plantId}.gltf`;
                const modelRelPath = `/assets1/${plantId}/${modelFileName}`;
                const modelFullPathCandidates = [
                    path.join(__dirname, 'public', 'assets1', plantId, modelFileName),
                    path.join(__dirname, '..', 'Frontend', 'assets1', plantId, modelFileName)
                ];

                // gather asset files from Backend public and Frontend folders
                const folderCandidates = [
                    path.join(__dirname, 'public', 'assets1', plantId),
                    path.join(__dirname, '..', 'Frontend', 'assets1', plantId)
                ];

                let filesFound = new Set();
                let previewImage = null;
                folderCandidates.forEach(folder => {
                    try {
                        if (fs.existsSync(folder)) {
                            const files = fs.readdirSync(folder);
                            files.forEach(f => filesFound.add(f));
                            const imgs = files.filter(f => /\.(jpe?g|png|webp)$/i.test(f));
                            if (!previewImage && imgs.length) {
                                const exact = imgs.find(f => f.toLowerCase().includes(plantId));
                                previewImage = exact || imgs[0];
                            }
                        }
                    } catch (e) {
                        console.warn('asset listing failed for', folder, e);
                    }
                });

                const assetFiles = Array.from(filesFound).map(f => `/assets1/${plantId}/${f}`);
                const binFileName = Array.from(filesFound).find(f => /\.bin$/i.test(f));
                const binPath = binFileName ? `/assets1/${plantId}/${binFileName}` : null;
                const imagePath = previewImage ? `/assets1/${plantId}/${previewImage}` : null;
                const modelExists = modelFullPathCandidates.some(p => fs.existsSync(p));

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
                    model_exists: modelExists,
                    asset_files: assetFiles,
                    preview_image: imagePath,
                    image_path: imagePath,
                    bin_path: binPath
                };
                // add pant_image pointing to Frontend/imgs/<PLANTID>.jpg if present
                const pantImageCandidate = `/imgs/${row.plant_id}.jpg`;
                try {
                    const pantExists = fs.existsSync(path.join(__dirname, '..', 'Frontend', 'imgs', `${row.plant_id}.jpg`));
                    if (pantExists) plantsMap[row.plant_id].pant_image = pantImageCandidate;
                } catch (e) {
                    // ignore
                }
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

        res.json(Object.values(plantsMap).map(applyStandardAssetPaths));
    });
});

// ------------------------
// ASSETS DEBUG route
// ------------------------
app.get('/assets-debug/:plantId', (req, res) => {
    const plantId = (req.params.plantId || '').toLowerCase();
    if (!plantId) return res.status(400).json({ error: 'plantId required' });

    const folders = [
        path.join(__dirname, 'public', 'assets1', plantId),
        path.join(__dirname, '..', 'Frontend', 'assets1', plantId)
    ];

    const report = [];
    folders.forEach(folder => {
        try {
            const exists = fs.existsSync(folder);
            const files = exists ? fs.readdirSync(folder) : [];
            report.push({ folder, exists, files });
        } catch (e) {
            report.push({ folder, exists: false, error: String(e) });
        }
    });

    // also check a couple of likely filenames
    const candidates = [
        `${plantId}.gltf`,
        `${plantId}.bin`,
        `${plantId}_dup.jpg`,
        'Image_0.jpg'
    ];

    const candidateReport = {};
    candidates.forEach(fn => {
        const url = `/assets1/${plantId}/${fn}`;
        const found = folders.some(folder => fs.existsSync(path.join(folder, fn)));
        candidateReport[fn] = { url, found };
    });

    res.json({ plantId, report, candidateReport });
});


// ------------------------
// PREDICT route (uses Python predictor)
// ------------------------
app.post('/predict', async (req, res) => {
    const message = (req.body && req.body.message) ? req.body.message.toString() : '';
    if (!message) return res.status(400).json({ error: 'No message provided' });

    try {
        const pyResp = await fetch(PREDICTOR_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });

        if (!pyResp.ok) {
            const t = await pyResp.text();
            console.error('Python predict error:', pyResp.status, t);
            return res.status(pyResp.status === 503 ? 503 : 502).json({
                error: 'Prediction service error',
                details: t
            });
        }

        const json = await pyResp.json();
        const numericId = json.numeric_id ?? null;
        const originalLabel = json.label ?? null;

        if (!originalLabel) {
            console.error('Predictor response missing label:', json);
            return res.status(502).json({
                error: json.error || 'No label returned from predictor',
                response: json.response || null
            });
        }

        // Query DB for full plant info (joins similar to search/filter)
        const query = `
            SELECT p.plant_id, p.scientific_name, p.description, p.type_id, f.type_name,
                   cn.common_name, r.region_name, u.uses AS use_text
            FROM plant p
            LEFT JOIN types f ON p.type_id = f.type_id
            LEFT JOIN common_names cn ON p.plant_id = cn.plant_id
            LEFT JOIN regions r ON p.plant_id = r.plant_id
            LEFT JOIN uses u ON p.plant_id = u.plant_id
            WHERE p.plant_id = ?
        `;

        connection.query(query, [originalLabel], (err, results) => {
            if (err) {
                console.error('DB error:', err);
                return res.status(500).json({ error: 'Database query failed' });
            }

            if (!results || !results.length) return res.status(404).json({ message: 'Plant not found', prediction: { numeric_id: numericId, label: originalLabel } });

            // aggregate rows
            const rows = results;
            const plantObj = {
                plant_id: rows[0].plant_id,
                scientific_name: rows[0].scientific_name,
                description: rows[0].description,
                type_id: rows[0].type_id,
                type_name: rows[0].type_name || null,
                common_names: [],
                regions: [],
                uses: []
            };

            rows.forEach(r => {
                if (r.common_name && !plantObj.common_names.includes(r.common_name)) plantObj.common_names.push(r.common_name);
                if (r.region_name && !plantObj.regions.includes(r.region_name)) plantObj.regions.push(r.region_name);
                if (r.use_text && !plantObj.uses.includes(r.use_text)) plantObj.uses.push(r.use_text);
            });

            // asset aggregation (check Backend and Frontend folders)
            const plantId = plantObj.plant_id.toLowerCase();
            const modelFileName = `${plantId}.gltf`;
            const modelRelPath = `/assets1/${plantId}/${modelFileName}`;
            const modelFullPathCandidates = [
                path.join(__dirname, 'public', 'assets1', plantId, modelFileName),
                path.join(__dirname, '..', 'Frontend', 'assets1', plantId, modelFileName)
            ];

            const folderCandidates = [
                path.join(__dirname, 'public', 'assets1', plantId),
                path.join(__dirname, '..', 'Frontend', 'assets1', plantId)
            ];

            let filesFound = new Set();
            let previewImage = null;
            folderCandidates.forEach(folder => {
                try {
                    if (fs.existsSync(folder)) {
                        const files = fs.readdirSync(folder);
                        files.forEach(f => filesFound.add(f));
                        const imgs = files.filter(f => /\.(jpe?g|png|webp)$/i.test(f));
                        if (!previewImage && imgs.length) {
                            const exact = imgs.find(f => f.toLowerCase().includes(plantId));
                            previewImage = exact || imgs[0];
                        }
                    }
                } catch (e) {
                    console.warn('asset listing failed for', folder, e);
                }
            });

            const assetFiles = Array.from(filesFound).map(f => `/assets1/${plantId}/${f}`);
            const binFileName = Array.from(filesFound).find(f => /\.bin$/i.test(f));
            const binPath = binFileName ? `/assets1/${plantId}/${binFileName}` : null;
            const imagePath = previewImage ? `/assets1/${plantId}/${previewImage}` : null;
            const modelExists = modelFullPathCandidates.some(p => fs.existsSync(p));

            plantObj.model_path = modelRelPath;
            plantObj.model_exists = modelExists;
            plantObj.asset_files = assetFiles;
            plantObj.preview_image = imagePath;
            plantObj.image_path = imagePath;
            plantObj.bin_path = binPath;

            // pant_image from Frontend imgs if present
            try {
                const pantExists = fs.existsSync(path.join(__dirname, '..', 'Frontend', 'imgs', `${plantObj.plant_id}.jpg`));
                if (pantExists) plantObj.pant_image = `/imgs/${plantObj.plant_id}.jpg`;
            } catch (e) {}

            return res.json({
                prediction: { numeric_id: numericId, label: originalLabel },
                plant: applyStandardAssetPaths(plantObj)
            });
        });
    } catch (e) {
        console.error('Predict route error:', e);
        return res.status(500).json({ error: 'Predict route failed' });
    }
});

// SPA catch-all: send index for frontend routes (after API paths)
app.get('/health', async (req, res) => {
    try {
        const base = PREDICTOR_URL.replace('/chat', '');
        const [healthResp, readyResp] = await Promise.all([
            fetch(`${base}/health`),
            fetch(`${base}/ready`)
        ]);
        const health = healthResp.ok ? await healthResp.json() : { status: 'unreachable' };
        let ready = { status: 'not_ready' };
        try {
            ready = await readyResp.json();
        } catch (_) { /* ignore */ }
        res.json({ backend: 'OK', predictor: health, predictor_ready: ready });
    } catch (e) {
        res.status(503).json({ backend: 'OK', predictor: { status: 'unreachable', error: String(e) } });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../Frontend/index.html'));
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
    console.log(`Accessible locally at http://localhost:${port}`);
});
