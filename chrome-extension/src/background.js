// Background service worker for Fum Calendar Extractor v1.0.2
// Completely rewritten to avoid caching issues

self.addEventListener('install', () => {
    console.log('Service worker installing...');
    self.skipWaiting();
});

self.addEventListener('activate', () => {
    console.log('Service worker activating...');
    self.clients.claim();
});

// Extension installation handler
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onInstalled) {
    chrome.runtime.onInstalled.addListener(() => {
        console.log('Fum Calendar Extractor v1.0.2 installed successfully');
    });
}

// Message handler with complete error isolation
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log('Message received:', request);
        
        // Handle course details storage
        if (request && request.action === 'courseDetails') {
            if (chrome.storage && chrome.storage.local) {
                chrome.storage.local.set({
                    latestCourseDetails: request.details || {}
                }, () => {
                    if (chrome.runtime.lastError) {
                        console.error('Storage error:', chrome.runtime.lastError);
                        sendResponse({ success: false, error: chrome.runtime.lastError.message });
                    } else {
                        console.log('Course details stored successfully');
                        sendResponse({ success: true });
                    }
                });
                return true; // Keep message channel open
            } else {
                sendResponse({ success: false, error: 'Storage API not available' });
            }
            return true;
        }
        
        // Handle ping requests
        if (request && request.action === 'ping') {
            console.log('Ping received');
            sendResponse({ pong: true, timestamp: Date.now() });
            return false;
        }
        
        // Unknown action
        console.warn('Unknown action:', request?.action);
        sendResponse({ success: false, error: 'Unknown action' });
        return false;
    });
}

console.log('Background script v1.0.2 loaded successfully');