import React, { useState, useRef, useEffect } from 'react';
import {
  Mic, Square, Download, Share2, Copy, CheckCircle,
  MessageSquare, LogOut, Inbox, Smartphone, Play, Pause, Trash2, Send, X, 
  Facebook, Twitter, Video, Disc
} from 'lucide-react';

// ------------------ Mock Auth & DB ------------------
const mockAuth = {
  currentUser: null,
  signIn: (email, password) => {
    const users = JSON.parse(localStorage.getItem('users') || '{}');
    const user = users[email];
    if (!user || user.password !== password) throw new Error('Invalid credentials');
    mockAuth.currentUser = { email: user.email, username: user.username, uid: user.uid };
    localStorage.setItem('user', JSON.stringify(mockAuth.currentUser));
    return Promise.resolve(mockAuth.currentUser);
  },
  signUp: (email, password, username) => {
    const users = JSON.parse(localStorage.getItem('users') || '{}');
    if (users[email]) throw new Error('Email already exists');
    if (Object.values(users).some(u => u.username === username)) throw new Error('Username taken');
    const newUser = { email, password, username, uid: Date.now().toString() };
    users[email] = newUser;
    localStorage.setItem('users', JSON.stringify(users));
    mockAuth.currentUser = { email, username: newUser.username, uid: newUser.uid };
    localStorage.setItem('user', JSON.stringify(mockAuth.currentUser));
    return Promise.resolve(mockAuth.currentUser);
  },
  signOut: () => { mockAuth.currentUser = null; localStorage.removeItem('user'); },
  init: () => { const u = localStorage.getItem('user');
    if (u) mockAuth.currentUser = JSON.parse(u); }
};

const mockDB = {
  saveMessage: (username, msg) => {
    const key = `messages_${username}`;
    const msgs = JSON.parse(localStorage.getItem(key) || '[]');
    msgs.unshift(msg); // Add new to top
    // Keep only last 5 messages to save storage space
    if (msgs.length > 5) msgs.pop(); 
    try {
      localStorage.setItem(key, JSON.stringify(msgs));
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        throw new Error('Storage full. Delete old messages.');
      }
      throw e;
    }
  },
  getMessages: (username) => JSON.parse(localStorage.getItem(`messages_${username}`) || '[]')
};

// ----------------------------- Helper utilities -----------------------------
const formatTime = s => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

// Convert Blob to Base64
const blobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const getSupportedMimeType = () => {
  const types = [
    'video/webm;codecs=vp8', 'video/webm', 'video/mp4'
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
};

// ------------------------------ Main App ------------------------------------
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('landing');
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [previewVideo, setPreviewVideo] = useState({ url: '', mimeType: '' });
  const [messages, setMessages] = useState([]);
  const [linkCopied, setLinkCopied] = useState(false);
  const [targetUsername, setTargetUsername] = useState('');
  
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [viewportHeight, setViewportHeight] = useState('100vh');
  
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const canvasRef = useRef(null);
  const audioUrlRef = useRef(null);
  const videoUrlRef = useRef(null);
  const audioContextRef = useRef(null);
  const previewAudioRef = useRef(null);

  // Constants
  const MAX_RECORDING_TIME = 15; // Limit to 15s to keep Base64 strings small

  useEffect(() => {
    const handleResize = () => setViewportHeight(`${window.innerHeight}px`);
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    mockAuth.init();
    if (mockAuth.currentUser) {
      setUser(mockAuth.currentUser);
      setMessages(mockDB.getMessages(mockAuth.currentUser.username));
      setView('dashboard');
    }
    return () => {
      clearInterval(timerRef.current);
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/u/')) {
      const username = path.split('/u/')[1]?.split('/')[0];
      if (username) {
        setTargetUsername(username);
        setView('record');
      }
    }
  }, []);

  // ----------------- Recording Logic -----------------
  const startRecording = async () => {
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
    if (previewVideo.url) { URL.revokeObjectURL(previewVideo.url); setPreviewVideo({ url: '', mimeType: '' }); }
    setAudioBlob(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true } 
      });
      
      audioChunksRef.current = [];
      const options = MediaRecorder.isTypeSupported('audio/webm') ? { mimeType: 'audio/webm' } : undefined;
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      
      recorder.ondataavailable = e => { if (e.data && e.data.size) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: options?.mimeType || 'audio/webm' });
        setAudioBlob(blob);
        audioUrlRef.current = URL.createObjectURL(blob);
        stream.getTracks().forEach(track => track.stop());
      };
      recorder.start();

      setIsRecording(true);
      setRecordingTime(0);
      
      // Auto-stop timer
      timerRef.current = setInterval(() => {
        setRecordingTime(t => {
          if (t >= MAX_RECORDING_TIME - 1) {
            stopRecording();
            return MAX_RECORDING_TIME;
          }
          return t + 1;
        });
      }, 1000);
    } catch (err) {
      alert('Microphone access required.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
    setIsRecording(false);
    clearInterval(timerRef.current);
  };

  const cancelRecording = () => {
    stopRecording();
    setAudioBlob(null);
    setRecordingTime(0);
  };

  // ----------------- Advanced Video & Robotic Audio -----------------
  const generatePreview = async () => {
    if (!audioBlob) return alert('No audio recorded.');
    setProcessing(true);
    setPreviewVideo({ url: '', mimeType: '' });
    
    const canvas = canvasRef.current;
    canvas.width = 640;  // Lower res for performance/storage
    canvas.height = 1136; // 9:16 aspect
    const ctx = canvas.getContext('2d', { alpha: false });
    
    if (audioContextRef.current) {
        try { await audioContextRef.current.close(); } catch(e) {}
    }

    let audioCtx, recorder;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      if (audioCtx.state === 'suspended') await audioCtx.resume();

      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      
      // --- ROBOTIC VOICE GRAPH ---
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      
      // 1. Ring Modulator (Oscillator x Audio = Robot)
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 30; // 30Hz flutter
      
      const ringGain = audioCtx.createGain();
      ringGain.gain.value = 0.0; // Carrier
      
      const dryGain = audioCtx.createGain();
      dryGain.gain.value = 0.5;
      
      const wetGain = audioCtx.createGain();
      wetGain.gain.value = 0.8;

      // 2. Metallic Delay
      const delay = audioCtx.createDelay();
      delay.delayTime.value = 0.02; // Short metallic slap
      const feedback = audioCtx.createGain();
      feedback.gain.value = 0.4;
      
      // Connections
      source.connect(dryGain);
      source.connect(wetGain);
      
      // Ring Mod chain
      const oscGain = audioCtx.createGain();
      oscGain.gain.value = 500; // Depth
      osc.connect(oscGain);
      oscGain.connect(wetGain.gain); // Modulate volume of source
      
      // Delay chain
      wetGain.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      
      const masterCompressor = audioCtx.createDynamicsCompressor();
      
      dryGain.connect(masterCompressor);
      delay.connect(masterCompressor);
      
      // Analyzer for visuals
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      masterCompressor.connect(analyser);
      masterCompressor.connect(audioCtx.destination);
      
      const dest = audioCtx.createMediaStreamDestination();
      masterCompressor.connect(dest);
      
      osc.start();
      source.start(0);

      // --- VISUALIZATION (CYBERPUNK) ---
      const canvasStream = canvas.captureStream(30);
      const combined = new MediaStream([ ...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks() ]);

      const recorderOptions = {
        mimeType: getSupportedMimeType(),
        videoBitsPerSecond: 1000000, // 1 Mbps
        audioBitsPerSecond: 64000
      };

      try { recorder = new MediaRecorder(combined, recorderOptions); } 
      catch (e) { recorder = new MediaRecorder(combined); }

      const videoChunks = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) videoChunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(videoChunks, { type: recorder.mimeType });
        if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
        const url = URL.createObjectURL(blob);
        videoUrlRef.current = url;
        setPreviewVideo({ url, mimeType: recorder.mimeType });
        setProcessing(false);
      };

      recorder.start();

      // --- ANIMATION LOOP ---
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const startTime = performance.now();
      const duration = audioBuffer.duration * 1000 + 500;
      
      // Matrix rain setup
      const drops = Array(Math.floor(canvas.width / 20)).fill(1);

      const drawFrame = (timestamp) => {
        const elapsed = timestamp - startTime;
        analyser.getByteFrequencyData(dataArray);
        
        // Dark background with slight trail for blur effect
        ctx.fillStyle = 'rgba(0, 10, 0, 0.3)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // 1. Matrix Digital Rain
        ctx.fillStyle = '#0F0';
        ctx.font = '16px monospace';
        for (let i = 0; i < drops.length; i++) {
          const text = String.fromCharCode(0x30A0 + Math.random() * 96);
          ctx.fillText(text, i * 20, drops[i] * 20);
          if (drops[i] * 20 > canvas.height && Math.random() > 0.975) drops[i] = 0;
          drops[i]++;
        }

        // 2. Central Pulse / Robot Eye
        const avg = dataArray.reduce((a,b)=>a+b) / bufferLength;
        const radius = 50 + (avg * 0.8);
        
        ctx.save();
        ctx.translate(canvas.width/2, canvas.height/2);
        
        // Glow
        ctx.shadowBlur = 20 + avg;
        ctx.shadowColor = '#00ff00';
        
        // Circle
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 5;
        ctx.stroke();
        
        // Waveform inside circle
        ctx.beginPath();
        ctx.moveTo(-radius, 0);
        for(let i=0; i<bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = (v * radius/2) * Math.sin(i);
            const x = (i/bufferLength) * (radius*2) - radius;
            ctx.lineTo(x, y);
        }
        ctx.stroke();
        
        ctx.restore();

        // 3. Text Overlay
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 30px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText("INCOMING TRANSMISSION", canvas.width/2, 200);
        
        if (elapsed < duration) {
          requestAnimationFrame(drawFrame);
        } else {
           if (recorder.state !== 'inactive') recorder.stop();
        }
      };
      
      requestAnimationFrame(drawFrame);

    } catch (error) {
      console.error(error);
      setProcessing(false);
      alert('Error generating. Please try again.');
    }
  };

  // ----------------- Persistent Storage -----------------
  const sendMessage = async () => {
    if (!previewVideo.url) return;
    const recipient = targetUsername || user?.username;
    
    try {
      setProcessing(true);
      const response = await fetch(previewVideo.url);
      const blob = await response.blob();
      const base64Data = await blobToBase64(blob); // Save as Base64

      mockDB.saveMessage(recipient, {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        videoUrl: base64Data, // Persist video data
        mimeType: previewVideo.mimeType
      });
      setProcessing(false);
      setView('success');
    } catch (err) {
      setProcessing(false);
      alert(err.message || 'Failed to send.');
    }
  };

  // ----------------- Sharing Actions -----------------
  const downloadVideo = async (url, mime) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `voiceanon_${Date.now()}.${mime.includes('mp4') ? 'mp4' : 'webm'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleNativeShare = async (url, mime) => {
    try {
        const blob = await fetch(url).then(r => r.blob());
        const file = new File([blob], "voice.webm", { type: mime });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], text: "Secret Voice Message" });
        } else {
            alert("Native sharing not supported. Use the Download button.");
        }
    } catch (e) { alert("Sharing failed."); }
  };

  // ------------------- VIEWS -------------------
  if (view === 'landing') {
    return (
      <div className="min-h-screen bg-black text-green-500 font-mono flex flex-col justify-center px-4 relative overflow-hidden" style={{minHeight: viewportHeight}}>
        {/* Matrix Background Effect */}
        <div className="absolute inset-0 opacity-20 pointer-events-none" 
             style={{backgroundImage: 'linear-gradient(0deg, transparent 24%, rgba(0, 255, 0, .3) 25%, rgba(0, 255, 0, .3) 26%, transparent 27%, transparent 74%, rgba(0, 255, 0, .3) 75%, rgba(0, 255, 0, .3) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(0, 255, 0, .3) 25%, rgba(0, 255, 0, .3) 26%, transparent 27%, transparent 74%, rgba(0, 255, 0, .3) 75%, rgba(0, 255, 0, .3) 76%, transparent 77%, transparent)', backgroundSize: '50px 50px'}}>
        </div>
        
        <div className="text-center z-10">
          <div className="w-20 h-20 mx-auto mb-6 bg-green-900/30 rounded-full flex items-center justify-center border border-green-500 animate-pulse">
             <Mic className="w-10 h-10 text-green-400" />
          </div>
          <h1 className="text-5xl font-black mb-2 text-white tracking-tighter" style={{textShadow: '0 0 10px #0f0'}}>VOICE_ANON</h1>
          <p className="text-sm text-green-400 mb-8 font-mono">ENCRYPTED. ANONYMOUS. ROBOTIC.</p>
          <div className="flex flex-col gap-4 max-w-xs mx-auto">
             <button onClick={() => setView('signin')} className="w-full py-4 border border-green-500 text-green-400 font-bold rounded hover:bg-green-900/50 transition">LOGIN TERMINAL</button>
             <button onClick={() => setView('signup')} className="w-full py-4 bg-green-600 text-black font-black rounded hover:bg-green-500 transition shadow-[0_0_15px_rgba(0,255,0,0.5)]">INITIATE IDENTITY</button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'signin' || view === 'signup') {
    const isIn = view === 'signin';
    const handleSubmit = (e) => {
      e.preventDefault();
      const p = isIn ? mockAuth.signIn(authEmail, authPassword) : mockAuth.signUp(authEmail, authPassword, authUsername);
      p.then(u => { setUser(u); setView('dashboard'); setMessages(mockDB.getMessages(u.username)); })
       .catch(e => alert(e.message));
    };
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4 font-mono" style={{minHeight: viewportHeight}}>
        <div className="w-full max-w-sm border border-green-800 p-6 rounded bg-gray-900/80 backdrop-blur">
          <h2 className="text-2xl text-green-500 mb-6 text-center glitch" data-text={isIn ? 'ACCESS' : 'CREATE'}>{isIn ? 'ACCESS_TERMINAL' : 'NEW_IDENTITY'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isIn && <input type="text" placeholder="CODENAME (USERNAME)" value={authUsername} onChange={e => setAuthUsername(e.target.value)} className="w-full p-4 bg-black border border-green-800 text-green-400 placeholder-green-900 outline-none focus:border-green-400" required />}
            <input type="email" placeholder="EMAIL" value={authEmail} onChange={e => setAuthEmail(e.target.value)} className="w-full p-4 bg-black border border-green-800 text-green-400 placeholder-green-900 outline-none focus:border-green-400" required />
            <input type="password" placeholder="PASSWORD" value={authPassword} onChange={e => setAuthPassword(e.target.value)} className="w-full p-4 bg-black border border-green-800 text-green-400 placeholder-green-900 outline-none focus:border-green-400" required />
            <button type="submit" className="w-full py-4 bg-green-700 text-black font-bold rounded hover:bg-green-600 uppercase">{isIn ? 'Decrypt & Enter' : 'Establish Link'}</button>
          </form>
          <button onClick={() => setView(isIn ? 'signup' : 'signin')} className="w-full mt-6 text-green-800 text-xs text-center hover:text-green-500">SWITCH PROTOCOL</button>
        </div>
      </div>
    );
  }

  if (view === 'dashboard') {
    return (
      <div className="min-h-screen bg-gray-900 text-white font-mono flex flex-col" style={{minHeight: viewportHeight}}>
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <h1 className="text-xl mb-6 text-green-500 font-bold tracking-widest">DASHBOARD_V1.0</h1>
          
          <div className="bg-black border border-green-600 p-6 rounded-lg w-full max-w-sm text-center mb-8 shadow-[0_0_20px_rgba(0,255,0,0.1)]">
            <p className="text-xs text-green-800 mb-2 font-bold uppercase">Your Anonymous Dropzone</p>
            <div className="bg-gray-900 p-3 rounded mb-4 border border-green-900 flex items-center justify-between">
                <code className="text-[10px] text-green-400 break-all">{window.location.origin}/u/{user?.username}</code>
            </div>
            <button onClick={copyLink} className="w-full py-3 bg-green-900/50 border border-green-600 text-green-400 rounded hover:bg-green-800 flex items-center justify-center gap-2">
              {linkCopied ? <CheckCircle size={16} /> : <Copy size={16} />} {linkCopied ? 'LINK COPIED' : 'COPY LINK'}
            </button>
          </div>
          
          <button onClick={() => { setMessages(mockDB.getMessages(user.username)); setView('inbox'); }} className="w-full max-w-sm py-4 bg-gray-800 text-white rounded flex items-center justify-center gap-2 mb-4 hover:bg-gray-700">
            <Inbox size={20} className="text-green-500" /> DECRYPT INBOX
          </button>
          
          <button onClick={() => { mockAuth.signOut(); setView('landing'); }} className="text-red-900 flex items-center gap-2 mt-8 text-sm hover:text-red-500">
            <LogOut size={16} /> TERMINATE SESSION
          </button>
        </div>
      </div>
    );
  }

  if (view === 'record') {
    return (
      <div className="bg-black flex flex-col relative font-sans overflow-hidden" style={{height: viewportHeight}}>
        <canvas ref={canvasRef} className="hidden" />
        
        {/* Header */}
        <div className="bg-gray-900 p-3 flex items-center gap-3 border-b border-green-900/30 z-10 shrink-0">
            <div className="w-8 h-8 rounded bg-green-900 flex items-center justify-center text-green-400 font-mono font-bold border border-green-500">
                {(targetUsername || user?.username || '?')[0].toUpperCase()}
            </div>
            <div>
                <h2 className="text-green-500 font-mono font-bold text-sm">TARGET: @{targetUsername || 'SELF'}</h2>
                <p className="text-[9px] text-gray-500 font-mono uppercase">Secure Line // {processing ? 'ENCODING...' : 'READY'}</p>
            </div>
            {!targetUsername && <button onClick={() => setView('dashboard')} className="ml-auto text-gray-500"><X /></button>}
        </div>

        {/* Viewfinder / Main Area */}
        <div className="flex-1 relative flex flex-col items-center justify-center p-4 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-900 to-black">
            
            {/* Grid Overlay */}
            <div className="absolute inset-0 pointer-events-none" style={{backgroundImage: 'linear-gradient(rgba(0, 255, 0, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 0, 0.1) 1px, transparent 1px)', backgroundSize: '40px 40px'}}></div>

            {previewVideo.url ? (
                <div className="relative w-full max-w-sm animate-fade-in z-20">
                    <div className="border-2 border-green-500 rounded bg-black shadow-[0_0_20px_rgba(0,255,0,0.3)] overflow-hidden relative">
                         <video src={previewVideo.url} controls playsInline className="w-full bg-black max-h-[60vh]" />
                         <div className="absolute top-2 right-2 text-[10px] text-green-500 font-mono bg-black/80 px-2 border border-green-500">PREVIEW_MODE</div>
                    </div>
                    
                    <div className="flex gap-2 mt-4">
                         <button onClick={() => { setPreviewVideo({url:'', mimeType:''}); setProcessing(false); }} className="p-3 bg-red-900/20 text-red-500 border border-red-900 rounded"><Trash2 /></button>
                         {processing ? (
                            <div className="flex-1 bg-green-900/20 border border-green-500 text-green-500 flex items-center justify-center font-mono animate-pulse">UPLOADING...</div>
                         ) : (
                            <button onClick={sendMessage} className="flex-1 bg-green-600 hover:bg-green-500 text-black font-bold py-3 rounded uppercase tracking-wider shadow-[0_0_15px_rgba(0,255,0,0.4)]">TRANSMIT</button>
                         )}
                    </div>
                </div>
            ) : processing ? (
                <div className="flex flex-col items-center justify-center z-20">
                    <div className="w-20 h-20 border-4 border-green-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p className="text-green-500 font-mono text-sm animate-pulse tracking-widest">RENDERING VISUALS...</p>
                </div>
            ) : audioBlob ? (
                 <div className="w-full max-w-sm z-20">
                     <div className="bg-gray-900 border border-green-800 p-6 rounded mb-6 text-center">
                         <div className="text-4xl text-white font-mono mb-2">{formatTime(recordingTime)}</div>
                         <div className="text-xs text-green-500 uppercase tracking-widest mb-4">Audio Captured</div>
                         <div className="flex justify-center gap-4">
                             <button onClick={cancelRecording} className="text-red-500 text-xs uppercase border-b border-red-900">Discard</button>
                             <button onClick={() => { 
                                 const audio = new Audio(audioUrlRef.current);
                                 audio.play();
                             }} className="text-green-400 text-xs uppercase border-b border-green-900">Review Audio</button>
                         </div>
                     </div>
                     <button onClick={generatePreview} className="w-full bg-green-600 text-black font-bold py-4 rounded uppercase tracking-wider shadow-[0_0_20px_rgba(0,255,0,0.4)] flex items-center justify-center gap-2">
                        <Smartphone size={20} /> GENERATE ROBOT VIDEO
                     </button>
                 </div>
            ) : (
                <div className="text-center z-20">
                    <div className={`w-32 h-32 rounded-full border-2 border-green-500 flex items-center justify-center mx-auto mb-6 transition-all duration-300 ${isRecording ? 'scale-110 shadow-[0_0_30px_#0f0] bg-green-900/20' : 'opacity-50'}`}>
                        <Mic className={`w-12 h-12 ${isRecording ? 'text-white animate-pulse' : 'text-green-500'}`} />
                    </div>
                    <p className="text-green-500 font-mono text-xs uppercase tracking-[0.2em]">{isRecording ? 'RECORDING VOICE DATA...' : 'TAP MIC TO RECORD'}</p>
                    {isRecording && <p className="text-red-500 font-mono mt-2">{MAX_RECORDING_TIME - recordingTime}s REMAINING</p>}
                </div>
            )}
        </div>

        {/* Footer Controls */}
        {!audioBlob && !processing && !previewVideo.url && (
            <div className="w-full bg-black border-t border-green-900 p-4 pb-8 flex items-center justify-center">
                <button 
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`w-16 h-16 rounded-full flex items-center justify-center border-2 transition-all duration-200 ${isRecording ? 'border-red-500 bg-red-900/50' : 'border-green-500 hover:bg-green-900/30'}`}
                >
                    {isRecording ? <Square className="fill-red-500 text-red-500 w-6 h-6" /> : <div className="w-4 h-4 rounded-full bg-green-500 shadow-[0_0_10px_#0f0]"></div>}
                </button>
            </div>
        )}
      </div>
    );
  }

  if (view === 'inbox' || view === 'success') {
    return (
      <div className="min-h-screen bg-gray-900 p-4 font-mono overflow-y-auto" style={{height: viewportHeight}}>
         {view === 'success' && (
           <div className="flex flex-col items-center justify-center h-full animate-fade-in">
             <div className="w-20 h-20 bg-green-900/30 rounded-full flex items-center justify-center mb-6 border border-green-500 shadow-[0_0_20px_#0f0]">
                <CheckCircle className="w-10 h-10 text-green-400" />
             </div>
             <h2 className="text-2xl text-white font-bold mb-2">TRANSMISSION SENT</h2>
             <p className="text-gray-500 text-xs mb-8">The recipient can now decrypt this message.</p>
             <button onClick={() => { setView('record'); setPreviewVideo({url:'', mimeType:''}); setAudioBlob(null); }} className="w-full max-w-xs py-3 bg-gray-800 text-green-500 rounded border border-green-900 mb-3">SEND ANOTHER</button>
             <button onClick={() => setView('dashboard')} className="text-gray-500 text-sm">RETURN TO BASE</button>
           </div>
         )}
         
         {view === 'inbox' && (
            <div className="pb-12 max-w-md mx-auto">
              <div className="flex items-center justify-between mb-6 sticky top-0 bg-gray-900/95 backdrop-blur py-4 z-10 border-b border-gray-800">
                <h2 className="text-xl text-green-500 font-bold uppercase tracking-widest">INBOX</h2>
                <button onClick={() => setView('dashboard')} className="text-white bg-gray-800 p-2 rounded-full"><X size={16}/></button>
              </div>
              
              {messages.length === 0 && (
                  <div className="text-center mt-20 opacity-50">
                      <Disc className="w-16 h-16 mx-auto mb-4 text-green-900" />
                      <p className="text-green-800">NO TRANSMISSIONS FOUND</p>
                  </div>
              )}

              {messages.map((m, i) => (
                <div key={m.id || i} className="bg-black border border-green-900/50 p-4 rounded-xl mb-6 shadow-lg">
                   {/* Video Player */}
                   <div className="aspect-[9/16] bg-gray-900 rounded-lg mb-4 overflow-hidden border border-gray-800 relative group">
                       <video 
                           src={m.videoUrl} 
                           controls 
                           playsInline 
                           className="w-full h-full object-cover" 
                        />
                   </div>

                   {/* Date Stamp */}
                   <div className="flex justify-between text-[10px] text-gray-500 mb-4 font-mono border-b border-gray-800 pb-2">
                      <span>ID: {m.id.slice(-6)}</span>
                      <span>{new Date(m.timestamp).toLocaleDateString()}</span>
                   </div>
                   
                   {/* Social Grid */}
                   <div className="grid grid-cols-4 gap-2">
                      {/* TikTok / General Download */}
                      <button onClick={() => downloadVideo(m.videoUrl, m.mimeType)} className="flex flex-col items-center gap-1 p-2 rounded hover:bg-gray-900 transition">
                         <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-white"><Download size={18} /></div>
                         <span className="text-[9px] text-gray-400">TikTok/DL</span>
                      </button>

                      {/* WhatsApp */}
                      <a href={`https://wa.me/?text=${encodeURIComponent("Check out this anonymous voice message: " + window.location.origin)}`} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 p-2 rounded hover:bg-gray-900 transition">
                         <div className="w-10 h-10 rounded-full bg-[#25D366] flex items-center justify-center text-black"><MessageSquare size={18} /></div>
                         <span className="text-[9px] text-gray-400">WhatsApp</span>
                      </a>

                      {/* Twitter / X */}
                      <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent("I just received a secure robotic transmission via VoiceAnon. " + window.location.origin)}`} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 p-2 rounded hover:bg-gray-900 transition">
                         <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-black"><Twitter size={18} /></div>
                         <span className="text-[9px] text-gray-400">Twitter/X</span>
                      </a>

                      {/* Facebook */}
                      <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.origin)}`} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 p-2 rounded hover:bg-gray-900 transition">
                         <div className="w-10 h-10 rounded-full bg-[#1877F2] flex items-center justify-center text-white"><Facebook size={18} /></div>
                         <span className="text-[9px] text-gray-400">Facebook</span>
                      </a>
                   </div>

                   <button onClick={() => handleNativeShare(m.videoUrl, m.mimeType)} className="w-full mt-4 py-2 bg-gray-900 text-green-500 text-xs rounded border border-green-900/30">
                       OPEN NATIVE SHARE MENU
                   </button>
                </div>
              ))}
            </div>
         )}
      </div>
    );
  }
}
