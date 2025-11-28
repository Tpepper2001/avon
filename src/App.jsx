import React, { useState, useRef, useEffect } from 'react';
import {
  Mic, Square, Download, Share2, Copy, CheckCircle,
  MessageSquare, LogOut, Inbox, Smartphone, Play, Pause, Trash2, Send, X, Video
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
    msgs.push(msg);
    localStorage.setItem(key, JSON.stringify(msgs));
  },
  getMessages: (username) => JSON.parse(localStorage.getItem(`messages_${username}`) || '[]')
};

// ----------------------------- Helper utilities -----------------------------
const formatTime = s => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

function wrapTextByWords(text, maxCharsPerLine = 16) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';
  for (const w of words) {
    if ((current + ' ' + w).trim().length <= maxCharsPerLine) {
      current = (current + ' ' + w).trim();
    } else {
      if (current) lines.push(current);
      if (w.length > maxCharsPerLine) {
        for (let i = 0; i < w.length; i += maxCharsPerLine) {
          lines.push(w.slice(i, i + maxCharsPerLine));
        }
        current = '';
      } else {
        current = w;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Optimized for Mobile compatibility
const getSupportedMimeType = () => {
  const types = [
    'video/mp4', // iOS 14.8+ supports this in MediaRecorder
    'video/webm;codecs=vp8', // Android Standard
    'video/webm',
    'video/mp4;codecs=h264', // iOS Preferred
    'video/mp4;codecs=avc1'
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return ''; // Let browser choose default
};

// ------------------------------ Main App ------------------------------------
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('landing');
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [transcript, setTranscript] = useState('');
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
  const recognitionRef = useRef(null);
  const audioUrlRef = useRef(null);
  const videoUrlRef = useRef(null);
  const audioContextRef = useRef(null);
  const previewAudioRef = useRef(null);

  // Mobile Viewport Hack
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
      if (recognitionRef.current) try { recognitionRef.current.stop(); } catch (e) {}
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
      // Constraints for mobile compatibility
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true, 
          noiseSuppression: true,
          sampleRate: 44100 
        } 
      });
      
      audioChunksRef.current = [];
      setTranscript('');

      // Prefer standard webm for audio recording container
      const options = MediaRecorder.isTypeSupported('audio/webm') ? { mimeType: 'audio/webm' } : undefined;
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      
      recorder.ondataavailable = e => { if (e.data && e.data.size) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: options?.mimeType || 'audio/webm' });
        setAudioBlob(blob);
        audioUrlRef.current = URL.createObjectURL(blob);
        
        // Stop all tracks to release microphone on mobile
        stream.getTracks().forEach(track => track.stop());
      };
      recorder.start();

      // Speech Recognition (Best Effort on Mobile)
      try {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SR) {
          const recognition = new SR();
          recognition.lang = 'en-US';
          recognition.continuous = true;
          recognition.interimResults = true;
          let finalTranscript = '';
          recognition.onresult = (event) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const t = event.results[i][0].transcript;
              if (event.results[i].isFinal) finalTranscript += t + ' ';
              else interim += t;
            }
            setTranscript((finalTranscript + interim).trim());
          };
          recognition.start();
          recognitionRef.current = recognition;
        }
      } catch (err) { console.warn('SpeechRecognition unavailable'); }

      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch (err) {
      alert('Microphone access required. Please check your browser permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
    if (recognitionRef.current) try { recognitionRef.current.stop(); } catch(e){}
    setIsRecording(false);
    clearInterval(timerRef.current);
  };

  const cancelRecording = () => {
    stopRecording();
    setAudioBlob(null);
    setTranscript('');
    setRecordingTime(0);
  };

  // ----------------- Video Generation (Mobile Optimized) -----------------
  const generatePreview = async () => {
    if (!audioBlob) return alert('No audio recorded.');

    // Check if canvas capture is supported (Older iOS doesn't support this)
    if (!canvasRef.current.captureStream) {
        alert("Your browser does not support video generation. Please try Chrome on Android or Desktop.");
        return;
    }

    setProcessing(true);
    setPreviewVideo({ url: '', mimeType: '' });
    
    // Lower resolution for Mobile Performance
    const canvas = canvasRef.current;
    canvas.width = 720; 
    canvas.height = 1280;
    const ctx = canvas.getContext('2d', { alpha: false });

    const textToSpeak = transcript || "Audio message";
    
    if (audioContextRef.current) {
      try { await audioContextRef.current.close(); } catch(e) {}
    }

    let audioCtx, recorder, analyser, source;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      
      // Crucial for Mobile: Resume context
      if (audioCtx.state === 'suspended') await audioCtx.resume();

      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      
      source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      
      // --- LIGHTWEIGHT VOICE MORPHING (Mobile Safe) ---
      source.playbackRate.value = 0.85; // Slight pitch down
      
      // Simple distortion
      const distortion = audioCtx.createWaveShaper();
      distortion.curve = makeDistortionCurve(20); // Less distortion for clarity
      distortion.oversample = 'none'; // '4x' kills mobile CPU
      
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2000;
      
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 2.0;
      
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256; // Smaller FFT size for performance
      
      const dest = audioCtx.createMediaStreamDestination();
      
      source.connect(filter);
      filter.connect(distortion);
      distortion.connect(gainNode);
      gainNode.connect(analyser);
      analyser.connect(dest);
      // Connect to destination so user can hear process (optional, helps keep audio active)
      analyser.connect(audioCtx.destination); 
      
      source.start(0);
      
      // Video Recording Setup
      const canvasStream = canvas.captureStream(30); // 30 FPS is enough for mobile
      const combined = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...dest.stream.getAudioTracks()
      ]);

      const mimeType = getSupportedMimeType();
      
      // Lower bitrate for mobile stability
      const recorderOptions = {
        mimeType: mimeType || undefined,
        videoBitsPerSecond: 1500000, // 1.5 Mbps
        audioBitsPerSecond: 128000
      };

      try {
        recorder = new MediaRecorder(combined, recorderOptions);
      } catch (e) {
        // Fallback if options fail
        recorder = new MediaRecorder(combined);
      }

      const videoChunks = [];
      recorder.ondataavailable = e => { if (e.data && e.data.size > 0) videoChunks.push(e.data); };

      recorder.onstop = () => {
        const blob = new Blob(videoChunks, { type: recorder.mimeType });
        if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
        
        const url = URL.createObjectURL(blob);
        videoUrlRef.current = url;
        setPreviewVideo({ url, mimeType: recorder.mimeType });
        setProcessing(false);
      };

      recorder.start();

      // --- VISUALIZATION LOOP ---
      const words = textToSpeak.split(/\s+/).filter(w => w.length > 0);
      const startTime = performance.now();
      const audioDuration = (audioBuffer.duration / source.playbackRate.value) * 1000 + 500;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const drawFrame = (timestamp) => {
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / audioDuration, 1);
        const wordIndex = Math.min(Math.floor(progress * words.length), words.length);

        analyser.getByteFrequencyData(dataArray);
        const avgVolume = dataArray.reduce((a, b) => a + b) / dataArray.length / 255;

        // Simplified Drawing for Mobile Performance
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Robot Head
        const cx = canvas.width / 2;
        const cy = 400;
        
        ctx.fillStyle = '#0a1f1f';
        ctx.beginPath();
        ctx.arc(cx, cy, 150, 0, Math.PI * 2);
        ctx.fill();
        
        // Eyes (Simple)
        const eyeGlow = 10 + avgVolume * 20;
        ctx.fillStyle = '#00ff7f';
        ctx.shadowBlur = eyeGlow;
        ctx.shadowColor = '#00ff7f';
        
        ctx.beginPath();
        ctx.arc(cx - 50, cy - 20, 30, 0, Math.PI * 2); // Left
        ctx.arc(cx + 50, cy - 20, 30, 0, Math.PI * 2); // Right
        ctx.fill();
        ctx.shadowBlur = 0; // Reset expensive shadow

        // Mouth (Waveform)
        ctx.strokeStyle = '#00ff7f';
        ctx.lineWidth = 4;
        ctx.beginPath();
        const mouthWidth = 100;
        const startX = cx - mouthWidth/2;
        const startY = cy + 60;
        
        ctx.moveTo(startX, startY);
        // Simple 3-point mouth movement
        ctx.lineTo(cx, startY + (avgVolume * 50)); 
        ctx.lineTo(startX + mouthWidth, startY);
        ctx.stroke();

        // Text (Large & Centered)
        ctx.font = 'bold 40px monospace';
        ctx.fillStyle = '#00ff7f';
        ctx.textAlign = 'center';
        
        const displayText = words.slice(0, wordIndex).join(' ');
        const lines = wrapTextByWords(displayText, 20);
        
        lines.forEach((line, i) => {
          ctx.fillText(line, cx, 700 + i * 50);
        });

        // Progress Bar
        ctx.fillStyle = '#333';
        ctx.fillRect(50, 1100, canvas.width - 100, 10);
        ctx.fillStyle = '#00ff7f';
        ctx.fillRect(50, 1100, (canvas.width - 100) * progress, 10);

        if (elapsed < audioDuration) {
          requestAnimationFrame(drawFrame);
        } else {
          setTimeout(() => {
            if (recorder && recorder.state !== 'inactive') recorder.stop();
          }, 200);
        }
      };

      requestAnimationFrame(drawFrame);

    } catch (error) {
      console.error(error);
      setProcessing(false);
      alert('Error generating video. Try a shorter recording.');
    }
  };

  function makeDistortionCurve(amount) {
    const k = typeof amount === 'number' ? amount : 50,
      n_samples = 44100,
      curve = new Float32Array(n_samples),
      deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  // ----------------- Sharing -----------------
  const shareVideoFile = async (videoUrl, type) => {
    if (!videoUrl) return;
    try {
      const blob = await fetch(videoUrl).then(r => r.blob());
      const ext = type && type.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([blob], `voiceanon_${Date.now()}.${ext}`, { type: blob.type });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const a = document.createElement('a');
        a.href = videoUrl;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (err) {
      console.log('Share failed', err);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/u/${user.username}`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  // ------------------- VIEWS -------------------
  if (view === 'landing') {
    return (
      <div className="min-h-screen bg-black text-green-500 font-mono flex flex-col justify-center px-4" style={{minHeight: viewportHeight}}>
        <div className="text-center">
          <Mic className="w-16 h-16 mx-auto mb-6 text-green-500" />
          <h1 className="text-4xl font-bold mb-4 text-white">VoiceAnon</h1>
          <p className="text-lg text-gray-400 mb-8">Secure, Anonymous Voice Messaging.</p>
          <div className="flex flex-col gap-4">
             <button onClick={() => setView('signin')} className="w-full py-4 border border-green-500 rounded text-lg">Login</button>
             <button onClick={() => setView('signup')} className="w-full py-4 bg-green-500 text-black font-bold rounded text-lg">Get Started</button>
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
        <div className="w-full max-w-sm">
          <h2 className="text-2xl text-green-500 mb-6 text-center">{isIn ? 'Access Terminal' : 'New Identity'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isIn && <input type="text" placeholder="Username" value={authUsername} onChange={e => setAuthUsername(e.target.value)} className="w-full p-4 bg-gray-900 border border-green-800 text-white rounded focus:outline-none focus:border-green-500" required />}
            <input type="email" placeholder="Email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} className="w-full p-4 bg-gray-900 border border-green-800 text-white rounded focus:outline-none focus:border-green-500" required />
            <input type="password" placeholder="Password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} className="w-full p-4 bg-gray-900 border border-green-800 text-white rounded focus:outline-none focus:border-green-500" required />
            <button type="submit" className="w-full py-4 bg-green-500 text-black font-bold rounded hover:bg-green-400">{isIn ? 'Login' : 'Initialize'}</button>
          </form>
          <button onClick={() => setView(isIn ? 'signup' : 'signin')} className="w-full mt-6 text-gray-500 p-2">Switch Mode</button>
        </div>
      </div>
    );
  }

  if (view === 'dashboard') {
    return (
      <div className="min-h-screen bg-gray-900 text-white font-mono flex flex-col" style={{minHeight: viewportHeight}}>
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <h1 className="text-xl mb-2 text-gray-400">Welcome, {user?.username}</h1>
          <div className="bg-black border border-green-500 p-6 rounded-lg w-full max-w-sm text-center mb-8">
            <p className="text-sm text-green-500 mb-2">YOUR ANONYMOUS LINK</p>
            <code className="block mb-6 bg-gray-900 p-2 rounded text-xs break-all">{window.location.origin}/u/{user?.username}</code>
            <button onClick={copyLink} className="w-full py-3 bg-green-600 text-white rounded flex items-center justify-center gap-2">
              {linkCopied ? <CheckCircle size={18} /> : <Copy size={18} />} {linkCopied ? 'Copied' : 'Copy Link'}
            </button>
          </div>
          
          <button onClick={() => { setMessages(mockDB.getMessages(user.username)); setView('inbox'); }} className="w-full max-w-sm py-4 bg-gray-800 rounded flex items-center justify-center gap-2 mb-4">
            <Inbox size={20} /> View Inbox
          </button>
          
          <button onClick={() => { mockAuth.signOut(); setView('landing'); }} className="text-gray-500 flex items-center gap-2 mt-4">
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (view === 'record') {
    const sendMessage = () => {
  if (!previewVideo.url) return;
  mockDB.saveMessage(user.username, {    // ← Change from targetUsername to user.username
    id: Date.now().toString(),
    text: transcript || 'Voice Message',
    timestamp: new Date().toISOString(),
    duration: recordingTime,
    videoUrl: previewVideo.url,
    mimeType: previewVideo.mimeType
  });
  setView('success');
};


    const togglePreviewPlay = () => {
        if (!previewAudioRef.current) {
            previewAudioRef.current = new Audio(audioUrlRef.current);
            previewAudioRef.current.onended = () => setIsPlayingPreview(false);
        }
        if (isPlayingPreview) {
            previewAudioRef.current.pause();
            setIsPlayingPreview(false);
        } else {
            previewAudioRef.current.play();
            setIsPlayingPreview(true);
        }
    };

    return (
      <div className="bg-[#111b21] flex flex-col relative font-sans overflow-hidden" style={{height: viewportHeight}}>
        <canvas ref={canvasRef} className="hidden" />
        
        {/* Header */}
        <div className="bg-[#202c33] p-3 flex items-center gap-3 shadow-md z-10 shrink-0">
            <div className="w-8 h-8 rounded-full bg-gray-500 flex items-center justify-center text-white font-bold">
                {targetUsername ? targetUsername[0].toUpperCase() : '?'}
            </div>
            <div>
                <h2 className="text-white font-bold text-sm">@{targetUsername}</h2>
                <p className="text-[10px] text-gray-400">Encrypting...</p>
            </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 relative flex flex-col items-center justify-center p-4" 
             style={{backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundBlendMode: 'overlay'}}>
            
            {/* Loading / Video State */}
            {previewVideo.url ? (
                <div className="bg-[#202c33] p-2 rounded-lg w-full max-w-sm shadow-xl animate-fade-in">
                    <video 
                        src={previewVideo.url} 
                        controls 
                        playsInline 
                        webkit-playsinline="true"
                        className="w-full rounded bg-black max-h-[60vh]" 
                    />
                    <div className="flex justify-between items-center mt-3 px-2">
                         <button onClick={() => { setPreviewVideo({url:'', mimeType:''}); setProcessing(false); }} className="p-2 text-red-400"><Trash2 size={24} /></button>
                         <button onClick={sendMessage} className="w-12 h-12 bg-[#00a884] rounded-full flex items-center justify-center text-white shadow-lg"><Send size={24} /></button>
                    </div>
                </div>
            ) : processing ? (
                <div className="flex flex-col items-center justify-center">
                    <div className="w-16 h-16 border-4 border-[#00a884] border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p className="text-[#00a884] font-mono text-sm animate-pulse">ENCRYPTING VOICE DATA...</p>
                </div>
            ) : audioBlob ? (
                // Post-Recording Review UI
                 <div className="w-full max-w-sm animate-slide-up">
                     <div className="bg-[#005c4b] p-4 rounded-lg shadow-xl mb-4 relative">
                         <div className="flex items-center gap-4">
                             <button onClick={togglePreviewPlay} className="text-white">
                                 {isPlayingPreview ? <Pause size={32} className="fill-current" /> : <Play size={32} className="fill-current" />}
                             </button>
                             <div className="flex-1">
                                 <div className="h-1 bg-white/30 rounded-full w-full mb-1">
                                     <div className={`h-full bg-white rounded-full ${isPlayingPreview ? 'animate-[width_2s_linear]' : 'w-0'}`}></div>
                                 </div>
                                 <div className="flex justify-between text-[10px] text-green-100">
                                     <span>{formatTime(recordingTime)}</span>
                                 </div>
                             </div>
                         </div>
                     </div>
                     <div className="flex gap-3">
                        <button onClick={cancelRecording} className="p-4 rounded-full bg-[#202c33] text-red-400"><Trash2 size={24} /></button>
                        <button onClick={generatePreview} className="flex-1 bg-[#00a884] text-white font-bold rounded-full shadow-lg flex items-center justify-center gap-2">
                             CONVERT TO VIDEO <Smartphone size={20} />
                        </button>
                     </div>
                 </div>
            ) : (
                // Idle Hints
                <div className="text-center opacity-50">
                    <Mic className="w-12 h-12 text-white mx-auto mb-2 opacity-50" />
                    <p className="text-gray-400 text-xs">Tap mic to record</p>
                </div>
            )}
        </div>

        {/* Bottom Bar - Only visible when not reviewing/processing */}
        {!audioBlob && !processing && !previewVideo.url && (
            <div className="w-full bg-[#202c33] px-2 py-3 flex items-center justify-between gap-2 shrink-0 pb-safe">
                {isRecording ? (
                    <div className="flex-1 flex items-center gap-3 pl-4">
                        <span className="text-red-500 animate-pulse text-xs">● REC</span>
                        <span className="text-white text-xl font-mono">{formatTime(recordingTime)}</span>
                        <button onClick={cancelRecording} className="ml-auto mr-4 text-gray-400 text-sm font-medium">Cancel</button>
                    </div>
                ) : (
                    <div className="flex-1 bg-[#2a3942] rounded-full h-12 flex items-center px-4 text-gray-400 text-sm select-none">
                        Type a message...
                    </div>
                )}

                <button 
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg ${isRecording ? 'bg-red-500 scale-110' : 'bg-[#00a884] active:scale-95'}`}
                    style={{touchAction: 'manipulation'}}
                >
                    {isRecording ? <Square className="fill-white text-white w-5 h-5" /> : <Mic className="text-white w-6 h-6" />}
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
           <div className="flex flex-col items-center justify-center h-full">
             <CheckCircle className="w-24 h-24 text-green-500 mb-6" />
             <h2 className="text-2xl text-white font-bold mb-8">Sent Anonymously</h2>
             <button onClick={() => { setView('record'); setPreviewVideo({url:'', mimeType:''}); setAudioBlob(null); setTranscript(''); }} className="px-8 py-3 bg-gray-800 text-green-500 rounded-full border border-green-500">Send Another</button>
             <button onClick={() => setView('dashboard')} className="mt-4 text-gray-500">Back to Dashboard</button>
           </div>
         )}
         
         {view === 'inbox' && (
            <div className="pb-12">
              <div className="flex items-center gap-4 mb-6 sticky top-0 bg-gray-900 py-4 z-10 border-b border-gray-800">
                <button onClick={() => setView('dashboard')} className="text-white"><X /></button>
                <h2 className="text-xl text-white font-bold">Inbox</h2>
              </div>
              
              {messages.length === 0 && <p className="text-gray-500 text-center mt-10">No messages yet.</p>}

              {messages.map(m => (
                <div key={m.id} className="bg-black border border-gray-800 p-3 rounded-lg mb-6">
                   <div className="aspect-[9/16] bg-gray-900 rounded mb-3 overflow-hidden">
                       <video 
                           src={m.videoUrl} 
                           controls 
                           playsInline 
                           webkit-playsinline="true"
                           className="w-full h-full object-contain" 
                        />
                   </div>
                   <div className="flex gap-2">
                      <button onClick={() => shareVideoFile(m.videoUrl, m.mimeType)} className="flex-1 py-3 bg-[#25D366] text-white font-bold rounded flex items-center justify-center gap-2 text-sm">
                        <MessageSquare size={18} /> Share
                      </button>
                      <button onClick={() => shareVideoFile(m.videoUrl, m.mimeType)} className="flex-1 py-3 bg-[#333] text-white rounded flex items-center justify-center gap-2 text-sm">
                         <Download size={18} /> Save
                      </button>
                   </div>
                   <div className="mt-2 flex justify-between text-xs text-gray-600">
                      <span>{new Date(m.timestamp).toLocaleDateString()}</span>
                      <span>{m.mimeType?.split('/')[1] || 'video'}</span>
                   </div>
                </div>
              ))}
            </div>
         )}
      </div>
    );
  }
}
