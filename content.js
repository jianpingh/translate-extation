// content.js - 内容脚本，运行在网页中
(function() {
    let recognition = null;
    let isRecording = false;
    let audioContext = null;
    let mediaStreamSource = null;
    
    console.log('Content script loaded');
    
    // 检查浏览器支持
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        console.error('该浏览器不支持语音识别API');
    } else {
        console.log('语音识别API可用');
    }
    
    // 监听来自popup的消息
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        console.log('Content script收到消息:', request);
        
        if (request.action === 'startTranscription') {
            console.log('开始转录请求，语言:', request.language);
            startTranscription(request.language)
                .then(() => {
                    console.log('转录启动成功');
                    sendResponse({success: true});
                })
                .catch(error => {
                    console.error('转录启动失败:', error);
                    sendResponse({success: false, error: error.message});
                });
            return true; // 保持消息通道开放
        } else if (request.action === 'stopTranscription') {
            console.log('停止转录请求');
            stopTranscription();
            sendResponse({success: true});
        } else if (request.action === 'getStatus') {
            sendResponse({isRecording: isRecording});
        }
    });
    
    // 开始转录
    async function startTranscription(language = 'zh-CN') {
        console.log('startTranscription called with language:', language);
        
        try {
            // 检查浏览器支持
            if (!SpeechRecognition) {
                throw new Error('浏览器不支持语音识别');
            }
            
            // 停止之前的转录
            if (recognition) {
                recognition.stop();
                recognition = null;
            }
            
            // 请求麦克风权限
            try {
                await navigator.mediaDevices.getUserMedia({ audio: true });
                console.log('麦克风权限已获得');
            } catch (error) {
                throw new Error('无法获得麦克风权限: ' + error.message);
            }
            
            // 创建语音识别实例
            recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = language;
            recognition.maxAlternatives = 1;
            
            console.log('语音识别实例已创建');
            
            // 监听识别结果
            recognition.onresult = function(event) {
                console.log('识别结果事件触发');
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
                
                // 显示临时结果
                if (interimTranscript) {
                    console.log('临时转录:', interimTranscript);
                    updateInterimTranscript(interimTranscript);
                }
                
                // 发送最终结果到popup
                if (finalTranscript) {
                    console.log('发送转录文本:', finalTranscript);
                    
                    // 发送到popup（如果打开）
                    chrome.runtime.sendMessage({
                        action: 'transcriptUpdate',
                        text: finalTranscript,
                        isFinal: true
                    });
                    
                    // 同时在页面上显示
                    showTranscriptOnPage(finalTranscript);
                }
            };
            
            // 监听开始事件
            recognition.onstart = function() {
                console.log('语音识别已开始');
                isRecording = true;
            };
            
            // 监听错误
            recognition.onerror = function(event) {
                console.error('语音识别错误:', event.error);
                let errorMessage = '未知错误';
                
                switch(event.error) {
                    case 'no-speech':
                        errorMessage = '未检测到语音';
                        break;
                    case 'audio-capture':
                        errorMessage = '无法捕获音频';
                        break;
                    case 'not-allowed':
                        errorMessage = '麦克风权限被拒绝';
                        break;
                    case 'network':
                        errorMessage = '网络错误';
                        break;
                    case 'service-not-allowed':
                        errorMessage = '语音服务不可用';
                        break;
                    default:
                        errorMessage = event.error;
                }
                
                chrome.runtime.sendMessage({
                    action: 'transcriptionError',
                    error: errorMessage
                });
            };
            
            // 监听结束事件
            recognition.onend = function() {
                console.log('语音识别结束');
                if (isRecording) {
                    // 如果还在录制状态，自动重启识别
                    setTimeout(() => {
                        if (isRecording && recognition) {
                            try {
                                console.log('自动重启语音识别');
                                recognition.start();
                            } catch (e) {
                                console.error('重启识别失败:', e);
                            }
                        }
                    }, 100);
                } else {
                    chrome.runtime.sendMessage({
                        action: 'transcriptionEnded'
                    });
                }
            };
            
            // 开始识别
            console.log('启动语音识别');
            recognition.start();
            
        } catch (error) {
            console.error('启动转录失败:', error);
            throw error;
        }
    }
    
    // 在页面上显示转录文本
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
        
        interimElement.textContent = '正在识别: ' + text;
    }
    
    function showTranscriptOnPage(text) {
        // 创建或更新显示覆盖层
        if (!transcriptOverlay) {
            createTranscriptOverlay();
        }
        
        // 清除临时显示
        if (interimElement) {
            interimElement.remove();
            interimElement = null;
        }
        
        // 添加新的转录文本
        const now = new Date().toLocaleTimeString();
        const textElement = document.createElement('div');
        textElement.className = 'transcript-item';
        textElement.innerHTML = `
            <div class="transcript-timestamp">${now}</div>
            <div class="transcript-text">${text}</div>
        `;
        
        const content = transcriptOverlay.querySelector('.transcript-content');
        content.appendChild(textElement);
        
        // 滚动到底部
        content.scrollTop = content.scrollHeight;
        
        // 限制显示的条目数量
        const items = content.querySelectorAll('.transcript-item');
        if (items.length > 10) {
            items[0].remove();
        }
    }
    
    function createTranscriptOverlay() {
        transcriptOverlay = document.createElement('div');
        transcriptOverlay.className = 'transcript-overlay active';
        transcriptOverlay.innerHTML = `
            <div class="transcript-header">
                🎵 实时转录
                <button class="transcript-close">×</button>
            </div>
            <div class="transcript-content"></div>
        `;
        
        // 添加关闭按钮事件
        const closeBtn = transcriptOverlay.querySelector('.transcript-close');
        closeBtn.addEventListener('click', function() {
            if (transcriptOverlay) {
                transcriptOverlay.remove();
                transcriptOverlay = null;
            }
        });
        
        document.body.appendChild(transcriptOverlay);
    }
    
    // 停止转录
    function stopTranscription() {
        console.log('停止转录');
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
        
        // 隐藏页面上的转录显示
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
