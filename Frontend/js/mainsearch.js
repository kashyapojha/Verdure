const BASE_URL = window.APP_CONFIG.BASE_URL;
const ASSET_BASE_URL = window.APP_CONFIG.ASSET_BASE_URL;


// Elements
const sciname = document.getElementById('sci-plant-name');
const comname = document.getElementById('common-names');
const uses = document.getElementById('uses');
const descriptionEl = document.getElementById('discription');
const pltype = document.getElementById('pltype');
const region = document.getElementById('region');
const modelContainer = document.getElementById('modelContainer');
const img = document.getElementById('plant-img-hold');
const resultsArea = document.getElementById('results-area');
const noOfResults = document.getElementById('no-of-results');
// Chatbot response UI disabled — keep variable for compatibility
let responseDiv = null; // response element intentionally disabled

/*
// Create chatbot response div if not exists
if (!responseDiv) {
    responseDiv = document.createElement("div");
    responseDiv.id = "chatbot-response";
    responseDiv.style.marginTop = "10px";
    responseDiv.style.padding = "10px";
    responseDiv.style.border = "1px solid #ccc";
    responseDiv.style.borderRadius = "5px";
    responseDiv.style.background = "#f0f0f0";
    document.querySelector(".search-container").appendChild(responseDiv);
}
*/

// Chatbot integration
async function askChatbot(userQuery) {
    try {
        const response = await fetch(window.APP_CONFIG.CHATBOT_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: userQuery })
        });
        return await response.json(); // array of plants or {response: text}
    } catch (err) {
        console.error("Error connecting to chatbot:", err);
        return [{ response: "Chatbot not available right now." }];
    }
}

// Display plant info
function displayPlantInfo(plant) {
    // normalize assets: prefer explicit fields, fall back to asset_files
    const id = plant.plant_id ? plant.plant_id.toLowerCase() : null;
    const assets = Array.isArray(plant.asset_files) ? plant.asset_files : [];

    if (id) {
        if (!plant.model_path) plant.model_path = `/assets1/${id}/${id}.gltf`;
        if (!plant.image_path) plant.image_path = `/assets1/${id}/Image_0.jpg`;
        if (!plant.preview_image) plant.preview_image = plant.image_path;
        if (!plant.pant_image) plant.pant_image = `/imgs/${plant.plant_id}.jpg`;
    }

    // choose gltf
    if (!plant.model_path && assets.length) {
        const exactGltf = id ? assets.find(a => a.toLowerCase().endsWith(`/${id}.gltf`)) : null;
        const anyGltf = assets.find(a => a.toLowerCase().endsWith('.gltf'));
        plant.model_path = exactGltf || anyGltf || plant.model_path;
    }

    // choose image
    if (!plant.image_path) {
        plant.image_path = plant.preview_image || assets.find(a => /\.(jpe?g|png|webp)$/i.test(a)) || null;
    }

    // choose bin (not directly used by model-viewer, but keep field for debug)
    if (!plant.bin_path) {
        const binMatch = assets.find(a => a.toLowerCase().endsWith('.bin'));
        plant.bin_path = binMatch || null;
    }

    sciname.innerText = plant.scientific_name || '';
    comname.innerText = plant.common_names ? plant.common_names.join(' || ') : '';
    descriptionEl.innerText = plant.description || '';
    pltype.innerText = plant.type_name || '';
    region.innerText = plant.regions ? plant.regions.join(' || ') : '';
    uses.innerText = plant.uses ? plant.uses.join(' || ') : '';

    // Ensure asset paths point to backend host (BASE_URL) when they are root-relative
    const withHost = (p) => {
        if (!p) return null;
        if (/^https?:\/\//i.test(p)) return p;
        if (p.startsWith('/')) return `${ASSET_BASE_URL}${p}`;
        return p;
    };

    const imageUrl = withHost(plant.image_path || plant.preview_image);
    const modelUrl = withHost(plant.model_path);
    const pantImageUrl = withHost(plant.pant_image);
    const displayImageUrl = pantImageUrl || imageUrl;

    // Image (background) — prefer /imgs photo, fall back to assets1/Image_0.jpg
    let imgHtml = '';
    if (displayImageUrl) {
        imgHtml += `<div class="plant-img" style="background:url('${displayImageUrl}'); background-size:cover; background-position:center;"></div>`;
    }
    img.innerHTML = imgHtml;

    // 3D model (model-viewer will fetch .bin referenced inside .gltf)
    modelContainer.innerHTML = modelUrl
        ? `<model-viewer src="${modelUrl}" alt="${plant.scientific_name}" camera-controls auto-rotate style="width:100%; height:100%;"></model-viewer>`
        : '';
}

// Expose a global handler so filtered results can show plant details
window.showPlantFromFilter = function(plant) {
    try {
        displayPlantInfo(plant);
        if (window.showdiscription) window.showdiscription();
    } catch (e) {
        console.error('showPlantFromFilter error:', e);
    }
};

// Clear plant display
function clearPlantDisplay() {
    sciname.innerText = '';
    comname.innerText = '';
    descriptionEl.innerText = '';
    pltype.innerText = '';
    region.innerText = '';
    uses.innerText = '';
    img.innerHTML = '';
    modelContainer.innerHTML = '';
    resultsArea.innerHTML = '';
    noOfResults.textContent = 0;
}

// Search button click
// Search (button click) — use backend /predict to get plant and display it like filter results
async function doPredictSearch(query) {
    if (!query) return;
    // responseDiv.innerText = "Searching..."; // disabled UI
    clearPlantDisplay();

    try {
        const resp = await fetch(`${BASE_URL}/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: query })
        });

        const data = await resp.json();

        if (resp.ok && data.plant) {
            const plants = [data.plant];
            // responseDiv.innerText = `Found ${plants.length} plant(s):`; // disabled UI
            noOfResults.textContent = plants.length;

            plants.forEach((plant) => {
                displayPlantInfo(plant);
                const card = document.createElement('div');
                card.className = 'f-card';
                card.innerHTML = `<h4>${plant.plant_id}</h4><h4>${plant.scientific_name}</h4>`;
                card.onclick = () => displayPlantInfo(plant);
                resultsArea.appendChild(card);
            });
        } else if (data && data.message) {
            noOfResults.textContent = 0;
            resultsArea.innerHTML = `<p>${data.message}</p>`;
        } else {
            noOfResults.textContent = 0;
            const errMsg = data?.error || data?.response || `Search failed (${resp.status})`;
            resultsArea.innerHTML = `<p class="search-error">${errMsg}</p>`;
            console.error('Predict failed:', resp.status, data);
        }
    } catch (err) {
        console.error('Predict error:', err);
        // responseDiv.innerText = 'Search failed'; // disabled UI
        noOfResults.textContent = 0;
    }
}

document.getElementById("searchBtn").addEventListener("click", async () => {
    const query = document.getElementById("searchInput").value.trim();
    if (!query) return;
    await doPredictSearch(query);
});

// support Enter key on search input
document.getElementById('searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const q = document.getElementById('searchInput').value.trim();
        if (q) doPredictSearch(q);
    }
});