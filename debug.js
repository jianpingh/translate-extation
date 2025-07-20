// 测试页面 - 验证插件功能
console.log('=== 音频转文本插件调试 ===');

// 检查插件是否加载
if (typeof chrome !== 'undefined' && chrome.runtime) {
    console.log('✅ Chrome扩展API可用');
    
    // 测试发送消息到background script
    chrome.runtime.sendMessage({action: 'test'}, function(response) {
        if (chrome.runtime.lastError) {
            console.error('❌ 无法连接到background script:', chrome.runtime.lastError);
        } else {
            console.log('✅ 成功连接到background script');
        }
    });
} else {
    console.error('❌ Chrome扩展API不可用');
}

// 检查语音识别API
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
    console.log('✅ 语音识别API可用');
} else {
    console.error('❌ 语音识别API不可用');
}

// 检查麦克风权限
if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    console.log('✅ 媒体设备API可用');
} else {
    console.error('❌ 媒体设备API不可用');
}

// 定期检查content script是否正在运行
let checkCount = 0;
const checkInterval = setInterval(() => {
    checkCount++;
    console.log(`Content script运行检查 #${checkCount}`);
    
    if (checkCount >= 5) {
        clearInterval(checkInterval);
        console.log('Content script运行正常');
    }
}, 1000);
