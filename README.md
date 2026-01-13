# GangNet2 - WebRTC Voice Conferencing

A modern, mobile-first voice conferencing web solution built with WebRTC, Node.js, and vanilla JavaScript. Features multi-channel audio support with individual volume controls and flexible transmit modes.

## Quick Start

Get the application running in under 2 minutes:

```bash
# 1. Clone the repository
git clone https://github.com/mpettit90/gangnet2.git
cd gangnet2

# 2. Install dependencies
npm install

# 3. Start the server
npm start

# 4. Open your browser to http://localhost:3000
```

The server will start on port 3000. Open the URL in your browser, grant microphone access when prompted, and you're ready to start voice conferencing!

**Note**: For production deployment, configure CORS origins using the `ALLOWED_ORIGINS` environment variable:
```bash
ALLOWED_ORIGINS="https://yourdomain.com" npm start
```

## Features

- **Multi-Channel Audio**: Listen to multiple channels simultaneously with independent volume controls
- **Flexible Transmit Modes**: 
  - Push-to-Talk (PTT): Hold button to transmit
  - Latch Mode: Click to toggle transmission on/off
- **Per-Channel Controls**: Individual volume sliders and transmit selectors for each channel
- **Modern Dark Theme**: Clean, mobile-optimized UI with dark theme
- **WebRTC Audio**: Low-latency peer-to-peer audio communication
- **Server-Side Channel Configuration**: Channels defined and managed by the server
- **Responsive Design**: Optimized for mobile devices, tablets, and desktop

## Technology Stack

- **Backend**: Node.js, Express, Socket.IO
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **WebRTC**: Peer-to-peer audio streaming
- **Web Audio API**: Per-channel volume control

## Architecture

### Server Components
- **Express Server**: Serves static files and provides REST API
- **Socket.IO**: WebRTC signaling and real-time communication
- **Channel API**: Returns channel configuration to clients

### Client Components
- **VoiceConferenceClient**: Main client class managing state and connections
- **WebRTC Manager**: Handles peer connections, offers/answers, ICE candidates
- **Audio Manager**: Controls local/remote streams and volume
- **UI Controller**: Manages user interactions and visual feedback

## Installation

### Prerequisites
- Node.js 16.0.0 or higher
- Modern web browser with WebRTC support (Chrome, Firefox, Safari, Edge)

### Setup

1. Clone the repository:
```bash
git clone https://github.com/mpettit90/gangnet2.git
cd gangnet2
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

4. Open your browser and navigate to:
```
http://localhost:3000
```

## Usage

### Getting Started

1. **Grant Microphone Access**: When prompted, allow the application to access your microphone
2. **Connect to Server**: The application automatically connects to the server
3. **Select Channels**: Toggle switches to enable listening on desired channels
4. **Enable Transmit**: Check "TX" boxes for channels you want to transmit to
5. **Choose Transmit Mode**:
   - **Push-to-Talk**: Hold the button down to talk
   - **Latch**: Click once to start talking, click again to stop

### Channel Controls

Each channel has three controls:
- **Toggle Switch**: Enable/disable listening to this channel
- **TX Checkbox**: Enable/disable transmitting to this channel
- **Volume Slider**: Adjust volume for audio received on this channel (0-100%)

### Transmit Modes

**Push-to-Talk (PTT)**
- Hold the green button to transmit
- Release to stop transmitting
- Works with mouse/touch events
- Visual feedback when transmitting

**Latch Mode**
- Click once to start transmitting
- Click again to stop transmitting
- Button turns red while transmitting

## Configuration

### Server Configuration

Edit `server/index.js` to customize:

**Port**: Change the `PORT` environment variable or default:
```javascript
const PORT = process.env.PORT || 3000;
```

**CORS Origins**: Set allowed origins for production (defaults to localhost):
```bash
ALLOWED_ORIGINS="https://yourdomain.com" npm start
```

**Channels**: Modify the channels array:
```javascript
const channels = [
  { id: 'channel-1', name: 'Main', color: '#4CAF50' },
  { id: 'channel-2', name: 'Tactical', color: '#2196F3' },
  // Add more channels...
];
```

### Client Configuration

Edit `public/js/app.js` to customize:

**ICE Servers**: Modify STUN/TURN servers:
```javascript
this.iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    // Add TURN servers for better connectivity...
  ]
};
```

**Audio Constraints**: Adjust microphone settings:
```javascript
audio: {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true
}
```

## API Documentation

### REST API

#### GET `/api/channels`
Returns the list of available channels.

**Response**:
```json
{
  "channels": [
    {
      "id": "channel-1",
      "name": "Main",
      "color": "#4CAF50"
    }
  ]
}
```

### Socket.IO Events

#### Client → Server

- `join-channel`: Join a channel for listening
- `leave-channel`: Leave a channel
- `transmit-start`: Start transmitting to a channel
- `transmit-stop`: Stop transmitting to a channel
- `request-channel-users`: Request list of users in a channel
- `webrtc-offer`: Send WebRTC offer
- `webrtc-answer`: Send WebRTC answer
- `webrtc-ice-candidate`: Send ICE candidate

#### Server → Client

- `init`: Initial user data and channel list
- `user-joined-channel`: Another user joined a channel
- `user-left-channel`: User left a channel
- `user-disconnected`: User disconnected
- `user-transmitting`: User started/stopped transmitting
- `channel-users`: List of users in a channel
- `webrtc-offer`: Received WebRTC offer
- `webrtc-answer`: Received WebRTC answer
- `webrtc-ice-candidate`: Received ICE candidate

## Browser Support

- Chrome 74+
- Firefox 66+
- Safari 12.1+
- Edge 79+

## Security Considerations

- Microphone access requires user permission
- WebRTC connections use DTLS-SRTP for encryption
- Signaling server should use HTTPS/WSS in production
- Consider implementing authentication and authorization
- Use TURN servers for NAT traversal in production

## Performance

- Peer-to-peer architecture minimizes server load
- Audio tracks disabled when not transmitting
- Individual volume controls use Web Audio API gain nodes
- Efficient Socket.IO event handling

## Development

### Project Structure
```
gangnet2/
├── server/
│   └── index.js          # Node.js server with Socket.IO
├── public/
│   ├── index.html        # Main HTML page
│   ├── css/
│   │   └── style.css     # Styles (mobile-first, dark theme)
│   └── js/
│       └── app.js        # Client-side application logic
├── package.json          # Dependencies and scripts
└── README.md            # Documentation
```

### Future Enhancements

- [ ] User authentication and channel access control
- [ ] Recording functionality
- [ ] Text chat alongside voice
- [ ] Screen sharing capability
- [ ] Admin panel for channel management
- [ ] User presence indicators
- [ ] Mute/unmute remote users
- [ ] Audio level indicators
- [ ] Connection quality indicators
- [ ] Mobile app versions (React Native, etc.)

## Troubleshooting

**Microphone not working**
- Check browser permissions
- Ensure HTTPS is used (required for getUserMedia in most browsers)
- Try a different browser

**No audio from other users**
- Check that channels are enabled (toggle switches)
- Verify volume sliders are not at 0
- Check browser console for WebRTC errors
- Ensure other users have their TX enabled and are transmitting

**Connection issues**
- Verify server is running
- Check firewall settings
- May need TURN servers for restrictive networks

## License

MIT License - See LICENSE file for details

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please open an issue on GitHub.
