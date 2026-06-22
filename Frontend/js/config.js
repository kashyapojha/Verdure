// Shared runtime config — works on localhost and on the deployed server IP.
(function () {
    const protocol = window.location.protocol || 'http:';
    const hostname = window.location.hostname || 'localhost';
    const port = window.location.port;
    const BACKEND_PORT = '3030';

    // Backend API: same origin when the app is served from port 3030, otherwise hostname:3030
    let apiBase;
    if (port === BACKEND_PORT) {
        apiBase = window.location.origin;
    } else {
        apiBase = `${protocol}//${hostname}:${BACKEND_PORT}`;
    }

    // Static assets (3D models, images) are served from the same origin as the page
    const assetBase = window.location.origin;

    window.APP_CONFIG = {
        BASE_URL: window.APP_CONFIG_BASE_URL || apiBase,
        ASSET_BASE_URL: window.APP_CONFIG_ASSET_BASE_URL || assetBase,
        CHATBOT_URL: window.APP_CONFIG_CHATBOT_URL || `${protocol}//${hostname}:5000/chat`
    };
})();
