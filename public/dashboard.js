// Dashboard global variables
let dashboardData = {
    cameras: [],
    stats: {}
};

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
    initializeDashboard();
    setupEventListeners();
});

async function initializeDashboard() {
    try {
        showLoading();
        await loadDashboardData();
        renderDashboard();
        hideLoading();
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        showError('Failed to load dashboard data');
    }
}

function setupEventListeners() {
    document.getElementById('refresh-dashboard').addEventListener('click', refreshDashboard);
}

async function loadDashboardData() {
    try {
        // Load cameras and their statistics
        const [camerasResponse, statsResponse] = await Promise.all([
            fetch('/api/cameras'),
            fetch('/api/stats')
        ]);

        const cameras = await camerasResponse.json();
        const stats = await statsResponse.json();

        dashboardData.cameras = cameras;
        dashboardData.stats = stats;

        // Load detailed stats for each camera
        const cameraStatsPromises = cameras.map(async (camera) => {
            try {
                const response = await fetch(`/api/cameras/${encodeURIComponent(camera.name)}/stats`);
                const cameraStats = await response.json();
                return { ...camera, stats: cameraStats };
            } catch (error) {
                console.error(`Error loading stats for camera ${camera.name}:`, error);
                return { ...camera, stats: { totalImages: 0, unviewedImages: 0, lastImage: null } };
            }
        });

        dashboardData.cameras = await Promise.all(cameraStatsPromises);

    } catch (error) {
        console.error('Error loading dashboard data:', error);
        throw error;
    }
}

function renderDashboard() {
    renderHeaderStats();
    renderCameraGrid();
}

function renderHeaderStats() {
    const { stats } = dashboardData;
    
    document.getElementById('total-cameras').textContent = dashboardData.cameras.length;
    document.getElementById('total-images').textContent = stats.totalImages || 0;
    document.getElementById('total-views').textContent = stats.totalViews || 0;
    document.getElementById('total-crops').textContent = stats.totalCrops || 0;
}

function renderCameraGrid() {
    const grid = document.getElementById('cameras-grid');
    grid.innerHTML = '';

    if (dashboardData.cameras.length === 0) {
        grid.innerHTML = '<div class="no-cameras">No cameras found</div>';
        return;
    }

    dashboardData.cameras.forEach(camera => {
        const cameraCard = createCameraCard(camera);
        grid.appendChild(cameraCard);
    });
}

function createCameraCard(camera) {
    const card = document.createElement('div');
    card.className = 'camera-card';
    
    const stats = camera.stats || {};
    const hasUnviewed = stats.unviewedImages > 0;
    const lastImageTime = stats.lastImage ? new Date(stats.lastImage.timestamp).toLocaleString() : 'No images';
    
    card.innerHTML = `
        <div class="camera-image-container">
            ${stats.lastImage ? 
                `<img class="camera-image" src="${stats.lastImage.path}" alt="${camera.displayName}" loading="lazy">` :
                `<div class="no-image-placeholder">📷</div>`
            }
            <div class="camera-overlay">
                <div class="image-status ${stats.lastImage ? 'status-live' : 'status-offline'}">
                    ${stats.lastImage ? '🟢 Live' : '🔴 No Images'}
                </div>
            </div>
        </div>
        
        <div class="camera-info">
            <h3 class="camera-name">${camera.displayName}</h3>
            
            <div class="camera-stats">
                <div class="stat-item">
                    <span class="stat-value">${stats.totalImages || 0}</span>
                    <span class="stat-label">Total Images</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value ${hasUnviewed ? 'unviewed-highlight' : ''}">${stats.unviewedImages || 0}</span>
                    <span class="stat-label">Unviewed</span>
                </div>
            </div>
            
            <div class="camera-details">
                <span class="last-updated">
                    Last: ${lastImageTime}
                </span>
                <button class="view-button" onclick="openCameraViewer('${camera.name}')">
                    View Camera
                </button>
            </div>
        </div>
    `;

    // Add click handler to open camera viewer
    card.addEventListener('click', (e) => {
        // Don't trigger if clicking the view button
        if (!e.target.classList.contains('view-button')) {
            openCameraViewer(camera.name);
        }
    });

    return card;
}

function openCameraViewer(cameraName) {
    // Open the main camera viewer with the specific camera
    const url = `index.html?camera=${encodeURIComponent(cameraName)}`;
    window.location.href = url;
}

async function refreshDashboard() {
    try {
        showLoading();
        await loadDashboardData();
        renderDashboard();
        hideLoading();
        
        // Show success feedback
        const refreshBtn = document.getElementById('refresh-dashboard');
        const originalText = refreshBtn.textContent;
        refreshBtn.textContent = '✅ Refreshed';
        refreshBtn.style.background = 'rgba(46, 204, 113, 0.3)';
        
        setTimeout(() => {
            refreshBtn.textContent = originalText;
            refreshBtn.style.background = '';
        }, 2000);
        
    } catch (error) {
        console.error('Error refreshing dashboard:', error);
        showError('Failed to refresh dashboard');
    }
}

function showLoading() {
    document.getElementById('dashboard-loading').style.display = 'block';
    document.getElementById('cameras-grid').style.display = 'none';
}

function hideLoading() {
    document.getElementById('dashboard-loading').style.display = 'none';
    document.getElementById('cameras-grid').style.display = 'grid';
}

function showError(message) {
    const grid = document.getElementById('cameras-grid');
    grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: #e74c3c;">
            <h3>❌ Error</h3>
            <p>${message}</p>
            <button onclick="refreshDashboard()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">
                Try Again
            </button>
        </div>
    `;
    hideLoading();
}

// Auto-refresh dashboard every 5 minutes
setInterval(() => {
    loadDashboardData().then(() => {
        renderDashboard();
    }).catch(error => {
        console.error('Auto-refresh failed:', error);
    });
}, 5 * 60 * 1000);
