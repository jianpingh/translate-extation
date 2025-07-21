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
    let currentInterimWords = []; // Track current interim words for proper appending
    
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
        currentInterimWords = [];
        
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
            
            // Listen for recognition results with proper order handling
            recognition.onresult = function(event) {
                console.log('Recognition result event triggered, results count:', event.results.length);
                
                // Process only the latest interim result for real-time display
                let latestInterimText = '';
                let newFinalTranscript = '';
                
                // Find the latest interim result (non-final)
                for (let i = event.results.length - 1; i >= 0; i--) {
                    if (!event.results[i].isFinal && event.results[i][0].transcript.trim()) {
                        latestInterimText = event.results[i][0].transcript;
                        console.log('Latest interim result:', latestInterimText);
                        break;
                    }
                }
                
                // Process only new final results from the current event
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    if (event.results[i].isFinal) {
                        const finalText = event.results[i][0].transcript;
                        newFinalTranscript += finalText;
                        console.log('New final result:', finalText);
                    }
                }
                
                // Update interim display with latest text
                if (latestInterimText && latestInterimText !== lastInterimText) {
                    console.log('Updating interim display:', latestInterimText);
                    updateInterimTranscript(latestInterimText);
                }
                
                // Process final transcript if we have new content
                if (newFinalTranscript.trim() && newFinalTranscript !== lastFinalTranscript) {
                    console.log('Processing new final transcript:', newFinalTranscript, 'User speaking:', userSpeaking);
                    lastFinalTranscript = newFinalTranscript;
                    
                    // Add final transcript in correct order
                    addFinalTranscript(newFinalTranscript, userSpeaking);
                    
                    // Send to popup (if open) - non-blocking
                    chrome.runtime.sendMessage({
                        action: 'transcriptUpdate',
                        text: newFinalTranscript,
                        isFinal: true
                    }).catch(() => {
                        // Popup might be closed, ignore error
                        console.log('Popup not available for message');
                    });
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
    
    // Update interim transcript with true word-by-word append (单词逐个出现且不消失)
    function updateInterimTranscript(text) {
        if (!transcriptOverlay) return;
        
        const container = transcriptOverlay.querySelector('.transcript-text-container');
        if (!container) return;
        
        // Skip if same as last interim text
        if (text === lastInterimText) {
            return;
        }
        
        // Find or create interim element
        let interimDiv = container.querySelector('.transcript-interim');
        
        if (!interimDiv) {
            // Create new interim element with immediate display
            interimDiv = document.createElement('div');
            interimDiv.className = 'transcript-interim';
            interimDiv.style.cssText = `
                color: rgba(255, 255, 255, 0.95);
                font-style: normal;
                padding: 8px 12px;
                background: linear-gradient(135deg, rgba(0, 0, 0, 0.6) 0%, rgba(30, 30, 30, 0.5) 100%);
                border-radius: 8px;
                margin-bottom: 8px;
                animation: pulse 2s infinite;
                transition: all 0.2s ease;
                min-height: 20px;
                opacity: 1;
                position: relative;
                z-index: 1000;
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-left: 3px solid rgba(76, 175, 80, 0.6);
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
            `;
            container.appendChild(interimDiv);
            currentInterimWords = [];
        }
        
        // Parse new words from the text
        const newWords = text.trim().split(' ').filter(w => w.length > 0);
        
        // Always append new words, never replace or remove existing ones during interim
        if (newWords.length > currentInterimWords.length) {
            // Check if new text starts with current words (可以追加)
            let canAppend = true;
            for (let i = 0; i < currentInterimWords.length; i++) {
                if (currentInterimWords[i] !== newWords[i]) {
                    canAppend = false;
                    break;
                }
            }
            
            if (canAppend) {
                // Append only the new words (单词逐个出现)
                for (let i = currentInterimWords.length; i < newWords.length; i++) {
                    const newWord = newWords[i];
                    
                    // Create word element with animation
                    const wordSpan = document.createElement('span');
                    wordSpan.textContent = (currentInterimWords.length > 0 ? ' ' : '') + newWord;
                    wordSpan.style.cssText = `
                        display: inline;
                        animation: fadeIn 0.3s ease-in;
                        margin-right: 2px;
                        opacity: 1;
                    `;
                    
                    // Append to the interim div (不消失)
                    interimDiv.appendChild(wordSpan);
                    currentInterimWords.push(newWord);
                    
                    console.log('New word appeared:', newWord);
                }
            } else {
                // Only replace if text structure is completely different
                console.log('Text structure changed, replacing interim content');
                interimDiv.innerHTML = '';
                currentInterimWords = [];
                
                for (let i = 0; i < newWords.length; i++) {
                    const word = newWords[i];
                    const wordSpan = document.createElement('span');
                    wordSpan.textContent = (i > 0 ? ' ' : '') + word;
                    wordSpan.style.cssText = `
                        display: inline;
                        animation: fadeIn 0.3s ease-in;
                        margin-right: 2px;
                        opacity: 1;
                    `;
                    interimDiv.appendChild(wordSpan);
                    currentInterimWords.push(word);
                }
            }
        } else {
            // For shorter text or corrections, only update if significantly different
            // This prevents words from disappearing during interim phase
            console.log('Keeping existing interim words to prevent disappearing');
        }
        
        lastInterimText = text;
        
        // Ensure visibility
        interimDiv.style.opacity = '1';
        
        // Immediate scroll update for real-time tracking
        requestAnimationFrame(() => {
            container.scrollTop = container.scrollHeight;
        });
        
        console.log('Current interim words (never disappear):', currentInterimWords);
    }
    
    // Add final transcript text with true cumulative display (preserve all words)
    function addFinalTranscript(text, isUserSpeech = true) {
        if (!transcriptOverlay || !text.trim()) return;
        
        const container = transcriptOverlay.querySelector('.transcript-text-container');
        if (!container) return;
        
        // Enhanced duplicate check for final text to prevent any repetition
        const existingItems = container.querySelectorAll('.transcript-item');
        const trimmedText = text.trim().toLowerCase();
        
        // Check last few items more thoroughly to prevent repetition
        for (let i = Math.max(0, existingItems.length - 3); i < existingItems.length; i++) {
            const existingText = existingItems[i].textContent.replace(/^You:\s*/, '').trim().toLowerCase();
            if (existingText === trimmedText) {
                console.log('Exact duplicate in final text, skipping:', text);
                return; // Skip exact duplicates
            }
            // Also check if new text is completely contained in existing text
            if (existingText.includes(trimmedText) && trimmedText.length > 3) {
                console.log('Final text already contained in existing item, skipping:', text);
                return;
            }
        }
        
        // Convert interim text to final text style without duplicating content
        const interimDiv = container.querySelector('.transcript-interim');
        if (interimDiv) {
            // Use only the new final text, don't accumulate with interim content
            const finalText = text.trim();
            
            // Transform interim element to final text style
            interimDiv.className = 'transcript-item persistent-item final-converted';
            
            // Update content with only the final text (no duplication)
            if (isUserSpeech) {
                interimDiv.innerHTML = `
                    <div class="transcript-text"><span style="color: #4CAF50; font-weight: 600;">You:</span> ${finalText}</div>
                `;
            } else {
                interimDiv.innerHTML = `
                    <div class="transcript-text">${finalText}</div>
                `;
            }
            
            // Update styling to final text appearance with smooth transition
            interimDiv.style.cssText = `
                margin-bottom: 12px;
                padding: 10px 14px;
                background: linear-gradient(135deg, rgba(0, 0, 0, 0.8) 0%, rgba(20, 20, 20, 0.7) 100%);
                border-radius: 10px;
                color: white;
                opacity: 1;
                transform: translateY(0);
                transition: all 0.4s ease;
                position: relative;
                z-index: 1000;
                display: block !important;
                visibility: visible !important;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(255, 255, 255, 0.08);
                animation: none;
                border-left: none;
            `;
            
            // Clear interim tracking state since it's now final
            currentInterimWords = [];
            lastInterimText = '';
            
            console.log('Interim text converted to final (no duplication):', finalText);
        } else {
            // Create new final text if no interim exists
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
            
            container.appendChild(finalDiv);
            
            // Clear interim tracking state for next round
            currentInterimWords = [];
            lastInterimText = '';
            
            console.log('New final transcript added in correct order:', text);
        }
        
        // Immediate scroll to bottom to maintain order visibility
        requestAnimationFrame(() => {
            container.scrollTop = container.scrollHeight;
            console.log('Scrolled to show latest transcript in order');
        });
        
        // Limit number of items to prevent memory issues
        const items = container.querySelectorAll('.transcript-item');
        if (items.length > 50) {
            // Remove oldest items but keep display order intact
            for (let i = 0; i < 10; i++) {
                const oldestItem = items[i];
                if (oldestItem && oldestItem.parentNode) {
                    oldestItem.remove();
                }
            }
            console.log('Cleaned up old items while preserving order');
        }
        
        console.log('Final transcript processed (no content duplication):', text);
    }
    
    // Stop transcription
    function stopTranscription() {
        console.log('Stopping transcription...');
        isRecording = false;
        userSpeaking = false;
        
        // Reset deduplication tracking variables
        lastFinalTranscript = '';
        lastInterimText = '';
        currentInterimWords = [];
        
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
    
    console.log('Content script initialization complete');
    
})();
