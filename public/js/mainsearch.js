const BASE_URL = 'http://localhost:3030';

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

function performSearch(searchTerm) {
  if (!searchTerm) return alert('Enter a plant name');

  fetch(`${BASE_URL}/search?term=${searchTerm}`)
    .then((res) => res.json())
    .then((data) => {
      resultsArea.innerHTML = '';
      if (!data || data.message) {
        sciname.innerText = data?.message || 'Plant not found';
        clearPlantDisplay();
        noOfResults.textContent = 0;
        return;
      }

      data.forEach((plant) => createResultCard(plant));
      noOfResults.textContent = data.length;
    })
    .catch((err) => console.error(err));
}

function createResultCard(plant) {
  const card = document.createElement('div');
  card.className = 'f-card';
  card.innerHTML = `<h4>${plant.plant_id}</h4><h4>${plant.scientific_name}</h4>`;
  card.onclick = () => displayPlantInfo(plant);
  resultsArea.appendChild(card);
}

function displayPlantInfo(plant) {
  sciname.innerText = plant.scientific_name || '';
  comname.innerText = plant.common_names ? plant.common_names.join(' || ') : '';
  descriptionEl.innerText = plant.description || '';
  pltype.innerText = plant.type_name || '';
  region.innerText = plant.regions ? plant.regions.join(' || ') : '';
  uses.innerText = plant.uses ? plant.uses.join(' || ') : ''; // show uses returned from API

  img.innerHTML = `<div class="plant-img" style="background:url('./imgs/${plant.plant_id}.jpg'); background-size:cover; background-position:center;"></div>`;
  modelContainer.innerHTML = '';
  // pass the full plant object so frontend can use preview_image or asset_files
  loadAndShowModel(plant);
}

// Dynamically load <model-viewer> if needed and try common asset paths for .gltf
async function ensureModelViewer() {
  if (window.customElements && customElements.get('model-viewer')) return;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    // model-viewer ships as an ES module; load as module to avoid 'export' syntax errors
    s.type = 'module';
    s.src = 'https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js';
    s.onload = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function urlExists(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch (e) {
    return false;
  }
}

async function loadAndShowModel(modelOrPlantId) {
  if (!modelOrPlantId) return;

  // if server passed a path (starts with '/'), use it directly
  let modelUrl = null;
  let previewImage = null;
  if (typeof modelOrPlantId === 'string' && modelOrPlantId.startsWith('/')) {
    if (await urlExists(modelOrPlantId)) modelUrl = modelOrPlantId;
  } else if (
    typeof modelOrPlantId === 'string' &&
    modelOrPlantId.toLowerCase().includes('.gltf')
  ) {
    if (await urlExists(modelOrPlantId)) modelUrl = modelOrPlantId;
  } else {
    // if caller passed a plant object, prefer canonical asset_files
    if (typeof modelOrPlantId === 'object' && modelOrPlantId !== null) {
      const plant = modelOrPlantId;
      const nameRaw = (plant.plant_id || plant.plantId || plant.id || '').toString();
      const name = nameRaw.toLowerCase();
      const files = Array.isArray(plant.asset_files) ? plant.asset_files : [];

      const pick = (ext) => files.find((f) => f && f.toLowerCase() === `${name}.${ext}`);
      const foundGltf = pick('gltf');
      const foundBin = pick('bin');
      const foundJpg = pick('jpg');

      if (foundGltf) modelUrl = `/assets1/${name}/${foundGltf}`;
      // preview image if available
      if (foundJpg) previewImage = `/assets1/${name}/${foundJpg}`;
      // fallback: check for canonical <name>.jpg in the same folder
      if (!previewImage) {
        const fallbackJpg = `/assets1/${name}/${name}.jpg`;
        // eslint-disable-next-line no-await-in-loop
        if (await urlExists(fallbackJpg)) previewImage = fallbackJpg;
      }

      // fallback to checking common candidate paths based on name
      if (!modelUrl) {
        const candidates = [
          `/assets1/${name}/${name}.gltf`,
          `/assets1/${nameRaw}/${nameRaw}.gltf`,
          `/assets1/${nameRaw}/${name}.gltf`,
          `/assets1/${name}/${nameRaw}.gltf`,
        ];
        for (const c of candidates) {
          // eslint-disable-next-line no-await-in-loop
          if (await urlExists(c)) {
            modelUrl = c;
            break;
          }
        }
      }
    } else {
      const plantId = modelOrPlantId;
      const candidates = [
        `/assets1/${plantId}/${plantId}.gltf`,
        `/assets1/${plantId.toLowerCase()}/${plantId.toLowerCase()}.gltf`,
        `/assets1/${plantId.toLowerCase()}/${plantId}.gltf`,
        `/assets1/${plantId}/${plantId.toLowerCase()}.gltf`,
      ];
      for (const c of candidates) {
        // eslint-disable-next-line no-await-in-loop
        if (await urlExists(c)) {
          modelUrl = c;
          break;
        }
      }
    }
  }

  if (!modelUrl) {
    console.warn('No model URL found for', modelOrPlantId);
    (window._modelLoadErrors = window._modelLoadErrors || []).push({
      plant: modelOrPlantId,
      error: 'no-model-url',
    });
    return; // no model available
  }

  console.log('Attempting to load model:', modelUrl);
  (window._modelLoadErrors = window._modelLoadErrors || []).push({
    plant: modelOrPlantId,
    attempt: modelUrl,
    ts: Date.now(),
  });

  // cleanup any previous renderer/viewer
  cleanupModelContainer();

  // load three.js and loaders
  try {
    await ensureThreeJS();
  } catch (e) {
    console.error('Failed to load three.js or loaders', e);
    window._modelLoadErrors.push({
      plant: modelOrPlantId,
      error: 'threejs-load-failed',
      detail: String(e),
    });
    // fallback to model-viewer
    try {
      await ensureModelViewer();
      const mv = document.createElement('model-viewer');
      mv.setAttribute('src', modelUrl);
      mv.setAttribute('alt', modelOrPlantId);
      mv.setAttribute('camera-controls', '');
      mv.setAttribute('auto-rotate', '');
      mv.style.width = '100%';
      mv.style.height = '100%';
      mv.style.background = 'transparent';
      modelContainer.appendChild(mv);
      return;
    } catch (mvErr) {
      console.error('model-viewer fallback failed', mvErr);
      window._modelLoadErrors.push({
        plant: modelOrPlantId,
        error: 'model-viewer-failed',
        detail: String(mvErr),
      });
      return;
    }
  }

  // create three scene
  try {
    // pass the normalized plant name (if available) so we can rewrite Image_*.jpg -> <name>.jpg
    let plantName = null;
    if (typeof modelOrPlantId === 'object' && modelOrPlantId !== null) {
      const nameRaw = (
        modelOrPlantId.plant_id ||
        modelOrPlantId.plantId ||
        modelOrPlantId.id ||
        ''
      ).toString();
      plantName = nameRaw.toLowerCase();
    }
    createThreeScene(modelUrl, previewImage, plantName);
  } catch (e) {
    console.error('createThreeScene error', e);
    window._modelLoadErrors.push({
      plant: modelOrPlantId,
      error: 'createThreeScene-failed',
      detail: String(e),
    });
    // try model-viewer as last resort
    try {
      await ensureModelViewer();
      const mv = document.createElement('model-viewer');
      mv.setAttribute('src', modelUrl);
      mv.setAttribute('alt', modelOrPlantId);
      mv.setAttribute('camera-controls', '');
      mv.setAttribute('auto-rotate', '');
      mv.style.width = '100%';
      mv.style.height = '100%';
      mv.style.background = 'transparent';
      modelContainer.appendChild(mv);
    } catch (mvErr) {
      console.error('model-viewer fallback also failed', mvErr);
      window._modelLoadErrors.push({
        plant: modelOrPlantId,
        error: 'fallback-failed',
        detail: String(mvErr),
      });
    }
  }
}

function cleanupModelContainer() {
  // remove any model-viewer elements
  const mv = modelContainer.querySelector('model-viewer');
  if (mv) mv.remove();
  // cancel any running animation loop
  if (window._threeAnimationId) {
    try {
      cancelAnimationFrame(window._threeAnimationId);
    } catch (e) {}
    delete window._threeAnimationId;
  }

  // remove resize handler if present
  if (window._threeResizeHandler) {
    try {
      window.removeEventListener('resize', window._threeResizeHandler);
    } catch (e) {}
    delete window._threeResizeHandler;
  }

  // dispose renderer and remove canvas
  if (window._threeRenderer) {
    try {
      const r = window._threeRenderer;
      if (r.domElement && r.domElement.parentNode) r.domElement.parentNode.removeChild(r.domElement);
      if (typeof r.dispose === 'function') r.dispose();
      if (typeof r.forceContextLoss === 'function') r.forceContextLoss();
    } catch (e) {}
    delete window._threeRenderer;
  }

  // finally clear container
  modelContainer.innerHTML = '';
}

async function ensureThreeJS() {
  // If already loaded with loaders/controls, we're done
  if (window.THREE && window.THREE.GLTFLoader && window.THREE.OrbitControls) return;

  // If another call is already loading Three, wait for it
  if (window._threeLoading) return window._threeLoading;

  window._threeLoading = (async () => {
    const loadScript = (src) =>
      new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = false; // preserve execution order
        s.onload = () => resolve();
        s.onerror = (e) => reject(new Error('Failed to load ' + src));
        document.head.appendChild(s);
      });

    // Use a pre-r150 build that provides UMD globals to avoid ESM-only syntax issues
    const threeVersion = '0.149.0';
    await loadScript(`https://unpkg.com/three@${threeVersion}/build/three.min.js`);
    // loaders and controls that attach to global THREE (non-module UMD builds)
    await loadScript(`https://unpkg.com/three@${threeVersion}/examples/js/loaders/GLTFLoader.js`);
    await loadScript(`https://unpkg.com/three@${threeVersion}/examples/js/controls/OrbitControls.js`);

    // ensure the globals are available; try to recover from different exposures
    if (!window.THREE) throw new Error('THREE global missing after load');
    if (!window.THREE.GLTFLoader && window.GLTFLoader) window.THREE.GLTFLoader = window.GLTFLoader;
    if (!window.THREE.OrbitControls && window.OrbitControls) window.THREE.OrbitControls = window.OrbitControls;
    if (!window.THREE.GLTFLoader || !window.THREE.OrbitControls)
      throw new Error('GLTFLoader or OrbitControls not attached to THREE');
  })();

  return window._threeLoading;
}

async function createThreeScene(modelUrl, previewImage) {
  const width = modelContainer.clientWidth || 300;
  const height = modelContainer.clientHeight || 300;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(width, height);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.physicallyCorrectLights = true;
  modelContainer.appendChild(renderer.domElement);
  // ensure the canvas fills the container and the container is positioned
  try {
    modelContainer.style.position = modelContainer.style.position || 'relative';
    const canvasEl = renderer.domElement;
    canvasEl.style.position = 'absolute';
    canvasEl.style.top = '0';
    canvasEl.style.left = '0';
    canvasEl.style.width = '100%';
    canvasEl.style.height = '100%';
    canvasEl.style.display = 'block';
  } catch (e) {
    /* ignore styling errors */
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(0, 1.5, 3);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.9);
  scene.add(hemi);
  const amb = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(amb);
  const dir = new THREE.DirectionalLight(0xffffff, 1.6);
  dir.position.set(5, 10, 7.5);
  dir.castShadow = false;
  scene.add(dir);
  const dir2 = new THREE.DirectionalLight(0xffffff, 0.6);
  dir2.position.set(-5, -3, -5);
  scene.add(dir2);

  // load model
  const textureLoader = new THREE.TextureLoader();
  // create a loading manager to rewrite internal glTF image names (e.g. Image_0.jpg)
  const manager = new THREE.LoadingManager();

  // If preview image exists, rewrite any internal glTF images to use it
  if (previewImage) {
    manager.setURLModifier((url) => {
      try {
        const base = url.split('/').pop().toLowerCase();
        // Any image in glTF gets replaced by preview image
        if (base.endsWith('.jpg') || base.endsWith('.png')) {
          return previewImage;
        }
        // Any .bin file gets mapped to the same folder as the glTF
        if (base.endsWith('.bin')) {
          const modelFolder = modelUrl.substring(0, modelUrl.lastIndexOf('/') + 1);
          return modelFolder + base;
        }
      } catch (e) {
        console.warn('URL rewrite failed', e);
      }
      return url;
    });
  }

  const loader = new THREE.GLTFLoader(manager);
  loader.setCrossOrigin && loader.setCrossOrigin('*');

  const loadGltfWithRewrites = async (url) => {
    // if this is a .gltf text file and we have a previewImage, rewrite internal URIs
    try {
      if (url.toLowerCase().endsWith('.gltf') && previewImage) {
        const basePath = url.substring(0, url.lastIndexOf('/') + 1);
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('gltf fetch failed');
        let txt = await resp.text();
        // rewrite image names like Image_0.jpg -> previewImage
        txt = txt.replace(/"uri"\s*:\s*"(Image_\d+\.(jpg|png))"/gi, `"uri":"${previewImage}"`);
        // rewrite .bin URIs to absolute paths if they are relative
        txt = txt.replace(
          /"uri"\s*:\s*"((?!https?:|\/)[^"\\]+\.bin)"/gi,
          (m, p1) => `"uri":"${basePath}${p1}"`,
        );
        const blob = new Blob([txt], { type: 'model/gltf+json' });
        return URL.createObjectURL(blob);
      }
    } catch (e) {
      console.warn('gltf rewrite failed', e);
    }
    return url;
  };

  // attempt to rewrite if needed, then load
  (async () => {
    const finalUrl = await loadGltfWithRewrites(modelUrl);
    loader.load(
      finalUrl,
      (gltf) => {
        const root = gltf.scene || gltf.scenes[0];
        scene.add(root);

        // compute bounding box, center and size
        const bbox = new THREE.Box3().setFromObject(root);
        const sizeVec = bbox.getSize(new THREE.Vector3());
        const maxDim = Math.max(sizeVec.x, sizeVec.y, sizeVec.z);
        const center = bbox.getCenter(new THREE.Vector3());

        // move to center
        root.position.sub(center);

        // scale to fit into a normalized box (avoid extremely large/small models)
        const desiredMax = 1.5; // target max dimension in scene units
        const scale = maxDim > 0 ? desiredMax / maxDim : 1;
        root.scale.setScalar(scale);

        // ensure textures/colors use correct encoding and update materials
        root.traverse((node) => {
          if (node.isMesh && node.material) {
            const mats = Array.isArray(node.material) ? node.material : [node.material];
            mats.forEach((m) => {
              try {
                if (m.map) {
                  m.map.encoding = THREE.sRGBEncoding;
                  m.map.needsUpdate = true;
                }
                if (m.emissiveMap) {
                  m.emissiveMap.encoding = THREE.sRGBEncoding;
                  m.emissiveMap.needsUpdate = true;
                }
                if (m.color && m.color.isColor) m.color.convertSRGBToLinear();
                if (m.emissive && m.emissive.isColor && m.emissive.convertSRGBToLinear)
                  m.emissive.convertSRGBToLinear();
                // if material is unlit or basic, convert to standard for lighting
                if (m.isMeshBasicMaterial) {
                  const newMat = new THREE.MeshStandardMaterial({
                    map: m.map || null,
                    color: m.color ? m.color.clone() : new THREE.Color(0xffffff),
                    metalness: 0,
                    roughness: 0.5,
                    side: THREE.DoubleSide,
                  });
                  if (newMat.map) {
                    newMat.map.encoding = THREE.sRGBEncoding;
                    newMat.map.needsUpdate = true;
                  }
                  newMat.needsUpdate = true;
                  node.material = newMat;
                } else {
                  m.side = THREE.DoubleSide;
                  if (m.map) m.map.needsUpdate = true;
                  m.needsUpdate = true;
                }
              } catch (e) {
                console.warn('material fixup failed', e);
              }
            });
          }
        });

        // If materials have no textures, try applying previewImage as fallback
        if (previewImage) {
          root.traverse((node) => {
            if (node.isMesh && node.material) {
              const mats = Array.isArray(node.material) ? node.material : [node.material];
              mats.forEach((m) => {
                // if material has no map, set fallback texture
                if (!m.map) {
                  try {
                    m.map = textureLoader.load(previewImage, (tex) => {
                      tex.encoding = THREE.sRGBEncoding;
                      tex.needsUpdate = true;
                      m.needsUpdate = true;
                    });
                    m.needsUpdate = true;
                  } catch (e) {
                    console.warn('fallback texture load failed', e);
                  }
                }
              });
            }
          });
        }

        // recompute bounding box after transform
        const bbox2 = new THREE.Box3().setFromObject(root);
        const radius = bbox2.getSize(new THREE.Vector3()).length() * 0.5;

        // ground the model so its bottom sits near y=0
        const minY = bbox2.min.y;
        root.position.y -= minY; // move so bottom is at y=0

        // position camera to fit the model using fov
        const fov = camera.fov * (Math.PI / 180);
        const cameraDistance = Math.abs(radius / Math.sin(fov / 2)) * 1.2;
        camera.position.set(0, cameraDistance * 0.35, cameraDistance);
        camera.near = Math.max(0.01, cameraDistance / 100);
        camera.far = cameraDistance * 100;
        camera.updateProjectionMatrix();

        camera.lookAt(new THREE.Vector3(0, 0, 0));
        controls.target.set(0, 0, 0);
        controls.update();
      },
      undefined,
      (err) => {
        console.error('GLTF load error', err);
        window._modelLoadErrors.push({
          error: 'gltf-load-error',
          detail: String(err),
          url: modelUrl,
        });
      },
    );
  })();

  function animate() {
    window._threeAnimationId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  window._threeRenderer = renderer;
  // handle resize
  const onResize = () => {
    const w = modelContainer.clientWidth || 300;
    const h = modelContainer.clientHeight || 300;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', onResize);
  window._threeResizeHandler = onResize;
}

// Called by filter results to directly open the description popup
window.showPlantFromFilter = function (plant) {
  displayPlantInfo(plant);
  const popup = document.getElementById('discription-card');
  if (popup) popup.style.display = 'block';
};

function clearPlantDisplay() {
  comname.innerText = '';
  descriptionEl.innerText = '';
  pltype.innerText = '';
  region.innerText = '';
  uses.innerText = '';
  img.innerHTML = '';
  modelContainer.innerHTML = '';
}

document.getElementById('searchBtn').addEventListener('click', () => {
  const term = document.getElementById('searchInput').value.trim();
  performSearch(term);
});

window.handleCardClick = (plantName) => performSearch(plantName);
