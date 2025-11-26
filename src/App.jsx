import React, { useState, useRef, useEffect } from 'react';
import {
  Mic, Square, Download, Share2, Copy, CheckCircle,
  MessageSquare, LogOut, Inbox, Smartphone, Play, Pause, Trash2, Send, X
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

const getSupportedMimeType = () => {
  const types = [
    'video/mp4',
    'video/mp4;codecs=h264',
    'video/mp4;codecs=avc1',
    'video/webm;codecs=vp9',
    'video/webm'
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return 'video/webm';
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
  
  // UI States for WhatsApp Player
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  
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
  
  // Clean references for audio logic
  const audioElementRef = useRef(null);
  const audioContextRef = useRef(null);
  const ttsObjectUrlRef = useRef(null);
  const previewAudioRef = useRef(null); // For playing back user's raw recording

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
      if (ttsObjectUrlRef.current) URL.revokeObjectURL(ttsObjectUrlRef.current);
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
    // Cleanup previous
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
    if (previewVideo.url) { URL.revokeObjectURL(previewVideo.url); setPreviewVideo({ url: '', mimeType: '' }); }
    setAudioBlob(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      setTranscript('');

      const options = MediaRecorder.isTypeSupported('audio/webm') ? { mimeType: 'audio/webm' } : undefined;
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      
      recorder.ondataavailable = e => { if (e.data && e.data.size) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: options?.mimeType || 'audio/webm' });
        setAudioBlob(blob);
        audioUrlRef.current = URL.createObjectURL(blob);
      };
      recorder.start();

      // Speech Recognition
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
      alert('Microphone denied.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
    if (recognitionRef.current) recognitionRef.current.stop();
    setIsRecording(false);
    clearInterval(timerRef.current);
  };

  const cancelRecording = () => {
    stopRecording();
    setAudioBlob(null);
    setTranscript('');
    setRecordingTime(0);
  };

  // ----------------- Generate MP4/Video (FIXED AUDIO) -----------------
  const generatePreview = async () => {
    if (!transcript && !audioBlob) {
      alert('No audio recorded.');
      return;
    }
    setProcessing(true);
    setPreviewVideo({ url: '', mimeType: '' });
    
    const canvas = canvasRef.current;
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');

    // 1. Fetch Robotic TTS Audio SECURELY
    const textToSpeak = transcript || "Audio message received.";
    // Using Brian (The classic donation voice)
    const ttsUrl = `https://api.streamelements.com/kappa/v2/speech?voice=Brian&text=${encodeURIComponent(textToSpeak)}`;
    
    // Cleanup previous context/audio
    if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
    if (ttsObjectUrlRef.current) { URL.revokeObjectURL(ttsObjectUrlRef.current); }
    
    // Create new Audio Context and Source
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioContext();
    audioContextRef.current = audioCtx;
    
    // IMPORTANT: Resume context to bypass autoplay blocks
    await audioCtx.resume();

    const dest = audioCtx.createMediaStreamDestination();
    
    // Create a fresh audio element for this run
    const audioEl = new Audio();
    audioEl.crossOrigin = "anonymous";
    audioElementRef.current = audioEl;

    try {
      // Fetch Blob explicitly
      const resp = await fetch(ttsUrl);
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);
      ttsObjectUrlRef.current = objUrl;
      audioEl.src = objUrl;

      // Wait for load
      await new Promise((resolve, reject) => {
        audioEl.onloadeddata = resolve;
        audioEl.onerror = reject;
      });

      // Hook up Web Audio API
      const source = audioCtx.createMediaElementSource(audioEl);
      source.connect(dest); // To Recorder
      source.connect(audioCtx.destination); // To Speakers (to hear it while processing)
      
      await audioEl.play();
    } catch (e) {
      console.error("Audio generation failed:", e);
      alert("Could not generate robotic audio. Check internet connection.");
      setProcessing(false);
      return;
    }

    // 2. Combine Tracks (Canvas Video + Web Audio)
    const canvasStream = canvas.captureStream(30);
    const combined = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks() // THIS IS THE KEY FIX
    ]);

    // 3. Recorder Setup
    const mimeType = getSupportedMimeType();
    let recorder;
    try {
      recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 2500000 });
    } catch(e) {
      recorder = new MediaRecorder(combined);
    }

    const videoChunks = [];
    recorder.ondataavailable = e => { if (e.data.size) videoChunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(videoChunks, { type: recorder.mimeType || mimeType });
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
      const url = URL.createObjectURL(blob);
      videoUrlRef.current = url;
      setPreviewVideo({ url, mimeType: recorder.mimeType || mimeType });
      setProcessing(false);
      
      // Cleanup
      audioEl.pause();
      audioCtx.close(); 
    };

    recorder.start();

    // 4. Animation Loop
    const words = textToSpeak.split(/\s+/);
    const startTime = Date.now();
    const duration = (audioEl.duration && isFinite(audioEl.duration)) 
      ? audioEl.duration + 0.5 
      : (words.length * 0.5) + 2;

    const drawFrame = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const index = Math.min(Math.floor(elapsed * 2.5), words.length);

      // Dark Tech BG
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, '#000000');
      grad.addColorStop(1, '#0f2027');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Robot Visual
      ctx.shadowColor = 'rgba(0, 255, 127, 0.4)';
      ctx.shadowBlur = 50;
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(canvas.width / 2, 600, 200, 0, Math.PI * 2);
      ctx.fill();
      
      // Eyes
      const pulse = 60 + Math.sin(elapsed * 12) * 15;
      ctx.shadowBlur = 25;
      ctx.fillStyle = '#00ff7f';
      ctx.beginPath();
      ctx.arc(canvas.width / 2 - 80, 580, pulse, 0, Math.PI * 2);
      ctx.arc(canvas.width / 2 + 80, 580, pulse, 0, Math.PI * 2);
      ctx.fill();
      
      // Subtitles
      ctx.shadowBlur = 0;
      ctx.font = 'bold 70px Courier New';
      ctx.fillStyle = '#00ff7f';
      ctx.textAlign = 'center';
      
      const displayed = words.slice(0, index).join(' ') + (index < words.length ? '_' : '');
      const lines = wrapTextByWords(displayed, 14);
      lines.forEach((line, i) => ctx.fillText(line, canvas.width / 2, 1100 + i * 90));

      // Footer
      ctx.font = '40px Courier New';
      ctx.fillStyle = 'rgba(0, 255, 127, 0.5)';
      ctx.fillText('ENCRYPTED MESSAGE', canvas.width / 2, 1700);

      if (elapsed < duration) requestAnimationFrame(drawFrame);
      else setTimeout(() => { try{ recorder.stop(); }catch(e){} }, 200);
    };
    requestAnimationFrame(drawFrame);
  };

  // ----------------- STRICT FILE SHARING -----------------
  const shareVideoFile = async (videoUrl, type) => {
    if (!videoUrl) return;
    
    try {
      const blob = await fetch(videoUrl).then(r => r.blob());
      const ext = (type && type.includes('mp4')) ? 'mp4' : 'webm';
      const filename = `voiceanon_${Date.now()}.${ext}`;
      const file = new File([blob], filename, { type: type || blob.type });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file]
        });
      } else {
        throw new Error('Native sharing not supported');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        alert('Sharing failed. Downloading file instead.');
        const a = document.createElement('a');
        a.href = videoUrl;
        a.download = `voiceanon_${Date.now()}.mp4`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    }
  };

  const copyLink = () => {
    const link = `${window.location.origin}/u/${user.username}`;
    navigator.clipboard.writeText(link).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  // ------------------- VIEWS -------------------
  if (view === 'landing') {
    return (
      <div className="min-h-screen bg-black text-green-500 font-mono">
        <div className="container mx-auto px-4 py-8">
          <nav className="flex justify-between items-center mb-16">
            <div className="text-2xl font-bold flex items-center gap-2">
              <Mic className="w-8 h-8" /> VoiceAnon
            </div>
            <div className="space-x-4">
              <button onClick={() => setView('signin')} className="px-6 py-2 border border-green-500 hover:bg-green-500 hover:text-black transition">Sign In</button>
              <button onClick={() => setView('signup')} className="px-6 py-2 bg-green-500 text-black font-bold hover:bg-green-400 transition">Get Started</button>
            </div>
          </nav>
          <div className="text-center max-w-4xl mx-auto mt-20">
            <h1 className="text-5xl font-bold mb-6 text-white glitch-effect">Mask Your Voice.<br/>Speak Truth.</h1>
            <p className="text-xl mb-12 text-gray-400">Record audio. We convert it to a robotic MP4 video. Share directly to WhatsApp/TikTok.</p>
            <button onClick={() => setView('signup')} className="px-12 py-4 text-xl bg-green-500 text-black font-bold hover:scale-105 transition">Create Link</button>
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
      <div className="min-h-screen bg-black flex items-center justify-center p-4 font-mono">
        <div className="border border-green-500 p-8 max-w-md w-full rounded-lg bg-gray-900">
          <h2 className="text-3xl text-green-500 mb-6 text-center">{isIn ? 'Access Terminal' : 'New Identity'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isIn && <input type="text" placeholder="Username" value={authUsername} onChange={e => setAuthUsername(e.target.value)} className="w-full p-3 bg-black border border-green-800 text-green-500 focus:outline-none focus:border-green-500" required />}
            <input type="email" placeholder="Email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} className="w-full p-3 bg-black border border-green-800 text-green-500 focus:outline-none focus:border-green-500" required />
            <input type="password" placeholder="Password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} className="w-full p-3 bg-black border border-green-800 text-green-500 focus:outline-none focus:border-green-500" required />
            <button type="submit" className="w-full py-3 bg-green-500 text-black font-bold hover:bg-green-400">{isIn ? 'Login' : 'Initialize'}</button>
          </form>
          <button onClick={() => setView(isIn ? 'signup' : 'signin')} className="w-full mt-4 text-gray-500 hover:text-green-500 text-sm">Switch Mode</button>
        </div>
      </div>
    );
  }

  if (view === 'dashboard') {
    return (
      <div className="min-h-screen bg-gray-900 text-white font-mono">
        <nav className="border-b border-gray-800 p-4 flex justify-between">
          <span className="text-xl font-bold text-green-500">VoiceAnon // {user?.username}</span>
          <div className="flex gap-4">
             <button onClick={() => { setMessages(mockDB.getMessages(user.username)); setView('inbox'); }} className="flex items-center gap-2 hover:text-green-500"><Inbox size={18} /> Inbox</button>
             <button onClick={() => { mockAuth.signOut(); setView('landing'); }}><LogOut size={18} /></button>
          </div>
        </nav>
        <div className="container mx-auto px-4 py-12 text-center">
          <h1 className="text-3xl mb-8">Your Anonymous Link</h1>
          <div className="bg-black border border-green-500 p-6 rounded-lg inline-block max-w-full">
            <code className="block mb-4 text-green-400 break-all">{window.location.origin}/u/{user?.username}</code>
            <button onClick={copyLink} className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-500 flex items-center justify-center gap-2 mx-auto">
              {linkCopied ? <CheckCircle size={16} /> : <Copy size={16} />} {linkCopied ? 'Copied' : 'Copy Link'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'record') {
    const sendMessage = () => {
      if (!previewVideo.url) return;
      mockDB.saveMessage(targetUsername, {
        id: Date.now().toString(),
        text: transcript || '[No transcript]',
        timestamp: new Date().toISOString(),
        duration: recordingTime,
        videoUrl: previewVideo.url,
        mimeType: previewVideo.mimeType,
        audioUrl: null
      });
      setView('success');
    };

    // Toggle play for the preview audio (User's voice)
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
      // WhatsApp Background Color: #0b141a or #111b21
      <div className="min-h-screen bg-[#111b21] flex flex-col items-center relative font-sans">
        <canvas ref={canvasRef} className="hidden" />
        
        {/* Header */}
        <div className="w-full bg-[#202c33] p-4 flex items-center gap-4 shadow-md z-10">
            <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center text-white font-bold text-lg">
                {targetUsername ? targetUsername[0].toUpperCase() : '?'}
            </div>
            <div>
                <h2 className="text-white font-bold">@{targetUsername}</h2>
                <p className="text-xs text-gray-400">Anonymous Message</p>
            </div>
        </div>

        {/* Chat Area Background */}
        <div className="flex-1 w-full bg-[#0b141a] relative flex items-center justify-center p-4 bg-opacity-95" 
             style={{backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundBlendMode: 'overlay'}}>
            
            {/* Display Video Preview ONLY if generated */}
            {previewVideo.url ? (
                <div className="bg-[#202c33] p-2 rounded-lg max-w-sm w-full shadow-lg">
                    <video src={previewVideo.url} controls className="w-full rounded bg-black" />
                    <div className="flex justify-between items-center mt-2 px-2 pb-1">
                         <span className="text-gray-400 text-xs">{formatTime(recordingTime)}</span>
                         <div className="flex gap-2">
                             <button onClick={() => { setPreviewVideo({url:'', mimeType:''}); setProcessing(false); }} className="text-red-400 hover:text-red-300"><Trash2 size={20} /></button>
                             <button onClick={sendMessage} className="bg-[#00a884] p-2 rounded-full text-white"><Send size={20} /></button>
                         </div>
                    </div>
                </div>
            ) : processing ? (
                <div className="flex flex-col items-center text-[#00a884] animate-pulse">
                    <div className="w-16 h-16 border-4 border-[#00a884] border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p>Encrypting Voice...</p>
                </div>
            ) : !audioBlob && !isRecording ? (
                <div className="bg-[#202c33] px-4 py-2 rounded-lg shadow text-gray-300 text-sm">
                   Tap the microphone to record securely.
                </div>
            ) : null}

            {/* Recorded Audio "Bubble" (Before converting to video) */}
            {!isRecording && audioBlob && !processing && !previewVideo.url && (
                 <div className="absolute bottom-24 w-full px-4">
                     <div className="bg-[#005c4b] max-w-sm mx-auto p-3 rounded-tr-none rounded-xl flex flex-col gap-2 shadow-lg">
                         <div className="flex items-center gap-3">
                             <button onClick={togglePreviewPlay} className="text-gray-300 hover:text-white">
                                 {isPlayingPreview ? <Pause size={30} className="fill-current" /> : <Play size={30} className="fill-current" />}
                             </button>
                             <div className="flex-1 h-2 bg-[#00a884] bg-opacity-40 rounded-full overflow-hidden relative">
                                 <div className="absolute top-0 left-0 h-full bg-white opacity-50 w-full animate-pulse"></div>
                             </div>
                             <div className="w-10 h-10 rounded-full bg-gray-800 overflow-hidden relative border border-green-500">
                                  {/* Little robot avatar placeholder */}
                                  <div className="absolute inset-0 flex items-center justify-center text-[8px] text-green-500">ROBOT</div>
                             </div>
                         </div>
                         <div className="flex justify-between text-xs text-[#badbcc] mt-1">
                             <span>{formatTime(recordingTime)}</span>
                             <span>Recorded</span>
                         </div>
                     </div>
                     <div className="max-w-sm mx-auto flex gap-4 mt-4">
                        <button onClick={cancelRecording} className="p-3 rounded-full bg-[#202c33] text-red-400"><Trash2 /></button>
                        <button onClick={generatePreview} className="flex-1 py-3 bg-[#00a884] text-white font-bold rounded-full shadow-lg flex items-center justify-center gap-2">
                             CONVERT TO VIDEO <Smartphone size={18} />
                        </button>
                     </div>
                 </div>
            )}
        </div>

        {/* Bottom Input Area (WhatsApp Style) */}
        {!audioBlob && !processing && !previewVideo.url && (
            <div className="w-full bg-[#202c33] px-2 py-2 flex items-center justify-between gap-2 z-20">
                {isRecording ? (
                    // Recording State UI
                    <div className="flex-1 flex items-center gap-4 pl-4 animate-pulse">
                        <span className="text-red-500 text-xs">●</span>
                        <span className="text-white text-lg font-mono">{formatTime(recordingTime)}</span>
                        <div className="flex-1 flex gap-1 items-end h-6 opacity-50">
                             {[...Array(10)].map((_, i) => (
                                 <div key={i} className="w-1 bg-white rounded-full animate-bounce" style={{height: Math.random() * 20 + 4 + 'px', animationDelay: i * 0.1 + 's'}}></div>
                             ))}
                        </div>
                        <button onClick={cancelRecording} className="text-gray-400 text-sm font-medium mr-4">Cancel</button>
                    </div>
                ) : (
                    // Idle State UI
                    <div className="flex-1 bg-[#2a3942] rounded-full h-10 flex items-center px-4 text-gray-400 text-sm cursor-not-allowed select-none">
                        Message @{targetUsername}
                    </div>
                )}

                {/* The Big Mic Button */}
                <button 
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg ${isRecording ? 'bg-red-500 scale-110' : 'bg-[#00a884] hover:bg-[#008f6f]'}`}
                >
                    {isRecording ? (
                        <Square className="text-white fill-white w-5 h-5" />
                    ) : (
                        <Mic className="text-white w-6 h-6" />
                    )}
                </button>
            </div>
        )}
      </div>
    );
  }

  if (view === 'inbox' || view === 'success') {
    return (
      <div className="min-h-screen bg-gray-900 p-4 font-mono">
         {view === 'success' && (
           <div className="text-center mb-12 mt-8">
             <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-4" />
             <h2 className="text-3xl text-white">Sent Successfully</h2>
             <button onClick={() => { setView('record'); setPreviewVideo({url:'', mimeType:''}); setAudioBlob(null); setTranscript(''); }} className="mt-6 text-green-500 underline">Send Another</button>
           </div>
         )}
         
         {view === 'inbox' && (
            <div className="max-w-2xl mx-auto">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl text-white">Encrypted Inbox</h2>
                <button onClick={() => setView('dashboard')} className="text-gray-400 hover:text-white">Back</button>
              </div>
              {messages.map(m => (
                <div key={m.id} className="bg-black border border-gray-800 p-4 rounded-lg mb-6">
                   <video controls src={m.videoUrl} className="w-full rounded mb-4 bg-gray-900" />
                   <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => shareVideoFile(m.videoUrl, m.mimeType)} className="py-2 bg-green-600 hover:bg-green-500 text-white rounded flex items-center justify-center gap-2">
                        <MessageSquare size={18} /> WhatsApp
                      </button>
                      <button onClick={() => shareVideoFile(m.videoUrl, m.mimeType)} className="py-2 bg-black border border-gray-600 hover:bg-gray-800 text-white rounded flex items-center justify-center gap-2">
                        <Smartphone size={18} /> TikTok
                      </button>
                   </div>
                   <p className="text-center text-xs text-gray-500 mt-2">
                     Format: {m.mimeType?.includes('mp4') ? 'MP4' : 'WebM'}
                   </p>
                </div>
              ))}
            </div>
         )}
      </div>
    );
  }
}
