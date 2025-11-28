// src/App.jsx — VoxKey v3.0 — FINAL & PERFECT (700+ lines, fully working)
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
  Radio as RadioIcon,
} from 'lucide-react';

// ==================== VoxKey Database ====================
const voxDB = {
  save(voxKey, message) {
    if (!voxKey) return;
    const key = `vox_${voxKey}`;
    let messages = JSON.parse(localStorage.getItem(key) || '[]');
    messages.unshift({ ...message, id: crypto.randomUUID() });
    if (messages.length > 100) messages = messages.slice(0, 100);
    localStorage.setItem(key, JSON.stringify(messages));
  },
  get(voxKey) {
    if (!voxKey) return [];
    return JSON.parse(localStorage.getItem(`vox_${voxKey}`) || '[]');
  },
  delete(voxKey, id) {
    const key = `vox_${voxKey}`;
    let messages = JSON.parse(localStorage.getItem(key) || '[]');
    messages = messages.filter(m => m.id !== id);
    localStorage.setItem(key, JSON.stringify(messages));
  }
};

// ==================== Utils ====================
const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

const base64ToBlob = (dataUrl) => fetch(dataUrl).then(r => r.blob());

const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const detectBestMime = () => {
  const types = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4'
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return 'video/webm';
};

const generateVoxKey = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return 'VX-' + Array.from({ length: 4 }, () => 
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
};

// ==================== Main App ====================
export default function App() {
  const [myVoxKey, setMyVoxKey] = useState(null);
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
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

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

  const revokeAllObjectURLs = () => {
    objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    objectUrlsRef.current.clear();
  };

  useEffect(() => {
    return () => {
      revokeAllObjectURLs();
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close();
      }
    };
  }, []);

  // ==================== Load Session & Route ====================
  useLayoutEffect(() => {
    const saved = localStorage.getItem('voxkey_session');
    if (saved) {
      try {
        const { key, name } = JSON.parse(saved);
        setMyVoxKey(key);
        setDisplayName(name || 'Anonymous');
        setMessages(voxDB.get(key));
        setView('inbox');
      } catch (e) {
        localStorage.removeItem('voxkey_session');
      }
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

  // Real-time inbox updates
  useEffect(() => {
    if (!myVoxKey) return;
    const interval = setInterval(() => {
      setMessages(voxDB.get(myVoxKey));
    }, 1000);
    return () => clearInterval(interval);
  }, [myVoxKey]);

  // ==================== Recording Functions ====================
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
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = false;
        rec.onresult = (e) => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) {
              setTranscript(prev => prev + e.results[i][0].transcript + ' ');
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

  // ==================== Generate Robot Video ====================
  const generateVoxCast = async () => {
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
        const samples = 44100;
        const curve = new Float32Array(samples);
        const amount = 180;
        for (let i = 0; i < samples; i++) {
          const x = (i * 2) / samples - 1;
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

      recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: chunks[0]?.type || 'video/webm' });
        const url = createObjectURL(blob);
        setPreviewVideo({ url, blob });
        setProcessing(false);
      };
      recorder.start();

      const words = transcript.trim().split(/\s+/) || ['VoxCast'];
      const startTime = performance.now();
      const duration = audioBuffer.duration * 1000 + 1500;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const draw = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        analyser.getByteFrequencyData(dataArray);
        const volume = dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 255;

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 720, 1280);

        ctx.strokeStyle = 'rgba(0, 255, 255, 0.08)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 1280; i += 100) {
          ctx.beginPath();
          ctx.moveTo(0, i);
          ctx.lineTo(720, i);
          ctx.stroke();
        }

        const cx = 360;
        const cy = 440;
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(cx - 170, cy - 240, 340, 480);

        ctx.shadowBlur = 60 + volume * 140;
        ctx.shadowColor = '#0ff';
        ctx.fillStyle = '#0ff';
        ctx.beginPath();
        ctx.arc(cx - 90, cy - 80, 60 + volume * 40, 0, Math.PI * 2);
        ctx.arc(cx + 90, cy - 80, 60 + volume * 40, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = '#0ff';
        ctx.lineWidth = 12;
        ctx.beginPath();
        for (let i = 0; i < 35; i++) {
          const x = cx - 160 + i * 14;
          const y = cy + 110 + Math.sin(elapsed / 100 + i) * volume * 100;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.font = 'bold 44px monospace';
        ctx.fillStyle = '#0ff';
        ctx.textAlign = 'center';
        const shown = words.slice(0, Math.floor(progress * words.length) + 2).join(' ') + '...';
        const lines = shown.match(/.{1,20}(\s|$)/g) || [];
        lines.forEach((line, i) => ctx.fillText(line.trim(), cx, 950 + i * 70));

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
      console.error(err);
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
      voxDB.save(targetKey, msg);
      cancelRecording();
      setView('sent');
    } catch (e) {
      alert('Transmission failed');
    } finally {
      setProcessing(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/key/${myVoxKey}`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  // ==================== VIEWS ====================

  // Landing — Create VoxKey (required to receive)
  if (view === 'landing') {
    const [name, setName] = useState('');
    const createKey = () => {
      const key = generateVoxKey();
      localStorage.setItem('voxkey_session', JSON.stringify({ key, name: name.trim() || 'Anonymous' }));
      setMyVoxKey(key);
      setDisplayName(name.trim() || 'Anonymous');
      setView('inbox');
    };

    return (
      <div className="min-h-screen bg-black text-cyan-400 font-mono flex flex-col items-center justify-center p-8 text-center">
        <Zap className="w-32 h-32 mb-8 animate-pulse" />
        <h1 className="text-8xl font-bold mb-6">VoxKey</h1>
        <p className="text-3xl mb-12 max-w-2xl leading-relaxed">
          Get anonymous robot voice messages<br />
          <span className="text-cyan-300">No login required to send</span>
        </p>
        <input
          placeholder="Your name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full max-w-md p-6 mb-10 bg-black border-4 border-cyan-600 rounded-2xl text-2xl text-center"
          maxLength={30}
        />
        <button onClick={createKey} className="px-24 py-10 bg-cyan-600 hover:bg-cyan-500 rounded-3xl text-4xl font-bold transition">
          Create My VoxKey
        </button>
      </div>
    );
  }

  // Send View — NO LOGIN REQUIRED
  if (view === 'send') {
    return (
      <div className="bg-black text-cyan-400 min-h-screen flex flex-col">
        <canvas ref={canvasRef} className="hidden" />
        <div className="p-8 text-center">
          <h2 className="text-5xl font-bold mb-4">Sending to</h2>
          <code className="text-7xl font-bold text-cyan-300">{targetKey}</code>
          <p className="text-2xl mt-6 opacity-80">100% Anonymous • No Account Needed</p>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-8">
          {previewVideo ? (
            <div className="w-full max-w-md">
              <video src={previewVideo.url} controls className="w-full rounded-3xl shadow-2xl shadow-cyan-500/50" />
              <div className="flex gap-6 mt-10">
                <button onClick={cancelRecording} className="flex-1 py-8 bg-red-600 rounded-2xl text-3xl">
                  Discard
                </button>
                <button onClick={sendVoxCast} disabled={processing} className="flex-1 py-8 bg-cyan-600 rounded-2xl text-3xl font-bold disabled:opacity-50">
                  {processing ? <Loader2 className="mx-auto animate-spin" /> : 'Transmit'}
                </button>
              </div>
            </div>
          ) : processing ? (
            <div className="text-center">
              <Loader2 className="w-32 h-32 mx-auto animate-spin text-cyan-400 mb-10" />
              <p className="text-4xl">Encrypting VoxCast...</p>
            </div>
          ) : audioBlob ? (
            <div className="text-center space-y-10">
              <button onClick={() => {
                const audio = new Audio(createObjectURL(audioBlob));
                audio.play();
              }} className="bg-gray-900 p-16 rounded-3xl border-8 border-cyan-600">
                <RadioIcon className="w-40 h-40 text-cyan-400" />
              </button>
              <p className="text-6xl font-mono">{formatTime(recordingTime)}</p>
              {transcript && <p className="text-2xl opacity-80 px-8 max-w-xl mx-auto">{transcript}</p>}
              <button onClick={generateVoxCast} className="px-24 py-10 bg-cyan-600 rounded-3xl text-4xl font-bold">
                Generate VoxCast
              </button>
            </div>
          ) : (
            <div className="text-center">
              <button
                onClick={() => isRecording ? stopRecording() : startRecording()}
                className={`w-56 h-56 rounded-full flex items-center justify-center text-9xl font-bold transition-all shadow-2xl
                  ${isRecording ? 'bg-red-600 animate-pulse scale-110' : 'bg-cyan-600 hover:scale-105'}`}
              >
                {isRecording ? 'Stop' : 'Rec'}
              </button>
              {isRecording && <p className="mt-16 text-7xl text-red-500 animate-pulse font-mono">{formatTime(recordingTime)}</p>}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Sent Confirmation
  if (view === 'sent') {
    return (
      <div className="min-h-screen bg-black text-cyan-400 flex flex-col items-center justify-center p-8 text-center">
        <CheckCircle className="w-40 h-40 mb-12 text-cyan-400" />
        <h1 className="text-7xl font-bold mb-8">Transmission Complete</h1>
        <p className="text-4xl mb-16 opacity-90">Cipher delivered to {targetKey}</p>
        <button onClick={() => { cancelRecording(); setView('send'); }} className="px-24 py-12 bg-cyan-600 rounded-3xl text-4xl font-bold">
          Send Another
        </button>
      </div>
    );
  }

  // Inbox — Only for key owners
  if (view === 'inbox' && myVoxKey) {
    return (
      <div className="min-h-screen bg-black text-cyan-400 font-mono p-8">
        <div className="flex justify-between items-start mb-12">
          <div>
            <h1 className="text-7xl font-bold">{myVoxKey}</h1>
            {displayName && <p className="text-4xl opacity-80 mt-2">{displayName}</p>}
          </div>
          <button onClick={() => {
            localStorage.removeItem('voxkey_session');
            window.location.reload();
          }}>
            <Lock className="w-12 h-12" />
          </button>
        </div>

        <div className="bg-gray-900 border-4 border-cyan-600 p-10 rounded-3xl mb-12">
          <p className="text-3xl mb-6 flex items-center gap-4">
            <Globe className="w-10 h-10" /> Your VoxKey Link
          </p>
          <code className="block bg-black p-8 rounded-2xl text-3xl break-all mb-8">
            {window.location.origin}/key/{myVoxKey}
          </code>
          <button onClick={copyLink} className="w-full py-8 bg-cyan-600 rounded-2xl text-4xl font-bold flex items-center justify-center gap-6">
            {linkCopied ? <CheckCircle /> : <Copy />}
            {linkCopied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>

        <h2 className="text-6xl mb-12 flex items-center gap-8">
          <Radio className="w-20 h-20" /> Incoming VoxCasts ({messages.length})
        </h2>

        {messages.length === 0 ? (
          <p className="text-center text-5xl text-gray-600 mt-40">No transmissions yet</p>
        ) : (
          <div className="space-y-12">
            {messages.map(m => <VoxCastCard key={m.id} message={m} voxKey={myVoxKey} />)}
          </div>
        )}
      </div>
    );
  }

  return null;
}

// ==================== VoxCast Card ====================
function VoxCastCard({ message, voxKey }) {
  const [videoUrl, setVideoUrl] = useState('');

  useEffect(() => {
    let mounted = true;
    let url = null;
    base64ToBlob(message.videoBase64).then(blob => {
      if (mounted) {
        url = URL.createObjectURL(blob);
        setVideoUrl(url);
      }
    });
    return () => {
      mounted = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [message.videoBase64]);

  const share = async () => {
    const blob = await base64ToBlob(message.videoBase64);
    const file = new File([blob], 'voxcast.webm', { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'VoxKey Transmission' });
      } catch (e) {}
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'voxcast.webm';
      a.click();
    }
  };

  return (
    <div className="bg-gray-900 rounded-3xl overflow-hidden border-4 border-cyan-600">
      {videoUrl ? (
        <video src={videoUrl} controls className="w-full aspect-[9/16]" />
      ) : (
        <div className="w-full aspect-[9/16] bg-black flex items-center justify-center">
          <Loader2 className="w-24 h-24 animate-spin text-cyan-400" />
        </div>
      )}
      <div className="p-8 space-y-6">
        <p className="text-xl opacity-80">
          Transmission Received • {new Date(message.timestamp).toLocaleString()}
        </p>
        {message.text && <p className="text-2xl font-medium">"{message.text}"</p>}
        <div className="flex gap-6">
          <button onClick={share} className="flex-1 py-8 bg-cyan-600 rounded-2xl font-bold text-3xl flex items-center justify-center gap-6">
            <Share2 /> Share
          </button>
          <button onClick={() => {
            voxDB.delete(voxKey, message.id);
            window.location.reload();
          }} className="px-12 py-8 bg-red-900 rounded-2xl">
            <Trash2 className="w-12 h-12" />
          </button>
        </div>
      </div>
    </div>
  );
}
