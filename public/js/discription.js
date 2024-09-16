const infobtn = document.getElementById('show-info-btn');
const discriptioncard = document.getElementById('discription-card');
const closeicon = document.getElementById('close-btn');

function showdiscription() {
    discriptioncard.style.display = 'flex';
    discriptioncard.classList.add('animate__animated', 'animate__flipInY');
}

function hidediscription() {
    discriptioncard.style.display = 'none';
    discriptioncard.classList.remove('animate__animated', 'animate__flipInY');

}

const filtersection = document.getElementById('filter-section');

function showfilters() {

    filtersection.style.display = 'flex';
    filtersection.classList.add('animate__animated', 'animate__fadeInLeft');

}

function hidefilters() {
    filtersection.style.display = 'none';
}

const filterpopup = document.getElementById('filter-popup');

function hideflpopup() {
    filterpopup.style.display = 'none';
}

function showflpopup() {
    hideflpopup();
    hidefilters();
    filterpopup.style.display = 'flex';

    const checkboxes = document.querySelectorAll('#filter-section input[name="filter"]:checked');
    const selectedFilters = Array.from(checkboxes).map(cb => cb.value);

    // Make an API call to fetch filtered data
    fetchFilteredData(selectedFilters);
}

function fetchFilteredData(filters) {
    fetch('/api/filter', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ filters })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(data => {
        displayResults(data);
    })
    .catch(error => {
        console.error('Error:', error);
    });
}

// Function to display the filtered results
function displayResults(data) {
    const resultsArea = document.getElementById('results-area');
    resultsArea.innerHTML = '';

    if (Array.isArray(data) && data.length === 0) {
        resultsArea.innerHTML = '<p>No results found</p>';
    } else {
        data.forEach(plant => {
            const cardholder = document.createElement('div');
            
            cardholder.innerHTML = `
                <div onclick="hideflpopup(), handleCardClick('${plant.scientific_name}')"  class="f-card">
                    <h4 id="plant-id">${plant.plant_id}</h4>
                    <h4 id="plant-name">${plant.scientific_name}</h4>
                </div>
            `;

            resultsArea.appendChild(cardholder);
        });
    }

    document.getElementById('no-of-results').textContent = (Array.isArray(data) ? data.length : 0);
}
