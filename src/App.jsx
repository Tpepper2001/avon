import React, { useEffect, useRef, useState } from 'react';
import {
  Mic, Square, Download, Share2, Copy, CheckCircle,
  MessageSquare, LogOut, Inbox, Smartphone, Play, Pause,
  Trash2, Send, X, Video
} from 'lucide-react';

/*
  Rewritten VoiceAnon App.jsx
  - Fixes the 20 issues previously identified
  - Uses localStorage-safe storage (base64 strings) for media
  - Robust WebAudio graph for robot voice via MediaStreamDestination
  - Detects supported MediaRecorder MIME types
  - Click-to-start / click-to-stop recording UX (no fragile hold)
  - Handles /u/:username route for anonymous sending (no login needed to record)
  - Keeps inbox reactive and avoids storing raw blobs in localStorage
  - Safer sharing and download logic
  - Basic auth validation and defensive checks
*/

// ------------------ Mock Auth & DB ------------------
const mockAuth = {
  currentUser: null,
  signIn: (email, password) => new Promise((res, rej) => {
    const users = JSON.parse(localStorage.getItem('users') || '{}');
    const user = users[email];
    if (!user || user.password !== password) return rej(new Error('Invalid credentials'));
    mockAuth.currentUser = { email: user.email, username: user.username, uid: user.uid };
    localStorage.setItem('user', JSON.stringify(mockAuth.currentUser));
    return res(mockAuth.currentUser);
  }),
  signUp: (email, password, username) => new Promise((res, rej) => {
    if (!email || !password || !username) return rej(new Error('Missing fields'));
    if (password.length < 6) return rej(new Error('Password must be at least 6 characters'));
    const users = JSON.parse(localStorage.getItem('users') || '{}');
    if (users[email]) return rej(new Error('Email already exists'));
    if (Object.values(users).some(u => u.username === username)) return rej(new Error('Username taken'));
    const newUser = { email, password, username, uid: Date.now().toString() };
    users[email] = newUser;
    localStorage.setItem('users', JSON.stringify(users));
    mockAuth.currentUser = { email, username, uid: newUser.uid };
    localStorage.setItem('user', JSON.stringify(mockAuth.currentUser));
    return res(mockAuth.currentUser);
  }),
  signOut: () => { mockAuth.currentUser = null; localStorage.removeItem('user'); },
  init: () => {
    try {
      const u = localStorage.getItem('user');
      if (u) mockAuth.currentUser = JSON.parse(u);
    } catch (e) { mockAuth.currentUser = null; }
  }
};

const mockDB = {
  // Messages are stored as base64 video string under key messages_<username>
  saveMessage: (username, msg) => {
    const key = `messages_${username}`;
    const msgs = JSON.parse(localStorage.getItem(key) || '[]');
    msgs.unshift(msg); // newest first
    localStorage.setItem(key, JSON.stringify(msgs));
  },
  getMessages: (username) => JSON.parse(localStorage.getItem(`messages_${username}`) || '[]'),
  deleteMessage: (username, id) => {
    const key = `messages_${username}`;
    let msgs = JSON.parse(localStorage.getItem(key) || '[]');
    msgs = msgs.filter(m => m.id !== id);
    localStorage.setItem(key, JSON.stringify(msgs));
  }
};

// ------------------ Helpers ------------------
const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

const base64ToBlob = (dataUrl) => fetch(dataUrl).then(r => r.blob());

const formatTime = s => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

const wrapText = (text, max = 20) => {
  if (!text) return [''];
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    if (line.length + w.length + 1 > max) {
      if (line.trim()) lines.push(line.trim());
      // if word itself is longer than max, break it
      if (w.length > max) {
        for (let i = 0; i < w.length; i += max) lines.push(w.slice(i, i + max));
        line = '';
      } else {
        line = w + ' ';
      }
    } else line += w + ' ';
  }
  if (line) lines.push(line.trim());
  return lines;
};

const makeDistortionCurve = (amount = 400) => {
  const samples = 44100;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = (3 + amount) * x * 20 * (Math.PI / 180) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
};

const detectSupportedMime = () => {
  const prefer = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/mp4;codecs=h264,aac',
    'video/mp4'
  ];
  for (const m of prefer) {
    try {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) return m;
    } catch (e) {}
  }
  return '';
};

// ------------------ Main App ------------------
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('landing');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [processing, setProcessing] = useState(false);
  const [previewVideo, setPreviewVideo] = useState({ url: '', mimeType: '', base64: '' });
  const [messages, setMessages] = useState([]);
  const [linkCopied, setLinkCopied] = useState(false);
  const [targetUsername, setTargetUsername] = useState('');
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [viewportHeight, setViewportHeight] = useState('100vh');

  // Auth form
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authUsername, setAuthUsername] = useState('');

  // Refs
  const canvasRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioContextRef = useRef(null);
  const previewAudioRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const handleResize = () => setViewportHeight(`${window.innerHeight}px`);
    window.addEventListener('resize', handleResize);
    handleResize();
    mockAuth.init();
    if (mockAuth.currentUser) {
      setUser(mockAuth.currentUser);
      setMessages(mockDB.getMessages(mockAuth.currentUser.username));
      setView('dashboard');
    }

    const path = window.location.pathname;
    if (path.startsWith('/u/')) {
      const username = path.slice(3).split('/')[0];
      if (username) {
        setTargetUsername(username);
        setView('record');
      }
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      stopRecordingInternal();
      if (recognitionRef.current) recognitionRef.current.stop();
      if (audioContextRef.current) try { audioContextRef.current.close(); } catch(e){}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------ Recording (click start/stop) ------------------
  const startRecording = async () => {
    if (isRecording) return;
    // get microphone with permission
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      alert('Microphone access denied or unavailable');
      return;
    }

    audioChunksRef.current = [];
    setTranscript('');

    // prefer a supported mime
    const mimeType = detectSupportedMime();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => { if (e.data && e.data.size) audioChunksRef.current.push(e.data); };
    recorder.onerror = (err) => console.error('MediaRecorder error', err);
    recorder.onstop = async () => {
      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      setAudioBlob(blob);
      // stop tracks
      stream.getTracks().forEach(t => t.stop());
    };

    recorder.start();
    setIsRecording(true);
    setRecordingTime(0);
    timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);

    // Speech Recognition (best-effort)
    try {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        const recognition = new SR();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = e => {
          let final = '', interim = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const t = e.results[i][0].transcript;
            e.results[i].isFinal ? final += t + ' ' : interim += t;
          }
          setTranscript((prev) => (final + interim).trim());
        };
        recognition.onerror = (err) => {
          // ignore some expected errors and stop gracefully
          console.warn('SpeechRecognition error', err);
        };
        recognition.start();
        recognitionRef.current = recognition;
      }
    } catch (e) {
      console.warn('Speech recognition not available', e);
    }
  };

  const stopRecordingInternal = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch (e) { console.warn(e); }
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
      recognitionRef.current = null;
    }
    clearInterval(timerRef.current);
    setIsRecording(false);
  };

  const stopRecording = () => stopRecordingInternal();

  const cancelRecording = () => {
    stopRecordingInternal();
    setAudioBlob(null);
    setTranscript('');
    setRecordingTime(0);
  };

  // ------------------ Video Generation (Robot + Voice) ------------------
  const generatePreview = async () => {
    if (!audioBlob) return alert('No recorded audio');
    setProcessing(true);
    setPreviewVideo({ url: '', mimeType: '', base64: '' });

    const canvas = canvasRef.current;
    canvas.width = 720;
    canvas.height = 1280;
    const ctx = canvas.getContext('2d');

    // Create AudioContext only on user gesture (we are already in one)
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioContextRef.current = audioCtx;

    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      // buffer source
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = 1.0; // keep natural pitch for robot processing

      const distortion = audioCtx.createWaveShaper();
      distortion.curve = makeDistortionCurve(600);
      distortion.oversample = '4x';

      // create a subtle LFO to modulate a gain for metallic effect
      const lfo = audioCtx.createOscillator();
      lfo.type = 'sawtooth';
      lfo.frequency.value = 90; // audible-ish for robotic timbre when mixed

      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 0.3;

      // dry/wet mix
      const dryGain = audioCtx.createGain(); dryGain.gain.value = 0.5;
      const wetGain = audioCtx.createGain(); wetGain.gain.value = 0.9;

      // analyser for visuals
      const analyser = audioCtx.createAnalyser(); analyser.fftSize = 512;

      // destination stream for MediaRecorder
      const dest = audioCtx.createMediaStreamDestination();

      // graph: source -> distortion -> wetGain -> analyser -> dest
      //        source -> dryGain -> dest
      source.connect(dryGain);
      dryGain.connect(dest);

      source.connect(distortion);
      distortion.connect(wetGain);
      wetGain.connect(analyser);
      analyser.connect(dest);

      // connect LFO to wetGain.gain for movement
      lfo.connect(lfoGain);
      lfoGain.connect(wetGain.gain);

      // start nodes
      source.start();
      lfo.start();

      // capture canvas video
      const videoStream = canvas.captureStream(30);
      const combinedStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...dest.stream.getAudioTracks()
      ]);

      // choose mime for recorder
      const mimeType = detectSupportedMime() || '';
      const recorder = new MediaRecorder(combinedStream, mimeType ? { mimeType } : undefined);
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.onerror = (e) => console.error('Recorder error', e);
      recorder.onstop = async () => {
        try {
          const blob = new Blob(chunks, { type: chunks[0]?.type || 'video/webm' });
          const url = URL.createObjectURL(blob);
          const base64 = await blobToBase64(blob);
          setPreviewVideo({ url, mimeType: blob.type || 'video/webm', base64 });
        } catch (e) {
          console.error(e);
          alert('Failed to finalize preview');
        } finally {
          setProcessing(false);
          // stop audio nodes
          try { source.stop(); } catch (e) {}
          try { lfo.stop(); } catch (e) {}
        }
      };

      recorder.start();

      // visuals
      const words = (transcript || 'Voice message').split(' ');
      const startTime = performance.now();
      const duration = (audioBuffer.duration / source.playbackRate.value) * 1000 + 1000;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const draw = (t) => {
        const elapsed = t - startTime;
        const progress = Math.min(elapsed / duration, 1);
        analyser.getByteFrequencyData(dataArray);
        const vol = dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 255;

        // Background
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Grid subtle
        ctx.strokeStyle = 'rgba(0,255,0,0.02)';
        for (let i = 0; i < canvas.height; i += 60) {
          ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
        }

        const cx = canvas.width / 2;
        const cy = 420;

        // Head
        ctx.fillStyle = '#0b0b0b';
        ctx.fillRect(cx - 160, cy - 220, 320, 440);

        // Eyes reactive
        ctx.shadowBlur = 30 + vol * 120;
        ctx.shadowColor = '#0f0';
        ctx.fillStyle = '#0f0';
        ctx.beginPath(); ctx.arc(cx - 80, cy - 70, 50 + vol * 30, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 80, cy - 70, 50 + vol * 30, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;

        // Mouth
        ctx.strokeStyle = '#0f0'; ctx.lineWidth = 10; ctx.beginPath();
        for (let i = 0; i < 30; i++) {
          const x = cx - 140 + i * 10;
          const y = cy + 100 + Math.sin(elapsed / 140 + i) * vol * 80;
          ctx[i === 0 ? 'moveTo' : 'lineTo'](x, y);
        }
        ctx.stroke();

        // Text
        ctx.font = 'bold 42px monospace'; ctx.fillStyle = '#0f0'; ctx.textAlign = 'center';
        const shown = words.slice(0, Math.floor(progress * words.length) + 1).join(' ');
        wrapText(shown, 22).forEach((line, i) => ctx.fillText(line, cx, 860 + i * 56));

        // Progress
        ctx.fillStyle = '#222'; ctx.fillRect(90, 1150, canvas.width - 180, 26);
        ctx.fillStyle = '#0f0'; ctx.fillRect(90, 1150, (canvas.width - 180) * progress, 26);

        if (elapsed < duration) rafRef.current = requestAnimationFrame(draw);
        else setTimeout(() => { try { recorder.stop(); } catch(e){} }, 500);
      };

      rafRef.current = requestAnimationFrame(draw);

    } catch (e) {
      console.error(e);
      setProcessing(false);
      alert('Video generation failed');
    }
  };

  // ------------------ Send Message ------------------
  const sendMessage = async () => {
    if (!previewVideo.base64) return alert('No generated video to send');
    const recipient = targetUsername || user?.username;
    if (!recipient) return alert('No recipient provided');

    const message = {
      id: Date.now().toString(),
      text: transcript || 'Voice message',
      timestamp: new Date().toISOString(),
      duration: recordingTime,
      videoBase64: previewVideo.base64,
      mimeType: previewVideo.mimeType || 'video/webm'
    };

    mockDB.saveMessage(recipient, message);

    // If current user's inbox is the same recipient, refresh
    if (user && user.username === recipient) setMessages(mockDB.getMessages(user.username));

    // reset recording state
    setPreviewVideo({ url: '', mimeType: '', base64: '' });
    setAudioBlob(null);
    setTranscript('');
    setRecordingTime(0);

    setView('success');
  };

  const copyLink = () => {
    const uname = user?.username;
    if (!uname) return alert('No user to copy link for');
    navigator.clipboard.writeText(`${window.location.origin}/u/${uname}`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const shareVideo = async (base64) => {
    if (!base64) return alert('No media to share');
    const blob = await base64ToBlob(base64);
    const fileName = 'voiceanon.webm';
    const file = new File([blob], fileName, { type: blob.type || 'video/webm' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Anonymous Voice Message' });
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        a.click();
      }
    } catch (e) {
      // fallback to download if share fails
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      a.click();
    }
  };

  // ------------------ Views ------------------
  if (view === 'landing') return (
    <div className="min-h-screen bg-black text-green-400 font-mono flex flex-col items-center justify-center p-6" style={{ minHeight: viewportHeight }}>
      <Video className="w-20 h-20 mb-8 animate-pulse" />
      <h1 className="text-5xl font-bold mb-4">VoiceAnon</h1>
      <p className="text-xl mb-12">Anonymous. Encrypted. Robotic.</p>
      <div className="space-y-4 w-full max-w-xs">
        <button onClick={() => setView('signin')} className="w-full py-4 border border-green-500 rounded text-xl">Login</button>
        <button onClick={() => setView('signup')} className="w-full py-4 bg-green-500 text-black font-bold rounded text-xl">Create Identity</button>
        <button onClick={() => { setTargetUsername(''); setView('record'); }} className="w-full py-4 bg-gray-800 text-white rounded text-xl">Send Anonymous</button>
      </div>
    </div>
  );

  if (view === 'signin' || view === 'signup') {
    const isSignIn = view === 'signin';
    const submit = (e) => {
      e.preventDefault();
      const p = isSignIn
        ? mockAuth.signIn(authEmail.trim(), authPassword)
        : mockAuth.signUp(authEmail.trim(), authPassword, authUsername.trim());
      p.then(u => {
        setUser(u);
        setMessages(mockDB.getMessages(u.username));
        setView('dashboard');
      }).catch(e => alert(e.message || 'Auth error'));
    };
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6 font-mono" style={{ minHeight: viewportHeight }}>
        <form onSubmit={submit} className="bg-gray-900 p-8 rounded-lg border border-green-800 space-y-6 w-full max-w-sm">
          <h2 className="text-3xl text-green-500 text-center">{isSignIn ? 'Access' : 'Initialize'}</h2>
          {!isSignIn && <input required placeholder="Username" value={authUsername} onChange={e => setAuthUsername(e.target.value)} className="w-full p-4 bg-black border border-green-800 rounded text-white" />}
          <input required type="email" placeholder="Email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} className="w-full p-4 bg-black border border-green-800 rounded text-white" />
          <input required minLength={6} type="password" placeholder="Password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} className="w-full p-4 bg-black border border-green-800 rounded text-white" />
          <button type="submit" className="w-full py-4 bg-green-500 text-black font-bold rounded text-xl">{isSignIn ? 'Enter' : 'Create'}</button>
          <button type="button" onClick={() => setView(isSignIn ? 'signup' : 'signin')} className="text-gray-500 text-sm">Switch to {isSignIn ? 'Sign Up' : 'Sign In'}</button>
        </form>
      </div>
    );
  }

  if (view === 'dashboard') return (
    <div className="min-h-screen bg-black text-white font-mono p-6" style={{ minHeight: viewportHeight }}>
      <h1 className="text-3xl mb-8">@{user.username}</h1>
      <div className="bg-gray-900 border border-green-500 p-6 rounded mb-8">
        <p className="text-sm text-green-400 mb-2">Your Link</p>
        <code className="block bg-black p-3 rounded text-xs break-all mb-4">{window.location.origin}/u/{user.username}</code>
        <button onClick={copyLink} className="w-full py-3 bg-green-600 rounded flex items-center justify-center gap-2">
          {linkCopied ? <CheckCircle /> : <Copy />} {linkCopied ? 'Copied!' : 'Copy Link'}
        </button>
      </div>
      <button onClick={() => { setMessages(mockDB.getMessages(user.username)); setView('inbox'); }} className="w-full py-4 bg-gray-800 rounded mb-4 flex items-center justify-center gap-3">
        <Inbox /> Inbox ({messages.length})
      </button>
      <button onClick={() => { mockAuth.signOut(); setUser(null); setView('landing'); }} className="text-red-500 flex items-center gap-2">
        <LogOut /> Sign Out
      </button>
    </div>
  );

  if (view === 'record') return (
    <div className="bg-black text-white min-h-screen flex flex-col" style={{ height: viewportHeight }}>
      <canvas ref={canvasRef} className="hidden" />
      <div className="bg-gray-900 p-4 flex items-center gap-4">
        <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-black font-bold">
          {(targetUsername || user?.username || '?')[0].toUpperCase()}
        </div>
        <div>
          <p className="font-bold">@{targetUsername || user?.username}</p>
          <p className="text-xs text-gray-400">Sending anonymously...</p>
        </div>
        {!targetUsername && <button onClick={() => setView('dashboard')} className="ml-auto"><X /></button>}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {previewVideo.url ? (
          <div className="w-full max-w-sm">
            <video src={previewVideo.url} controls className="w-full rounded-lg shadow-2xl" />
            <div className="flex gap-4 mt-6">
              <button onClick={() => { setPreviewVideo({ url: '', mimeType: '', base64: '' }); }} className="flex-1 py-4 bg-red-600 rounded"><Trash2 /></button>
              <button onClick={sendMessage} disabled={processing} className="flex-1 py-4 bg-green-600 rounded flex items-center justify-center gap-2">
                <Send /> Send
              </button>
            </div>
          </div>
        ) : processing ? (
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-green-500">Generating Robot Video...</p>
          </div>
        ) : audioBlob ? (
          <div className="text-center space-y-8">
            <div className="bg-gray-900 p-6 rounded-lg">
              <button onClick={() => {
                if (previewAudioRef.current) { previewAudioRef.current.pause(); previewAudioRef.current = null; setIsPlayingPreview(false); return; }
                previewAudioRef.current = new Audio(URL.createObjectURL(audioBlob));
                previewAudioRef.current.onended = () => setIsPlayingPreview(false);
                previewAudioRef.current.play();
                setIsPlayingPreview(true);
              }} className="mb-4">
                {isPlayingPreview ? <Pause className="w-16 h-16 mx-auto" /> : <Play className="w-16 h-16 mx-auto" />}
              </button>
              <p className="text-2xl">{formatTime(recordingTime)}</p>
              <p className="text-sm text-gray-400 mt-2">{transcript}</p>
            </div>
            <div className="flex gap-4">
              <button onClick={cancelRecording} className="px-8 py-4 bg-red-600 rounded"><Trash2 /></button>
              <button onClick={generatePreview} className="flex-1 py-4 bg-green-600 rounded font-bold text-xl">
                Convert to Robot Video
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <Mic className="w-24 h-24 mx-auto mb-8 text-green-500 animate-pulse" />
            <p className="text-gray-500">Click to record</p>
          </div>
        )}
      </div>

      {!audioBlob && !processing && (
        <div className="p-6">
          <button
            onClick={() => isRecording ? stopRecording() : startRecording()}
            className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center text-white text-4xl font-bold transition-all ${isRecording ? 'bg-red-600 scale-125' : 'bg-green-600'}`}
          >
            {isRecording ? '■' : '●'}
          </button>
          {isRecording && <p className="text-center mt-4 text-red-500 animate-pulse text-xl">{formatTime(recordingTime)}</p>}
        </div>
      )}
    </div>
  );

  if (view === 'inbox' || view === 'success') return (
    <div className="min-h-screen bg-black text-white font-mono p-4" style={{ height: viewportHeight }}>
      {view === 'success' && (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <CheckCircle className="w-32 h-32 text-green-500 mb-8" />
          <h1 className="text-4xl mb-8">Sent Anonymously</h1>
          <button onClick={() => { setView('record'); setPreviewVideo({ url: '', mimeType: '', base64: '' }); setAudioBlob(null); }} className="px-8 py-4 bg-green-600 rounded text-xl">Send Another</button>
        </div>
      )}

      {view === 'inbox' && (
        <>
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl">Inbox</h1>
            <button onClick={() => setView('dashboard')}><X /></button>
          </div>
          {messages.length === 0 ? (
            <p className="text-center text-gray-500 mt-20">No messages yet</p>
          ) : (
            messages.map(m => (
              <MessageCard key={m.id} message={m} onDelete={() => { mockDB.deleteMessage(user.username, m.id); setMessages(mockDB.getMessages(user.username)); }} onShare={() => shareVideo(m.videoBase64)} />
            ))
          )}
        </>
      )}
    </div>
  );

  return null;
}

function MessageCard({ message, onDelete, onShare }) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    let active = true;
    const create = async () => {
      if (!message.videoBase64) return;
      const b = await base64ToBlob(message.videoBase64);
      const u = URL.createObjectURL(b);
      if (active) setUrl(u);
    };
    create();
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.videoBase64]);

  return (
    <div className="bg-gray-900 rounded-xl overflow-hidden mb-8 border border-green-900">
      {url ? <video src={url} controls className="w-full aspect-[9/16]" /> : <div className="w-full aspect-[9/16] bg-black" />}
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <button onClick={() => onShare()} className="bg-gradient-to-r from-purple-600 to-pink-600 py-4 rounded font-bold">TikTok</button>
          <button onClick={() => onShare()} className="bg-green-600 py-4 rounded font-bold">WhatsApp</button>
          <button onClick={() => onShare()} className="bg-blue-700 py-4 rounded font-bold">Facebook</button>
          <button onClick={() => onShare()} className="bg-gradient-to-r from-pink-500 to-orange-500 py-4 rounded font-bold col-span-2">Instagram</button>
          <button onClick={() => onShare()} className="bg-black border border-white py-4 rounded font-bold">X / Twitter</button>
        </div>
        <div className="flex gap-3">
          <button onClick={() => onShare()} className="flex-1 py-3 bg-gray-800 rounded flex items-center justify-center gap-2">
            <Download /> Save
          </button>
          <button onClick={onDelete} className="px-6 py-3 bg-red-900 rounded"><Trash2 /></button>
        </div>
      </div>
    </div>
  );
}
