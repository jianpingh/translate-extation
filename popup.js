// popup.js - Popup window script
document.addEventListener('DOMContentLoaded', function() {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const status = document.getElementById('status');
    const languageSelect = document.getElementById('languageSelect');
    
    let isRecording = false;
    
    // Load saved settings
    chrome.storage.sync.get(['language'], function(result) {
        if (result.language) {
            languageSelect.value = result.language;
        }
    });
    
    // Listen for language selection changes
    languageSelect.addEventListener('change', function() {
        chrome.storage.sync.set({language: languageSelect.value});
    });
    
    // Start transcription
    startBtn.addEventListener('click', async function() {
        console.log('Start transcription button clicked');
        try {
            const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
            console.log('Current tab:', tab);
            
            // Send message to content script to start transcription
            chrome.tabs.sendMessage(tab.id, {
                action: 'startTranscription',
                language: languageSelect.value
            }, function(response) {
                console.log('Received response from content script:', response);
                
                if (chrome.runtime.lastError) {
                    console.error('Chrome runtime error:', chrome.runtime.lastError);
                    updateStatus('Error: Cannot connect to page, please refresh and try again', false);
                    return;
                }
                
                if (response && response.success) {
                    isRecording = true;
                    updateUI();
                    updateStatus('Recording...', true);
                } else {
                    updateStatus('Failed to start: ' + (response?.error || 'Unknown error'), false);
                }
            });
        } catch (error) {
            console.error('Start transcription error:', error);
            updateStatus('Failed to start: ' + error.message, false);
        }
    });
    
    // Stop transcription
    stopBtn.addEventListener('click', async function() {
        try {
            const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
            
            chrome.tabs.sendMessage(tab.id, {action: 'stopTranscription'}, function(response) {
                if (response && response.success) {
                    isRecording = false;
                    updateUI();
                    updateStatus('Stopped', false);
                }
            });
        } catch (error) {
            console.error('Stop transcription error:', error);
        }
    });
    
    // Update UI state
    function updateUI() {
        startBtn.disabled = isRecording;
        stopBtn.disabled = !isRecording;
    }
    
    // Update status display
    function updateStatus(message, active) {
        status.textContent = 'Status: ' + message;
        status.className = 'status ' + (active ? 'active' : 'inactive');
    }
    
    // 检查当前页面的转录状态
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {action: 'getStatus'}, function(response) {
                if (response && response.isRecording) {
                    isRecording = true;
                    updateUI();
                    updateStatus('正在转录...', true);
                }
            });
        }
    });
});
