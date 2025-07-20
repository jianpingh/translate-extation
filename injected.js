// injected.js - 注入到页面中的脚本，用于更好地访问页面音频
(function() {
    'use strict';
    
    // 监听页面中的音频/视频元素
    let capturedStream = null;
    
    // 重写 getUserMedia 以捕获音频流
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = function(constraints) {
        return originalGetUserMedia(constraints).then(stream => {
            if (constraints.audio) {
                capturedStream = stream;
                // 通知content script有新的音频流
                window.postMessage({
                    type: 'AUDIO_STREAM_CAPTURED',
                    streamId: stream.id
                }, '*');
            }
            return stream;
        });
    };
    
    // 监听 WebRTC 连接
    const originalCreateOffer = RTCPeerConnection.prototype.createOffer;
    const originalCreateAnswer = RTCPeerConnection.prototype.createAnswer;
    const originalAddStream = RTCPeerConnection.prototype.addStream;
    
    RTCPeerConnection.prototype.createOffer = function(...args) {
        console.log('WebRTC: createOffer called');
        return originalCreateOffer.apply(this, args);
    };
    
    RTCPeerConnection.prototype.createAnswer = function(...args) {
        console.log('WebRTC: createAnswer called');
        return originalCreateAnswer.apply(this, args);
    };
    
    if (originalAddStream) {
        RTCPeerConnection.prototype.addStream = function(stream) {
            console.log('WebRTC: addStream called', stream);
            window.postMessage({
                type: 'WEBRTC_STREAM_ADDED',
                streamId: stream.id
            }, '*');
            return originalAddStream.call(this, stream);
        };
    }
    
    // 监听音频/视频元素的变化
    function monitorAudioVideo() {
        const elements = document.querySelectorAll('video, audio');
        elements.forEach(element => {
            if (!element.hasAttribute('data-audio-monitored')) {
                element.setAttribute('data-audio-monitored', 'true');
                
                // 监听播放事件
                element.addEventListener('play', function() {
                    window.postMessage({
                        type: 'MEDIA_ELEMENT_PLAY',
                        src: element.src || element.currentSrc,
                        type: element.tagName.toLowerCase()
                    }, '*');
                });
                
                // 监听音量变化
                element.addEventListener('volumechange', function() {
                    window.postMessage({
                        type: 'MEDIA_VOLUME_CHANGE',
                        volume: element.volume,
                        muted: element.muted
                    }, '*');
                });
            }
        });
    }
    
    // 监听 Web Audio API
    const originalCreateMediaElementSource = (AudioContext.prototype.createMediaElementSource || function() {}).bind(AudioContext.prototype);
    const originalCreateMediaStreamSource = (AudioContext.prototype.createMediaStreamSource || function() {}).bind(AudioContext.prototype);
    
    if (AudioContext.prototype.createMediaElementSource) {
        AudioContext.prototype.createMediaElementSource = function(element) {
            console.log('Web Audio: createMediaElementSource called', element);
            window.postMessage({
                type: 'WEB_AUDIO_ELEMENT_SOURCE',
                elementType: element.tagName.toLowerCase()
            }, '*');
            return originalCreateMediaElementSource.call(this, element);
        };
    }
    
    if (AudioContext.prototype.createMediaStreamSource) {
        AudioContext.prototype.createMediaStreamSource = function(stream) {
            console.log('Web Audio: createMediaStreamSource called', stream);
            window.postMessage({
                type: 'WEB_AUDIO_STREAM_SOURCE',
                streamId: stream.id
            }, '*');
            return originalCreateMediaStreamSource.call(this, stream);
        };
    }
    
    // 定期检查新的媒体元素
    setInterval(monitorAudioVideo, 1000);
    
    // 初始检查
    monitorAudioVideo();
    
    // 检测常见的会议网站
    function detectMeetingPlatform() {
        const hostname = window.location.hostname.toLowerCase();
        const platforms = {
            'meet.google.com': 'Google Meet',
            'zoom.us': 'Zoom',
            'teams.microsoft.com': 'Microsoft Teams',
            'webex.com': 'Cisco Webex',
            'discord.com': 'Discord',
            'slack.com': 'Slack',
            'whereby.com': 'Whereby',
            'jitsi.org': 'Jitsi Meet',
            'bigbluebutton.org': 'BigBlueButton'
        };
        
        for (const domain in platforms) {
            if (hostname.includes(domain)) {
                window.postMessage({
                    type: 'MEETING_PLATFORM_DETECTED',
                    platform: platforms[domain],
                    url: window.location.href
                }, '*');
                return platforms[domain];
            }
        }
        
        // 检测视频网站
        const videoSites = {
            'youtube.com': 'YouTube',
            'bilibili.com': 'Bilibili',
            'youku.com': 'Youku',
            'iqiyi.com': 'iQiyi',
            'netflix.com': 'Netflix',
            'vimeo.com': 'Vimeo'
        };
        
        for (const domain in videoSites) {
            if (hostname.includes(domain)) {
                window.postMessage({
                    type: 'VIDEO_PLATFORM_DETECTED',
                    platform: videoSites[domain],
                    url: window.location.href
                }, '*');
                return videoSites[domain];
            }
        }
        
        return null;
    }
    
    // 检测平台
    const platform = detectMeetingPlatform();
    if (platform) {
        console.log('检测到平台:', platform);
    }
    
    // 向content script发送页面信息
    window.postMessage({
        type: 'PAGE_INFO',
        url: window.location.href,
        title: document.title,
        platform: platform
    }, '*');
    
})();
