// popup.js - 弹出窗口脚本
document.addEventListener('DOMContentLoaded', function() {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const status = document.getElementById('status');
    const transcript = document.getElementById('transcript');
    const clearBtn = document.getElementById('clearBtn');
    const languageSelect = document.getElementById('languageSelect');
    
    let isRecording = false;
    
    // 加载保存的设置
    chrome.storage.sync.get(['language', 'transcript'], function(result) {
        if (result.language) {
            languageSelect.value = result.language;
        }
        if (result.transcript) {
            transcript.innerHTML = result.transcript;
        }
    });
    
    // 监听语言选择变化
    languageSelect.addEventListener('change', function() {
        chrome.storage.sync.set({language: languageSelect.value});
    });
    
    // 开始转录
    startBtn.addEventListener('click', async function() {
        console.log('开始转录按钮被点击');
        try {
            const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
            console.log('当前标签页:', tab);
            
            // 发送消息给content script开始转录
            chrome.tabs.sendMessage(tab.id, {
                action: 'startTranscription',
                language: languageSelect.value
            }, function(response) {
                console.log('收到content script响应:', response);
                
                if (chrome.runtime.lastError) {
                    console.error('Chrome runtime错误:', chrome.runtime.lastError);
                    updateStatus('错误: 无法连接到页面，请刷新页面重试', false);
                    return;
                }
                
                if (response && response.success) {
                    isRecording = true;
                    updateUI();
                    updateStatus('正在转录...', true);
                } else {
                    updateStatus('启动失败: ' + (response?.error || '未知错误'), false);
                }
            });
        } catch (error) {
            console.error('Start transcription error:', error);
            updateStatus('启动失败: ' + error.message, false);
        }
    });
    
    // 停止转录
    stopBtn.addEventListener('click', async function() {
        try {
            const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
            
            chrome.tabs.sendMessage(tab.id, {action: 'stopTranscription'}, function(response) {
                if (response && response.success) {
                    isRecording = false;
                    updateUI();
                    updateStatus('已停止', false);
                }
            });
        } catch (error) {
            console.error('Stop transcription error:', error);
        }
    });
    
    // 清空文本
    clearBtn.addEventListener('click', function() {
        transcript.innerHTML = '<div style="color: #999; text-align: center; margin-top: 80px;">点击"开始转录"按钮开始捕获音频...</div>';
        chrome.storage.sync.remove('transcript');
    });
    
    // 更新UI状态
    function updateUI() {
        startBtn.disabled = isRecording;
        stopBtn.disabled = !isRecording;
    }
    
    // 更新状态显示
    function updateStatus(message, active) {
        status.textContent = '状态: ' + message;
        status.className = 'status ' + (active ? 'active' : 'inactive');
    }
    
    // 监听来自content script的消息
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        console.log('Popup收到消息:', request);
        
        if (request.action === 'transcriptUpdate') {
            console.log('更新转录文本:', request.text);
            // 更新转录文本
            const now = new Date().toLocaleTimeString();
            const newText = `<div style="margin-bottom: 10px;"><span style="color: #666; font-size: 10px;">[${now}]</span> ${request.text}</div>`;
            
            if (transcript.innerHTML.includes('点击"开始转录"')) {
                transcript.innerHTML = newText;
            } else {
                transcript.innerHTML += newText;
            }
            
            // 滚动到底部
            transcript.scrollTop = transcript.scrollHeight;
            
            // 保存到存储
            chrome.storage.sync.set({transcript: transcript.innerHTML});
        } else if (request.action === 'transcriptionError') {
            console.log('转录错误:', request.error);
            updateStatus('错误: ' + request.error, false);
            isRecording = false;
            updateUI();
        } else if (request.action === 'transcriptionEnded') {
            console.log('转录结束');
            updateStatus('转录已结束', false);
            isRecording = false;
            updateUI();
        }
    });
    
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
