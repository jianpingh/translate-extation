// content.js - 内容脚本，运行在网页中
(function() {
    let recognition = null;
    let isRecording = false;
    let audioContext = null;
    let mediaStreamSource = null;
    
    console.log('Audio Transcription Extension: Content script loaded');
    
    // 检查浏览器支持
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        console.error('Speech recognition API not supported by this browser');
    } else {
        console.log('Speech recognition API available');
    }
    
    // 监听来自popup的消息
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
            return true; // 保持消息通道开放
        } else if (request.action === 'stopTranscription') {
            console.log('Stop transcription request');
            stopTranscription();
            sendResponse({success: true});
        } else if (request.action === 'getStatus') {
            sendResponse({isRecording: isRecording});
        }
    });
    
    // Start transcription
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
            
            // Create speech recognition instance
            recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = language;
            recognition.maxAlternatives = 1;
            
            console.log('Speech recognition instance created');
            
            // Listen for recognition results
            recognition.onresult = function(event) {
                console.log('Recognition result event triggered');
                let finalTranscript = '';
                let interimTranscript = '';
                
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript;
                    } else {
                        interimTranscript += transcript;
                    }
                }
                
                // Display interim results
                if (interimTranscript) {
                    console.log('Interim transcript:', interimTranscript);
                    updateInterimTranscript(interimTranscript);
                }
                
                // Send final results to popup
                if (finalTranscript) {
                    console.log('Sending transcript text:', finalTranscript);
                    
                    // Send to popup (if open)
                    chrome.runtime.sendMessage({
                        action: 'transcriptUpdate',
                        text: finalTranscript,
                        isFinal: true
                    });
                    
                    // Also display on page
                    showTranscriptOnPage(finalTranscript);
                }
            };
            
            // Listen for start event
            recognition.onstart = function() {
                console.log('Speech recognition started');
                isRecording = true;
            };
            
            // Listen for errors
            recognition.onerror = function(event) {
                console.error('Speech recognition error:', event.error);
                let errorMessage = 'Unknown error';
                
                switch(event.error) {
                    case 'no-speech':
                        errorMessage = 'No speech detected';
                        break;
                    case 'audio-capture':
                        errorMessage = 'Cannot capture audio';
                        break;
                    case 'not-allowed':
                        errorMessage = 'Microphone permission denied';
                        break;
                    case 'network':
                        errorMessage = 'Network error';
                        break;
                    case 'service-not-allowed':
                        errorMessage = 'Speech service unavailable';
                        break;
                    default:
                        errorMessage = event.error;
                }
                
                chrome.runtime.sendMessage({
                    action: 'transcriptionError',
                    error: errorMessage
                });
            };
            
            // Listen for end event
            recognition.onend = function() {
                console.log('Speech recognition ended');
                if (isRecording) {
                    // Auto restart recognition if still in recording state
                    setTimeout(() => {
                        if (isRecording && recognition) {
                            try {
                                console.log('Auto restarting speech recognition');
                                recognition.start();
                            } catch (e) {
                                console.error('Failed to restart recognition:', e);
                            }
                        }
                    }, 100);
                } else {
                    chrome.runtime.sendMessage({
                        action: 'transcriptionEnded'
                    });
                }
            };
            
            // Start recognition
            console.log('Starting speech recognition');
            recognition.start();
            
        } catch (error) {
            console.error('Failed to start transcription:', error);
            throw error;
        }
    }
    
    // Display transcript text on page
    let transcriptOverlay = null;
    let interimElement = null;
    
    function updateInterimTranscript(text) {
        if (!transcriptOverlay) {
            createTranscriptOverlay();
        }
        
        if (!interimElement) {
            interimElement = document.createElement('div');
            interimElement.className = 'transcript-interim';
            interimElement.style.cssText = 'color: #999; font-style: italic; padding: 5px 0;';
            const content = transcriptOverlay.querySelector('.transcript-content');
            content.appendChild(interimElement);
        }
        
        interimElement.textContent = 'Recognizing: ' + text;
    }
    
    function showTranscriptOnPage(text) {
        // Create or update display overlay
        if (!transcriptOverlay) {
            createTranscriptOverlay();
        }
        
        // Clear interim display
        if (interimElement) {
            interimElement.remove();
            interimElement = null;
        }
        
        // Add new transcript text
        const now = new Date().toLocaleTimeString();
        const textElement = document.createElement('div');
        textElement.className = 'transcript-item';
        textElement.innerHTML = `
            <div class="transcript-timestamp">${now}</div>
            <div class="transcript-text">${text}</div>
        `;
        
        const content = transcriptOverlay.querySelector('.transcript-content');
        content.appendChild(textElement);
        
        // Scroll to bottom
        content.scrollTop = content.scrollHeight;
        
        // Limit number of displayed items
        const items = content.querySelectorAll('.transcript-item');
        if (items.length > 10) {
            items[0].remove();
        }
    }
    
    function createTranscriptOverlay() {
        transcriptOverlay = document.createElement('div');
        transcriptOverlay.className = 'transcript-overlay active';
        transcriptOverlay.innerHTML = `
            <div class="transcript-header" id="transcript-header">
                🎵 Real-time Transcription - Draggable
                <button class="transcript-close">×</button>
            </div>
            <div class="transcript-content"></div>
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
        
        // Add drag functionality
        makeDraggable(transcriptOverlay);
        
        document.body.appendChild(transcriptOverlay);
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
            
            // Boundary check
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
                });
            }
        });
        
        // Load saved position
        chrome.storage.local.get(['transcriptPosition'], function(result) {
            if (result.transcriptPosition) {
                const pos = result.transcriptPosition;
                element.style.left = pos.left + 'px';
                element.style.top = pos.top + 'px';
                element.style.right = 'auto';
            }
        });
    }
    
    // Stop transcription
    function stopTranscription() {
        console.log('Stopping transcription');
        isRecording = false;
        
        if (recognition) {
            recognition.stop();
            recognition = null;
        }
        
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }
        
        if (mediaStreamSource) {
            mediaStreamSource.disconnect();
            mediaStreamSource = null;
        }
        
        // Hide transcript display on page
        if (transcriptOverlay) {
            transcriptOverlay.style.display = 'none';
        }
    }
    
    // 捕获页面音频
    async function capturePageAudio() {
        try {
            // 尝试获取显示媒体（屏幕/标签页音频）
            if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
                const stream = await navigator.mediaDevices.getDisplayMedia({
                    audio: true,
                    video: false
                });
                
                // 创建音频上下文
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                mediaStreamSource = audioContext.createMediaStreamSource(stream);
                
                console.log('成功捕获页面音频');
                return;
            }
        } catch (error) {
            console.log('无法捕获页面音频，将使用麦克风:', error.message);
        }
        
        // 如果无法捕获页面音频，回退到麦克风
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            mediaStreamSource = audioContext.createMediaStreamSource(stream);
            console.log('使用麦克风音频');
        } catch (error) {
            console.error('无法访问麦克风:', error);
            throw new Error('无法访问音频设备');
        }
    }
    
    // 注入脚本到页面，用于更好地访问页面音频
    function injectPageScript() {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('injected.js');
        script.onload = function() {
            this.remove();
        };
        (document.head || document.documentElement).appendChild(script);
    }
    
    // 页面加载完成后注入脚本
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectPageScript);
    } else {
        injectPageScript();
    }
    
    // 监听页面中的视频/音频元素
    function monitorMediaElements() {
        const mediaElements = document.querySelectorAll('video, audio');
        mediaElements.forEach(element => {
            if (!element.hasAttribute('data-transcript-monitored')) {
                element.setAttribute('data-transcript-monitored', 'true');
                
                element.addEventListener('play', function() {
                    console.log('检测到媒体播放:', element.src || element.currentSrc);
                });
                
                element.addEventListener('pause', function() {
                    console.log('媒体暂停');
                });
            }
        });
    }
    
    // 定期检查新的媒体元素
    setInterval(monitorMediaElements, 2000);
    
    // 初始检查
    monitorMediaElements();
    
})();
