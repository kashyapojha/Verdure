import * as THREE from "https://cdn.skypack.dev/three@0.129.0/build/three.module.js";
import { GLTFLoader } from "https://cdn.skypack.dev/three@0.129.0/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "https://cdn.skypack.dev/three@0.129.0/examples/jsm/controls/OrbitControls.js";

// Event listener for the search button
function performSearch(searchTerm) {
    console.log(searchTerm);
    // Fetch plant data from the server using the search term
    fetch(`/search?term=${searchTerm}`)
        .then(response => response.json())  // Parse the JSON response
        .then(data => {
            hidediscription();
            const sciname = document.getElementById('sci-plant-name');  // Div to show search results
            const comname1 = document.getElementById('com-1');  // Div to show search results
            const comname2 = document.getElementById('com-2');  // Div to show search results
            const comname3 = document.getElementById('com-3');  // Div to show search results
            const uses = document.getElementById('uses');  // Div to show search results
            const discription = document.getElementById('discription');  // Div to show search results
            const pltype = document.getElementById('pltype');  // Div to show search results
            const region = document.getElementById('region');  // Div to show search results
            const modelContainer = document.getElementById('modelContainer');  // Container for 3D model
            const img = document.getElementById('plant-img-hold');
            
            // Check if a plant with the specified ID was found
            if (data.plant_id) {
                // Display the plant ID
                sciname.innerHTML = `<p>${data.scientific_name}</p>`;
                comname1.innerHTML = `${data.common_name}`;
                comname2.innerHTML = `${data.common_name2}`;
                comname3.innerHTML = `${data.common_name3}`;
                discription.innerHTML = `${data.description}`;
                pltype.innerHTML = `${data.type}`;
                region.innerHTML = `${data.region}`;
                uses.innerHTML = `${data.uses}`;
                img.innerHTML =`
                    <div id="img-container" class="plant-img" style="background: url('./imgs/${data.plant_id}.jpg');  background-repeat: no-repeat;
            background-position: center;
            background-size: cover;"></div>
                `;
                    

                // Clear any previous 3D model in the container
                modelContainer.innerHTML = '';

                let object;  // This will store the 3D model object once it's loaded
                let objToRender = 'eye';  // Example object type, customize this as needed

                // Set up the Three.js scene, camera, and renderer
                const width = modelContainer.clientWidth;  // Get width of the container
                const height = modelContainer.clientHeight;  // Get height of the container
                const scene = new THREE.Scene();  // Create a new Three.js scene
                const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);  // Set up perspective camera
                const renderer = new THREE.WebGLRenderer({ alpha: true });  // WebGL renderer with transparency
                renderer.setSize(width, height);  // Set renderer size to container dimensions
                modelContainer.appendChild(renderer.domElement);  // Add the renderer canvas to the container

                // Adjust camera position depending on the object type
                camera.position.z = objToRender === "dino" ? 1 : 2;  // Customize distance based on object

                // Add ambient light to the scene
                const ambientLight = new THREE.AmbientLight(0x333333, objToRender === "dino" ? 5 : 2);  // Adjust intensity for different objects
                scene.add(ambientLight);

                // Add a directional light to illuminate the 3D model
                const topLight = new THREE.DirectionalLight(0xffffff, 1);  // White light with intensity 1
                topLight.position.set(500, 500, 500);  // Position the light in the top-left corner
                scene.add(topLight);

                const downLight = new THREE.DirectionalLight(0xffffff, 1);  // White light with intensity 1
                downLight.position.set(200, 200, -250);  // Position the light in the top-left corner
                scene.add(downLight);

                // Initialize OrbitControls to allow user interaction (zoom, pan, rotate)
                const controls = new OrbitControls(camera, renderer.domElement);
                controls.enableDamping = true;  // Enable damping for smoother controls
                controls.dampingFactor = 0.25;  // Set damping factor
                controls.enableZoom = true;  // Allow zooming

                // Load the 3D model using GLTFLoader
                const loader = new GLTFLoader();
                loader.load(
                    `assets/${data.plant_id}/${data.plant_id}.gltf`,  // Path to the 3D model based on plant ID
                    function (gltf) {
                        // When the model is successfully loaded, add it to the scene
                        object = gltf.scene;
                        scene.add(object);

                        // Set material properties for metallicity
                        object.traverse(function (child) {
                            if (child.isMesh) {
                                child.material.metalness = 0.7;  // Set metallicity
                                child.material.roughness = 0.8;  // Optionally adjust roughness for better visual effect
                            }
                        });

                        animate();  // Start the animation loop to render the scene
                    },
                    function (xhr) {
                        // Log the progress of the loading process
                        console.log((xhr.loaded / xhr.total * 100) + '% loaded');
                    },
                    function (error) {
                        // Handle any errors that occur during model loading
                        console.error(error);
                        sciname.innerHTML = '<p>Error loading 3D model.</p>';  // Display error message to the user
                    }
                );

                // Animation loop to keep rendering the scene
                function animate() {
                    requestAnimationFrame(animate);  // Call animate recursively

                    if (object) {
                        // Auto-rotate the 3D model along the Y-axis
                        object.rotation.y += 0.01;
                    }

                    controls.update();  // Update controls for user interaction
                    renderer.render(scene, camera);  // Render the scene with the camera
                }

            } else {
                // If no plant was found, display a "Plant not found" message
                sciname.innerHTML = '<p>Plant not found.</p>';
                modelContainer.innerHTML = '';  // Clear the model container
            }
        })
        .catch(error => {
            // Handle any errors that occur during the fetch process
            console.error('Error:', error);
            document.getElementById('result').innerHTML = '<p>There was an error with the search.</p>';
        });
}


document.getElementById('searchBtn').addEventListener('click', function () {
    // Get the search term from the input box
    const searchTerm = document.getElementById('searchInput').value;
    performSearch(searchTerm);
});

function handleCardClick(plantId) {
    // Call the performSearch function with the plantId
    performSearch(plantId);
}

window.handleCardClick = handleCardClick;