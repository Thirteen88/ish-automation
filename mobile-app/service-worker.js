/**
 * Service Worker for AI Orchestrator PWA
 *
 * Features:
 * - Offline caching strategy
 * - Background sync for queries
 * - Push notification handling
 * - Update management
 * - Cache-first with network fallback
 */

const CACHE_NAME = 'ai-orchestrator-v1.0.0';
const RUNTIME_CACHE = 'ai-orchestrator-runtime';
const API_CACHE = 'ai-orchestrator-api';

// Files to cache on install
const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/app.js',
    '/manifest.webmanifest',
    '/icons/icon-72x72.png',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png'
];

// API endpoints to cache
const CACHEABLE_API_PATTERNS = [
    /\/api\/status/,
    /\/api\/platforms/,
    /\/api\/history/
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('🔧 Service Worker: Installing...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('📦 Service Worker: Caching static assets');
                return cache.addAll(PRECACHE_URLS);
            })
            .then(() => {
                console.log('✅ Service Worker: Installation complete');
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('❌ Service Worker: Installation failed', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('🔄 Service Worker: Activating...');

    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(name => name !== CACHE_NAME && name !== RUNTIME_CACHE && name !== API_CACHE)
                        .map(name => {
                            console.log('🗑️ Service Worker: Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('✅ Service Worker: Activation complete');
                return self.clients.claim();
            })
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip cross-origin requests
    if (url.origin !== self.location.origin && !url.pathname.startsWith('/api/')) {
        return;
    }

    // Handle API requests differently
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(handleAPIRequest(request));
    } else {
        event.respondWith(handleStaticRequest(request));
    }
});

// Handle static file requests (cache-first)
async function handleStaticRequest(request) {
    try {
        // Try cache first
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }

        // Fetch from network
        const networkResponse = await fetch(request);

        // Cache successful responses
        if (networkResponse.ok) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;

    } catch (error) {
        console.error('❌ Service Worker: Fetch failed', error);

        // Return offline page or error response
        return new Response('Offline - Please check your connection', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
                'Content-Type': 'text/plain'
            })
        });
    }
}

// Handle API requests (network-first with cache fallback)
async function handleAPIRequest(request) {
    const url = new URL(request.url);

    // Check if this endpoint should be cached
    const shouldCache = CACHEABLE_API_PATTERNS.some(pattern => pattern.test(url.pathname));

    try {
        // Try network first
        const networkResponse = await fetch(request);

        // Cache successful responses for cacheable endpoints
        if (networkResponse.ok && shouldCache) {
            const cache = await caches.open(API_CACHE);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;

    } catch (error) {
        console.error('❌ Service Worker: API request failed', error);

        // Try to return cached response
        if (shouldCache) {
            const cachedResponse = await caches.match(request);
            if (cachedResponse) {
                console.log('📦 Service Worker: Returning cached API response');
                return cachedResponse;
            }
        }

        // Queue for background sync if POST request
        if (request.method === 'POST') {
            await queueBackgroundSync(request);
        }

        // Return error response
        return new Response(JSON.stringify({
            success: false,
            error: 'Network unavailable. Request queued for sync.',
            offline: true
        }), {
            status: 503,
            headers: new Headers({
                'Content-Type': 'application/json'
            })
        });
    }
}

// Background Sync - queue failed requests
async function queueBackgroundSync(request) {
    try {
        const data = await request.clone().json();

        // Store in IndexedDB for background sync
        const db = await openIndexedDB();
        const tx = db.transaction('syncQueue', 'readwrite');
        await tx.store.add({
            url: request.url,
            method: request.method,
            headers: Object.fromEntries(request.headers.entries()),
            body: data,
            timestamp: Date.now()
        });

        console.log('📥 Service Worker: Request queued for background sync');

        // Register sync if available
        if ('sync' in self.registration) {
            await self.registration.sync.register('sync-queries');
        }

    } catch (error) {
        console.error('❌ Service Worker: Failed to queue request', error);
    }
}

// Background Sync event
self.addEventListener('sync', (event) => {
    console.log('🔄 Service Worker: Background sync triggered');

    if (event.tag === 'sync-queries') {
        event.waitUntil(syncQueuedRequests());
    }
});

// Sync queued requests
async function syncQueuedRequests() {
    try {
        const db = await openIndexedDB();
        const tx = db.transaction('syncQueue', 'readonly');
        const queue = await tx.store.getAll();

        console.log(`🔄 Service Worker: Syncing ${queue.length} queued requests`);

        for (const item of queue) {
            try {
                // Attempt to send request
                const response = await fetch(item.url, {
                    method: item.method,
                    headers: item.headers,
                    body: JSON.stringify(item.body)
                });

                if (response.ok) {
                    // Remove from queue on success
                    const deleteTx = db.transaction('syncQueue', 'readwrite');
                    await deleteTx.store.delete(item.id);
                    console.log('✅ Service Worker: Synced request successfully');
                }

            } catch (error) {
                console.error('❌ Service Worker: Failed to sync request', error);
            }
        }

        // Notify clients
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({
                type: 'BACKGROUND_SYNC',
                data: { syncedCount: queue.length }
            });
        });

    } catch (error) {
        console.error('❌ Service Worker: Sync failed', error);
    }
}

// Push notification handling
self.addEventListener('push', (event) => {
    console.log('📬 Service Worker: Push notification received');

    let data = {
        title: 'AI Orchestrator',
        body: 'New update available',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        tag: 'default',
        data: {}
    };

    if (event.data) {
        try {
            data = { ...data, ...event.data.json() };
        } catch (error) {
            console.error('❌ Service Worker: Failed to parse push data', error);
        }
    }

    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: data.icon,
            badge: data.badge,
            tag: data.tag,
            data: data.data,
            vibrate: [200, 100, 200],
            requireInteraction: false,
            actions: [
                {
                    action: 'view',
                    title: 'View',
                    icon: '/icons/icon-72x72.png'
                },
                {
                    action: 'dismiss',
                    title: 'Dismiss',
                    icon: '/icons/icon-72x72.png'
                }
            ]
        })
    );

    // Notify clients
    self.clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage({
                type: 'PUSH_RECEIVED',
                data: data.data
            });
        });
    });
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
    console.log('👆 Service Worker: Notification clicked');

    event.notification.close();

    const action = event.action;
    const data = event.notification.data;

    if (action === 'dismiss') {
        return;
    }

    // Open or focus app
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clients => {
                // Check if app is already open
                for (const client of clients) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        return client.focus();
                    }
                }

                // Open new window
                if (self.clients.openWindow) {
                    const url = data.queryId ? `/?queryId=${data.queryId}` : '/';
                    return self.clients.openWindow(url);
                }
            })
    );
});

// Message handling from clients
self.addEventListener('message', (event) => {
    console.log('📨 Service Worker: Message received', event.data);

    const { type, data } = event.data;

    switch (type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;

        case 'CACHE_URLS':
            event.waitUntil(cacheURLs(data.urls));
            break;

        case 'CLEAR_CACHE':
            event.waitUntil(clearAllCaches());
            break;

        case 'GET_CACHE_SIZE':
            event.waitUntil(getCacheSize().then(size => {
                event.ports[0].postMessage({ size });
            }));
            break;
    }
});

// Cache specific URLs
async function cacheURLs(urls) {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.addAll(urls);
    console.log('📦 Service Worker: Cached URLs', urls);
}

// Clear all caches
async function clearAllCaches() {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
    console.log('🗑️ Service Worker: All caches cleared');

    // Notify clients
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
        client.postMessage({
            type: 'CACHE_UPDATED',
            data: { cleared: true }
        });
    });
}

// Get total cache size
async function getCacheSize() {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        return estimate.usage;
    }
    return 0;
}

// IndexedDB helper
async function openIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('AIOrchestrator', 1);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            if (!db.objectStoreNames.contains('syncQueue')) {
                db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
            }

            if (!db.objectStoreNames.contains('cachedResponses')) {
                db.createObjectStore('cachedResponses', { keyPath: 'queryId' });
            }

            if (!db.objectStoreNames.contains('pendingQueries')) {
                db.createObjectStore('pendingQueries', { keyPath: 'id', autoIncrement: true });
            }
        };
    });
}

// Periodic background sync (if supported)
self.addEventListener('periodicsync', (event) => {
    console.log('⏰ Service Worker: Periodic sync triggered');

    if (event.tag === 'update-status') {
        event.waitUntil(updatePlatformStatus());
    }
});

// Update platform status in background
async function updatePlatformStatus() {
    try {
        const response = await fetch('/api/status');
        if (response.ok) {
            const data = await response.json();

            // Cache the status
            const cache = await caches.open(API_CACHE);
            cache.put('/api/status', new Response(JSON.stringify(data)));

            console.log('✅ Service Worker: Platform status updated');
        }
    } catch (error) {
        console.error('❌ Service Worker: Failed to update status', error);
    }
}

// Handle fetch errors with retry logic
async function fetchWithRetry(request, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fetch(request);
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
        }
    }
}

// Prefetch important resources
async function prefetchResources() {
    const urls = [
        '/api/status',
        '/api/platforms',
        '/api/history?limit=10'
    ];

    const cache = await caches.open(API_CACHE);
    const promises = urls.map(url => {
        return fetch(url)
            .then(response => {
                if (response.ok) {
                    return cache.put(url, response);
                }
            })
            .catch(error => {
                console.warn('⚠️ Service Worker: Failed to prefetch', url, error);
            });
    });

    await Promise.allSettled(promises);
    console.log('✅ Service Worker: Resources prefetched');
}

// Clean old cache entries
async function cleanOldCacheEntries() {
    const cache = await caches.open(RUNTIME_CACHE);
    const requests = await cache.keys();

    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

    for (const request of requests) {
        const response = await cache.match(request);
        const dateHeader = response.headers.get('date');

        if (dateHeader) {
            const date = new Date(dateHeader).getTime();
            if (now - date > maxAge) {
                await cache.delete(request);
                console.log('🗑️ Service Worker: Deleted old cache entry', request.url);
            }
        }
    }
}

// Schedule periodic cleanup
setInterval(() => {
    cleanOldCacheEntries().catch(error => {
        console.error('❌ Service Worker: Cache cleanup failed', error);
    });
}, 24 * 60 * 60 * 1000); // Once per day

console.log('✅ Service Worker: Loaded successfully');
