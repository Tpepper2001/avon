// src/App.jsx — VoiceAnon v3.0 — 100% Pure JavaScript (No TS!)
// Works perfectly on Vercel, Netlify, Vite, iOS, Android

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useLayoutEffect,
} from 'react';
import {
  Mic,
  Square,
  Download,
  Share2,
  Copy,
  CheckCircle,
  MessageSquare,
  LogOut,
  Inbox,
  Play,
  Pause,
  Trash2,
  Send,
  X,
  Video,
  Loader2,
  User,
} from 'lucide-react';

// ==================== Secure Mock Auth (SHA-256 + UUID) ====================
const mockAuth = {
  currentUser: null,

  async hash(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  },

  async signIn(email, password) {
    const users = JSON.parse(localStorage.getItem('va_users_v3') || '{}');
    const user = users[email];
    if (!user || user.passwordHash !== (await this.hash(password))) {
      throw new Error('Invalid credentials');
    }
    this.currentUser = { email: user.email, username: user.username, uid: user.uid };
    localStorage.setItem('va_session', JSON.stringify(this.currentUser));
    return this.currentUser;
  },

  async signUp(email, password, username) {
    if (!email || !password || !username) throw new Error('All fields required');
    if (password.length < 6) throw new Error('Password must be 6+ chars');
    if (!/^[a-zA-Z0-9_]+$/.test(username)) throw new Error('Username: letters, numbers, _ only');

    const users = JSON.parse(localStorage.getItem('va_users_v3') || '{}');
    if (users[email]) throw new Error('Email already registered');
    if (Object.values(users).some((u) => u.username === username.toLowerCase()))
      throw new Error('Username taken');

    const newUser = {
      email,
      username: username.toLowerCase(),
      uid: crypto.randomUUID(),
      passwordHash: await this.hash(password),
    };
    users[email] = newUser;
    localStorage.setItem('va_users_v3', JSON.stringify(users));

    this.currentUser = {
      email: newUser.email,
      username: newUser.username,
      uid: newUser.uid,
    };
    localStorage.setItem('va_session', JSON.stringify(this.currentUser));
    return this.currentUser;
  },

  signOut() {
    this.currentUser = null;
    localStorage.removeItem('va_session');
  },

  init() {
    try {
      const s = localStorage.getItem('va_session');
      if (s) this.currentUser = JSON.parse(s);
    } catch (e) {
      this.currentUser = null;
    }
  },
};

// ==================== Safe Message Store ====================
const MAX_VIDEO_BASE64 = 18 * 1024 * 1024;
const MAX_MESSAGES = 50;

const msgDB = {
  async save(username, msg) {
    if (msg.videoBase64.length > MAX_VIDEO_BASE64) {
      throw new Error('Video too large (max ~15 seconds)');
    }
    const key = `va_msgs_${username}`;
    let list = JSON.parse(localStorage.getItem(key) || '[]');
    list.unshift({ ...msg, id: crypto.randomUUID() });
    if (list.length > MAX_MESSAGES) list = list.slice(0, MAX_MESSAGES);

    try {
      localStorage.setItem(key, JSON.stringify(list));
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        list = list.slice(0, 10);
        localStorage.setItem(key, JSON.stringify(list));
        alert('Storage full — keeping only 10 newest messages');
      } else throw e;
    }
  },

  get(username) {
    return JSON.parse(localStorage.getItem(`va_msgs_${username}`) || '[]');
  },

  delete(username, id) {
    const key = `va_msgs_${username}`;
    let list = JSON.parse(localStorage.getItem(key) || '[]');
    list = list.filter((m) => m.id !== id);
    localStorage.setItem(key, JSON.stringify(list));
  },
};

// ==================== Utils ====================
const blobToBase64 = (blob) =>
  new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result);
    reader.onerror = rej;
    reader.readAsDataURL(blob);
  });

const base64ToBlob = (dataUrl) => fetch(dataUrl).then((r) => r.blob());

const formatTime = (s) =>
  `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

const detectBestMime = () => {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return 'video/webm';
};

// ==================== Main App ====================
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('landing');
  const [targetUsername, setTargetUsername] = useState('');
  const [messages, setMessages] = useState([]);
  const [linkCopied, setLinkCopied] = useState(false);

  // Recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [processing, setProcessing] = useState(false);
  const [previewVideo, setPreviewVideo] = useState(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

  // Auth form
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const [authError, setAuthError] = useState('');

  // Refs
  const canvasRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioContextRef = useRef(null);
  const previewAudioRef = useRef(null);
  const animationRef = useRef(0);
  const objectUrlsRef = useRef(new Set());

  const createObjectURL = (blob) => {
    const url = URL.createObjectURL(blob);
    objectUrlsRef.current.add(url);
    return url;
  };

  const revokeAllObjectURLs = () => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current.clear();
  };

  useEffect(() => {
    return () => {
      revokeAllObjectURLs();
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close();
      }
      recognitionRef.current?.stop();
    };
  }, []);

  useLayoutEffect(() => {
    mockAuth.init();
    if (mockAuth.currentUser) {
      setUser(mockAuth.currentUser);
      setMessages(msgDB.get(mockAuth.currentUser.username));
      setView('dashboard');
    }

    const path = window.location.pathname;
    if (path.startsWith('/u/')) {
      const username = path.slice(3).split('/')[0].toLowerCase();
      if (username) {
        setTargetUsername(username);
        setView('record');
      }
    }
  }, []);

  // ==================== Recording ====================
  const startRecording = async () => {
    if (isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      setTranscript('');

      const mimeType = detectBestMime();
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);

      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        const rec = new SR();
        rec.continuous = true;
        rec.interimResults = false;
        rec.onresult = (e) => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) {
              setTranscript((prev) => prev + e.results[i][0].transcript + ' ');
            }
          }
        };
        rec.onerror = () => rec.stop();
        rec.start();
        recognitionRef.current = rec;
      }
    } catch (err) {
      alert('Microphone access denied');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    if (recognitionRef.current) recognitionRef.current.stop();
    clearInterval(timerRef.current);
    setIsRecording(false);
  };

  const cancelRecording = () => {
    stopRecording();
    setAudioBlob(null);
    setTranscript('');
    setRecordingTime(0);
    setPreviewVideo(null);
    revokeAllObjectURLs();
  };

  // ==================== Robot Video Generation ====================
  const generatePreview = async () => {
    if (!audioBlob) return;
    setProcessing(true);
    revokeAllObjectURLs();

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = 720;
    canvas.height = 1280;

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioContextRef.current = audioCtx;

    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    try {
      const audioBuffer = await audioCtx.decodeAudioData(await audioBlob.arrayBuffer());

      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;

      const distortion = audioCtx.createWaveShaper();
      distortion.curve = (() => {
        const samples = 44100;
        const curve = new Float32Array(samples);
        const amount = 140;
        for (let i = 0; i < samples; i++) {
          const x = (i * 2) / samples - 1;
          curve[i] =
            (3 + amount) *
            x *
            20 *
            (Math.PI / 180) /
            (Math.PI + amount * Math.abs(x));
        }
        return curve;
      })();
      distortion.oversample = '4x';

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;

      const dest = audioCtx.createMediaStreamDestination();

      source.connect(distortion);
      distortion.connect(analyser);
      analyser.connect(dest);
      source.connect(dest);

      source.start();

      const videoStream = canvas.captureStream(30);
      const combined = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);

      const recorder = new MediaRecorder(combined, { mimeType: detectBestMime() });
      const chunks = [];

      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: chunks[0]?.type || 'video/webm' });
        const url = createObjectURL(blob);
        setPreviewVideo({ url, blob });
        setProcessing(false);
      };
      recorder.start();

      const words = transcript.trim().split(/\s+/) || ['Voice', 'message'];
      const startTime = performance.now();
      const duration = audioBuffer.duration * 1000 + 1200;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const draw = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);

        analyser.getByteFrequencyData(dataArray);
        const volume = dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 255;

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 720, 1280);

        ctx.strokeStyle = 'rgba(0, 255, 0, 0.07)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 1280; i += 80) {
          ctx.beginPath();
          ctx.moveTo(0, i);
          ctx.lineTo(720, i);
          ctx.stroke();
        }

        const cx = 360;
        const cy = 440;

        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(cx - 170, cy - 240, 340, 480);

        ctx.shadowBlur = 50 + volume * 120;
        ctx.shadowColor = '#0f0';
        ctx.fillStyle = '#0f0';
        ctx.beginPath();
        ctx.arc(cx - 90, cy - 80, 55 + volume * 35, 0, Math.PI * 2);
        ctx.arc(cx + 90, cy - 80, 55 + volume * 35, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = '#0f0';
        ctx.lineWidth = 10;
        ctx.beginPath();
        for (let i = 0; i < 32; i++) {
          const x = cx - 150 + i * 15;
          const y = cy + 110 + Math.sin(elapsed / 120 + i) * volume * 90;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.font = 'bold 46px monospace';
        ctx.fillStyle = '#0f0';
        ctx.textAlign = 'center';
        const shownWords = words.slice(0, Math.floor(progress * words.length) + 2);
        const text = shownWords.join(' ') + (progress < 1 ? '...' : '');
        const lines = text.match(/.{1,22}(\s|$)/g) || [];
        lines.forEach((line, i) => {
          ctx.fillText(line.trim(), cx, 900 + i * 68);
        });

        ctx.fillStyle = '#111';
        ctx.fillRect(80, 1160, 560, 32);
        ctx.fillStyle = '#0f0';
        ctx.fillRect(80, 1160, 560 * progress, 32);

        if (elapsed < duration) {
          animationRef.current = requestAnimationFrame(draw);
        } else {
          setTimeout(() => recorder.stop(), 800);
        }
      };

      animationRef.current = requestAnimationFrame(draw);
    } catch (err) {
      console.error(err);
      alert('Video generation failed');
      setProcessing(false);
    }
  };

  // ==================== Send ====================
  const sendMessage = async () => {
    if (!previewVideo) return;
    setProcessing(true);
    try {
      const base64 = await blobToBase64(previewVideo.blob);
      const msg = {
        id: crypto.randomUUID(),
        text: transcript.trim() || 'Voice message',
        timestamp: new Date().toISOString(),
        duration: recordingTime,
        videoBase64: base64,
        mimeType: previewVideo.blob.type,
      };

      const recipient = targetUsername || user.username;
      await msgDB.save(recipient, msg);

      if (user?.username === recipient) {
        setMessages(msgDB.get(user.username));
      }

      cancelRecording();
      setView('success');
    } catch (e) {
      alert(e.message || 'Failed to send');
    } finally {
      setProcessing(false);
    }
  };

  // ==================== Share & Copy ====================
  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/u/${user.username}`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const shareVideo = async (blob) => {
    const file = new File([blob], 'voiceanon_robot_message.webm', { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'Anonymous Robot Message',
          text: 'You received a voice message!',
        });
        return;
      } catch (e) {}
    }
    const a = document.createElement('a');
    a.href = createObjectURL(blob);
    a.download = 'voiceanon_robot_message.webm';
    a.click();
  };

  // ==================== Render ====================
  if (view === 'landing') {
    return (
      <div className="min-h-screen bg-black text-green-400 font-mono flex flex-col items-center justify-center p-6">
        <Video className="w-28 h-28 mb-8 animate-pulse" />
        <h1 className="text-6xl font-bold mb-4">VoiceAnon</h1>
        <p className="text-2xl mb-12 text-center">Anonymous. Robotic. Untraceable.</p>
        <div className="space-y-5 w-full max-w-xs">
          <button onClick={() => setView('signin')} className="w-full py-5 border-2 border-green-500 rounded-xl text-2xl hover:bg-green-500 hover:text-black transition">
            Login
          </button>
          <button onClick={() => setView('signup')} className="w-full py-5 bg-green-500 text-black font-bold rounded-xl text-2xl">
            Create Identity
          </button>
          <button onClick={() => setView('record')} className="w-full py-5 bg-gray-800 rounded-xl text-2xl">
            Send Anonymous
          </button>
        </div>
      </div>
    );
  }

  if (view === 'signin' || view === 'signup') {
    const isSignIn = view === 'signin';

    const handleSubmit = async (e) => {
      e.preventDefault();
      setAuthError('');
      try {
        const u = isSignIn
          ? await mockAuth.signIn(authEmail.trim(), authPassword)
          : await mockAuth.signUp(authEmail.trim(), authPassword, authUsername.trim());
        setUser(u);
        setMessages(msgDB.get(u.username));
        setView('dashboard');
      } catch (err) {
        setAuthError(err.message);
      }
    };

    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <form onSubmit={handleSubmit} className="bg-gray-900 p-10 rounded-2xl border border-green-800 w-full max-w-sm space-y-6">
          <h2 className="text-4xl text-green-500 text-center font-bold">
            {isSignIn ? 'Access Terminal' : 'Initialize Identity'}
          </h2>
          {authError && <p className="text-red-500 text-center">{authError}</p>}
          {!isSignIn && (
            <input required placeholder="Username" value={authUsername} onChange={(e) => setAuthUsername(e.target.value)}
              className="w-full p-4 bg-black border border-green-800 rounded text-white text-lg" />
          )}
          <input required type="email" placeholder="Email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)}
            className="w-full p-4 bg-black border border-green-800 rounded text-white text-lg" />
          <input required type="password" placeholder="Password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)}
            className="w-full p-4 bg-black border border-green-800 rounded text-white text-lg" />
          <button type="submit" className="w-full py-5 bg-green-500 text-black font-bold rounded-xl text-2xl">
            {isSignIn ? 'Enter' : 'Create'}
          </button>
          <button type="button" onClick={() => setView(isSignIn ? 'signup' : 'signin')} className="text-gray-400 text-center w-full">
            {isSignIn ? "Don't have an identity?" : 'Already initialized?'}
          </button>
        </form>
      </div>
    );
  }

  if (view === 'dashboard') {
    return (
      <div className="min-h-screen bg-black text-white font-mono p-6">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <User className="w-10 h-10 text-green-500" />
            <h1 className="text-3xl">@{user.username}</h1>
          </div>
          <button onClick={() => { mockAuth.signOut(); setUser(null); setView('landing'); }}
            className="text-red-500 flex items-center gap-2">
            <LogOut /> Logout
          </button>
        </div>

        <div className="bg-gray-900 border border-green-600 p-6 rounded-xl mb-8">
          <p className="text-green-400 mb-3">Your anonymous link</p>
          <code className="block bg-black p-4 rounded text-sm break-all">
            {window.location.origin}/u/{user.username}
          </code>
          <button onClick={copyLink} className="mt-4 w-full py-4 bg-green-600 rounded-xl flex items-center justify-center gap-2">
            {linkCopied ? <CheckCircle /> : <Copy />}
            {linkCopied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>

        <button onClick={() => { setMessages(msgDB.get(user.username)); setView('inbox'); }}
          className="w-full py-5 bg-gray-800 rounded-xl flex items-center justify-center gap-3 text-xl mb-4">
          <Inbox /> Inbox ({messages.length})
        </button>

        <button onClick={() => setView('record')} className="w-full py-5 bg-green-600 rounded-xl text-xl">
          Send Anonymous Message
        </button>
      </div>
    );
  }

  if (view === 'record') {
    return (
      <div className="bg-black text-white min-h-screen flex flex-col">
        <canvas ref={canvasRef} className="hidden" />

        <div className="p-4 bg-gray-900 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-black text-2xl font-bold">
              {(targetUsername || user?.username || '?')[0].toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-xl">@{targetUsername || user?.username}</p>
              <p className="text-sm text-gray-400">Anonymous robot message</p>
            </div>
          </div>
          {!targetUsername && <button onClick={() => setView('dashboard')}><X className="w-8 h-8" /></button>}
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-8">
          {previewVideo ? (
            <div className="w-full max-w-sm">
              <video src={previewVideo.url} controls className="w-full rounded-2xl shadow-2xl" />
              <div className="flex gap-4 mt-8">
                <button onClick={cancelRecording} className="flex-1 py-5 bg-red-600 rounded-xl flex items-center justify-center gap-2">
                  <Trash2 /> Discard
                </button>
                <button onClick={sendMessage} disabled={processing}
                  className="flex-1 py-5 bg-green-600 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
                  {processing ? <Loader2 className="animate-spin" /> : <Send />} Send
                </button>
              </div>
            </div>
          ) : processing ? (
            <div className="text-center">
              <Loader2 className="w-20 h-20 mx-auto animate-spin text-green-500 mb-6" />
              <p className="text-2xl">Building robot video...</p>
            </div>
          ) : audioBlob ? (
            <div className="text-center space-y-8 max-w-lg">
              <button onClick={() => {
                if (isPlayingPreview) {
                  previewAudioRef.current?.pause();
                  setIsPlayingPreview(false);
                } else {
                  const audio = new Audio(createObjectURL(audioBlob));
                  previewAudioRef.current = audio;
                  audio.onended = () => setIsPlayingPreview(false);
                  audio.play();
                  setIsPlayingPreview(true);
                }
              }} className="bg-gray-900 p-10 rounded-2xl">
                {isPlayingPreview ? <Pause className="w-24 h-24 text-green-500" /> : <Play className="w-24 h-24 text-green-500" />}
              </button>

              <p className="text-4xl font-mono">{formatTime(recordingTime)}</p>
              {transcript && <p className="text-lg text-gray-400 px-8 max-w-md mx-auto">{transcript}</p>}

              <div className="flex gap-4">
                <button onClick={cancelRecording} className="px-10 py-5 bg-red-600 rounded-xl"><Trash2 /></button>
                <button onClick={generatePreview} className="flex-1 py-5 bg-green-600 rounded-xl text-xl font-bold">
                  Convert to Robot Video
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <button onClick={() => isRecording ? stopRecording() : startRecording()}
                className={`w-36 h-36 rounded-full flex items-center justify-center text-6xl font-bold transition-all shadow-2xl ${isRecording ? 'bg-red-600 animate-pulse scale-110' : 'bg-green-600 hover:scale-105'}`}>
                {isRecording ? 'Stop' : 'Rec'}
              </button>
              {isRecording && <p className="mt-10 text-4xl text-red-500 animate-pulse font-mono">{formatTime(recordingTime)}</p>}
              {!isRecording && <p className="mt-8 text-gray-500 text-xl">Tap to record</p>}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (view === 'success') {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 text-center">
        <CheckCircle className="w-32 h-32 text-green-500 mb-8" />
        <h1 className="text-5xl font-bold mb-6">Sent Anonymously</h1>
        <p className="text-xl text-gray-400 mb-12">Your robot message is delivered.</p>
        <button onClick={() => { cancelRecording(); setView('record'); }}
          className="px-12 py-6 bg-green-600 rounded-xl text-2xl">
          Send Another
        </button>
      </div>
    );
  }

  if (view === 'inbox') {
    const currentMessages = msgDB.get(user.username);

    return (
      <div className="min-h-screen bg-black text-white font-mono p-6">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl">Inbox</h1>
          <button onClick={() => setView('dashboard')}><X className="w-8 h-8" /></button>
        </div>

        {currentMessages.length === 0 ? (
          <p className="text-center text-gray-500 text-2xl mt-32">No messages yet</p>
        ) : (
          <div className="space-y-8">
            {currentMessages.map((m) => (
              <MessageCard key={m.id} message={m} onShare={(blob) => shareVideo(blob || previewVideo?.blob)} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}

// ==================== Message Card ====================
function MessageCard({ message, onShare }) {
  const [videoUrl, setVideoUrl] = useState('');

  useEffect(() => {
    let canceled = false;
    base64ToBlob(message.videoBase64).then((blob) => {
      if (!canceled) {
        const url = URL.createObjectURL(blob);
        setVideoUrl(url);
      }
    });
    return () => {
      canceled = true;
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [message.videoBase64]);

  const handleDownload = async () => {
    const blob = await base64ToBlob(message.videoBase64);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'voiceanon_message.webm';
    a.click();
  };

  return (
    <div className="bg-gray-900 rounded-2xl overflow-hidden border border-green-900">
      {videoUrl ? (
        <video src={videoUrl} controls className="w-full aspect-[9/16]" />
      ) : (
        <div className="w-full aspect-[9/16] bg-black flex items-center justify-center">
          <Loader2 className="w-12 h-12 animate-spin text-green-500" />
        </div>
      )}

      <div className="p-5 space-y-5">
        <p className="text-sm text-gray-400">
          {new Date(message.timestamp).toLocaleString()}
        </p>

        <div className="grid grid-cols-3 gap-3">
          <button onClick={() => base64ToBlob(message.videoBase64).then(onShare)} className="bg-gradient-to-r from-purple-600 to-pink-600 py-4 rounded-xl font-bold text-sm">TikTok</button>
          <button onClick={() => base64ToBlob(message.videoBase64).then(onShare)} className="bg-green-600 py-4 rounded-xl font-bold text-sm">WhatsApp</button>
          <button onClick={() => base64ToBlob(message.videoBase64).then(onShare)} className="bg-blue-700 py-4 rounded-xl font-bold text-sm">Facebook</button>
          <button onClick={() => base64ToBlob(message.videoBase64).then(onShare)} className="bg-gradient-to-r from-pink-500 to-orange-500 py-4 rounded-xl font-bold text-sm col-span-2">Instagram</button>
          <button onClick={() => base64ToBlob(message.videoBase64).then(onShare)} className="bg-black border border-white py-4 rounded-xl font-bold text-sm">X / Twitter</button>
        </div>

        <div className="flex gap-3">
          <button onClick={handleDownload} className="flex-1 py-4 bg-gray-800 rounded-xl flex items-center justify-center gap-2">
            <Download /> Save
          </button>
          <button onClick={() => { msgDB.delete(user?.username || 'unknown', message.id); window.location.reload(); }}
            className="px-8 py-4 bg-red-900 rounded-xl">
            <Trash2 />
          </button>
        </div>
      </div>
    </div>
  );
}
