import React, { useState, useEffect, useRef } from 'react';
import { Mic, Send, Trash2, Download, Share2, Copy, LogOut, Volume2 } from 'lucide-react';

// In-memory database
const db = {
  users: [],
  messages: [],
  currentUser: null
};

const generateVoxKey = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let key = 'VX-';
  for (let i = 0; i < 4; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
};

const VoxKey = () => {
  const [view, setView] = useState('landing');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [voxKey, setVoxKey] = useState('');
  const [messages, setMessages] = useState([]);
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [videoUrl, setVideoUrl] = useState(null);
  const [senderKey, setSenderKey] = useState('');
  
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);
  const canvasRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    if (db.currentUser) {
      loadMessages();
      const interval = setInterval(loadMessages, 1000);
      return () => clearInterval(interval);
    }
  }, [db.currentUser]);

  const loadMessages = () => {
    if (db.currentUser) {
      const userMessages = db.messages.filter(m => m.recipientKey === db.currentUser.voxKey);
      setMessages(userMessages.sort((a, b) => b.timestamp - a.timestamp));
    }
  };

  const handleSignup = () => {
    if (!email || !username || !password) return;
    const newKey = generateVoxKey();
    const user = { email, username, password, voxKey: newKey };
    db.users.push(user);
    db.currentUser = user;
    setVoxKey(newKey);
    setView('inbox');
  };

  const handleLogin = () => {
    if (!email || !password) return;
    const user = db.users.find(u => u.email === email && u.password === password);
    if (user) {
      db.currentUser = user;
      setVoxKey(user.voxKey);
      setView('inbox');
    }
  };

  const handleLogout = () => {
    db.currentUser = null;
    setView('landing');
    setEmail('');
    setPassword('');
    setMessages([]);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];
      
      mediaRecorder.current.ondataavailable = (e) => {
        audioChunks.current.push(e.data);
      };
      
      mediaRecorder.current.onstop = () => {
        const blob = new Blob(audioChunks.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorder.current.start();
      setRecording(true);
    } catch (err) {
      alert('Microphone access denied');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && recording) {
      mediaRecorder.current.stop();
      setRecording(false);
    }
  };

  const generateRobotVideo = async (audioBlob) => {
    setProcessing(true);
    
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    
    const audio = new Audio(URL.createObjectURL(audioBlob));
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaElementSource(audio);
    const analyser = audioContext.createAnalyser();
    const distortion = audioContext.createWaveShaper();
    const gainNode = audioContext.createGain();
    
    // Heavy distortion curve
    const makeDistortionCurve = (amount = 50) => {
      const samples = 44100;
      const curve = new Float32Array(samples);
      const deg = Math.PI / 180;
      for (let i = 0; i < samples; i++) {
        const x = (i * 2) / samples - 1;
        curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
      }
      return curve;
    };
    
    distortion.curve = makeDistortionCurve(100);
    analyser.fftSize = 256;
    
    source.connect(distortion);
    distortion.connect(gainNode);
    gainNode.connect(analyser);
    analyser.connect(audioContext.destination);
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const chunks = [];
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      setProcessing(false);
    };
    
    let frame = 0;
    const duration = await new Promise(resolve => {
      audio.onloadedmetadata = () => resolve(audio.duration);
    });
    
    const animate = () => {
      if (frame / 30 >= duration) {
        recorder.stop();
        audio.pause();
        return;
      }
      
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / bufferLength;
      const intensity = average / 255;
      
      // Background
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Grid
      ctx.strokeStyle = `rgba(0, 255, 255, ${0.1 + intensity * 0.2})`;
      ctx.lineWidth = 2;
      for (let i = 0; i < 10; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * 192);
        ctx.lineTo(canvas.width, i * 192);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(i * 108, 0);
        ctx.lineTo(i * 108, canvas.height);
        ctx.stroke();
      }
      
      // Robot head
      const headY = 600 + Math.sin(frame / 10) * 20;
      ctx.strokeStyle = '#00FFFF';
      ctx.fillStyle = `rgba(0, 255, 255, ${0.1 + intensity * 0.3})`;
      ctx.lineWidth = 4;
      
      // Head outline
      ctx.beginPath();
      ctx.roundRect(340, headY, 400, 500, 20);
      ctx.fill();
      ctx.stroke();
      
      // Eyes
      const eyeGlow = 100 + intensity * 155;
      ctx.fillStyle = `rgb(0, ${eyeGlow}, ${eyeGlow})`;
      ctx.beginPath();
      ctx.ellipse(440, headY + 150, 40, 50, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(640, headY + 150, 40, 50, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Mouth waveform
      ctx.strokeStyle = '#00FFFF';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < bufferLength; i++) {
        const x = 380 + (i / bufferLength) * 320;
        const y = headY + 350 + (dataArray[i] / 255) * 50 - 25;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      
      // Cipher text
      ctx.fillStyle = '#00FFFF';
      ctx.font = '20px monospace';
      const cipherText = Array(40).fill(0).map(() => 
        String.fromCharCode(33 + Math.floor(Math.random() * 94))
      ).join('');
      ctx.fillText(cipherText.slice(0, 20), 340, headY - 50);
      ctx.fillText(cipherText.slice(20), 340, headY - 20);
      
      // Progress bar
      const progress = frame / 30 / duration;
      ctx.fillStyle = '#00FFFF';
      ctx.fillRect(200, 1700, 680 * progress, 30);
      ctx.strokeStyle = '#00FFFF';
      ctx.lineWidth = 2;
      ctx.strokeRect(200, 1700, 680, 30);
      
      // Time
      ctx.fillStyle = '#00FFFF';
      ctx.font = '24px monospace';
      const currentTime = (frame / 30).toFixed(1);
      ctx.fillText(`${currentTime}s / ${duration.toFixed(1)}s`, 380, 1780);
      
      frame++;
      requestAnimationFrame(animate);
    };
    
    recorder.start();
    audio.play();
    animate();
  };

  const handleTransmit = () => {
    if (!videoUrl || !senderKey) return;
    
    const recipient = db.users.find(u => u.voxKey === senderKey.toUpperCase());
    if (!recipient) {
      alert('Invalid VoxKey');
      return;
    }
    
    const message = {
      id: Date.now(),
      recipientKey: senderKey.toUpperCase(),
      videoUrl,
      transcript: '[Voice message received]',
      timestamp: Date.now()
    };
    
    db.messages.push(message);
    alert('VoxCast transmitted! 🤖');
    setVideoUrl(null);
    setAudioBlob(null);
    setSenderKey('');
    setView('landing');
  };

  const deleteMessage = (id) => {
    db.messages = db.messages.filter(m => m.id !== id);
    loadMessages();
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`/key/${voxKey}`);
    alert('Link copied!');
  };

  if (view === 'landing') {
    return (
      <div className="min-h-screen bg-black text-cyan-400 font-mono flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center space-y-4">
            <h1 className="text-6xl font-bold tracking-wider animate-pulse">VOXKEY</h1>
            <p className="text-sm text-cyan-300">ANONYMOUS VOICE TRANSMISSION PROTOCOL</p>
            <div className="border-2 border-cyan-400 p-4 space-y-2">
              <p className="text-xs">► ZERO IDENTITY TRACE</p>
              <p className="text-xs">► ROBOT-ENCRYPTED AUDIO</p>
              <p className="text-xs">► INSTANT VIRAL SHARING</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="border-2 border-cyan-400 p-6 space-y-4">
              <h2 className="text-xl font-bold text-center">{db.currentUser ? 'SEND MESSAGE' : 'ACCESS TERMINAL'}</h2>
              
              {!db.currentUser ? (
                <>
                  <input
                    type="email"
                    placeholder="EMAIL"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-black border-2 border-cyan-400 p-3 text-cyan-400 placeholder-cyan-600 focus:outline-none focus:border-cyan-300"
                  />
                  {!db.users.find(u => u.email === email) && (
                    <input
                      type="text"
                      placeholder="USERNAME"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full bg-black border-2 border-cyan-400 p-3 text-cyan-400 placeholder-cyan-600 focus:outline-none focus:border-cyan-300"
                    />
                  )}
                  <input
                    type="password"
                    placeholder="PASSWORD"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-black border-2 border-cyan-400 p-3 text-cyan-400 placeholder-cyan-600 focus:outline-none focus:border-cyan-300"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSignup}
                      className="flex-1 bg-cyan-400 text-black p-3 font-bold hover:bg-cyan-300 transition-colors"
                    >
                      SIGN UP
                    </button>
                    <button
                      onClick={handleLogin}
                      className="flex-1 border-2 border-cyan-400 text-cyan-400 p-3 font-bold hover:bg-cyan-400 hover:text-black transition-colors"
                    >
                      LOGIN
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <input
                    type="text"
                    placeholder="RECIPIENT VOXKEY (VX-XXXX)"
                    value={senderKey}
                    onChange={(e) => setSenderKey(e.target.value)}
                    className="w-full bg-black border-2 border-cyan-400 p-3 text-cyan-400 placeholder-cyan-600 focus:outline-none focus:border-cyan-300 uppercase"
                  />
                  
                  {!audioBlob && !videoUrl && (
                    <button
                      onMouseDown={startRecording}
                      onMouseUp={stopRecording}
                      onTouchStart={startRecording}
                      onTouchEnd={stopRecording}
                      className={`w-full p-8 border-2 font-bold transition-all ${
                        recording 
                          ? 'bg-red-500 border-red-500 text-white animate-pulse' 
                          : 'border-cyan-400 text-cyan-400 hover:bg-cyan-400 hover:text-black'
                      }`}
                    >
                      <Mic className="w-12 h-12 mx-auto mb-2" />
                      {recording ? 'RECORDING...' : 'HOLD TO RECORD'}
                    </button>
                  )}
                  
                  {audioBlob && !videoUrl && !processing && (
                    <button
                      onClick={() => generateRobotVideo(audioBlob)}
                      className="w-full bg-cyan-400 text-black p-4 font-bold hover:bg-cyan-300 transition-colors"
                    >
                      GENERATE VOXCAST
                    </button>
                  )}
                  
                  {processing && (
                    <div className="text-center py-8 space-y-2">
                      <div className="text-2xl animate-pulse">PROCESSING...</div>
                      <div className="text-xs">APPLYING ROBOTIC DISTORTION</div>
                    </div>
                  )}
                  
                  {videoUrl && (
                    <div className="space-y-4">
                      <video
                        src={videoUrl}
                        controls
                        className="w-full border-2 border-cyan-400"
                      />
                      <button
                        onClick={handleTransmit}
                        className="w-full bg-cyan-400 text-black p-4 font-bold hover:bg-cyan-300 transition-colors flex items-center justify-center gap-2"
                      >
                        <Send className="w-5 h-5" />
                        TRANSMIT VOXCAST
                      </button>
                    </div>
                  )}
                  
                  <button
                    onClick={() => setView('inbox')}
                    className="w-full border-2 border-cyan-400 text-cyan-400 p-3 font-bold hover:bg-cyan-400 hover:text-black transition-colors"
                  >
                    VIEW INBOX
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'inbox') {
    return (
      <div className="min-h-screen bg-black text-cyan-400 font-mono p-4">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-between border-b-2 border-cyan-400 pb-4">
            <div>
              <h1 className="text-3xl font-bold">VOXKEY INBOX</h1>
              <p className="text-sm text-cyan-300">USER: {db.currentUser.username}</p>
            </div>
            <button
              onClick={handleLogout}
              className="border-2 border-cyan-400 text-cyan-400 p-2 hover:bg-cyan-400 hover:text-black transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
          
          <div className="border-2 border-cyan-400 p-4 space-y-2">
            <p className="text-sm">YOUR VOXKEY:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-cyan-400 text-black p-3 text-xl font-bold">
                voxkey.com/key/{voxKey}
              </code>
              <button
                onClick={copyLink}
                className="border-2 border-cyan-400 text-cyan-400 p-3 hover:bg-cyan-400 hover:text-black transition-colors"
              >
                <Copy className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          <div className="space-y-4">
            <h2 className="text-xl font-bold">RECEIVED TRANSMISSIONS: {messages.length}</h2>
            
            {messages.length === 0 ? (
              <div className="border-2 border-cyan-400 p-8 text-center space-y-2">
                <Volume2 className="w-16 h-16 mx-auto text-cyan-600" />
                <p className="text-cyan-600">NO MESSAGES YET</p>
                <p className="text-xs text-cyan-600">SHARE YOUR VOXKEY TO RECEIVE ANONYMOUS VOICE MESSAGES</p>
              </div>
            ) : (
              messages.map(msg => (
                <div key={msg.id} className="border-2 border-cyan-400 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-cyan-300">
                      {new Date(msg.timestamp).toLocaleString()}
                    </span>
                    <button
                      onClick={() => deleteMessage(msg.id)}
                      className="text-red-500 hover:text-red-400"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                  
                  <video
                    src={msg.videoUrl}
                    controls
                    className="w-full max-w-sm mx-auto border-2 border-cyan-400"
                  />
                  
                  <p className="text-sm text-cyan-300">{msg.transcript}</p>
                  
                  <div className="flex gap-2">
                    <a
                      href={msg.videoUrl}
                      download={`voxcast-${msg.id}.webm`}
                      className="flex-1 border-2 border-cyan-400 text-cyan-400 p-2 text-center hover:bg-cyan-400 hover:text-black transition-colors flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      DOWNLOAD
                    </a>
                    <button
                      onClick={() => navigator.share({ files: [new File([msg.videoUrl], 'voxcast.webm')] }).catch(() => {})}
                      className="flex-1 border-2 border-cyan-400 text-cyan-400 p-2 hover:bg-cyan-400 hover:text-black transition-colors flex items-center justify-center gap-2"
                    >
                      <Share2 className="w-4 h-4" />
                      SHARE
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          
          <button
            onClick={() => setView('landing')}
            className="w-full bg-cyan-400 text-black p-4 font-bold hover:bg-cyan-300 transition-colors"
          >
            SEND NEW MESSAGE
          </button>
        </div>
      </div>
    );
  }
};

export default VoxKey;
