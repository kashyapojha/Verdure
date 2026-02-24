// const BASE_URL = "http://localhost:3030";
const BASE_URL = window.APP_CONFIG.BASE_URL;

function showfilters() {
    document.getElementById('filter-section').style.display = 'flex';
}
function hidefilters() {
    document.getElementById('filter-section').style.display = 'none';
}

function showflpopup() {
    const checkboxes = document.querySelectorAll('#filter-section input[name="filter"]:checked');
    const selectedFilters = Array.from(checkboxes).map(cb => cb.value);
    if (!selectedFilters.length) return alert("Select at least one filter");

    fetch(`${BASE_URL}/api/filter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: selectedFilters })
    })
        .then(res => res.json())
        .then(data => {
            displayResults(data);
            const popup = document.getElementById('filter-popup');
            if (popup) popup.style.display = 'flex';
        })
        .catch(err => console.error(err));
}

function hideflpopup() {
    const popup = document.getElementById('filter-popup');
    if (popup) popup.style.display = 'none';
}

function displayResults(data) {
    const resultsArea = document.getElementById('results-area');
    resultsArea.innerHTML = '';
    if (!data.length) {
        resultsArea.innerHTML = '<p>No results found</p>';
        document.getElementById('no-of-results').textContent = 0;
        return;
    }
    data.forEach(plant => {
        const card = document.createElement('div');
        card.className = 'f-card';
        card.innerHTML = `<h4>${plant.plant_id}</h4><h4>${plant.scientific_name}</h4>`;
        card.onclick = () => {
            hidefilters();
            hideflpopup();
            if (window.showPlantFromFilter) {
                window.showPlantFromFilter(plant);
            } else {
                window.handleCardClick(plant.scientific_name);
            }
        };
        resultsArea.appendChild(card);
    });
    document.getElementById('no-of-results').textContent = data.length;
}

window.showfilters = showfilters;
window.hidefilters = hidefilters;
window.showflpopup = showflpopup;
window.hideflpopup = hideflpopup;

function showdiscription() {
    const el = document.getElementById('discription-card');
    if (!el) return;
    el.style.display = 'block';
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hidediscription() {
    const el = document.getElementById('discription-card');
    if (!el) return;
    el.style.display = 'none';
}

window.showdiscription = showdiscription;
window.hidediscription = hidediscription;
