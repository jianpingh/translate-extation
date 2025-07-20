// background.js - 服务工作者脚本
console.log('音频转文本助手 - 后台脚本已加载');

// 监听插件安装
chrome.runtime.onInstalled.addListener((details) => {
    console.log('插件安装事件:', details.reason);
    
    if (details.reason === 'install') {
        // 设置默认配置
        chrome.storage.sync.set({
            language: 'zh-CN',
            autoStart: false,
            saveTranscripts: true
        }).catch(err => console.error('设置默认配置失败:', err));
    }
});

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
        if (request.action === 'transcriptUpdate') {
            console.log('收到转录文本:', request.text);
            // 保存转录历史
            saveTranscriptHistory(request.text, sender.tab?.url || '');
        } else if (request.action === 'transcriptionError') {
            console.error('转录错误:', request.error);
        }
    } catch (error) {
        console.error('处理消息时出错:', error);
    }
    
    // 返回true保持消息通道开放
    return true;
});

// 保存转录历史
async function saveTranscriptHistory(text, url) {
    if (!text) return;
    
    try {
        const timestamp = new Date().toISOString();
        const entry = {
            text: text,
            url: url,
            timestamp: timestamp
        };
        
        const result = await chrome.storage.local.get(['transcriptHistory']);
        const history = result.transcriptHistory || [];
        history.push(entry);
        
        // 只保留最近50条记录
        if (history.length > 50) {
            history.splice(0, history.length - 50);
        }
        
        await chrome.storage.local.set({transcriptHistory: history});
    } catch (error) {
        console.error('保存转录历史失败:', error);
    }
}
