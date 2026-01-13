/**
 * GangNet2 - Voice Conferencing Client
 * WebRTC-based multi-channel voice communication
 */

class VoiceConferenceClient {
    constructor() {
        // Socket.IO connection
        this.socket = null;
        
        // User state
        this.userId = null;
        this.localStream = null;
        
        // Channel state
        this.channels = [];
        this.activeChannels = new Set(); // Channels user is listening to
        this.transmitChannels = new Set(); // Channels user can transmit to
        
        // Peer connections: Map<socketId, Map<channelId, RTCPeerConnection>>
        this.peerConnections = new Map();
        
        // ICE candidate queues: Map<socketId-channelId, Array<RTCIceCandidate>>
        this.iceCandidateQueues = new Map();
        
        // Audio elements: Map<socketId-channelId, {element, gainNode, volume}>
        this.audioElements = new Map();
        
        // Web Audio API context for volume control
        this.audioContext = null;
        
        // Transmit state
        this.transmitMode = 'ptt'; // 'ptt' or 'latch'
        this.isTransmitting = false;
        
        // ICE configuration
        this.iceServers = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
        
        this.init();
    }

    /**
     * Initialize the client
     */
    async init() {
        try {
            // Initialize Socket.IO connection
            this.socket = io();
            
            // Setup socket event handlers
            this.setupSocketHandlers();
            
            // Setup UI event handlers
            this.setupUIHandlers();
            
            // Request microphone access
            await this.setupLocalStream();
            
            // Load channels from server
            await this.loadChannels();
            
        } catch (error) {
            console.error('Initialization error:', error);
            this.showError('Failed to initialize application');
        }
    }

    /**
     * Setup Socket.IO event handlers
     */
    setupSocketHandlers() {
        // Connection established
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.updateConnectionStatus('connected');
        });

        // Disconnection
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.updateConnectionStatus('disconnected');
            this.cleanup();
        });

        // Initialization data from server
        this.socket.on('init', ({ userId, channels }) => {
            console.log('Initialized with userId:', userId);
            this.userId = userId;
            this.channels = channels;
            this.renderChannels();
        });

        // Another user joined a channel
        this.socket.on('user-joined-channel', ({ socketId, channelId }) => {
            console.log(`User ${socketId} joined channel ${channelId}`);
            // If we're in that channel, establish peer connection
            if (this.activeChannels.has(channelId)) {
                this.createPeerConnection(socketId, channelId, true);
            }
        });

        // User left a channel
        this.socket.on('user-left-channel', ({ socketId, channelId }) => {
            console.log(`User ${socketId} left channel ${channelId}`);
            this.closePeerConnection(socketId, channelId);
        });

        // User disconnected completely
        this.socket.on('user-disconnected', ({ socketId }) => {
            console.log(`User ${socketId} disconnected`);
            this.closeAllPeerConnections(socketId);
        });

        // WebRTC signaling: offer received
        this.socket.on('webrtc-offer', async ({ offer, fromSocketId, channelId }) => {
            console.log(`Received offer from ${fromSocketId} on channel ${channelId}`);
            await this.handleOffer(offer, fromSocketId, channelId);
        });

        // WebRTC signaling: answer received
        this.socket.on('webrtc-answer', async ({ answer, fromSocketId, channelId }) => {
            console.log(`Received answer from ${fromSocketId} on channel ${channelId}`);
            await this.handleAnswer(answer, fromSocketId, channelId);
        });

        // WebRTC signaling: ICE candidate received
        this.socket.on('webrtc-ice-candidate', async ({ candidate, fromSocketId, channelId }) => {
            await this.handleIceCandidate(candidate, fromSocketId, channelId);
        });

        // Channel users list (when joining a channel)
        this.socket.on('channel-users', ({ channelId, users }) => {
            console.log(`Users in channel ${channelId}:`, users);
            // Create peer connections with existing users
            users.forEach(({ socketId }) => {
                this.createPeerConnection(socketId, channelId, true);
            });
        });

        // User transmitting state changed
        this.socket.on('user-transmitting', ({ socketId, channelId, transmitting }) => {
            console.log(`User ${socketId} ${transmitting ? 'started' : 'stopped'} transmitting on ${channelId}`);
            // Could add visual indicator here
        });
    }

    /**
     * Resume audio context (required by browser autoplay policy)
     */
    async resumeAudioContext() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            try {
                await this.audioContext.resume();
                console.log('Audio context resumed');
            } catch (error) {
                console.error('Failed to resume audio context:', error);
            }
        }
    }

    /**
     * Setup UI event handlers
     */
    setupUIHandlers() {
        // Transmit mode toggle
        const pttModeBtn = document.getElementById('pttMode');
        const latchModeBtn = document.getElementById('latchMode');
        const pttSection = document.getElementById('pttSection');
        const pttButton = document.getElementById('pttButton');

        pttModeBtn.addEventListener('click', () => {
            this.resumeAudioContext();
            this.transmitMode = 'ptt';
            pttModeBtn.classList.add('active');
            latchModeBtn.classList.remove('active');
            pttSection.classList.add('visible');
            this.isTransmitting = false;
            pttButton.classList.remove('active');
            this.updateTransmitState();
        });

        latchModeBtn.addEventListener('click', () => {
            this.resumeAudioContext();
            this.transmitMode = 'latch';
            latchModeBtn.classList.add('active');
            pttModeBtn.classList.remove('active');
            pttSection.classList.remove('visible');
            this.isTransmitting = false;
            this.updateTransmitState();
        });

        // PTT button handlers
        // Mouse events
        pttButton.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.resumeAudioContext();
            if (this.transmitMode === 'ptt') {
                this.startTransmit();
            }
        });

        pttButton.addEventListener('mouseup', (e) => {
            e.preventDefault();
            if (this.transmitMode === 'ptt') {
                this.stopTransmit();
            }
        });

        pttButton.addEventListener('mouseleave', (e) => {
            if (this.transmitMode === 'ptt' && this.isTransmitting) {
                this.stopTransmit();
            }
        });

        // Touch events for mobile
        pttButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.resumeAudioContext();
            if (this.transmitMode === 'ptt') {
                this.startTransmit();
            }
        });

        pttButton.addEventListener('touchend', (e) => {
            e.preventDefault();
            if (this.transmitMode === 'ptt') {
                this.stopTransmit();
            }
        });

        // Click for latch mode
        pttButton.addEventListener('click', (e) => {
            this.resumeAudioContext();
            if (this.transmitMode === 'latch') {
                if (this.isTransmitting) {
                    this.stopTransmit();
                } else {
                    this.startTransmit();
                }
            }
        });

        // Set PTT section visible by default
        pttSection.classList.add('visible');
    }

    /**
     * Setup local media stream (microphone)
     */
    async setupLocalStream() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });
            
            console.log('Local stream acquired');
            
            // Initialize audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
        } catch (error) {
            console.error('Error accessing microphone:', error);
            this.showError('Microphone access denied. Please allow microphone access to use this application.');
            throw error;
        }
    }

    /**
     * Load channels from server API
     */
    async loadChannels() {
        try {
            const response = await fetch('/api/channels');
            const data = await response.json();
            this.channels = data.channels;
            this.renderChannels();
        } catch (error) {
            console.error('Error loading channels:', error);
        }
    }

    /**
     * Render channels in UI
     */
    renderChannels() {
        const channelsList = document.getElementById('channelsList');
        channelsList.innerHTML = '';

        this.channels.forEach(channel => {
            const channelItem = document.createElement('div');
            channelItem.className = 'channel-item';
            channelItem.style.borderLeftColor = channel.color;
            channelItem.dataset.channelId = channel.id;

            channelItem.innerHTML = `
                <div class="channel-header">
                    <div class="channel-info">
                        <div class="channel-color" style="background-color: ${channel.color}"></div>
                        <span class="channel-name">${channel.name}</span>
                    </div>
                    <div class="channel-controls">
                        <div class="tx-control">
                            <input type="checkbox" 
                                   class="tx-checkbox" 
                                   id="tx-${channel.id}"
                                   data-channel-id="${channel.id}">
                            <label for="tx-${channel.id}" class="tx-label">TX</label>
                        </div>
                        <label class="switch">
                            <input type="checkbox" 
                                   class="channel-toggle" 
                                   data-channel-id="${channel.id}">
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
                <div class="volume-control">
                    <span class="volume-icon">🔊</span>
                    <input type="range" 
                           class="volume-slider" 
                           min="0" 
                           max="100" 
                           value="75"
                           data-channel-id="${channel.id}">
                    <span class="volume-value">75%</span>
                </div>
            `;

            channelsList.appendChild(channelItem);

            // Add event listeners
            const toggle = channelItem.querySelector('.channel-toggle');
            const volumeSlider = channelItem.querySelector('.volume-slider');
            const volumeValue = channelItem.querySelector('.volume-value');
            const txCheckbox = channelItem.querySelector('.tx-checkbox');

            toggle.addEventListener('change', (e) => {
                this.toggleChannel(channel.id, e.target.checked);
                channelItem.classList.toggle('disabled', !e.target.checked);
            });

            volumeSlider.addEventListener('input', (e) => {
                const volume = e.target.value;
                volumeValue.textContent = `${volume}%`;
                this.updateChannelVolume(channel.id, volume / 100);
            });

            txCheckbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.transmitChannels.add(channel.id);
                } else {
                    this.transmitChannels.delete(channel.id);
                }
            });
        });
    }

    /**
     * Toggle channel on/off
     */
    async toggleChannel(channelId, enabled) {
        // Resume audio context on user interaction
        await this.resumeAudioContext();
        
        if (enabled) {
            this.activeChannels.add(channelId);
            this.socket.emit('join-channel', { channelId });
            
            // Request list of users in channel to establish connections
            this.socket.emit('request-channel-users', { channelId });
        } else {
            this.activeChannels.delete(channelId);
            this.socket.emit('leave-channel', { channelId });
            
            // Close all peer connections for this channel
            this.peerConnections.forEach((channelMap, socketId) => {
                if (channelMap.has(channelId)) {
                    this.closePeerConnection(socketId, channelId);
                }
            });
        }
    }

    /**
     * Update channel volume
     */
    updateChannelVolume(channelId, volume) {
        // Update gain for all audio elements from this channel
        this.audioElements.forEach((audioData, key) => {
            if (key.includes(channelId)) {
                if (audioData.gainNode) {
                    audioData.gainNode.gain.value = volume;
                }
                audioData.volume = volume;
            }
        });
    }

    /**
     * Start transmitting
     */
    startTransmit() {
        if (this.transmitChannels.size === 0) {
            console.log('No transmit channels selected');
            return;
        }

        this.isTransmitting = true;
        const pttButton = document.getElementById('pttButton');
        pttButton.classList.add('active');
        pttButton.querySelector('.ptt-text').textContent = 
            this.transmitMode === 'ptt' ? 'Transmitting...' : 'Click to Stop';

        // Notify server for each transmit channel
        this.transmitChannels.forEach(channelId => {
            this.socket.emit('transmit-start', { channelId });
        });

        console.log('Started transmitting');
    }

    /**
     * Stop transmitting
     */
    stopTransmit() {
        this.isTransmitting = false;
        const pttButton = document.getElementById('pttButton');
        pttButton.classList.remove('active');
        pttButton.querySelector('.ptt-text').textContent = 
            this.transmitMode === 'ptt' ? 'Hold to Talk' : 'Click to Talk';

        // Notify server for each transmit channel
        this.transmitChannels.forEach(channelId => {
            this.socket.emit('transmit-stop', { channelId });
        });

        console.log('Stopped transmitting');
    }

    /**
     * Update transmit state (called when channels or mode change)
     */
    updateTransmitState() {
        if (this.isTransmitting) {
            this.stopTransmit();
        }
    }

    /**
     * Create a peer connection
     */
    async createPeerConnection(socketId, channelId, createOffer) {
        try {
            // Check if connection already exists
            if (this.peerConnections.has(socketId)) {
                const channelMap = this.peerConnections.get(socketId);
                if (channelMap.has(channelId)) {
                    console.log(`Peer connection already exists for ${socketId} on ${channelId}`);
                    return;
                }
            }

            console.log(`Creating peer connection with ${socketId} on channel ${channelId}`);

            // Create new RTCPeerConnection
            const pc = new RTCPeerConnection(this.iceServers);

            // Add local stream
            if (this.localStream) {
                console.log(`Adding local stream tracks to peer connection:`, {
                    trackCount: this.localStream.getTracks().length,
                    tracks: this.localStream.getTracks().map(t => ({
                        kind: t.kind,
                        enabled: t.enabled,
                        readyState: t.readyState,
                        muted: t.muted
                    }))
                });
                this.localStream.getTracks().forEach(track => {
                    pc.addTrack(track, this.localStream);
                });
            }

            // Handle ICE candidates
            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    this.socket.emit('webrtc-ice-candidate', {
                        candidate: event.candidate,
                        targetSocketId: socketId,
                        channelId
                    });
                }
            };

            // Handle incoming tracks
            pc.ontrack = (event) => {
                console.log(`Received remote track from ${socketId} on ${channelId}`, {
                    trackKind: event.track.kind,
                    trackEnabled: event.track.enabled,
                    trackMuted: event.track.muted,
                    trackReadyState: event.track.readyState,
                    streamsCount: event.streams.length
                });
                this.handleRemoteTrack(event, socketId, channelId);
            };

            // Handle connection state changes
            pc.onconnectionstatechange = () => {
                console.log(`Connection state with ${socketId} on ${channelId}: ${pc.connectionState}`);
                if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                    this.closePeerConnection(socketId, channelId);
                }
            };

            // Store peer connection
            if (!this.peerConnections.has(socketId)) {
                this.peerConnections.set(socketId, new Map());
            }
            this.peerConnections.get(socketId).set(channelId, pc);

            // Create and send offer if initiator
            if (createOffer) {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                
                this.socket.emit('webrtc-offer', {
                    offer: pc.localDescription,
                    targetSocketId: socketId,
                    channelId
                });
            }

        } catch (error) {
            console.error('Error creating peer connection:', error);
        }
    }

    /**
     * Handle incoming WebRTC offer
     */
    async handleOffer(offer, fromSocketId, channelId) {
        try {
            // Check if connection already exists
            let pc = null;
            if (this.peerConnections.has(fromSocketId) && 
                this.peerConnections.get(fromSocketId).has(channelId)) {
                pc = this.peerConnections.get(fromSocketId).get(channelId);
                
                // Handle glare condition: both sides sent offers
                if (pc.signalingState === 'have-local-offer') {
                    console.log(`Glare condition detected with ${fromSocketId} on ${channelId}`);
                    // Use tie-breaker: lexicographic comparison of socket IDs
                    const comparison = this.socket.id.localeCompare(fromSocketId);
                    if (comparison > 0) {
                        console.log(`Closing our offer and accepting theirs (${fromSocketId})`);
                        this.closePeerConnection(fromSocketId, channelId);
                        pc = null;
                    } else {
                        console.log(`Ignoring their offer, keeping ours (${fromSocketId})`);
                        return;
                    }
                } else if (pc.signalingState === 'stable') {
                    console.log(`Connection already stable with ${fromSocketId} on ${channelId}, ignoring offer`);
                    return;
                }
            }
            
            // Create peer connection if it doesn't exist or was closed
            if (!pc) {
                await this.createPeerConnection(fromSocketId, channelId, false);
                pc = this.peerConnections.get(fromSocketId).get(channelId);
            }

            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            
            // Process any queued ICE candidates
            await this.processQueuedIceCandidates(fromSocketId, channelId, pc);

            // Create and send answer
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            this.socket.emit('webrtc-answer', {
                answer: pc.localDescription,
                targetSocketId: fromSocketId,
                channelId
            });
            
            console.log(`Sent answer to ${fromSocketId} on ${channelId}`);

        } catch (error) {
            console.error('Error handling offer:', error);
        }
    }

    /**
     * Handle incoming WebRTC answer
     */
    async handleAnswer(answer, fromSocketId, channelId) {
        try {
            if (this.peerConnections.has(fromSocketId)) {
                const channelMap = this.peerConnections.get(fromSocketId);
                if (channelMap.has(channelId)) {
                    const pc = channelMap.get(channelId);
                    
                    // Check signaling state before setting remote description
                    if (pc.signalingState === 'have-local-offer') {
                        await pc.setRemoteDescription(new RTCSessionDescription(answer));
                        console.log(`Set remote answer for ${fromSocketId} on ${channelId}`);
                        
                        // Process any queued ICE candidates
                        await this.processQueuedIceCandidates(fromSocketId, channelId, pc);
                    } else if (pc.signalingState === 'stable') {
                        console.log(`Connection already stable for ${fromSocketId} on ${channelId}, ignoring answer`);
                    } else {
                        console.warn(`Unexpected signaling state (${pc.signalingState}) when receiving answer from ${fromSocketId} on ${channelId}`);
                    }
                } else {
                    console.warn(`No peer connection found for answer from ${fromSocketId} on ${channelId}`);
                }
            } else {
                console.warn(`No socket entry found for answer from ${fromSocketId}`);
            }
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }

    /**
     * Handle incoming ICE candidate
     */
    async handleIceCandidate(candidate, fromSocketId, channelId) {
        try {
            const key = `${fromSocketId}-${channelId}`;
            
            if (this.peerConnections.has(fromSocketId)) {
                const channelMap = this.peerConnections.get(fromSocketId);
                if (channelMap.has(channelId)) {
                    const pc = channelMap.get(channelId);
                    
                    // Only add ICE candidate if remote description is set
                    if (pc.remoteDescription) {
                        await pc.addIceCandidate(new RTCIceCandidate(candidate));
                        console.log(`Added ICE candidate from ${fromSocketId} on ${channelId}`);
                    } else {
                        // Queue the candidate for later
                        if (!this.iceCandidateQueues.has(key)) {
                            this.iceCandidateQueues.set(key, []);
                        }
                        this.iceCandidateQueues.get(key).push(candidate);
                        console.log(`Queued ICE candidate from ${fromSocketId} on ${channelId} (queue size: ${this.iceCandidateQueues.get(key).length})`);
                    }
                }
            }
        } catch (error) {
            console.error('Error handling ICE candidate:', error);
        }
    }

    /**
     * Process queued ICE candidates after remote description is set
     */
    async processQueuedIceCandidates(socketId, channelId, pc) {
        const key = `${socketId}-${channelId}`;
        
        if (this.iceCandidateQueues.has(key)) {
            const queue = this.iceCandidateQueues.get(key);
            console.log(`Processing ${queue.length} queued ICE candidates for ${socketId} on ${channelId}`);
            
            for (const candidate of queue) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (error) {
                    console.error(`Error adding queued ICE candidate:`, error);
                }
            }
            
            // Clear the queue
            this.iceCandidateQueues.delete(key);
        }
    }

    /**
     * Handle remote track (incoming audio)
     */
    async handleRemoteTrack(event, socketId, channelId) {
        const key = `${socketId}-${channelId}`;
        
        console.log(`Setting up audio for ${key}`, {
            streams: event.streams.length,
            tracks: event.streams[0]?.getTracks().length,
            trackEnabled: event.track?.enabled,
            trackReadyState: event.track?.readyState
        });
        
        // Remove existing audio setup if present
        if (this.audioElements.has(key)) {
            const oldAudioData = this.audioElements.get(key);
            if (oldAudioData.source) {
                try {
                    oldAudioData.source.disconnect();
                } catch (e) {
                    console.warn('Error disconnecting old source:', e);
                }
            }
            if (oldAudioData.gainNode) {
                try {
                    oldAudioData.gainNode.disconnect();
                } catch (e) {
                    console.warn('Error disconnecting old gain node:', e);
                }
            }
            this.audioElements.delete(key);
        }
        
        try {
            // Resume audio context if suspended (browser autoplay policy)
            await this.resumeAudioContext();
            
            console.log(`Audio context state: ${this.audioContext.state}`);
            
            // Verify we have a valid stream
            if (!event.streams || !event.streams[0]) {
                console.error('No stream in track event');
                return;
            }
            
            const stream = event.streams[0];
            const audioTracks = stream.getAudioTracks();
            
            console.log(`Stream has ${audioTracks.length} audio tracks`);
            audioTracks.forEach((track, i) => {
                console.log(`Track ${i}: enabled=${track.enabled}, readyState=${track.readyState}, muted=${track.muted}`);
            });
            
            // Create audio graph: source -> gain -> destination
            const source = this.audioContext.createMediaStreamSource(stream);
            const gainNode = this.audioContext.createGain();
            
            // Get current volume setting for this channel
            const volumeSlider = document.querySelector(`.volume-slider[data-channel-id="${channelId}"]`);
            const volume = volumeSlider ? volumeSlider.value / 100 : 0.75;
            gainNode.gain.value = volume;
            
            console.log(`Connecting audio graph with volume: ${volume}`);
            
            // Connect audio graph
            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            // Store audio setup
            this.audioElements.set(key, {
                source: source,
                gainNode: gainNode,
                volume: volume,
                stream: stream
            });
            
            console.log(`Audio setup complete for ${key}, volume: ${volume}, audioContext.state: ${this.audioContext.state}`);
            
        } catch (error) {
            console.error(`Error setting up audio for ${key}:`, error);
            console.error('Error stack:', error.stack);
        }
    }

    /**
     * Close a specific peer connection
     */
    closePeerConnection(socketId, channelId) {
        const key = `${socketId}-${channelId}`;
        
        if (this.peerConnections.has(socketId)) {
            const channelMap = this.peerConnections.get(socketId);
            if (channelMap.has(channelId)) {
                const pc = channelMap.get(channelId);
                pc.close();
                channelMap.delete(channelId);
                
                if (channelMap.size === 0) {
                    this.peerConnections.delete(socketId);
                }
                
                // Remove audio setup
                if (this.audioElements.has(key)) {
                    const audioData = this.audioElements.get(key);
                    if (audioData.source) {
                        audioData.source.disconnect();
                    }
                    if (audioData.gainNode) {
                        audioData.gainNode.disconnect();
                    }
                    this.audioElements.delete(key);
                }
                
                // Clear ICE candidate queue
                if (this.iceCandidateQueues.has(key)) {
                    this.iceCandidateQueues.delete(key);
                    console.log(`Cleared ICE candidate queue for ${key}`);
                }
            }
        }
    }

    /**
     * Close all peer connections for a socket
     */
    closeAllPeerConnections(socketId) {
        if (this.peerConnections.has(socketId)) {
            const channelMap = this.peerConnections.get(socketId);
            channelMap.forEach((pc, channelId) => {
                this.closePeerConnection(socketId, channelId);
            });
        }
    }

    /**
     * Update connection status indicator
     */
    updateConnectionStatus(status) {
        const statusIndicator = document.getElementById('connectionStatus');
        const statusText = statusIndicator.querySelector('.status-text');
        
        statusIndicator.className = `status-indicator ${status}`;
        
        switch (status) {
            case 'connected':
                statusText.textContent = 'Connected';
                break;
            case 'disconnected':
                statusText.textContent = 'Disconnected';
                break;
            default:
                statusText.textContent = 'Connecting...';
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        console.error('Error:', message);
        
        // Create a toast notification
        const toast = document.createElement('div');
        toast.className = 'toast-notification error';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 80px;
            left: 50%;
            transform: translateX(-50%);
            background-color: #f44336;
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
            z-index: 1000;
            max-width: 90%;
            text-align: center;
            font-size: 0.875rem;
            animation: slideDown 0.3s ease;
        `;
        
        document.body.appendChild(toast);
        
        // Remove toast after 5 seconds
        setTimeout(() => {
            toast.style.animation = 'slideUp 0.3s ease';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 5000);
    }

    /**
     * Cleanup on disconnect
     */
    cleanup() {
        // Close all peer connections
        this.peerConnections.forEach((channelMap, socketId) => {
            channelMap.forEach((pc, channelId) => {
                pc.close();
            });
        });
        this.peerConnections.clear();

        // Remove all audio setups
        this.audioElements.forEach((audioData, key) => {
            if (audioData.source) {
                audioData.source.disconnect();
            }
            if (audioData.gainNode) {
                audioData.gainNode.disconnect();
            }
        });
        this.audioElements.clear();

        // Clear active channels
        this.activeChannels.clear();
        this.transmitChannels.clear();
        this.isTransmitting = false;
    }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.voiceConference = new VoiceConferenceClient();
});
