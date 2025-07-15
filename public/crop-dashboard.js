// Crop Dashboard JavaScript
let currentPage = 1;
const itemsPerPage = 9;
let totalItems = 0;
let currentFilters = {
    status: 'all',
    jonathan: 'all',
    activity: 'all',
    clothing: 'all'
};

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', function() {
    initializeDashboard();
    setupEventListeners();
});

function initializeDashboard() {
    loadStatistics();
    loadCrops();
}

function setupEventListeners() {
    // Filter controls
    document.getElementById('apply-filters').addEventListener('click', applyFilters);
    document.getElementById('reset-filters').addEventListener('click', resetFilters);
    
    // Pagination controls
    document.getElementById('prev-page').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            loadCrops();
        }
    });
    
    document.getElementById('next-page').addEventListener('click', () => {
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            loadCrops();
        }
    });
}

async function loadStatistics() {
    try {
        const response = await fetch('/api/crop-stats');
        const stats = await response.json();
        
        document.getElementById('total-crops').textContent = stats.total_crops || 0;
        document.getElementById('unreviewed-crops').textContent = stats.never_reviewed || 0;
        document.getElementById('classified-crops').textContent = stats.classified_crops || 0;
        
        const reviewedPercentage = stats.total_crops > 0 
            ? Math.round((stats.classified_crops / stats.total_crops) * 100)
            : 0;
        document.getElementById('reviewed-percentage').textContent = reviewedPercentage + '%';
        
    } catch (error) {
        console.error('Error loading statistics:', error);
    }
}

async function loadCrops() {
    console.log('🔍 CLIENT DEBUG: loadCrops called');
    showLoading(true);
    
    try {
        const params = new URLSearchParams({
            page: currentPage,
            limit: itemsPerPage,
            ...currentFilters
        });
        
        console.log('📤 CLIENT DEBUG: Making request with params:', params.toString());
        console.log('🎯 CLIENT DEBUG: Current filters:', currentFilters);
        console.log('📄 CLIENT DEBUG: Page:', currentPage, 'Limit:', itemsPerPage);
        
        const response = await fetch(`/api/crops-filtered?${params}`);
        console.log('📥 CLIENT DEBUG: Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📊 CLIENT DEBUG: Response data:', data);
        console.log('📊 CLIENT DEBUG: Crops array length:', data.crops ? data.crops.length : 'undefined');
        console.log('📊 CLIENT DEBUG: Total count:', data.totalCount);
        
        totalItems = data.totalCount || 0;
        displayCrops(data.crops);
        updatePagination();
        updateResultsCount();
        
    } catch (error) {
        console.error('❌ CLIENT DEBUG: Error loading crops:', error);
        console.error('Stack trace:', error.stack);
        document.getElementById('crops-grid').innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: #ff6b6b;">Error loading crops: ${error.message}</p>`;
    } finally {
        showLoading(false);
    }
}

function displayCrops(crops) {
    console.log('🖼️ CLIENT DEBUG: displayCrops called with:', crops);
    console.log('🖼️ CLIENT DEBUG: crops is array?', Array.isArray(crops));
    console.log('🖼️ CLIENT DEBUG: crops length:', crops ? crops.length : 'undefined');
    
    const grid = document.getElementById('crops-grid');
    
    if (!crops || crops.length === 0) {
        console.log('⚠️ CLIENT DEBUG: No crops to display');
        grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #cccccc;">No crops found matching the selected filters.</p>';
        return;
    }
    
    console.log('🖼️ CLIENT DEBUG: Creating cards for', crops.length, 'crops');
    console.log('🖼️ CLIENT DEBUG: First crop data:', crops[0]);
    
    grid.innerHTML = crops.map((crop, index) => {
        console.log(`🖼️ CLIENT DEBUG: Processing crop ${index + 1}:`, {
            id: crop.id,
            crop_folder: crop.crop_folder,
            crop_filename: crop.crop_filename,
            original_camera: crop.original_camera
        });
        return createCropCard(crop);
    }).join('');
    
    console.log('✅ CLIENT DEBUG: Grid HTML updated');
}

function createCropCard(crop) {
    const activities = crop.activities ? JSON.parse(crop.activities) : [];
    const activityTags = activities.map(activity => 
        `<span class="activity-tag">${activity}</span>`
    ).join('');
    
    const status = getReviewStatus(crop);
    const statusClass = `status-${status.toLowerCase().replace(' ', '-')}`;
    
    // Fix the image path - crop_folder already contains the full path from saved_images
    let imagePath;
    if (crop.crop_folder.includes('saved_images')) {
        // If crop_folder already contains saved_images, just use it directly
        imagePath = `/${crop.crop_folder.replace(/\\/g, '/')}/${crop.crop_filename}`;
    } else {
        // Otherwise, prepend /saved_images/
        imagePath = `/saved_images/${crop.crop_folder}/${crop.crop_filename}`;
    }
    
    console.log('🖼️ CLIENT DEBUG: Image path constructed:', imagePath);
    
    return `
        <div class="crop-card">
            <img src="${imagePath}" 
                 alt="Crop ${crop.id}" 
                 class="crop-image"
                 onerror="this.src='/placeholder-image.png'">
            
            <div class="crop-info">
                <div class="crop-filename">${crop.crop_filename}</div>
                <div class="crop-camera">${crop.original_camera}</div>
                
                <div class="crop-details">
                    <div class="crop-detail">
                        <span class="label">Status:</span>
                        <span class="value ${statusClass}">${status}</span>
                    </div>
                    <div class="crop-detail">
                        <span class="label">Jonathan:</span>
                        <span class="value">${crop.is_jonathan || 'Not set'}</span>
                    </div>
                    <div class="crop-detail">
                        <span class="label">Clothing:</span>
                        <span class="value">${crop.top_clothing || 'Not set'}</span>
                    </div>
                    <div class="crop-detail">
                        <span class="label">Saved:</span>
                        <span class="value">${formatDate(crop.saved_at)}</span>
                    </div>
                </div>
                
                ${activities.length > 0 ? `
                    <div class="activity-tags">
                        ${activityTags}
                    </div>
                ` : ''}
                
                <div class="crop-actions">
                    <a href="/crop-review?crop=${crop.id}" class="btn btn-primary btn-small">Review</a>
                    <button onclick="viewOriginal('${crop.original_camera}', '${crop.original_filename}')" 
                            class="btn btn-secondary btn-small">View Original</button>
                </div>
            </div>
        </div>
    `;
}

function getReviewStatus(crop) {
    if (!crop.is_jonathan && !crop.top_clothing && !crop.activities) {
        return 'Unreviewed';
    } else {
        return 'Reviewed';
    }
}

function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString();
}

function applyFilters() {
    currentFilters.status = document.getElementById('status-filter').value;
    currentFilters.jonathan = document.getElementById('jonathan-filter').value;
    currentFilters.activity = document.getElementById('activity-filter').value;
    currentFilters.clothing = document.getElementById('clothing-filter').value;
    
    currentPage = 1; // Reset to first page when filtering
    loadCrops();
}

function resetFilters() {
    document.getElementById('status-filter').value = 'all';
    document.getElementById('jonathan-filter').value = 'all';
    document.getElementById('activity-filter').value = 'all';
    document.getElementById('clothing-filter').value = 'all';
    
    currentFilters = {
        status: 'all',
        jonathan: 'all',
        activity: 'all',
        clothing: 'all'
    };
    
    currentPage = 1;
    loadCrops();
}

function updatePagination() {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    
    document.getElementById('current-page').textContent = currentPage;
    document.getElementById('total-pages').textContent = totalPages;
    
    document.getElementById('prev-page').disabled = currentPage <= 1;
    document.getElementById('next-page').disabled = currentPage >= totalPages;
}

function updateResultsCount() {
    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);
    
    document.getElementById('showing-count').textContent = totalItems > 0 ? `${startItem}-${endItem}` : '0';
    document.getElementById('total-count').textContent = totalItems;
}

function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
    document.getElementById('crops-grid').style.display = show ? 'none' : 'grid';
}

function viewOriginal(camera, filename) {
    // Open the camera viewer with the specific image
    window.open(`/camera-viewer.html?camera=${encodeURIComponent(camera)}&file=${encodeURIComponent(filename)}`, '_blank');
}

// Refresh data periodically - DISABLED to prevent flashing
// setInterval(() => {
//     loadStatistics();
// }, 30000); // Refresh every 30 seconds
