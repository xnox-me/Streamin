class MultistreamDashboard {
    constructor() {
        this.ws = null;
        this.reconnectInterval = null;
        this.config = {};
        this.streams = {};
        this.platforms = {};
        this.serverStats = {
            uptime: 0,
            startTime: Date.now()
        };
        
        this.init();
    }

    async init() {
        try {
            this.showLoading(true);
            await this.loadConfig();
            await this.loadPlatforms();
            await this.loadStreams();
            this.setupWebSocket();
            this.setupEventListeners();
            this.startPeriodicUpdates();
            this.updateUI();
            this.showToast('Dashboard loaded successfully', 'success');
        } catch (error) {
            console.error('Failed to initialize dashboard:', error);
            this.showToast('Failed to load dashboard', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async loadConfig() {
        try {
            const response = await fetch('/api/config');
            const result = await response.json();
            if (result.success) {
                this.config = result.data;
                this.updateRTMPEndpoint();
            }
        } catch (error) {
            console.error('Failed to load config:', error);
        }
    }

    async loadPlatforms() {
        try {
            const response = await fetch('/api/platforms');
            const result = await response.json();
            if (result.success) {
                this.platforms = result.data.reduce((acc, platform) => {
                    acc[platform.name] = platform;
                    return acc;
                }, {});
                this.updatePlatformsDisplay();
            }
        } catch (error) {
            console.error('Failed to load platforms:', error);
        }
    }

    async loadStreams() {
        try {
            const response = await fetch('/api/streams');
            const result = await response.json();
            if (result.success) {
                this.streams = result.data.reduce((acc, stream) => {
                    acc[stream.streamId] = stream;
                    return acc;
                }, {});
                this.updateStreamsDisplay();
            }
        } catch (error) {
            console.error('Failed to load streams:', error);
        }
    }

    setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.updateConnectionStatus(true);
            if (this.reconnectInterval) {
                clearInterval(this.reconnectInterval);
                this.reconnectInterval = null;
            }
        };
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleWebSocketMessage(data);
            } catch (error) {
                console.error('Failed to parse WebSocket message:', error);
            }
        };
        
        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.updateConnectionStatus(false);
            this.reconnectWebSocket();
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.updateConnectionStatus(false);
        };
    }

    reconnectWebSocket() {
        if (this.reconnectInterval) return;
        
        this.reconnectInterval = setInterval(() => {
            console.log('Attempting to reconnect WebSocket...');
            this.setupWebSocket();
        }, 5000);
    }

    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'streams':
                this.streams = data.data.reduce((acc, stream) => {
                    acc[stream.streamId] = stream;
                    return acc;
                }, {});
                this.updateStreamsDisplay();
                break;
                
            case 'streamStarted':
                this.showToast(`Stream ${data.data.streamId} started`, 'success');
                this.loadStreams(); // Refresh streams
                break;
                
            case 'streamStopped':
                this.showToast(`Stream ${data.data.streamId} stopped`, 'warning');
                this.loadStreams(); // Refresh streams
                break;
                
            case 'streamError':
                this.showToast(`Stream error: ${data.data.platform} - ${data.data.error.message || data.data.error}`, 'error');
                this.loadStreams(); // Refresh streams
                break;
                
            default:
                console.log('Unknown WebSocket message type:', data.type);
        }
    }

    setupEventListeners() {
        // Update stream key
        const streamKeyInput = document.getElementById('stream-key');
        if (streamKeyInput) {
            streamKeyInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.updateStreamKey();
                }
            });
        }

        // Manual stream controls
        const manualStreamKeyInput = document.getElementById('manual-stream-key');
        const manualInputPathInput = document.getElementById('manual-input-path');
        
        if (manualStreamKeyInput) {
            manualStreamKeyInput.addEventListener('input', () => {
                const streamKey = manualStreamKeyInput.value.trim();
                if (streamKey && manualInputPathInput) {
                    manualInputPathInput.value = `rtmp://localhost:${this.config.rtmpPort || 1935}/live/${streamKey}`;
                }
            });
        }
    }

    startPeriodicUpdates() {
        // Update server stats every 5 seconds
        setInterval(() => {
            this.updateServerStats();
        }, 5000);
        
        // Refresh streams every 10 seconds
        setInterval(() => {
            this.loadStreams();
        }, 10000);
    }

    updateConnectionStatus(connected) {
        const indicator = document.getElementById('connection-indicator');
        const text = document.getElementById('connection-text');
        
        if (indicator && text) {
            if (connected) {
                indicator.className = 'status-indicator online';
                text.textContent = 'Connected';
            } else {
                indicator.className = 'status-indicator offline';
                text.textContent = 'Disconnected';
            }
        }
    }

    updateRTMPEndpoint() {
        const endpoint = document.getElementById('rtmp-endpoint');
        if (endpoint && this.config.rtmpPort) {
            endpoint.textContent = `rtmp://localhost:${this.config.rtmpPort}/live/YOUR_STREAM_KEY`;
        }
    }

    updatePlatformsDisplay() {
        const grid = document.getElementById('platforms-grid');
        const noPlatforms = document.getElementById('no-platforms');
        
        if (!grid) return;
        
        const platformsList = Object.values(this.platforms);
        
        if (platformsList.length === 0) {
            grid.style.display = 'none';
            if (noPlatforms) noPlatforms.style.display = 'block';
            return;
        }
        
        grid.style.display = 'grid';
        if (noPlatforms) noPlatforms.style.display = 'none';
        
        grid.innerHTML = platformsList.map(platform => `
            <div class="platform-card ${platform.enabled ? 'enabled' : 'disabled'}">
                <div class="platform-header">
                    <div class="platform-name">${this.getPlatformDisplayName(platform.name)}</div>
                    <div class="platform-status ${platform.enabled ? 'enabled' : 'disabled'}">
                        ${platform.enabled ? 'Enabled' : 'Disabled'}
                    </div>
                </div>
                <div class="platform-url">${platform.rtmpUrl}</div>
            </div>
        `).join('');
    }

    updateStreamsDisplay() {
        const container = document.getElementById('streams-container');
        const noStreams = document.getElementById('no-streams');
        const streamsList = document.getElementById('streams-list');
        
        if (!container || !streamsList) return;
        
        const activeStreams = Object.values(this.streams);
        
        if (activeStreams.length === 0) {
            noStreams.style.display = 'block';
            streamsList.style.display = 'none';
            return;
        }
        
        noStreams.style.display = 'none';
        streamsList.style.display = 'block';
        
        streamsList.innerHTML = activeStreams.map(stream => `
            <div class="stream-item">
                <div class="stream-header">
                    <div class="stream-id">🎥 ${stream.streamId}</div>
                    <div class="stream-status ${stream.status}">${stream.status}</div>
                </div>
                <div class="stream-platforms">
                    ${stream.platforms.map(platform => `
                        <span class="platform-badge">${this.getPlatformDisplayName(platform)}</span>
                    `).join('')}
                </div>
                <div class="stream-uptime">
                    ⏱️ Uptime: ${this.formatDuration(stream.uptime || 0)}
                </div>
                ${stream.stats && stream.stats.errors && stream.stats.errors.length > 0 ? `
                    <div class="stream-errors">
                        ⚠️ Recent errors: ${stream.stats.errors.length}
                    </div>
                ` : ''}
            </div>
        `).join('');
    }

    updateServerStats() {
        const activeStreamsCount = document.getElementById('active-streams-count');
        const enabledPlatformsCount = document.getElementById('enabled-platforms-count');
        const serverUptime = document.getElementById('server-uptime');
        
        if (activeStreamsCount) {
            activeStreamsCount.textContent = Object.keys(this.streams).length;
        }
        
        if (enabledPlatformsCount) {
            enabledPlatformsCount.textContent = Object.values(this.platforms).filter(p => p.enabled).length;
        }
        
        if (serverUptime) {
            const uptime = Date.now() - this.serverStats.startTime;
            serverUptime.textContent = this.formatDuration(uptime);
        }
    }

    getPlatformDisplayName(name) {
        const displayNames = {
            'twitch': '🟣 Twitch',
            'youtube': '🔴 YouTube',
            'facebook': '🔵 Facebook',
            'custom1': '🟡 Custom 1',
            'custom2': '🟢 Custom 2'
        };
        return displayNames[name] || `📡 ${name}`;
    }

    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    updateStreamKey() {
        const input = document.getElementById('stream-key');
        const endpoint = document.getElementById('rtmp-endpoint');
        
        if (input && endpoint) {
            const streamKey = input.value.trim();
            if (streamKey) {
                const port = this.config.rtmpPort || 1935;
                endpoint.textContent = `rtmp://localhost:${port}/live/${streamKey}`;
                this.showToast('Stream endpoint updated', 'success');
                input.value = '';
            } else {
                endpoint.textContent = `rtmp://localhost:${this.config.rtmpPort || 1935}/live/YOUR_STREAM_KEY`;
                this.showToast('Stream key cleared', 'warning');
            }
        }
    }

    async startManualStream() {
        const streamKeyInput = document.getElementById('manual-stream-key');
        const inputPathInput = document.getElementById('manual-input-path');
        
        if (!streamKeyInput || !inputPathInput) return;
        
        const streamKey = streamKeyInput.value.trim();
        const inputPath = inputPathInput.value.trim();
        
        if (!streamKey || !inputPath) {
            this.showToast('Please fill in both stream key and input path', 'error');
            return;
        }
        
        try {
            this.showLoading(true, 'Starting stream...');
            
            const response = await fetch(`/api/streams/${streamKey}/start`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ inputPath })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showToast(`Stream ${streamKey} started successfully`, 'success');
                streamKeyInput.value = '';
                inputPathInput.value = '';
                this.loadStreams();
            } else {
                this.showToast(`Failed to start stream: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Failed to start stream:', error);
            this.showToast('Failed to start stream', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async stopManualStream() {
        const streamKeyInput = document.getElementById('manual-stream-key');
        
        if (!streamKeyInput) return;
        
        const streamKey = streamKeyInput.value.trim();
        
        if (!streamKey) {
            this.showToast('Please enter a stream key', 'error');
            return;
        }
        
        try {
            this.showLoading(true, 'Stopping stream...');
            
            const response = await fetch(`/api/streams/${streamKey}/stop`, {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showToast(`Stream ${streamKey} stopped successfully`, 'success');
                streamKeyInput.value = '';
                document.getElementById('manual-input-path').value = '';
                this.loadStreams();
            } else {
                this.showToast(`Failed to stop stream: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Failed to stop stream:', error);
            this.showToast('Failed to stop stream', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    copyToClipboard(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            const text = element.textContent;
            navigator.clipboard.writeText(text).then(() => {
                this.showToast('Copied to clipboard', 'success');
            }).catch(() => {
                this.showToast('Failed to copy to clipboard', 'error');
            });
        }
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        container.appendChild(toast);
        
        // Remove toast after 5 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 5000);
    }

    showLoading(show, message = 'Loading...') {
        const overlay = document.getElementById('loading-overlay');
        if (!overlay) return;
        
        if (show) {
            overlay.querySelector('p').textContent = message;
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.add('hidden');
        }
    }

    updateUI() {
        this.updateConnectionStatus(!!this.ws && this.ws.readyState === WebSocket.OPEN);
        this.updateRTMPEndpoint();
        this.updatePlatformsDisplay();
        this.updateStreamsDisplay();
        this.updateServerStats();
    }
}

// Global functions for HTML onclick handlers
function copyToClipboard(elementId) {
    if (window.dashboard) {
        window.dashboard.copyToClipboard(elementId);
    }
}

function updateStreamKey() {
    if (window.dashboard) {
        window.dashboard.updateStreamKey();
    }
}

function startManualStream() {
    if (window.dashboard) {
        window.dashboard.startManualStream();
    }
}

function stopManualStream() {
    if (window.dashboard) {
        window.dashboard.stopManualStream();
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new MultistreamDashboard();
});