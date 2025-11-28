// src/App.jsx — VoiceAnon v5.1 — NGL-style anonymous + robot video for sharing
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

// -------------------- CONFIG --------------------
const MAX_VIDEO_BYTES = 16 * 1024 * 1024; // ~16MB (WhatsApp friendly)
const MAX_MESSAGES = 200;

// -------------------- Simple Message DB (localStorage) --------------------
const msgDB = {
  async save(recipientUsername, msg) {
    if (!recipientUsername) throw new Error('No recipient');
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

// -------------------- Simple Auth (view-only, local) --------------------
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

// -------------------- Utils --------------------
const blobToDataURL = (blob) =>
  new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result);
    reader.onerror = rej;
    reader.readAsDataURL(blob);
  });

// robust base64(dataURL) -> Blob
const dataUrlToBlob = (dataUrl) => {
  const parts = dataUrl.split(',');
  const meta = parts[0];
  const base64 = parts[1];
  const mime = (meta.match(/:(.*?);/) || [])[1] || 'application/octet-stream';
  const binary = atob(base64);
  const len = binary.length;
  const u8 = new Uint8Array(len);
  for (let i = 0; i < len; i++) u8[i] = binary.charCodeAt(i);
  return new Blob([u8], { type: mime });
};

// safe revoke map
const useObjectUrlManager = () => {
  const set = useRef(new Set());
  useEffect(() => () => {
    set.current.forEach((u) => URL.revokeObjectURL(u));
    set.current.clear();
  }, []);
  const create = (blob) => {
    const url = URL.createObjectURL(blob);
    set.current.add(url);
    return url;
  };
  const revoke = (url) => {
    if (!url) return;
    URL.revokeObjectURL(url);
    set.current.delete(url);
  };
  return { create, revoke };
};

const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

// choose common whatsapp-friendly codec first
const detectBestMime = () => {
  const candidates = [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm',
    'video/mp4',
  ];
  for (const t of candidates) {
    try {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t;
    } catch {}
  }
  return 'video/webm';
};

// -------------------- Main App --------------------
export default function App() {
  // auth & routing
  const [user, setUser] = useState(null);
  const [view, setView] = useState('landing'); // landing | record | sent | login | inbox
  const [targetUsername, setTargetUsername] = useState('');
  const [messages, setMessages] = useState([]);

  // recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [processing, setProcessing] = useState(false);
  const [previewVideo, setPreviewVideo] = useState(null);

  // refs & managers
  const canvasRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioContextRef = useRef(null);
  const animationRef = useRef(null);
  const objectUrlManager = useObjectUrlManager();
  const previewAudioRef = useRef(null);

  // Init / route handling
  useLayoutEffect(() => {
    mockAuth.init();
    if (mockAuth.currentUser) {
      setUser(mockAuth.currentUser);
      setMessages(msgDB.get(mockAuth.currentUser.username));
      setView('inbox');
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

  // poll for inbox updates (only when logged in)
  useEffect(() => {
    if (!user) return;
    let last = JSON.stringify(msgDB.get(user.username));
    setMessages(JSON.parse(last));
    const interval = setInterval(() => {
      const cur = JSON.stringify(msgDB.get(user.username));
      if (cur !== last) {
        last = cur;
        setMessages(JSON.parse(cur));
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [user]);

  // cleanup on unload
  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioContextRef.current) {
        try { audioContextRef.current.close(); } catch {}
      }
    };
  }, []);

  // -------------------- Recording --------------------
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      setTranscript('');
      setAudioBlob(null);

      // prefer audio/webm
      const mimeType = 'audio/webm;codecs=opus';
      let recorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType });
      } catch {
        recorder = new MediaRecorder(stream);
      }
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => e.data.size && audioChunksRef.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setAudioBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);

      // SpeechRecognition (if available) - optional transcript
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        try {
          const rec = new SR();
          rec.continuous = true;
          rec.interimResults = false;
          rec.onresult = (e) => {
            for (let i = e.resultIndex; i < e.results.length; i++) {
              if (e.results[i].isFinal) {
                setTranscript((prev) => (prev ? prev + ' ' : '') + e.results[i][0].transcript);
              }
            }
          };
          rec.onerror = () => {}; // ignore
          rec.start();
          recognitionRef.current = rec;
        } catch {
          recognitionRef.current = null;
        }
      } else {
        recognitionRef.current = null;
      }
    } catch (err) {
      alert('Microphone access denied or unavailable.');
    }
  };

  const stopRecording = () => {
    try { mediaRecorderRef.current?.stop(); } catch {}
    try { recognitionRef.current?.stop?.(); } catch {}
    clearInterval(timerRef.current);
    setIsRecording(false);
  };

  const cancelRecording = () => {
    stopRecording();
    setAudioBlob(null);
    setTranscript('');
    setRecordingTime(0);
    setPreviewVideo(null);
    // revoke all object URLs used for preview
    // objectUrlManager will revoke on unmount, but we can revoke preview now
    if (previewAudioRef.current) {
      try { previewAudioRef.current.pause(); } catch {}
      previewAudioRef.current = null;
    }
  };

  // -------------------- Robot Video Generation --------------------
  // Approach: decode audio -> process with OfflineAudioContext (ring-mod + mild distortion)
  //           render canvas animation synchronized to audio duration -> capture with canvas.captureStream + processed audio -> record
  const generateRobotVideo = async () => {
    if (!audioBlob) return;
    setProcessing(true);

    // cleanup previous
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    // ensure audio context is fresh
    try {
      if (audioContextRef.current) {
        await audioContextRef.current.close();
      }
    } catch {}
    audioContextRef.current = null;

    try {
      // decode audio into buffer
      const arrayBuffer = await audioBlob.arrayBuffer();
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = ac;
      const audioBuffer = await ac.decodeAudioData(arrayBuffer);

      // Create processed audio via OfflineAudioContext for deterministic transform
      const offline = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
        audioBuffer.numberOfChannels,
        audioBuffer.length,
        audioBuffer.sampleRate
      );

      // source
      const src = offline.createBufferSource();
      src.buffer = audioBuffer;

      // ring modulator: oscillator * input (via gain)
      const osc = offline.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 30; // low freq to give robotic timbre

      const oscGain = offline.createGain();
      oscGain.gain.value = 0.5;

      // multiply via GainNode trick: use oscillator to modulate gain of a constant source
      const modGain = offline.createGain();
      osc.connect(oscGain);
      oscGain.connect(modGain.gain); // modulates gain for ring effect

      // connect source through modGain to a distortion node
      src.connect(modGain);
      // mild waveshaper for grit
      const waveShaper = offline.createWaveShaper();
      const makeCurve = (amount = 10) => {
        const k = typeof amount === 'number' ? amount : 50;
        const n = 44100;
        const curve = new Float32Array(n);
        for (let i = 0; i < n; ++i) {
          const x = (i * 2) / n - 1;
          curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
        }
        return curve;
      };
      waveShaper.curve = makeCurve(80);
      waveShaper.oversample = '2x';

      modGain.connect(waveShaper);
      waveShaper.connect(offline.destination);

      // start nodes
      src.start();
      osc.start();

      const processedBuffer = await offline.startRendering();

      // now create a MediaStream from processedBuffer using AudioContext + MediaStreamDestination
      const liveCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = liveCtx;
      const processedSource = liveCtx.createBufferSource();
      processedSource.buffer = processedBuffer;

      const destination = liveCtx.createMediaStreamDestination();
      processedSource.connect(destination);
      processedSource.start();

      // Canvas for video (9:16 vertical)
      const canvas = canvasRef.current || document.createElement('canvas');
      canvas.width = 720;
      canvas.height = 1280;
      const ctx = canvas.getContext('2d');

      // create combined stream
      const videoStream = canvas.captureStream(30);
      const combined = new MediaStream([...videoStream.getVideoTracks(), ...destination.stream.getAudioTracks()]);

      // recorder with best mime
      const mimeType = detectBestMime();
      let recorder;
      try {
        recorder = new MediaRecorder(combined, { mimeType });
      } catch {
        recorder = new MediaRecorder(combined);
      }

      const chunks = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: chunks[0]?.type || 'video/webm' });
        // size check
        if (blob.size > MAX_VIDEO_BYTES) {
          // if too big, alert and store as audio-only fallback
          alert('Video too large for sharing. Saving audio-only message instead.');
          const audioDataUrl = await blobToDataURL(processedBufferToBlob(processedBuffer, 'audio/webm'));
          // save audio as message (fallback)
          const msg = {
            id: crypto.randomUUID(),
            text: transcript.trim() || 'Voice message',
            timestamp: new Date().toISOString(),
            duration: Math.round(processedBuffer.duration),
            videoBase64: audioDataUrl, // still using dataURL but it's audio
            mimeType: 'audio/webm',
            isAudioOnly: true,
          };
          await msgDB.save(targetUsername.toLowerCase(), msg);
          setProcessing(false);
          setPreviewVideo(null);
          setView('sent');
          return;
        }

        const url = objectUrlManager.create(blob);
        setPreviewVideo({ url, blob, mimeType: blob.type });
        setProcessing(false);
      };

      // helper: convert processed buffer to Blob (audio/webm via recorder approach is better; fallback to WAV)
      const processedBufferToBlob = (buf, type = 'audio/webm') => {
        // fallback to simple WAV encode if needed (quick implementation)
        const numChannels = buf.numberOfChannels;
        const length = buf.length * numChannels * 2 + 44;
        const buffer = new ArrayBuffer(length);
        const view = new DataView(buffer);
        // write WAV header
        const writeString = (v, offset) => {
          for (let i = 0; i < v.length; i++) view.setUint8(offset + i, v.charCodeAt(i));
        };
        let offset = 0;
        writeString('RIFF', offset); offset += 4;
        view.setUint32(offset, length - 8, true); offset += 4;
        writeString('WAVE', offset); offset += 4;
        writeString('fmt ', offset); offset += 4;
        view.setUint32(offset, 16, true); offset += 4;
        view.setUint16(offset, 1, true); offset += 2;
        view.setUint16(offset, numChannels, true); offset += 2;
        view.setUint32(offset, buf.sampleRate, true); offset += 4;
        view.setUint32(offset, buf.sampleRate * numChannels * 2, true); offset += 4;
        view.setUint16(offset, numChannels * 2, true); offset += 2;
        view.setUint16(offset, 16, true); offset += 2;
        writeString('data', offset); offset += 4;
        view.setUint32(offset, length - offset - 4, true); offset += 4;

        // interleave
        const interleaved = new Int16Array(buf.length * numChannels);
        let idx = 0;
        for (let i = 0; i < buf.length; i++) {
          for (let ch = 0; ch < numChannels; ch++) {
            const sample = Math.max(-1, Math.min(1, buf.getChannelData(ch)[i]));
            interleaved[idx++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
          }
        }
        // write samples
        for (let i = 0; i < interleaved.length; i++, offset += 2) {
          view.setInt16(offset, interleaved[i], true);
        }
        return new Blob([view], { type: 'audio/wav' });
      };

      // DRAW ANIMATION: simple green-LED robot UI reflecting amplitude
      const startTime = performance.now();
      const durationMs = Math.max(1200, (processedBuffer.duration || 1) * 1000 + 600);

      // analyzer in liveCtx to get realtime amplitude (approx)
      const analyser = liveCtx.createAnalyser();
      analyser.fftSize = 256;
      const procSource = liveCtx.createBufferSource();
      // we already created processedSource connected to destination; create another for analysis
      const procNode = liveCtx.createBufferSource();
      procNode.buffer = processedBuffer;
      const procGain = liveCtx.createGain();
      procNode.connect(procGain);
      procGain.connect(analyser);
      procNode.connect(destination); // ensure audio is captured
      procNode.start();

      recorder.start();

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const drawFrame = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / durationMs, 1);
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 255;

        // background
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);

        // robot panel
        ctx.fillStyle = '#060'; ctx.fillRect(60, 220, canvas.width - 120, 720);
        ctx.fillStyle = '#001a00'; ctx.fillRect(80, 240, canvas.width - 160, 680);

        // two glowing eyes
        const eyeR = 50 + avg * 60;
        ctx.beginPath();
        ctx.fillStyle = `rgba(0,255,0,${0.25 + avg * 0.75})`;
        ctx.arc(canvas.width / 2 - 90, 420, eyeR, 0, Math.PI * 2);
        ctx.arc(canvas.width / 2 + 90, 420, eyeR, 0, Math.PI * 2);
        ctx.fill();

        // waveform-ish lines
        ctx.strokeStyle = 'rgba(0,255,0,0.9)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        for (let i = 0; i < 120; i++) {
          const x = 80 + (i / 119) * (canvas.width - 160);
          const y = 1000 + Math.sin(i / 8 + elapsed / 200) * (avg * 200);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // text (transcript snippet)
        ctx.font = 'bold 34px monospace';
        ctx.fillStyle = '#0f0';
        ctx.textAlign = 'center';
        const text = (transcript || '').slice(0, 120);
        ctx.fillText(text || '[anonymous voice]', canvas.width / 2, 1180);

        // progress bar
        ctx.fillStyle = '#111';
        ctx.fillRect(80, 1240, canvas.width - 160, 24);
        ctx.fillStyle = '#0f0';
        ctx.fillRect(80, 1240, (canvas.width - 160) * progress, 24);

        if (progress < 1) {
          animationRef.current = requestAnimationFrame(drawFrame);
        } else {
          // stop shortly after
          setTimeout(() => {
            try { recorder.stop(); } catch {}
            try { procNode.stop(); } catch {}
            try { processedSource.stop(); } catch {}
            if (animationRef.current) { cancelAnimationFrame(animationRef.current); animationRef.current = null; }
          }, 600);
        }
      };

      animationRef.current = requestAnimationFrame(drawFrame);
    } catch (err) {
      console.error(err);
      alert('Failed to generate video. Try again or send audio-only message.');
      setProcessing(false);
    }
  };

  // -------------------- Send Message (save to recipient inbox) --------------------
  const sendMessage = async () => {
    if (!previewVideo || !targetUsername) {
      alert('No video ready or missing recipient username');
      return;
    }
    setProcessing(true);
    try {
      // convert blob to dataURL (base64) for storage
      const base64 = await blobToDataURL(previewVideo.blob);
      const msg = {
        id: crypto.randomUUID(),
        text: transcript.trim() || 'Voice message',
        timestamp: new Date().toISOString(),
        duration: recordingTime,
        videoBase64: base64,
        mimeType: previewVideo.mimeType || previewVideo.blob.type,
      };
      await msgDB.save(targetUsername.toLowerCase(), msg);
      cancelRecording();
      setView('sent');
    } catch (e) {
      console.error(e);
      alert('Failed to save message');
    } finally {
      setProcessing(false);
    }
  };

  // -------------------- UI Renders --------------------
  if (view === 'landing') {
    return (
      <div className="min-h-screen bg-black text-green-400 font-mono flex flex-col items-center justify-center p-6">
        <Video className="w-28 h-28 mb-8 animate-pulse" />
        <h1 className="text-6xl font-bold mb-4">VoiceAnon</h1>
        <p className="text-2xl mb-8">Send anonymous robotified voice videos — go viral</p>
        <div className="flex gap-4">
          <button onClick={() => setView('record')} className="px-10 py-4 bg-green-600 rounded-2xl text-xl font-bold">Start Sending</button>
          <button onClick={() => setView('login')} className="px-6 py-4 text-gray-300 rounded-2xl border border-green-800">Inbox (view)</button>
        </div>
      </div>
    );
  }

  if (view === 'record') {
    return (
      <div className="bg-black text-white min-h-screen flex flex-col">
        <canvas ref={canvasRef} className="hidden" />
        <div className="p-6 bg-gray-900 text-center">
          <h2 className="text-2xl font-bold mb-1">Send to @{targetUsername || 'someone'}</h2>
          <div className="mt-3 flex items-center justify-center gap-3">
            <input value={targetUsername} onChange={(e) => setTargetUsername(e.target.value.toLowerCase())}
              placeholder="recipient username (no @)" className="bg-black border border-green-800 p-3 rounded text-white" />
            <button onClick={() => {
              navigator.share?.({ text: `${window.location.origin}/u/${targetUsername}` })
                || navigator.clipboard?.writeText(`${window.location.origin}/u/${targetUsername}`);
            }} className="p-3 bg-gray-800 rounded border border-green-700"><Link2 /></button>
          </div>
          <p className="text-gray-400 mt-3">100% anonymous • no login required to send</p>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-8">
          {previewVideo ? (
            <div className="w-full max-w-sm">
              <video src={previewVideo.url} controls className="w-full rounded-2xl shadow-2xl" />
              <div className="flex gap-4 mt-6">
                <button onClick={() => { objectUrlManager.revoke(previewVideo.url); setPreviewVideo(null); }} className="flex-1 py-3 bg-red-600 rounded-xl">
                  <Trash2 className="mx-auto" />
                </button>
                <button onClick={sendMessage} disabled={processing} className="flex-1 py-3 bg-green-600 rounded-xl font-bold text-lg disabled:opacity-50">
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
            <div className="text-center space-y-6">
              <div>
                <button onClick={() => {
                  if (previewAudioRef.current && !previewAudioRef.current.paused) {
                    previewAudioRef.current.pause();
                  } else {
                    const url = objectUrlManager.create(audioBlob);
                    const a = new Audio(url);
                    previewAudioRef.current = a;
                    a.onended = () => { /* leave as is */ };
                    a.play();
                  }
                }} className="bg-gray-900 p-8 rounded-full">
                  <Play className="w-12 h-12" />
                </button>
              </div>
              <p className="text-4xl font-mono">{formatTime(recordingTime)}</p>
              {transcript && <p className="text-lg text-gray-400 max-w-md mx-auto">{transcript}</p>}
              <div className="flex gap-4">
                <button onClick={cancelRecording} className="px-8 py-3 bg-red-600 rounded-xl"><Trash2 /></button>
                <button onClick={generateRobotVideo} className="flex-1 px-6 py-3 bg-green-600 rounded-xl font-bold">Convert to Robot Video</button>
              </div>
            </div>
          ) : (
            <button onClick={() => isRecording ? stopRecording() : startRecording()}
              className={`w-44 h-44 rounded-full flex items-center justify-center text-6xl font-bold transition-all shadow-2xl ${isRecording ? 'bg-red-600 animate-pulse scale-110' : 'bg-green-600'}`}>
              {isRecording ? 'Stop' : 'Rec'}
            </button>
          )}
          {isRecording && <p className="mt-6 text-3xl text-red-500 animate-pulse font-mono">{formatTime(recordingTime)}</p>}
        </div>
      </div>
    );
  }

  if (view === 'sent') {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 text-center">
        <CheckCircle className="w-28 h-28 text-green-500 mb-8" />
        <h1 className="text-4xl font-bold mb-4">Sent Anonymously!</h1>
        <p className="text-lg text-gray-400 mb-8">@{targetUsername} will see it in their inbox</p>
        <div className="flex gap-4">
          <button onClick={() => { cancelRecording(); setView('record'); }} className="px-8 py-4 bg-green-600 rounded-xl">Send Another</button>
          <button onClick={() => setView('landing')} className="px-6 py-4 bg-gray-800 rounded-xl">Home</button>
        </div>
      </div>
    );
  }

  // LOGIN (top-level hooks used — no hooks inside conditionals)
  if (view === 'login') {
    return <LoginView onOpen={(username) => {
      localStorage.setItem('va_session', JSON.stringify({ username: username.toLowerCase() }));
      setUser({ username: username.toLowerCase() });
      setMessages(msgDB.get(username.toLowerCase()));
      setView('inbox');
    }} onBack={() => setView('landing')} />;
  }

  if (view === 'inbox' && user) {
    return (
      <div className="min-h-screen bg-black text-white font-mono p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl">@{user.username}'s Inbox ({messages.length})</h1>
          <div className="flex items-center gap-3">
            <button onClick={() => { mockAuth.signOut(); setUser(null); setView('landing'); }} className="p-2 bg-gray-800 rounded"><LogOut /></button>
          </div>
        </div>
        {messages.length === 0 ? (
          <p className="text-center text-gray-500 text-xl mt-24">No messages yet</p>
        ) : (
          <div className="space-y-6">
            {messages.map((m) => <MessageCard key={m.id} message={m} currentUser={user} onDelete={() => {
              msgDB.delete(user.username, m.id);
              setMessages(msgDB.get(user.username));
            }} objectUrlManager={objectUrlManager} />)}
          </div>
        )}
      </div>
    );
  }

  // default fallback
  return null;
}

// -------------------- LoginView (separate component — hooks safe) --------------------
function LoginView({ onOpen, onBack }) {
  const [username, setUsername] = useState('');
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <div className="bg-gray-900 p-8 rounded-2xl border border-green-800 w-full max-w-sm">
        <h2 className="text-3xl text-green-500 text-center mb-6">View Your Inbox</h2>
        <input placeholder="Your username" value={username} onChange={(e) => setUsername(e.target.value)}
          className="w-full p-3 bg-black border border-green-800 rounded text-white text-lg mb-4" />
        <button onClick={() => onOpen(username)} className="w-full py-3 bg-green-600 rounded-xl text-lg mb-3">Open Inbox</button>
        <button onClick={onBack} className="w-full py-3 bg-transparent border border-green-800 rounded-xl text-gray-300">Back</button>
      </div>
    </div>
  );
}

// -------------------- MessageCard --------------------
function MessageCard({ message, currentUser, onDelete, objectUrlManager }) {
  const [videoUrl, setVideoUrl] = useState('');
  useEffect(() => {
    let mounted = true;
    try {
      // convert stored dataURL to blob and make objectURL
      if (message.videoBase64) {
        const blob = dataUrlToBlob(message.videoBase64);
        const url = objectUrlManager.create(blob);
        if (mounted) setVideoUrl(url);
      }
    } catch (e) {
      console.error('Failed to load message media', e);
    }
    return () => { mounted = false; if (videoUrl) objectUrlManager.revoke(videoUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.videoBase64]);

  const share = async () => {
    try {
      const blob = dataUrlToBlob(message.videoBase64);
      const file = new File([blob], message.isAudioOnly ? 'anon_audio.webm' : 'anon.webm', { type: blob.type });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Anonymous message' });
      } else {
        // fallback: download
        const a = document.createElement('a');
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    } catch (e) {
      console.error(e);
      alert('Share failed.');
    }
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
      <div className="p-4 space-y-3">
        <p className="text-sm text-gray-400">{new Date(message.timestamp).toLocaleString()}</p>
        <div className="flex gap-3">
          <button onClick={share} className="flex-1 py-3 bg-green-600 rounded-xl font-bold flex items-center justify-center gap-2"><Play /> Share</button>
          <button onClick={() => { onDelete(); }} className="flex-1 py-3 bg-red-900 rounded-xl"><Trash2 /></button>
        </div>
      </div>
    </div>
  );
}
