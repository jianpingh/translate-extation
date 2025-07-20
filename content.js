// content.js - Content script for real-time audio transcription
(function() {
    let recognition = null;
    let isRecording = false;
    let transcriptOverlay = null;
    let interimElement = null;
    
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
            
            // Request microphone permission
            try {
                await navigator.mediaDevices.getUserMedia({ audio: true });
                console.log('Microphone permission granted');
            } catch (error) {
                throw new Error('Cannot access microphone: ' + error.message);
            }
            
            // Create and show transcript overlay first
            createTranscriptOverlay();
            showStatus('Ready');
            
            // Create speech recognition instance
            recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = language;
            recognition.maxAlternatives = 1;
            
            console.log('Speech recognition instance created with language:', language);
            
            // Listen for recognition results
            recognition.onresult = function(event) {
                console.log('Recognition result event triggered, results count:', event.results.length);
                let finalTranscript = '';
                let interimTranscript = '';
                
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    const confidence = event.results[i][0].confidence;
                    
                    console.log('Result', i, '- Final:', event.results[i].isFinal, 'Text:', transcript, 'Confidence:', confidence);
                    
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript;
                    } else {
                        interimTranscript += transcript;
                    }
                }
                
                // Process final results first to avoid flickering
                if (finalTranscript) {
                    console.log('Final transcript:', finalTranscript);
                    addFinalTranscript(finalTranscript);
                    
                    // Send to popup (if open)
                    chrome.runtime.sendMessage({
                        action: 'transcriptUpdate',
                        text: finalTranscript,
                        isFinal: true
                    }).catch(() => {
                        // Popup might be closed, ignore error
                        console.log('Popup not available for message');
                    });
                } else if (interimTranscript) {
                    // Only show interim results if no final results
                    console.log('Interim transcript:', interimTranscript);
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
    
    // Update interim transcript (real-time preview)
    function updateInterimTranscript(text) {
        if (!transcriptOverlay) return;
        
        const container = transcriptOverlay.querySelector('.transcript-text-container');
        if (!container) return;
        
        // Find or create interim element
        let interimDiv = container.querySelector('.transcript-interim');
        
        if (!interimDiv) {
            // Create new interim element
            interimDiv = document.createElement('div');
            interimDiv.className = 'transcript-interim';
            interimDiv.style.cssText = `
                color: white;
                font-style: normal;
                padding: 8px 12px;
                background: rgba(0, 0, 0, 0.75);
                border-radius: 6px;
                margin-bottom: 8px;
                animation: pulse 1.5s infinite;
                transition: all 0.2s ease;
                min-height: 20px;
            `;
            container.appendChild(interimDiv);
            
            // Auto scroll to bottom smoothly when new interim appears
            setTimeout(() => {
                container.scrollTo({
                    top: container.scrollHeight,
                    behavior: 'smooth'
                });
            }, 50);
        }
        
        // Update text content smoothly
        if (text.trim()) {
            interimDiv.textContent = text;
            interimDiv.style.opacity = '1';
        } else {
            interimDiv.style.opacity = '0.5';
        }
        
        console.log('Interim transcript updated:', text);
    }
    
    // Add final transcript text
    function addFinalTranscript(text) {
        if (!transcriptOverlay) return;
        
        const container = transcriptOverlay.querySelector('.transcript-text-container');
        if (!container) return;
        
        // Remove interim text smoothly
        const interimDiv = container.querySelector('.transcript-interim');
        if (interimDiv) {
            // Fade out interim text before removing
            interimDiv.style.opacity = '0';
            interimDiv.style.transition = 'opacity 0.2s ease';
            setTimeout(() => {
                if (interimDiv.parentNode) {
                    interimDiv.remove();
                }
            }, 200);
        }
        
        // Add final text with timestamp
        const now = new Date().toLocaleTimeString();
        const finalDiv = document.createElement('div');
        finalDiv.className = 'transcript-item';
        finalDiv.innerHTML = `
            <div class="transcript-timestamp">${now}</div>
            <div class="transcript-text">${text}</div>
        `;
        finalDiv.style.cssText = `
            margin-bottom: 12px;
            padding: 10px 12px;
            background: rgba(0, 0, 0, 0.75);
            border-radius: 8px;
            animation: fadeInUp 0.3s ease-out;
            color: white;
            opacity: 0;
            transform: translateY(10px);
        `;
        
        container.appendChild(finalDiv);
        
        // Animate in the final text
        requestAnimationFrame(() => {
            finalDiv.style.opacity = '1';
            finalDiv.style.transform = 'translateY(0)';
            finalDiv.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        });
        
        // Auto scroll to bottom smoothly
        setTimeout(() => {
            container.scrollTo({
                top: container.scrollHeight,
                behavior: 'smooth'
            });
        }, 100);
        
        // Limit number of items to prevent memory issues
        const items = container.querySelectorAll('.transcript-item');
        if (items.length > 25) {
            // Remove oldest items with fade out
            const oldestItem = items[0];
            oldestItem.style.opacity = '0';
            oldestItem.style.transform = 'translateY(-10px)';
            oldestItem.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            setTimeout(() => {
                if (oldestItem.parentNode) {
                    oldestItem.remove();
                }
            }, 300);
        }
        
        console.log('Final transcript added:', text);
    }
    
    // Stop transcription
    function stopTranscription() {
        console.log('Stopping transcription...');
        isRecording = false;
        
        if (recognition) {
            recognition.stop();
            recognition = null;
        }
        
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
