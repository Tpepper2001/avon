// src/App.jsx — VoxKey v1.0 — The Ultimate Anonymous Robot Voice App
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
} from 'lucide-react';

// ==================== VoxKey Storage ====================
const generateVoxKey = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = 'VX-';
  for (let i = 0; i < 4; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
};

const voxDB = {
  saveMessage(voxKey, msg) {
    const key = `vox_${voxKey}`;
    let list = JSON.parse(localStorage.getItem(key) || '[]');
    list.unshift({ ...msg, id: crypto.randomUUID() });
    if (list.length > 100) list = list.slice(0, 100);
    localStorage.setItem(key, JSON.stringify(list));
  },
  getMessages(voxKey) {
    return JSON.parse(localStorage.getItem(`vox_${voxKey}`) || '[]');
  },
  deleteMessage(voxKey, id) {
    const key = `vox_${voxKey}`;
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
  const [voxKey, setVoxKey] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [view, setView] = useState('landing');
  const [targetKey, setTargetKey] = useState('');
  const [messages, setMessages] = useState([]);
  const [linkCopied, setLinkCopied] = useState(false);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [processing, setProcessing] = useState(false);
  const [previewVideo, setPreviewVideo] = useState(null);

  // Refs
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

  // Initial load & routing
  useLayoutEffect(() => {
    const saved = localStorage.getItem('voxkey_session');
    if (saved) {
      const { key, name } = JSON.parse(saved);
      setVoxKey(key);
      setDisplayName(name || '');
      setMessages(voxDB.getMessages(key));
      setView('inbox');
    }

    const path = window.location.pathname;
    if (path.startsWith('/key/')) {
      const key = path.slice(5).toUpperCase();
      if (/^VX-[A-Z0-9]{4}$/.test(key)) {
        setTargetKey(key);
        setView('record');
      }
    }
  }, []);

  // Real-time inbox
  useEffect(() => {
    if (!voxKey) return;
    const interval = setInterval(() => {
      setMessages(voxDB.getMessages(voxKey));
    }, 1000);
    return () => clearInterval(interval);
  }, [voxKey]);

  // ==================== Recording ====================
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      setTranscript('');

      const mime = detectBestMime();
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = e => e.data.size && audioChunksRef.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mime });
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

      const stream = canvas.captureStream(30);
      const combined = new MediaStream([...stream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
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

        // Background
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 720, 1280);

        // Grid
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.08)';
        for (let i = 0; i < 1280; i += 100) {
          ctx.beginPath();
          ctx.moveTo(0, i);
          ctx.lineTo(720, i);
          ctx.stroke();
        }

        // Robot Head
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(180, 300, 360, 520);

        // Eyes
        ctx.shadowBlur = 60 + vol * 140;
        ctx.shadowColor = '#0ff';
        ctx.fillStyle = '#0ff';
        ctx.beginPath();
        ctx.arc(280, 460, 60 + vol * 40, 0, Math.PI * 2);
        ctx.arc(440, 460, 60 + vol * 40, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Mouth waveform
        ctx.strokeStyle = '#0ff';
        ctx.lineWidth = 12;
        ctx.beginPath();
        for (let i = 0; i < 35; i++) {
          const x = 200 + i * 14;
          const y = 620 + Math.sin(elapsed / 100 + i) * vol * 100;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Cipher Text
        ctx.font = 'bold 44px monospace';
        ctx.fillStyle = '#0ff';
        ctx.textAlign = 'center';
        const shown = words.slice(0, Math.floor(progress * words.length) + 2).join(' ') + '...';
        const lines = shown.match(/.{1,20}(\s|$)/g) || [];
        lines.forEach((line, i) => ctx.fillText(line.trim(), 360, 950 + i * 70));

        // Progress
        ctx.fillStyle = '#111';
        ctx.fillRect(80, 1180, 560, 34);
        ctx.fillStyle = '#0ff';
        ctx.fillRect(80, 1180, 560 * progress, 34);

        if (elapsed < duration) {
          animationRef.current = requestAnimationFrame(draw);
        } else {
          setTimeout(() => recorder.stop(), 800);
        }
      };
      animationRef.current = requestAnimationFrame(draw);
    } catch (err) {
      alert('VoxCast generation failed');
      setProcessing(false);
    }
  };

  // ==================== Send VoxCast ====================
  const sendVoxCast = async () => {
    if (!previewVideo || !targetKey) return;
    setProcessing(true);
    try {
      const base64 = await blobToBase64(previewVideo.blob);
      const msg = {
        id: crypto.randomUUID(),
        text: transcript.trim() || 'VoxCast',
        timestamp: new Date().toISOString(),
        duration: recordingTime,
        videoBase64: base64,
        mimeType: previewVideo.blob.type,
      };

      voxDB.saveMessage(targetKey, msg);
      cancelRecording();
      setView('sent');
    } catch (e) {
      alert('Transmission failed');
    } finally {
      setProcessing(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/key/${voxKey}`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  // ==================== VIEWS ====================

  // Landing / Create VoxKey
  if (view === 'landing') {
    const [name, setName] = useState('');
    const createKey = () => {
      const key = generateVoxKey();
      localStorage.setItem('voxkey_session', JSON.stringify({ key, name: name.trim() || 'Anonymous' }));
      setVoxKey(key);
      setDisplayName(name.trim() || 'Anonymous');
      setView('inbox');
    };

    return (
      <div className="min-h-screen bg-black text-cyan-400 font-mono flex flex-col items-center justify-center p-8 text-center">
        <Zap className="w-32 h-32 mb-8 animate-pulse" />
        <h1 className="text-7xl font-bold mb-6">VoxKey</h1>
        <p className="text-2xl mb-12 max-w-2xl">
          Receive anonymous robot voice messages<br />
          <span className="text-cyan-300">No login required to send</span>
        </p>
        <input
          placeholder="Your display name (optional)"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full max-w-md p-5 mb-8 bg-black border-2 border-cyan-600 rounded-xl text-xl text-center"
          maxLength={30}
        />
        <button onClick={createKey} className="px-16 py-8 bg-cyan-600 rounded-2xl text-3xl font-bold hover:bg-cyan-500 transition">
          Generate VoxKey
        </button>
      </div>
    );
  }

  // Record View
  if (view === 'record') {
    return (
      <div className="bg-black text-cyan-400 min-h-screen flex flex-col">
        <canvas ref={canvasRef} className="hidden" />
        <div className="p-6 bg-gradient-to-b from-cyan-900/20 to-black text-center">
          <h2 className="text-4xl font-bold mb-2">Transmission to</h2>
          <code className="text-5xl font-bold text-cyan-300">{targetKey}</code>
          <p className="text-xl mt-4 opacity-80">100% Anonymous • No Trace</p>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-8">
          {previewVideo ? (
            <div className="w-full max-w-md">
              <video src={previewVideo.url} controls className="w-full rounded-2xl shadow-2xl shadow-cyan-500/50" />
              <div className="flex gap-4 mt-8">
                <button onClick={cancelRecording} className="flex-1 py-6 bg-red-600 rounded-xl text-2xl">
                  <Trash2 className="mx-auto" />
                </button>
                <button onClick={sendVoxCast} disabled={processing} className="flex-1 py-6 bg-cyan-600 rounded-xl text-2xl font-bold disabled:opacity-50">
                  {processing ? <Loader2 className="mx-auto animate-spin" /> : <Radio className="mx-auto" />} Transmit
                </button>
              </div>
            </div>
          ) : processing ? (
            <div className="text-center">
              <Loader2 className="w-24 h-24 mx-auto animate-spin text-cyan-400 mb-8" />
              <p className="text-3xl">Encrypting VoxCast...</p>
            </div>
          ) : audioBlob ? (
            <div className="text-center space-y-8 max-w-lg">
              <button onClick={() => {
                const audio = new Audio(createObjectURL(audioBlob));
                audio.play();
              }} className="bg-gray-900 p-12 rounded-3xl border-4 border-cyan-600">
                <Radio className="w-32 h-32 text-cyan-400" />
              </button>
              <p className="text-5xl font-mono">{formatTime(recordingTime)}</p>
              {transcript && <p className="text-xl opacity-80 px-8">{transcript}</p>}
              <button onClick={generateVoxCast} className="px-16 py-8 bg-cyan-600 rounded-2xl text-3xl font-bold">
                Generate VoxCast
              </button>
            </div>
          ) : (
            <button
              onClick={() => isRecording ? stopRecording() : startRecording()}
              className={`w-48 h-48 rounded-full flex items-center justify-center text-8xl font-bold transition-all shadow-2xl
                ${isRecording ? 'bg-red-600 animate-pulse scale-110' : 'bg-cyan-600 hover:scale-105'}`}
            >
              {isRecording ? 'Stop' : 'Rec'}
            </button>
          )}
          {isRecording && <p className="mt-12 text-6xl text-red-500 animate-pulse font-mono">{formatTime(recordingTime)}</p>}
        </div>
      </div>
    );
  }

  // Sent Confirmation
  if (view === 'sent') {
    return (
      <div className="min-h-screen bg-black text-cyan-400 flex flex-col items-center justify-center p-8 text-center">
        <CheckCircle className="w-40 h-40 mb-12 text-cyan-400" />
        <h1 className="text-6xl font-bold mb-6">Transmission Complete</h1>
        <p className="text-3xl mb-12 opacity-90">Cipher delivered to {targetKey}</p>
        <button onClick={() => { cancelRecording(); setView('record'); }} className="px-16 py-8 bg-cyan-600 rounded-2xl text-3xl font-bold">
          Send Another
        </button>
      </div>
    );
  }

  // Inbox
  if (view === 'inbox' && voxKey) {
    return (
      <div className="min-h-screen bg-black text-cyan-400 font-mono p-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-5xl font-bold">{voxKey}</h1>
            {displayName && <p className="text-2xl opacity-80">{displayName}</p>}
          </div>
          <button onClick={() => {
            localStorage.removeItem('voxkey_session');
            window.location.reload();
          }}>
            <Lock className="w-10 h-10" />
          </button>
        </div>

        <div className="bg-gray-900 border-2 border-cyan-600 p-6 rounded-2xl mb-8">
          <p className="text-xl mb-3 flex items-center gap-3">
            <Globe className="w-6 h-6" /> Your VoxKey Link
          </p>
          <code className="block bg-black p-4 rounded-xl text-lg break-all">
            {window.location.origin}/key/{voxKey}
          </code>
          <button onClick={copyLink} className="mt-4 w-full py-5 bg-cyan-600 rounded-xl flex items-center justify-center gap-3 text-xl font-bold">
            {linkCopied ? <CheckCircle /> : <Copy />}
            {linkCopied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>

        <h2 className="text-4xl mb-8 flex items-center gap-4">
          <Radio className="w-12 h-12" /> Incoming VoxCasts ({messages.length})
        </h2>

        {messages.length === 0 ? (
          <p className="text-center text-3xl text-gray-600 mt-32">No transmissions yet</p>
        ) : (
          <div className="space-y-8">
            {messages.map(m => <VoxCastCard key={m.id} message={m} voxKey={voxKey} />)}
          </div>
        )}
      </div>
    );
  }

  return null;
}

// ==================== VoxCast Card ====================
function VoxCastCard({ message, voxKey }) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    let mounted = true;
    base64ToBlob(message.videoBase64).then(blob => {
      if (mounted) setUrl(URL.createObjectURL(blob));
    });
    return () => { mounted = false; if (url) URL.revokeObjectURL(url); };
  }, [message.videoBase64]);

  const share = async () => {
    const blob = await base64ToBlob(message.videoBase64);
    const file = new File([blob], 'voxcast.webm', { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'VoxKey Transmission' });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'voxcast.webm';
      a.click();
    }
  };

  return (
    <div className="bg-gray-900 rounded-2xl overflow-hidden border-2 border-cyan-600">
      {url ? (
        <video src={url} controls className="w-full aspect-[9/16]" />
      ) : (
        <div className="w-full aspect-[9/16] bg-black flex items-center justify-center">
          <Loader2 className="w-20 h-20 animate-spin text-cyan-400" />
        </div>
      )}
      <div className="p-6 space-y-4">
        <p className="text-sm opacity-80">
          Transmission Received • {new Date(message.timestamp).toLocaleString()}
        </p>
        {message.text && <p className="text-lg font-medium">"{message.text}"</p>}
        <div className="flex gap-4">
          <button onClick={share} className="flex-1 py-5 bg-cyan-600 rounded-xl font-bold text-xl flex items-center justify-center gap-3">
            <Share2 /> Share
          </button>
          <button onClick={() => {
            voxDB.deleteMessage(voxKey, message.id);
            window.location.reload();
          }} className="px-8 py-5 bg-red-900 rounded-xl">
            <Trash2 />
          </button>
        </div>
      </div>
    </div>
  );
}
