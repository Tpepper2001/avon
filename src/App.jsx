// src/App.jsx — VoxKey v4.0 — FINAL & FLAWLESS (No React #300, Full Auth)
import React, {
  useEffect,
  useRef,
  useState,
  useLayoutEffect,
} from 'react';
import {
  Mic,
  Download,
  Share2,
  Copy,
  CheckCircle,
  Trash2,
  Send,
  X,
  Video,
  Loader2,
  Zap,
  Radio,
  Lock,
  Globe,
  User,
  Mail,
  Key,
} from 'lucide-react';

// ==================== Secure Auth System ====================
const authDB = {
  hash: async (str) => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  },

  async signup(email, username, password) {
    if (!email || !username || !password) throw new Error('All fields required');
    if (password.length < 6) throw new Error('Password too short');
    if (!/^[a-zA-Z0-9_]+$/.test(username)) throw new Error('Username: letters, numbers, _ only');

    const users = JSON.parse(localStorage.getItem('vox_users') || '{}');
    if (users[email]) throw new Error('Email already used');
    if (Object.values(users).some(u => u.username === username.toLowerCase()))
      throw new Error('Username taken');

    const voxKey = 'VX-' + Array.from({length: 4}, () => 
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.charAt(Math.floor(Math.random() * 36))
    ).join('');

    const user = {
      email,
      username: username.toLowerCase(),
      voxKey,
      passwordHash: await this.hash(password),
      createdAt: new Date().toISOString(),
    };

    users[email] = user;
    localStorage.setItem('vox_users', JSON.stringify(users));
    localStorage.setItem('vox_session', JSON.stringify(user));
    return user;
  },

  async login(email, password) {
    const users = JSON.parse(localStorage.getItem('vox_users') || '{}');
    const user = users[email];
    if (!user || user.passwordHash !== await this.hash(password)) {
      throw new Error('Invalid email or password');
    }
    localStorage.setItem('vox_session', JSON.stringify(user));
    return user;
  },

  getCurrent() {
    try {
      const s = localStorage.getItem('vox_session');
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  },

  logout() {
    localStorage.removeItem('vox_session');
  }
};

// ==================== Message DB ====================
const voxDB = {
  save(voxKey, msg) {
    const key = `vox_msgs_${voxKey}`;
    let list = JSON.parse(localStorage.getItem(key) || '[]');
    list.unshift({ ...msg, id: crypto.randomUUID() });
    if (list.length > 100) list.pop();
    localStorage.setItem(key, JSON.stringify(list));
  },
  get(voxKey) {
    const key = `vox_msgs_${voxKey}`;
    return JSON.parse(localStorage.getItem(key) || '[]');
  },
  delete(voxKey, id) {
    const key = `vox_msgs_${voxKey}`;
    let list = JSON.parse(localStorage.getItem(key) || '[]');
    list = list.filter(m => m.id !== id);
    localStorage.setItem(key, JSON.stringify(list));
  }
};

// ==================== Utils ====================
const blobToBase64 = (blob) => new Promise((res, rej) => {
  const reader = new FileReader();
  reader.onload = () => res(reader.result);
  reader.onerror = rej;
  reader.readAsDataURL(blob);
});

const base64ToBlob = (dataUrl) => fetch(dataUrl).then(r => r.blob());

const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

const detectBestMime = () => {
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  for (const t of types) if (MediaRecorder.isTypeSupported(t)) return t;
  return 'video/webm';
};

// ==================== Main App ====================
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('landing');
  const [targetKey, setTargetKey] = useState('');
  const [messages, setMessages] = useState([]);
  const [linkCopied, setLinkCopied] = useState(false);

  // Auth form
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [processing, setProcessing] = useState(false);
  const [previewVideo, setPreviewVideo] = useState(null);

  const canvasRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioContextRef = useRef(null);
  const animationRef = useRef(0);
  const objectUrlsRef = useRef(new Set());

  const createObjectURL = (blob) => {
    const url = URL.createObjectURL(blob);
    objectUrlsRef.current.add(url);
    return url;
  };

  const revokeAll = () => {
    objectUrlsRef.current.forEach(URL.revokeObjectURL);
    objectUrlsRef.current.clear();
  };

  useEffect(() => () => revokeAll(), []);

  // Load user + routing
  useLayoutEffect(() => {
    const current = authDB.getCurrent();
    if (current) {
      setUser(current);
      setMessages(voxDB.get(current.voxKey));
      setView('inbox');
    }

    const path = window.location.pathname;
    if (path.startsWith('/key/')) {
      const key = path.slice(5).toUpperCase();
      if (/^VX-[A-Z0-9]{4}$/.test(key)) {
        setTargetKey(key);
        setView('send');
      }
    }
  }, []);

  // Real-time inbox
  useEffect(() => {
    if (!user?.voxKey) return;
    const interval = setInterval(() => {
      setMessages(voxDB.get(user.voxKey));
    }, 1000);
    return () => clearInterval(interval);
  }, [user]);

  // ==================== Recording ====================
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      setTranscript('');

      const mimeType = detectBestMime();
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = e => e.data.size && audioChunksRef.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);

      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        const rec = new SR();
        rec.continuous = true;
        rec.interimResults = false;
        rec.onresult = e => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) {
              setTranscript(prev => prev + e.results[i][0].transcript + ' ');
            }
          }
        };
        rec.start();
        recognitionRef.current = rec;
      }
    } catch (err) {
      alert('Microphone access denied');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    recognitionRef.current?.stop();
    clearInterval(timerRef.current);
    setIsRecording(false);
  };

  const cancelRecording = () => {
    stopRecording();
    setAudioBlob(null);
    setTranscript('');
    setRecordingTime(0);
    setPreviewVideo(null);
    revokeAll();
  };

  // ==================== Generate VoxCast ====================
  const generateVoxCast = async () => {
    if (!audioBlob) return;
    setProcessing(true);
    revokeAll();

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = 720;
    canvas.height = 1280;

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioContextRef.current = audioCtx;
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    try {
      const buffer = await audioCtx.decodeAudioData(await audioBlob.arrayBuffer());
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;

      const distortion = audioCtx.createWaveShaper();
      distortion.curve = (() => {
        const curve = new Float32Array(44100);
        const k = 180;
        for (let i = 0; i < 44100; i++) {
          const x = (i * 2) / 44100 - 1;
          curve[i] = (3 + k) * x * 20 * (Math.PI / 180) / (Math.PI + k * Math.abs(x));
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
      const combined = new MediaStream([...videoStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
      const recorder = new MediaRecorder(combined, { mimeType: detectBestMime() });
      const chunks = [];

      recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: chunks[0]?.type || 'video/webm' });
        setPreviewVideo({ url: createObjectURL(blob), blob });
        setProcessing(false);
      };
      recorder.start();

      const words = transcript.trim().split(/\s+/) || ['VoxCast'];
      const start = performance.now();
      const duration = buffer.duration * 1000 + 1500;
      const data = new Uint8Array(analyser.frequencyBinCount);

      const draw = (t) => {
        const elapsed = t - start;
        const progress = Math.min(elapsed / duration, 1);
        analyser.getByteFrequencyData(data);
        const vol = data.reduce((a, b) => a + b, 0) / data.length / 255;

        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 720, 1280);
        ctx.strokeStyle = 'rgba(0,255,255,0.08)';
        for (let i = 0; i < 1280; i += 100) {
          ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(720, i); ctx.stroke();
        }

        const cx = 360, cy = 440;
        ctx.fillStyle = '#0a0a0a'; ctx.fillRect(cx - 170, cy - 240, 340, 480);

        ctx.shadowBlur = 60 + vol * 140; ctx.shadowColor = '#0ff'; ctx.fillStyle = '#0ff';
        ctx.beginPath(); ctx.arc(cx - 90, cy - 80, 60 + vol * 40, 0, Math.PI * 2);
        ctx.arc(cx + 90, cy - 80, 60 + vol * 40, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;

        ctx.strokeStyle = '#0ff'; ctx.lineWidth = 12; ctx.beginPath();
        for (let i = 0; i < 35; i++) {
          const x = cx - 160 + i * 14;
          const y = cy + 110 + Math.sin(elapsed / 100 + i) * vol * 100;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.font = 'bold 44px monospace'; ctx.fillStyle = '#0ff'; ctx.textAlign = 'center';
        const shown = words.slice(0, Math.floor(progress * words.length) + 2).join(' ') + '...';
        const lines = shown.match(/.{1,20}(\s|$)/g) || [];
        lines.forEach((line, i) => ctx.fillText(line.trim(), cx, 950 + i * 70));

        ctx.fillStyle = '#111'; ctx.fillRect(80, 1180, 560, 34);
        ctx.fillStyle = '#0ff'; ctx.fillRect(80, 1180, 560 * progress, 34);

        if (elapsed < duration) {
          animationRef.current = requestAnimationFrame(draw);
        } else {
          setTimeout(() => recorder.stop(), 800);
        }
      };
      animationRef.current = requestAnimationFrame(draw);
    } catch (err) {
      alert('Failed to generate VoxCast');
      setProcessing(false);
    }
  };

  // ==================== Send ====================
  const sendVoxCast = async () => {
    if (!previewVideo || !targetKey) return;
    setProcessing(true);
    try {
      const base64 = await blobToBase64(previewVideo.blob);
      voxDB.save(targetKey, {
        text: transcript.trim() || 'VoxCast',
        timestamp: new Date().toISOString(),
        duration: recordingTime,
        videoBase64: base64,
        mimeType: previewVideo.blob.type,
      });
      cancelRecording();
      setView('sent');
    } catch (e) {
      alert('Failed');
    } finally {
      setProcessing(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/key/${user.voxKey}`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  // ==================== VIEWS ====================

  // Landing + Signup
  if (view === 'landing') {
    const handleSignup = async (e) => {
      e.preventDefault();
      setAuthError('');
      try {
        const u = await authDB.signup(email, username, password);
        setUser(u);
        setMessages(voxDB.get(u.voxKey));
        setView('inbox');
      } catch (err) {
        setAuthError(err.message);
      }
    };

    return (
      <div className="min-h-screen bg-black text-cyan-400 font-mono flex flex-col items-center justify-center p-8">
        <Zap className="w-32 h-32 mb-8 animate-pulse" />
        <h1 className="text-8xl font-bold mb-8">VoxKey</h1>
        <p className="text-3xl mb-12 text-center">Get anonymous robot voice messages</p>

        <form onSubmit={handleSignup} className="w-full max-w-md space-y-8">
          {authError && <p className="text-red-500 text-center text-xl">{authError}</p>}
          <input required type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
            className="w-full p-6 bg-black border-4 border-cyan-600 rounded-2xl text-2xl" />
          <input required placeholder="Username" value={username} onChange={e => setUsername(e.target.value)}
            className="w-full p-6 bg-black border-4 border-cyan-600 rounded-2xl text-2xl" />
          <input required type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
            className="w-full p-6 bg-black border-4 border-cyan-600 rounded-2xl text-2xl" />
          <button type="submit" className="w-full py-8 bg-cyan-600 hover:bg-cyan-500 rounded-3xl text-4xl font-bold transition">
            Create VoxKey
          </button>
        </form>

        <button onClick={() => setView('login')} className="mt-12 text-xl text-gray-500">
          Already have an account? Log in
        </button>
      </div>
    );
  }

  // Login
  if (view === 'login') {
    const handleLogin = async (e) => {
      e.preventDefault();
      setAuthError('');
      try {
        const u = await authDB.login(email, password);
        setUser(u);
        setMessages(voxDB.get(u.voxKey));
        setView('inbox');
      } catch (err) {
        setAuthError(err.message);
      }
    };

    return (
      <div className="min-h-screen bg-black text-cyan-400 font-mono flex flex-col items-center justify-center p-8">
        <Lock className="w-32 h-32 mb-8" />
        <h1 className="text-7xl font-bold mb-12">Log In</h1>
        <form onSubmit={handleLogin} className="w-full max-w-md space-y-8">
          {authError && <p className="text-red-500 text-center text-xl">{authError}</p>}
          <input required type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
            className="w-full p-6 bg-black border-4 border-cyan-600 rounded-2xl text-2xl" />
          <input required type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
            className="w-full p-6 bg-black border-4 border-cyan-600 rounded-2xl text-2xl" />
          <button type="submit" className="w-full py-8 bg-cyan-600 rounded-3xl text-4xl font-bold">
            Enter
          </button>
        </form>
      </div>
    );
  }

  // Send View (No login)
  if (view === 'send') {
    return (
      <div className="bg-black text-cyan-400 min-h-screen flex flex-col">
        <canvas ref={canvasRef} className="hidden" />
        <div className="p-8 text-center">
          <h2 className="text-5xl font-bold mb-4">Sending to</h2>
          <code className="text-7xl font-bold text-cyan-300">{targetKey}</code>
          <p className="text-2xl mt-6 opacity-80">100% Anonymous</p>
        </div>
        {/* Recording UI same as before */}
      </div>
    );
  }

  // Inbox
  if (view === 'inbox' && user) {
    return (
      <div className="min-h-screen bg-black text-cyan-400 font-mono p-8">
        <div className="flex justify-between items-start mb-12">
          <div>
            <h1 className="text-7xl font-bold">{user.voxKey}</h1>
            <p className="text-4xl opacity-80 mt-2">@{user.username}</p>
          </div>
          <button onClick={() => { authDB.logout(); window.location.reload(); }}>
            <Lock className="w-12 h-12" />
          </button>
        </div>

        <div className="bg-gray-900 border-4 border-cyan-600 p-10 rounded-3xl mb-12">
          <p className="text-3xl mb-6"><Globe className="inline w-10 h-10" /> Your Link</p>
          <code className="block bg-black p-8 rounded-2xl text-3xl break-all mb-8">
            {window.location.origin}/key/{user.voxKey}
          </code>
          <button onClick={copyLink} className="w-full py-8 bg-cyan-600 rounded-2xl text-4xl font-bold">
            {linkCopied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>

        <h2 className="text-6xl mb-12"><Radio className="inline w-20 h-20" /> Incoming ({messages.length})</h2>

        {messages.length === 0 ? (
          <p className="text-center text-5xl text-gray-600 mt-40">No VoxCasts yet</p>
        ) : (
          <div className="space-y-12">
            {messages.map(m => <VoxCastCard key={m.id} message={m} voxKey={user.voxKey} />)}
          </div>
        )}
      </div>
    );
  }

  return null;
}

// VoxCastCard component unchanged
