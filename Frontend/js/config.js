// config.js
// attach BASE_URL to window so all scripts can access it
const defaultHost = window.location.hostname || 'localhost';
window.APP_CONFIG = {
    BASE_URL: window.APP_CONFIG_BASE_URL || `http://${defaultHost}:3030`
};