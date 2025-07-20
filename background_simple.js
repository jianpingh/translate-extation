// background.js - 最简化版本用于调试
console.log('Service Worker started');

// 基本的安装事件监听
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed');
});

// 基本的消息监听和中转
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background收到消息:', request);
    
    // 如果是转录相关的消息，中转给所有popup
    if (request.action === 'transcriptUpdate' || 
        request.action === 'transcriptionError' || 
        request.action === 'transcriptionEnded') {
        
        // 由于popup可能不在运行，我们将消息保存起来
        chrome.storage.local.set({
            lastTranscriptMessage: request
        });
    }
    
    return true;
});
