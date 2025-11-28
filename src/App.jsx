// src/App.jsx — VoiceAnon v5.0 — TRUE NGL STYLE (No Login to Send!)
import React, {
  useEffect,
  useRef,
  useState,
  useLayoutEffect,
} from 'react';
import {
  Mic,
  Download,
  Copy,
  CheckCircle,
  Inbox,
  LogOut,
  Play,
  Pause,
  Trash2,
  Send,
  X,
  Video,
  Loader2,
  User,
  Link2,
} from 'lucide-react';

// ==================== Message DB (Recipient-Based Only) ====================
const MAX_VIDEO_BASE64 = 18 * 1024 * 1024;
const MAX_MESSAGES = 100;

const msgDB = {
  async save(recipientUsername, msg) {
    if (!recipientUsername) throw new Error('No recipient');
    if (msg.videoBase64.length > MAX_VIDEO_BASE64) {
      throw new Error('Video too large');
    }
    const key = `va_msgs_${recipientUsername.toLowerCase()}`;
    let list = JSON.parse(localStorage.getItem(key) || '[]');
    list.unshift({ ...msg, id: crypto.randomUUID() });
    if (list.length > MAX_MESSAGES) list = list.slice(0, MAX_MESSAGES);
    localStorage.setItem(key, JSON.stringify(list));
  },

  get(username) {
    if (!username) return [];
    return JSON.parse(localStorage.getItem(`va_msgs_${username.toLowerCase()}`) || '[]');
  },

  delete(username, id) {
    const key = `va_msgs_${username.toLowerCase()}`;
    let list = JSON.parse(localStorage.getItem(key) || '[]');
    list = list.filter((m) => m.id !== id);
    localStorage.setItem(key, JSON.stringify(list));
  },
};

// ==================== Simple Auth (Optional — Only for Inbox) ====================
const mockAuth = {
  currentUser: null,
  init() {
    try {
      const s = localStorage.getItem('va_session');
      if (s) this.currentUser = JSON.parse(s);
    } catch {}
  },
  signOut() {
    this.currentUser = null;
    localStorage.removeItem('va_session');
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
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  for (const type of candidates) if (MediaRecorder.isTypeSupported(type)) return type;
  return 'video/webm';
};

// ==================== Main App ====================
export default function App() {
  const [user, setUser] = useState(mockAuth.currentUser);
  const [view, setView] = useState('landing');
  const [targetUsername, setTargetUsername] = useState('');
  const [messages, setMessages] = useState([]);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [processing, setProcessing] = useState(false);
  const [previewVideo, setPreviewVideo] = useState(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

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

  const revokeAllObjectURLs = () => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current.clear();
  };

  // Cleanup
  useEffect(() => {
    return () => revokeAllObjectURLs();
  }, []);

  // Initial load + routing
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

  // Real-time inbox updates when logged in
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      setMessages(msgDB.get(user.username));
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

      recorder.ondataavailable = (e) => e.data.size && audioChunksRef.current.push(e.data);
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
    revokeAllObjectURLs();
  };

  // ==================== Generate Robot Video ====================
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
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    try {
      const audioBuffer = await audioCtx.decodeAudioData(await audioBlob.arrayBuffer());
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;

      const distortion = audioCtx.createWaveShaper();
      distortion.curve = (() => {
        const curve = new Float32Array(44100);
        const amount = 140;
        for (let i = 0; i < 44100; i++) {
          const x = (i * 2) / 44100 - 1;
          curve[i] = (3 + amount) * x * 20 * (Math.PI / 180) / (Math.PI + amount * Math.abs(x));
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

        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 720, 1280);
        ctx.strokeStyle = 'rgba(0,255,0,0.07)'; ctx.lineWidth = 2;
        for (let i = 0; i < 1280; i += 80) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(720, i); ctx.stroke(); }

        const cx = 360, cy = 440;
        ctx.fillStyle = '#0a0a0a'; ctx.fillRect(cx - 170, cy - 240, 340, 480);
        ctx.shadowBlur = 50 + volume * 120; ctx.shadowColor = '#0f0'; ctx.fillStyle = '#0f0';
        ctx.beginPath(); ctx.arc(cx - 90, cy - 80, 55 + volume * 35, 0, Math.PI * 2);
        ctx.arc(cx + 90, cy - 80, 55 + volume * 35, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;

        ctx.strokeStyle = '#0f0'; ctx.lineWidth = 10; ctx.beginPath();
        for (let i = 0; i < 32; i++) {
          const x = cx - 150 + i * 15;
          const y = cy + 110 + Math.sin(elapsed / 120 + i) * volume * 90;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.font = 'bold 46px monospace'; ctx.fillStyle = '#0f0'; ctx.textAlign = 'center';
        const text = words.slice(0, Math.floor(progress * words.length) + 2).join(' ') + '...';
        const lines = text.match(/.{1,22}(\s|$)/g) || [];
        lines.forEach((line, i) => ctx.fillText(line.trim(), cx, 900 + i * 68));

        ctx.fillStyle = '#111'; ctx.fillRect(80, 1160, 560, 32);
        ctx.fillStyle = '#0f0'; ctx.fillRect(80, 1160, 560 * progress, 32);

        if (elapsed < duration) {
          animationRef.current = requestAnimationFrame(draw);
        } else {
          setTimeout(() => recorder.stop(), 800);
        }
      };
      animationRef.current = requestAnimationFrame(draw);
    } catch (err) {
      alert('Video generation failed');
      setProcessing(false);
    }
  };

  // ==================== SEND MESSAGE — TRUE NGL STYLE ====================
  const sendMessage = async () => {
    if (!previewVideo || !targetUsername) return;
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

      // Always save to recipient's inbox — no login needed to send!
      await msgDB.save(targetUsername.toLowerCase(), msg);

      cancelRecording();
      setView('sent');
    } catch (e) {
      alert('Failed to send');
    } finally {
      setProcessing(false);
    }
  };

  // ==================== Render ====================
  if (view === 'landing') {
    return (
      <div className="min-h-screen bg-black text-green-400 font-mono flex flex-col items-center justify-center p-6">
        <Video className="w-32 h-32 mb-8 animate-pulse" />
        <h1 className="text-7xl font-bold mb-4">VoiceAnon</h1>
        <p className="text-3xl mb-12">Send anonymous robot messages</p>
        <button onClick={() => setView('record')} className="px-12 py-6 bg-green-600 rounded-2xl text-3xl font-bold">
          Start Sending
        </button>
      </div>
    );
  }

  if (view === 'record') {
    return (
      <div className="bg-black text-white min-h-screen flex flex-col">
        <canvas ref={canvasRef} className="hidden" />
        <div className="p-6 bg-gray-900 text-center">
          <h2 className="text-3xl font-bold mb-2">Send to @{targetUsername || 'someone'}</h2>
          <p className="text-gray-400">100% anonymous • no login needed</p>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-8">
          {previewVideo ? (
            <div className="w-full max-w-sm">
              <video src={previewVideo.url} controls className="w-full rounded-2xl shadow-2xl" />
              <div className="flex gap-4 mt-8">
                <button onClick={cancelRecording} className="flex-1 py-5 bg-red-600 rounded-xl">
                  <Trash2 className="mx-auto" />
                </button>
                <button onClick={sendMessage} disabled={processing} className="flex-1 py-5 bg-green-600 rounded-xl font-bold text-xl disabled:opacity-50">
                  {processing ? <Loader2 className="mx-auto animate-spin" /> : <Send className="mx-auto" />} Send
                </button>
              </div>
            </div>
          ) : processing ? (
            <div className="text-center">
              <Loader2 className="w-20 h-20 mx-auto animate-spin text-green-500 mb-6" />
              <p className="text-2xl">Building robot video...</p>
            </div>
          ) : audioBlob ? (
            <div className="text-center space-y-8">
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
                {isPlayingPreview ? <Pause className="w-24 h-24" /> : <Play className="w-24 h-24" />}
              </button>
              <p className="text-4xl font-mono">{formatTime(recordingTime)}</p>
              {transcript && <p className="text-lg text-gray-400 max-w-md mx-auto">{transcript}</p>}
              <div className="flex gap-4">
                <button onClick={cancelRecording} className="px-10 py-5 bg-red-600 rounded-xl"><Trash2 /></button>
                <button onClick={generatePreview} className="flex-1 py-5 bg-green-600 rounded-xl text-xl font-bold">
                  Convert to Robot Video
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => isRecording ? stopRecording() : startRecording()}
              className={`w-40 h-40 rounded-full flex items-center justify-center text-7xl font-bold transition-all shadow-2xl ${isRecording ? 'bg-red-600 animate-pulse scale-110' : 'bg-green-600'}`}>
              {isRecording ? 'Stop' : 'Rec'}
            </button>
          )}
          {isRecording && <p className="mt-8 text-4xl text-red-500 animate-pulse font-mono">{formatTime(recordingTime)}</p>}
        </div>
      </div>
    );
  }

  if (view === 'sent') {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 text-center">
        <CheckCircle className="w-32 h-32 text-green-500 mb-8" />
        <h1 className="text-5xl font-bold mb-6">Sent Anonymously!</h1>
        <p className="text-xl text-gray-400 mb-12">@{targetUsername} will see it in their inbox</p>
        <button onClick={() => { cancelRecording(); setView('record'); }} className="px-12 py-6 bg-green-600 rounded-xl text-2xl">
          Send Another
        </button>
      </div>
    );
  }

  // Optional login for inbox
  if (view === 'login') {
    const [username, setUsername] = useState('');
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="bg-gray-900 p-10 rounded-2xl border border-green-800 w-full max-w-sm">
          <h2 className="text-4xl text-green-500 text-center mb-8">View Your Inbox</h2>
          <input
            placeholder="Your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full p-4 bg-black border border-green-800 rounded text-white text-lg mb-6"
          />
          <button
            onClick={() => {
              localStorage.setItem('va_session', JSON.stringify({ username: username.toLowerCase() }));
              setUser({ username: username.toLowerCase() });
              setMessages(msgDB.get(username.toLowerCase()));
              setView('inbox');
            }}
            className="w-full py-5 bg-green-600 rounded-xl text-2xl font-bold"
          >
            Open Inbox
          </button>
        </div>
      </div>
    );
  }

  if (view === 'inbox' && user) {
    return (
      <div className="min-h-screen bg-black text-white font-mono p-6">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl">@{user.username}'s Inbox ({messages.length})</h1>
          <button onClick={() => { mockAuth.signOut(); setUser(null); setView('landing'); }}>
            <LogOut className="w-8 h-8" />
          </button>
        </div>
        {messages.length === 0 ? (
          <p className="text-center text-gray-500 text-2xl mt-32">No messages yet</p>
        ) : (
          <div className="space-y-8">
            {messages.map((m) => <MessageCard key={m.id} message={m} currentUser={user} />)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-green-400 font-mono flex flex-col items-center justify-center p-6">
      <Video className="w-32 h-32 mb-8 animate-pulse" />
      <h1 className="text-7xl font-bold mb-4">VoiceAnon</h1>
      <p className="text-3xl mb-12">Send anonymous robot messages</p>
      <button onClick={() => setView('record')} className="px-12 py-6 bg-green-600 rounded-2xl text-3xl font-bold">
        Start Sending
      </button>
      <button onClick={() => setView('login')} className="mt-8 text-gray-500">
        Have an inbox? Log in
      </button>
    </div>
  );
}

// ==================== MessageCard ====================
function MessageCard({ message, currentUser }) {
  const [videoUrl, setVideoUrl] = useState('');

  useEffect(() => {
    let mounted = true;
    base64ToBlob(message.videoBase64).then((blob) => {
      if (mounted) setVideoUrl(URL.createObjectURL(blob));
    });
    return () => { mounted = false; if (videoUrl) URL.revokeObjectURL(videoUrl); };
  }, [message.videoBase64]);

  const share = async () => {
    const blob = await base64ToBlob(message.videoBase64);
    const file = new File([blob], 'anon.webm', { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'anon.webm';
      a.click();
    }
  };

  return (
    <div className="bg-gray-900 rounded-2xl overflow-hidden border border-green-900">
      {videoUrl ? <video src={videoUrl} controls className="w-full aspect-[9/16]" /> : <div className="w-full aspect-[9/16] bg-black flex items-center justify-center"><Loader2 className="w-16 h-16 animate-spin text-green-500" /></div>}
      <div className="p-5 space-y-4">
        <p className="text-sm text-gray-400">{new Date(message.timestamp).toLocaleString()}</p>
        <button onClick={share} className="w-full py-4 bg-green-600 rounded-xl font-bold">Share</button>
        <button onClick={() => { msgDB.delete(currentUser.username, message.id); window.location.reload(); }} className="w-full py-4 bg-red-900 rounded-xl">
          <Trash2 className="mx-auto" />
        </button>
      </div>
    </div>
  );
}
