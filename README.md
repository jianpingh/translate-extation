# Audio-to-Text Assistant Chrome Extension

A powerful Chrome browser extension that can convert audio from online videos and meetings into text in real-time.

## Features

🎵 **Real-time Speech-to-Text** - Supports real-time conversion of audio to text
🌍 **Multi-language Support** - Supports Chinese, English, Japanese, Korean and other languages
📹 **Video Platform Support** - Supports mainstream video platforms like YouTube, Bilibili, Youku, etc.
💼 **Meeting Platform Support** - Supports online meeting platforms like Google Meet, Zoom, Teams, etc.
💾 **Auto-save** - Automatically saves transcribed text with history viewing support
🎨 **Beautiful Interface** - Clean and user-friendly interface with dark theme support

## Supported Websites

### Video Platforms

- YouTube
- Bilibili
- Youku
- iQiyi
- Netflix
- Vimeo

### Meeting Platforms

- Google Meet
- Zoom
- Microsoft Teams
- Cisco Webex
- Discord
- Slack
- Whereby
- Jitsi Meet
- BigBlueButton

## Installation

1. Download or clone this project to your local machine
2. Open Chrome browser and navigate to the extensions management page (`chrome://extensions/`)
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the project folder
6. Extension installation complete

## Usage

1. **Basic Usage**
   - Click the extension icon in the browser toolbar
   - Select transcription language
   - Click the "Start Transcription" button
   - Browser will request microphone permission, click "Allow"
   - Start playing videos or join meetings, the extension will automatically transcribe audio

2. **Language Settings**
   - Select appropriate language in the popup window
   - Supports: Simplified Chinese, Traditional Chinese, English, Japanese, Korean, etc.

3. **View Transcribed Text**
   - Transcribed text will be displayed in real-time in the extension window
   - Each text entry includes a timestamp
   - Click "Clear Text" to clear current content

4. **Stop Transcription**
   - Click "Stop Transcription" button to end transcription
   - Transcribed text will be automatically saved

## Permissions

This extension requires the following permissions:

- **Microphone Access Permission** - Used to capture audio for speech recognition
- **Tab Access Permission** - Used to inject transcription functionality into web pages
- **Storage Permission** - Used to save settings and transcription history

## Technical Implementation

- Uses Web Speech API for speech recognition
- Supports continuous recognition and real-time results
- Injects page functionality through Content Script
- Uses Chrome Extension API for cross-page communication

## File Structure

```text
translate-extation/
├── manifest.json          # Extension manifest file
├── popup.html             # Popup window HTML
├── popup.js               # Popup window script
├── content.js             # Content script
├── background.js          # Background script
├── injected.js            # Injected page script
├── styles.css             # Style file
├── icons/                 # Icons folder
└── README.md              # Documentation
```

## FAQ

### Q: Why can't audio be recognized?

A: Please ensure:

1. Browser has granted microphone permission
2. The website supports audio capture
3. Audio devices are working properly

### Q: What to do if recognition accuracy is low?

A: Suggestions:

1. Ensure audio is clear and reduce background noise
2. Select the correct language setting
3. Speak at moderate speed with clear pronunciation

### Q: Does it support offline use?

A: This extension uses the browser's built-in speech recognition API and requires an internet connection to work.

## Development Guide

### Requirements

- Chrome 88+ browser
- Extension format that supports Manifest V3

### Development Mode

1. After modifying code, click "Reload" on the extensions management page
2. Use browser developer tools for debugging

### Code Structure

- `manifest.json` - Defines extension configuration and permissions
- `popup.*` - User interface related files
- `content.js` - Page content script, responsible for audio capture and recognition
- `background.js` - Background service, handles extension lifecycle
- `injected.js` - Script injected into pages, used to monitor media elements

## Changelog

### v1.0.0 (2025-07-20)

- Initial release
- Basic speech-to-text functionality support
- Multi-language recognition support
- Support for mainstream video and meeting platforms
- Auto-save transcription history

## License

MIT License

## Contributing

Welcome to submit Issues and Pull Requests to improve this project!

## Contact

If you have questions or suggestions, please contact us through GitHub Issues.
