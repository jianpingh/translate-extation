// content.js - Content script for real-time audio transcription
(function() {
    let recognition = null;
    let isRecording = false;
    let transcriptOverlay = null;
    let interimElement = null;
    let userSpeaking = false; // Track if user is actively speaking
    let audioContext = null;
    let analyser = null;
    let microphone = null;
    let lastFinalTranscript = ''; // Track last final transcript to prevent duplicates
    let lastInterimText = ''; // Track last interim text to prevent duplicates
    
    console.log('Audio Transcription Extension: Content script loaded');
    
    // Check browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        console.error('Speech recognition API not supported by this browser');
    } else {
        console.log('Speech recognition API available');
    }
    
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        console.log('Content script received message:', request);
        
        if (request.action === 'startTranscription') {
            console.log('Start transcription request, language:', request.language);
            startTranscription(request.language)
                .then(() => {
                    console.log('Transcription started successfully');
                    sendResponse({success: true});
                })
                .catch(error => {
                    console.error('Failed to start transcription:', error);
                    sendResponse({success: false, error: error.message});
                });
            return true; // Keep message channel open
        } else if (request.action === 'stopTranscription') {
            console.log('Stop transcription request');
            stopTranscription();
            sendResponse({success: true});
        } else if (request.action === 'getStatus') {
            sendResponse({isRecording: isRecording});
        }
    });
    
    // Start transcription function
    async function startTranscription(language = 'en-US') {
        console.log('startTranscription called with language:', language);
        
        // Reset deduplication tracking variables
        lastFinalTranscript = '';
        lastInterimText = '';
        
        try {
            // Check browser support
            if (!SpeechRecognition) {
                throw new Error('Browser does not support speech recognition');
            }
            
            // Stop previous transcription
            if (recognition) {
                recognition.stop();
                recognition = null;
            }
            
            // Request microphone permission and setup audio analysis
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                console.log('Microphone permission granted');
                
                // Setup audio analysis to detect user speech
                setupAudioAnalysis(stream);
                
            } catch (error) {
                throw new Error('Cannot access microphone: ' + error.message);
            }
            
            // Create and show transcript overlay first
            createTranscriptOverlay();
            showStatus('Ready');
            
            // Create speech recognition instance with optimized settings for real-time
            recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = language;
            recognition.maxAlternatives = 1;
            
            // Optimize for real-time performance
            if ('webkitSpeechRecognition' in window) {
                // Chrome-specific optimizations
                recognition.serviceURI = 'wss://www.google.com/speech-api/full-duplex/v1/up';
            }
            
            console.log('Speech recognition instance created with real-time optimizations, language:', language);
            
            // Listen for recognition results with deduplication
            recognition.onresult = function(event) {
                console.log('Recognition result event triggered, results count:', event.results.length);
                let finalTranscript = '';
                let interimTranscript = '';
                // Process results immediately for real-time display
                let hasNewContent = false;
                
                // Process only new results to prevent duplication
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    const confidence = event.results[i][0].confidence;
                    
                    console.log('Result', i, '- Final:', event.results[i].isFinal, 'Text:', transcript, 'Confidence:', confidence);
                    
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript;
                        hasNewContent = true;
                    } else {
                        // Only use the latest interim result to prevent duplication
                        if (i === event.results.length - 1) {
                            interimTranscript = transcript;
                            hasNewContent = true;
                        }
                    }
                }
                
                // Check for duplicate final transcripts
                if (finalTranscript.trim() && finalTranscript !== lastFinalTranscript) {
                    console.log('New final transcript (deduplicated):', finalTranscript, 'User speaking:', userSpeaking);
                    lastFinalTranscript = finalTranscript;
                    
                    // Add final transcript with guaranteed persistence
                    addFinalTranscript(finalTranscript, userSpeaking);
                    
                    // Send to popup (if open) - non-blocking
                    chrome.runtime.sendMessage({
                        action: 'transcriptUpdate',
                        text: finalTranscript,
                        isFinal: true
                    }).catch(() => {
                        // Popup might be closed, ignore error
                        console.log('Popup not available for message');
                    });
                }
                
                // Show interim results only if different from final
                if (interimTranscript.trim() && interimTranscript !== lastFinalTranscript) {
                    console.log('Interim transcript (deduplicated):', interimTranscript);
                    updateInterimTranscript(interimTranscript);
                }
            };
            
            // Listen for start event
            recognition.onstart = function() {
                console.log('Speech recognition started successfully');
                isRecording = true;
                showStatus('Ready');
            };
            
            // Listen for errors
            recognition.onerror = function(event) {
                console.error('Speech recognition error:', event.error);
                let errorMessage = 'Unknown error';
                
                switch(event.error) {
                    case 'no-speech':
                        errorMessage = 'No speech detected - please speak louder';
                        break;
                    case 'audio-capture':
                        errorMessage = 'Cannot capture audio - check microphone';
                        break;
                    case 'not-allowed':
                        errorMessage = 'Microphone permission denied';
                        break;
                    case 'network':
                        errorMessage = 'Network error - check internet connection';
                        break;
                    case 'service-not-allowed':
                        errorMessage = 'Speech service unavailable';
                        break;
                    default:
                        errorMessage = event.error;
                }
                
                showStatus('Error: ' + errorMessage);
                console.error('Speech recognition error details:', event);
                
                // Send error to popup
                chrome.runtime.sendMessage({
                    action: 'transcriptionError',
                    error: errorMessage
                }).catch(() => {
                    console.log('Popup not available for error message');
                });
            };
            
            // Listen for end event
            recognition.onend = function() {
                console.log('Speech recognition ended');
                if (isRecording) {
                    // Auto restart recognition if still in recording state
                    console.log('Auto restarting speech recognition...');
                    setTimeout(() => {
                        if (isRecording && recognition) {
                            try {
                                recognition.start();
                            } catch (e) {
                                console.error('Failed to restart recognition:', e);
                                showStatus('Failed to restart - click Start again');
                                isRecording = false;
                            }
                        }
                    }, 100);
                } else {
                    showStatus('Stopped');
                    chrome.runtime.sendMessage({
                        action: 'transcriptionEnded'
                    }).catch(() => {
                        console.log('Popup not available for end message');
                    });
                }
            };
            
            // Start recognition
            console.log('Starting speech recognition...');
            recognition.start();
            
        } catch (error) {
            console.error('Failed to start transcription:', error);
            showStatus('Failed to start: ' + error.message);
            throw error;
        }
    }
    
    // Setup audio analysis to detect user speech
    function setupAudioAnalysis(stream) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            microphone = audioContext.createMediaStreamSource(stream);
            
            analyser.fftSize = 256;
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            
            microphone.connect(analyser);
            
            // Monitor audio levels to detect user speech
            function checkAudioLevel() {
                analyser.getByteFrequencyData(dataArray);
                
                // Calculate average volume
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                    sum += dataArray[i];
                }
                const average = sum / bufferLength;
                
                // Consider user speaking if volume is above threshold
                const threshold = 25; // Adjust this value as needed
                userSpeaking = average > threshold;
                
                if (isRecording) {
                    requestAnimationFrame(checkAudioLevel);
                }
            }
            
            checkAudioLevel();
            console.log('Audio analysis setup complete');
            
        } catch (error) {
            console.error('Failed to setup audio analysis:', error);
            // Fallback: assume all speech is from user
            userSpeaking = true;
        }
    }
    
    // Create transcript overlay
    function createTranscriptOverlay() {
        // Remove existing overlay
        if (transcriptOverlay) {
            transcriptOverlay.remove();
        }
        
        transcriptOverlay = document.createElement('div');
        transcriptOverlay.className = 'transcript-overlay active';
        transcriptOverlay.innerHTML = `
            <div class="transcript-header">
                <span>🎵 Real-time Transcription</span>
                <button class="transcript-close">×</button>
            </div>
            <div class="transcript-content">
                <div class="transcript-status" style="display: none;"></div>
                <div class="transcript-text-container"></div>
            </div>
        `;
        
        // Add close button event
        const closeBtn = transcriptOverlay.querySelector('.transcript-close');
        closeBtn.addEventListener('click', function() {
            if (transcriptOverlay) {
                transcriptOverlay.remove();
                transcriptOverlay = null;
                interimElement = null;
            }
        });
        
        // Make draggable
        makeDraggable(transcriptOverlay);
        
        // Add to page
        document.body.appendChild(transcriptOverlay);
        
        console.log('Transcript overlay created and added to page');
    }
    
    // Make element draggable
    function makeDraggable(element) {
        let isDragging = false;
        let startX, startY, initialX, initialY;
        
        const header = element.querySelector('.transcript-header');
        
        header.addEventListener('mousedown', function(e) {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            
            const rect = element.getBoundingClientRect();
            initialX = rect.left;
            initialY = rect.top;
            
            element.style.cursor = 'grabbing';
            document.body.style.userSelect = 'none';
            
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', function(e) {
            if (!isDragging) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            let newX = initialX + deltaX;
            let newY = initialY + deltaY;
            
            // Keep within viewport bounds
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;
            const elementWidth = element.offsetWidth;
            const elementHeight = element.offsetHeight;
            
            newX = Math.max(0, Math.min(newX, windowWidth - elementWidth));
            newY = Math.max(0, Math.min(newY, windowHeight - elementHeight));
            
            element.style.left = newX + 'px';
            element.style.top = newY + 'px';
            element.style.right = 'auto';
        });
        
        document.addEventListener('mouseup', function() {
            if (isDragging) {
                isDragging = false;
                element.style.cursor = 'move';
                document.body.style.userSelect = '';
                
                // Save position
                const rect = element.getBoundingClientRect();
                chrome.storage.local.set({
                    transcriptPosition: {
                        left: rect.left,
                        top: rect.top
                    }
                }).catch(err => console.log('Failed to save position:', err));
            }
        });
        
        // Load saved position
        chrome.storage.local.get(['transcriptPosition']).then(result => {
            if (result.transcriptPosition) {
                const pos = result.transcriptPosition;
                element.style.left = pos.left + 'px';
                element.style.top = pos.top + 'px';
                element.style.right = 'auto';
            }
        }).catch(err => console.log('Failed to load position:', err));
    }
    
    // Show status in overlay
    function showStatus(message) {
        if (!transcriptOverlay) return;
        
        const statusElement = transcriptOverlay.querySelector('.transcript-status');
        if (statusElement) {
            // Hide status element when ready, only show errors
            if (message === 'Ready' || message === 'Listening...' || message === 'Initializing...') {
                statusElement.style.display = 'none';
            } else {
                statusElement.style.display = 'block';
                statusElement.textContent = message;
                statusElement.style.color = message.includes('Error') ? '#f44336' : '#4CAF50';
            }
        }
        console.log('Status updated:', message);
    }
    
    // Update interim transcript (real-time preview) - optimized for speed with deduplication
    function updateInterimTranscript(text) {
        if (!transcriptOverlay) return;
        
        const container = transcriptOverlay.querySelector('.transcript-text-container');
        if (!container) return;
        
        // Skip if same as last interim text
        if (text === lastInterimText) {
            return;
        }
        lastInterimText = text;
        
        // Find or create interim element
        let interimDiv = container.querySelector('.transcript-interim');
        
        if (!interimDiv) {
            // Create new interim element with immediate display
            interimDiv = document.createElement('div');
            interimDiv.className = 'transcript-interim';
            interimDiv.style.cssText = `
                color: white;
                font-style: normal;
                padding: 8px 12px;
                background: linear-gradient(135deg, rgba(0, 0, 0, 0.75) 0%, rgba(30, 30, 30, 0.7) 100%);
                border-radius: 8px;
                margin-bottom: 8px;
                animation: pulse 1.5s infinite;
                transition: opacity 0.2s ease;
                min-height: 20px;
                opacity: 1;
                position: relative;
                z-index: 1000;
                border: 1px solid rgba(255, 255, 255, 0.1);
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
            `;
            container.appendChild(interimDiv);
            
            // Immediate scroll to bottom for real-time feel
            container.scrollTop = container.scrollHeight;
        }
        
        // Update text content immediately - no animation delays
        if (text.trim()) {
            interimDiv.textContent = text;
            interimDiv.style.opacity = '1';
            
            // Immediate scroll update for real-time tracking
            requestAnimationFrame(() => {
                container.scrollTop = container.scrollHeight;
            });
        } else {
            interimDiv.style.opacity = '0.5';
        }
        
        console.log('Interim transcript updated (deduplicated):', text);
    }
    
    // Add final transcript text with guaranteed persistence and deduplication
    function addFinalTranscript(text, isUserSpeech = true) {
        if (!transcriptOverlay || !text.trim()) return;
        
        const container = transcriptOverlay.querySelector('.transcript-text-container');
        if (!container) return;
        
        // Check for duplicate content in existing transcripts
        const existingItems = container.querySelectorAll('.transcript-item');
        const trimmedText = text.trim().toLowerCase();
        
        // Check if this text already exists in recent transcripts
        for (let i = Math.max(0, existingItems.length - 5); i < existingItems.length; i++) {
            const existingText = existingItems[i].textContent.replace(/^You:\s*/, '').trim().toLowerCase();
            if (existingText === trimmedText) {
                console.log('Duplicate transcript detected, skipping:', text);
                return; // Skip duplicate
            }
        }
        
        // Remove interim text immediately to prevent flickering
        const interimDiv = container.querySelector('.transcript-interim');
        if (interimDiv) {
            // Remove interim text immediately without animation to prevent disappearing
            interimDiv.remove();
        }
        
        // Add final text with or without You: prefix based on source
        const finalDiv = document.createElement('div');
        finalDiv.className = 'transcript-item persistent-item';
        
        if (isUserSpeech) {
            finalDiv.innerHTML = `
                <div class="transcript-text"><span style="color: #4CAF50; font-weight: 600;">You:</span> ${text}</div>
            `;
        } else {
            finalDiv.innerHTML = `
                <div class="transcript-text">${text}</div>
            `;
        }
        finalDiv.style.cssText = `
            margin-bottom: 12px;
            padding: 10px 14px;
            background: linear-gradient(135deg, rgba(0, 0, 0, 0.8) 0%, rgba(20, 20, 20, 0.7) 100%);
            border-radius: 10px;
            color: white;
            opacity: 1;
            transform: translateY(0);
            transition: all 0.3s ease;
            position: relative;
            z-index: 1000;
            display: block !important;
            visibility: visible !important;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.08);
        `;
        
        // Ensure the element is added and stays visible
        container.appendChild(finalDiv);
        
        // Force reflow to ensure element is rendered
        finalDiv.offsetHeight;
        
        // Immediate scroll to bottom for real-time feel
        requestAnimationFrame(() => {
            container.scrollTop = container.scrollHeight;
        });
        
        // Limit number of items to prevent memory issues but keep more items visible
        const items = container.querySelectorAll('.transcript-item');
        if (items.length > 50) {
            // Remove oldest items but keep more history
            for (let i = 0; i < 10; i++) {
                const oldestItem = items[i];
                if (oldestItem && oldestItem.parentNode) {
                    oldestItem.remove();
                }
            }
        }
        
        console.log('Final transcript added with deduplication:', text);
    }
    
    // Stop transcription
    function stopTranscription() {
        console.log('Stopping transcription...');
        isRecording = false;
        userSpeaking = false;
        
        // Reset deduplication tracking variables
        lastFinalTranscript = '';
        lastInterimText = '';
        
        if (recognition) {
            recognition.stop();
            recognition = null;
        }
        
        // Clean up audio analysis
        if (microphone) {
            microphone.disconnect();
            microphone = null;
        }
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }
        analyser = null;
        
        showStatus('Stopped');
        
        // Hide overlay
        if (transcriptOverlay) {
            transcriptOverlay.style.display = 'none';
        }
        
        console.log('Transcription stopped');
    }
    
    // Test speech recognition availability
    function testSpeechRecognition() {
        if (SpeechRecognition) {
            console.log('Speech Recognition API is available');
            console.log('Supported languages might include: en-US, zh-CN, ja-JP, ko-KR, etc.');
            
            // Test basic functionality
            try {
                const testRecognition = new SpeechRecognition();
                console.log('Speech recognition instance created successfully');
                testRecognition = null;
            } catch (error) {
                console.error('Failed to create speech recognition instance:', error);
            }
        } else {
            console.error('Speech Recognition API is not available in this browser');
        }
    }
    
    // Run test on load
    testSpeechRecognition();
    
    console.log('Content script initialization complete');
    
})();
