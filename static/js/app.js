// MoodSync AI - Main Application JavaScript
class MoodSyncAI {
    constructor() {
        this.currentMood = null;
        this.moodHistory = [];
        this.isRecording = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.videoStream = null;
        this.recordingTimer = null;
        this.recordingStartTime = 0;
        
        this.init();
    }

    // Initialize the application
    init() {
        this.setupEventListeners();
        this.setupNavigation();
        this.loadMoodHistory();
        this.showToast('Welcome to MoodSync AI!', 'success');
    }

    // Setup event listeners
    setupEventListeners() {
        // Text Analysis
        document.getElementById('analyze-text-btn').addEventListener('click', () => this.analyzeText());
        document.querySelectorAll('.sample-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.loadSampleText(e.target.dataset.text));
        });

        // Voice Analysis
        document.getElementById('record-btn').addEventListener('click', () => this.startRecording());
        document.getElementById('stop-record-btn').addEventListener('click', () => this.stopRecording());
        document.getElementById('analyze-voice-btn').addEventListener('click', () => this.analyzeVoice());
        document.getElementById('audio-upload').addEventListener('change', (e) => this.handleAudioUpload(e));

        // Video Analysis
        document.getElementById('start-video-btn').addEventListener('click', () => this.startVideoAnalysis());
        document.getElementById('stop-video-btn').addEventListener('click', () => this.stopVideoAnalysis());
        document.getElementById('capture-btn').addEventListener('click', () => this.captureFrame());

        // Navigation
        document.querySelector('.nav-toggle').addEventListener('click', () => this.toggleMobileMenu());
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => this.handleNavigation(e));
        });

        // Feature cards navigation
        document.querySelectorAll('.feature-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const section = e.currentTarget.dataset.section;
                this.scrollToSection(section);
            });
        });
    }

    // Navigation handling
    setupNavigation() {
        window.addEventListener('scroll', () => this.updateActiveNavLink());
    }

    handleNavigation(e) {
        e.preventDefault();
        const href = e.target.getAttribute('href');
        if (href.startsWith('#')) {
            this.scrollToSection(href.substring(1));
        }
    }

    scrollToSection(sectionId) {
        const section = document.getElementById(sectionId);
        if (section) {
            const offsetTop = section.offsetTop - 80; // Account for fixed navbar
            window.scrollTo({
                top: offsetTop,
                behavior: 'smooth'
            });
        }
    }

    updateActiveNavLink() {
        const sections = document.querySelectorAll('.section, #hero');
        const navLinks = document.querySelectorAll('.nav-link');
        
        let current = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop - 100;
            if (window.pageYOffset >= sectionTop) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${current}`) {
                link.classList.add('active');
            }
        });
    }

    toggleMobileMenu() {
        const navMenu = document.querySelector('.nav-menu');
        const navToggle = document.querySelector('.nav-toggle');
        
        navMenu.classList.toggle('active');
        navToggle.classList.toggle('active');
    }

    // Text Analysis
    loadSampleText(text) {
        document.getElementById('text-input').value = text;
    }

    async analyzeText() {
        const textInput = document.getElementById('text-input');
        const text = textInput.value.trim();
        
        if (!text) {
            this.showToast('Please enter some text to analyze', 'warning');
            return;
        }
    
        const btn = document.getElementById('analyze-text-btn');
        this.setButtonLoading(btn, true);
    
        try {
            const response = await fetch('/analyze_text', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text: text })
            });
    
            const data = await response.json();
    
            if (data.error) {
                throw new Error(data.error);
            }
    
            this.displayTextResults(data);
            this.currentMood = data.mood;
            this.updateWellnessGuide(data.wellness_recommendations, data.mood);
            this.updateTravelRecommendations(data.mood);
            
            // **ADD THIS LINE**: Refresh mood history after successful analysis
            this.loadMoodHistory();
            
            this.showToast(`Mood detected: ${data.mood}`, 'success');
    
        } catch (error) {
            this.showToast(`Analysis failed: ${error.message}`, 'error');
        } finally {
            this.setButtonLoading(btn, false);
        }
    }
    

    displayTextResults(data) {
        const resultsContainer = document.getElementById('text-results');
        
        const moodEmojis = {
            happy: '😊',
            sad: '😢',
            angry: '😠',
            neutral: '😐',
            anxious: '😰',
            excited: '🤩'
        };

        const sentimentClass = data.sentiment_score > 0 ? 'sentiment-positive' : 
                             data.sentiment_score < 0 ? 'sentiment-negative' : 'sentiment-neutral';

        resultsContainer.innerHTML = `
            <div class="mood-result fade-in">
                <div class="mood-emoji">${moodEmojis[data.mood] || '😐'}</div>
                <div class="mood-label mood-${data.mood}">${data.mood.toUpperCase()}</div>
                <div class="mood-confidence">Confidence: ${(data.confidence * 100).toFixed(1)}%</div>
                <div class="sentiment-meter">
                    <div class="sentiment-fill ${sentimentClass}" 
                         style="width: ${Math.abs(data.sentiment_score) * 100}%"></div>
                </div>
                <div class="sentiment-score">
                    Sentiment Score: ${data.sentiment_score.toFixed(3)}
                </div>
            </div>
        `;
    }

    // Voice Analysis
    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Create AudioContext for processing
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.audioInput = this.audioContext.createMediaStreamSource(stream);
            
            // Create ScriptProcessor for recording
            this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
            this.audioData = [];
            
            this.processor.onaudioprocess = (e) => {
                if (this.isRecording) {
                    const inputData = e.inputBuffer.getChannelData(0);
                    this.audioData.push(new Float32Array(inputData));
                }
            };
            
            this.audioInput.connect(this.processor);
            this.processor.connect(this.audioContext.destination);
            
            this.isRecording = true;
            this.audioStream = stream;
            this.startRecordingTimer();
            
            document.getElementById('record-btn').style.display = 'none';
            document.getElementById('stop-record-btn').style.display = 'block';
            document.getElementById('recording-timer').style.display = 'block';
            
            this.showToast('Recording started...', 'success');
            
        } catch (error) {
            this.showToast('Could not access microphone: ' + error.message, 'error');
        }
    }
    
    stopRecording() {
        if (this.isRecording) {
            this.isRecording = false;
            this.stopRecordingTimer();
            
            // Stop the processor and audio stream
            if (this.processor) {
                this.processor.disconnect();
            }
            if (this.audioInput) {
                this.audioInput.disconnect();
            }
            if (this.audioStream) {
                this.audioStream.getTracks().forEach(track => track.stop());
            }
            
            // Convert recorded audio to WAV
            const audioBuffer = this.mergeAudioBuffers(this.audioData);
            const wavBuffer = this.audioBufferToWav(audioBuffer);
            this.currentAudioBlob = new Blob([wavBuffer], { type: 'audio/wav' });
            
            document.getElementById('analyze-voice-btn').disabled = false;
            document.getElementById('record-btn').style.display = 'block';
            document.getElementById('stop-record-btn').style.display = 'none';
            document.getElementById('recording-timer').style.display = 'none';
            
            this.showToast('Recording completed! Click analyze to process.', 'success');
        }
    }

    startRecordingTimer() {
        this.recordingStartTime = Date.now();
        this.recordingTimer = setInterval(() => {
            const elapsed = Date.now() - this.recordingStartTime;
            const seconds = Math.floor(elapsed / 1000);
            const minutes = Math.floor(seconds / 60);
            const displaySeconds = seconds % 60;
            
            document.getElementById('recording-timer').textContent = 
                `${minutes.toString().padStart(2, '0')}:${displaySeconds.toString().padStart(2, '0')}`;
        }, 1000);
    }

    stopRecordingTimer() {
        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
            this.recordingTimer = null;
        }
    }

    handleAudioUpload(event) {
        const file = event.target.files[0];
        if (file) {
            this.currentAudioBlob = file;
            document.getElementById('analyze-voice-btn').disabled = false;
            this.showToast('Audio file selected. Click analyze to process.', 'success');
        }
    }

    mergeAudioBuffers(audioData) {
        const totalLength = audioData.reduce((acc, buffer) => acc + buffer.length, 0);
        const merged = new Float32Array(totalLength);
        let offset = 0;
        
        for (const buffer of audioData) {
            merged.set(buffer, offset);
            offset += buffer.length;
        }
        
        return merged;
    }

    audioBufferToWav(buffer) {
        const length = buffer.length;
        const arrayBuffer = new ArrayBuffer(44 + length * 2);
        const view = new DataView(arrayBuffer);
        
        // WAV header
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };
        
        const sampleRate = this.audioContext ? this.audioContext.sampleRate : 44100;
        
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + length * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, length * 2, true);
        
        // Convert float samples to 16-bit PCM
        let offset = 44;
        for (let i = 0; i < length; i++) {
            const sample = Math.max(-1, Math.min(1, buffer[i]));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            offset += 2;
        }
        
        return arrayBuffer;
    }

    async analyzeVoice() {
        if (!this.currentAudioBlob) {
            this.showToast('Please record or upload audio first', 'warning');
            return;
        }
    
        const btn = document.getElementById('analyze-voice-btn');
        this.setButtonLoading(btn, true);
    
        try {
            const formData = new FormData();
            formData.append('audio', this.currentAudioBlob);
    
            const response = await fetch('/analyze_voice', {
                method: 'POST',
                body: formData
            });
    
            const data = await response.json();
    
            if (data.error) {
                throw new Error(data.error);
            }
    
            this.displayVoiceResults(data);
            this.currentMood = data.mood;
            this.updateWellnessGuide(data.wellness_recommendations, data.mood);
            this.updateTravelRecommendations(data.mood);
            
            // **ADD THIS LINE**: Refresh mood history after successful analysis
            this.loadMoodHistory();
            
            this.showToast(`Voice analysis complete: ${data.mood}`, 'success');
    
        } catch (error) {
            this.showToast(`Voice analysis failed: ${error.message}`, 'error');
        } finally {
            this.setButtonLoading(btn, false);
        }
    }
    

    displayVoiceResults(data) {
        const resultsContainer = document.getElementById('voice-results');
        
        const moodEmojis = {
            happy: '😊',
            sad: '😢',
            angry: '😠',
            neutral: '😐',
            anxious: '😰',
            excited: '🤩'
        };

        const sentimentClass = data.sentiment_score > 0 ? 'sentiment-positive' : 
                             data.sentiment_score < 0 ? 'sentiment-negative' : 'sentiment-neutral';

        resultsContainer.innerHTML = `
            <div class="mood-result fade-in">
                <div class="transcription-section">
                    <h4>Transcription:</h4>
                    <p style="background: rgba(255,255,255,0.1); padding: 1rem; border-radius: 10px; margin: 1rem 0;">
                        "${data.transcription}"
                    </p>
                </div>
                <div class="mood-emoji">${moodEmojis[data.mood] || '😐'}</div>
                <div class="mood-label mood-${data.mood}">${data.mood.toUpperCase()}</div>
                <div class="mood-confidence">Confidence: ${(data.confidence * 100).toFixed(1)}%</div>
                <div class="sentiment-meter">
                    <div class="sentiment-fill ${sentimentClass}" 
                         style="width: ${Math.abs(data.sentiment_score) * 100}%"></div>
                </div>
                <div class="sentiment-score">
                    Sentiment Score: ${data.sentiment_score.toFixed(3)}
                </div>
            </div>
        `;
    }

    // Video Analysis
    async startVideoAnalysis() {
        try {
            this.videoStream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: 640, height: 480 } 
            });
            
            const videoElement = document.getElementById('video-feed');
            videoElement.srcObject = this.videoStream;
            
            document.getElementById('start-video-btn').style.display = 'none';
            document.getElementById('stop-video-btn').style.display = 'block';
            document.getElementById('capture-btn').style.display = 'block';
            
            this.showToast('Camera started. Position your face and click capture.', 'success');
            
        } catch (error) {
            this.showToast('Could not access camera: ' + error.message, 'error');
        }
    }

    stopVideoAnalysis() {
        if (this.videoStream) {
            this.videoStream.getTracks().forEach(track => track.stop());
            this.videoStream = null;
            
            const videoElement = document.getElementById('video-feed');
            videoElement.srcObject = null;
            
            document.getElementById('start-video-btn').style.display = 'block';
            document.getElementById('stop-video-btn').style.display = 'none';
            document.getElementById('capture-btn').style.display = 'none';
            
            this.showToast('Camera stopped', 'success');
        }
    }

    async captureFrame() {
        const videoElement = document.getElementById('video-feed');
        const canvas = document.getElementById('video-canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        
        ctx.drawImage(videoElement, 0, 0);
        
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        
        const btn = document.getElementById('capture-btn');
        this.setButtonLoading(btn, true);
    
        try {
            const response = await fetch('/analyze_video', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ image_data: imageData })
            });
    
            const data = await response.json();
    
            if (data.error) {
                throw new Error(data.error);
            }
    
            this.displayVideoResults(data);
            this.currentMood = data.mood;
            this.updateWellnessGuide(data.wellness_recommendations, data.mood);
            this.updateTravelRecommendations(data.mood);
            
            // **ADD THIS LINE**: Refresh mood history after successful analysis
            this.loadMoodHistory();
            
            this.showToast(`Emotion detected: ${data.mood}`, 'success');
    
        } catch (error) {
            this.showToast(`Video analysis failed: ${error.message}`, 'error');
        } finally {
            this.setButtonLoading(btn, false);
        }
    }
    

    displayVideoResults(data) {
        const resultsContainer = document.getElementById('video-results');
        
        const moodEmojis = {
            happy: '😊',
            sad: '😢',
            angry: '😠',
            neutral: '😐',
            anxious: '😰',
            excited: '🤩'
        };

        const emotionsHtml = Object.entries(data.all_emotions)
            .sort(([,a], [,b]) => b - a)
            .map(([emotion, confidence]) => 
                `<div style="display: flex; justify-content: space-between; margin: 0.25rem 0;">
                    <span>${emotion}</span>
                    <span>${confidence.toFixed(1)}%</span>
                </div>`
            ).join('');

        resultsContainer.innerHTML = `
            <div class="mood-result fade-in">
                <div class="mood-emoji">${moodEmojis[data.mood] || '😐'}</div>
                <div class="mood-label mood-${data.mood}">${data.mood.toUpperCase()}</div>
                <div class="mood-confidence">Confidence: ${(data.confidence * 100).toFixed(1)}%</div>
                <div class="emotion-breakdown" style="margin-top: 1rem; padding: 1rem; background: rgba(255,255,255,0.1); border-radius: 10px;">
                    <h4 style="margin-bottom: 0.5rem;">All Emotions Detected:</h4>
                    ${emotionsHtml}
                </div>
            </div>
        `;
    }

    // Wellness Guide
    updateWellnessGuide(recommendations, mood) {
        const wellnessContainer = document.getElementById('wellness-content');
        
        if (!recommendations) {
            return;
        }

        // Handle different recommendation formats
        let categories = {};
        if (typeof recommendations === 'object' && !Array.isArray(recommendations)) {
            categories = recommendations;
        } else {
            categories = { 'Recommendations': recommendations };
        }

        const categoriesHtml = Object.entries(categories).map(([category, items]) => {
            const itemsArray = Array.isArray(items) ? items : [items];
            const itemsHtml = itemsArray.map(item => `<li>${item}</li>`).join('');
            
            return `
                <div class="wellness-category">
                    <h3>${category.replace('_', ' ').toUpperCase()}</h3>
                    <ul class="wellness-list">
                        ${itemsHtml}
                    </ul>
                </div>
            `;
        }).join('');

        wellnessContainer.innerHTML = `
            <div class="wellness-header">
                <h3>🌟 Personalized Wellness Guide for ${mood.toUpperCase()} Mood</h3>
                <p>Here are some activities and practices to help improve your wellbeing:</p>
            </div>
            <div class="wellness-categories">
                ${categoriesHtml}
            </div>
        `;
    }

    // Travel Recommendations
    async updateTravelRecommendations(mood) {
        try {
            const response = await fetch('/get_travel_recommendations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ mood: mood })
            });

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            this.displayTravelRecommendations(data.destinations, mood);

        } catch (error) {
            this.showToast(`Failed to load travel recommendations: ${error.message}`, 'error');
        }
    }

    displayTravelRecommendations(destinations, mood) {
        const travelContainer = document.getElementById('travel-content');
        
        const destinationsHtml = destinations.map(dest => {
            const activitiesHtml = dest.activities.map(activity => 
                `<span class="activity-tag">${activity}</span>`
            ).join('');
            
            return `
                <div class="destination-card">
                    <div class="destination-name">${dest.name}</div>
                    <div class="destination-description">${dest.description}</div>
                    <div class="destination-details">
                        <div class="detail-section">
                            <h4>🎯 Activities</h4>
                            <div class="activities-list">
                                ${activitiesHtml}
                            </div>
                        </div>
                        <div class="detail-section">
                            <h4>🌤️ Best Season</h4>
                            <p>${dest.season}</p>
                        </div>
                        <div class="detail-section">
                            <h4>💭 Why This Matches Your Mood</h4>
                            <p>${dest.mood_match}</p>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        travelContainer.innerHTML = `
            <div class="travel-header">
                <h3>✈️ Perfect Destinations for Your ${mood.toUpperCase()} Mood</h3>
                <p>Based on your current emotional state, here are some destinations that might be perfect for you:</p>
            </div>
            <div class="travel-destinations">
                ${destinationsHtml}
            </div>
        `;
    }

    // Mood History
    async loadMoodHistory() {
        try {
            const response = await fetch('/get_mood_history');
            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            this.displayMoodHistory(data.history);

        } catch (error) {
            console.error('Failed to load mood history:', error);
        }
    }

    displayMoodHistory(history) {
        const historyContainer = document.getElementById('mood-history');
        
        if (!history || history.length === 0) {
            historyContainer.innerHTML = `
                <div class="history-placeholder">
                    <p>No mood analysis history yet. Start analyzing your mood to see your journey!</p>
                </div>
            `;
            return;
        }

        const historyHtml = history.map(entry => {
            const date = new Date(entry.timestamp).toLocaleString();
            const scoreColor = entry.sentiment_score > 0 ? 'var(--success-color)' : 
                              entry.sentiment_score < 0 ? 'var(--error-color)' : 'var(--text-secondary)';
            
            return `
                <div class="history-item">
                    <div class="history-info">
                        <div class="history-mood mood-${entry.mood}">${entry.mood.toUpperCase()}</div>
                        <div class="history-method">via ${entry.method}</div>
                        <div class="history-time">${date}</div>
                    </div>
                    <div class="history-score">
                        <div class="score-value" style="color: ${scoreColor}">
                            ${entry.sentiment_score ? entry.sentiment_score.toFixed(2) : 'N/A'}
                        </div>
                        <div class="score-label">Score</div>
                    </div>
                </div>
            `;
        }).join('');

        historyContainer.innerHTML = historyHtml;
    }

    // Utility functions
    setButtonLoading(button, loading) {
        if (loading) {
            button.classList.add('loading');
            button.disabled = true;
        } else {
            button.classList.remove('loading');
            button.disabled = false;
        }
    }

    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        const container = document.getElementById('toast-container');
        container.appendChild(toast);
        
        // Trigger animation
        setTimeout(() => toast.classList.add('show'), 100);
        
        // Remove toast after 5 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => container.removeChild(toast), 300);
        }, 5000);
    }

    showLoadingOverlay() {
        document.getElementById('loading-overlay').style.display = 'flex';
    }

    hideLoadingOverlay() {
        document.getElementById('loading-overlay').style.display = 'none';
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.moodSyncAI = new MoodSyncAI();
});
