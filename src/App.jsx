import React, { useState, useRef, useEffect } from 'react';
import {
  Mic, Square, Download, Share2, Copy, CheckCircle,
  MessageSquare, LogOut, Inbox, Smartphone, Play, Pause,
  Trash2, Send, X, Video
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
  init: () => { 
    const u = localStorage.getItem('user');
    if (u) mockAuth.currentUser = JSON.parse(u); 
  }
};

const mockDB = {
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

const formatTime = s => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

const wrapText = (text, max = 20) => {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + w).length > max) {
      lines.push(line.trim());
      line = w + ' ';
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

// ------------------ Main App ------------------
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('landing');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [processing, setProcessing] = useState(false);
  const [previewVideo, setPreviewVideo] = useState({ url: '', mimeType: '', blob: null });
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
      if (username && username !== mockAuth.currentUser?.username) {
        setTargetUsername(username);
        setView('record');
      }
    }

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ------------------ Recording ------------------
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      setTranscript('');
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = e => e.data.size && audioChunksRef.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);

      // Speech Recognition
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
            setTranscript((final + interim).trim());
          };
          recognition.start();
          recognitionRef.current = recognition;
        }
      } catch (e) {}
    } catch (err) {
      alert('Microphone access denied');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
    if (recognitionRef.current) recognitionRef.current.stop();
    clearInterval(timerRef.current);
    setIsRecording(false);
  };

  const cancelRecording = () => {
    stopRecording();
    setAudioBlob(null);
    setTranscript('');
    setRecordingTime(0);
  };

  // ------------------ Video Generation (Robot + Voice) ------------------
  const generatePreview = async () => {
    if (!audioBlob) return;
    setProcessing(true);
    setPreviewVideo({ url: '', mimeType: '', blob: null });

    const canvas = canvasRef.current;
    canvas.width = 720;
    canvas.height = 1280;
    const ctx = canvas.getContext('2d');

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioContextRef.current = audioCtx;

    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = 0.8;

      // ROBOT VOICE
      const distortion = audioCtx.createWaveShaper();
      distortion.curve = makeDistortionCurve(500);
      distortion.oversample = '4x';

      const modulator = audioCtx.createOscillator();
      modulator.type = 'sawtooth';
      modulator.frequency.value = 90;

      const modGain = audioCtx.createGain();
      modGain.gain.value = 0.5;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;

      const dest = audioCtx.createMediaStreamDestination();

      modulator.connect(modGain);
      modGain.connect(dest.stream.getAudioTracks()[0]);

      source.connect(distortion);
      distortion.connect(modGain.gain);
      modGain.connect(analyser);
      analyser.connect(dest);

      source.start();
      modulator.start();

      const videoStream = canvas.captureStream(30);
      const combinedStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...dest.stream.getAudioTracks()
      ]);

      const recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm' });
      const chunks = [];

      recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        setPreviewVideo({ url, mimeType: 'video/webm', blob });
        setProcessing(false);
      };
      recorder.start();

      const words = (transcript || "Voice message").split(' ');
      const startTime = performance.now();
      const duration = (audioBuffer.duration / 0.8) * 1000 + 1000;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const draw = (t) => {
        const elapsed = t - startTime;
        const progress = Math.min(elapsed / duration, 1);
        analyser.getByteFrequencyData(dataArray);
        const vol = dataArray.reduce((a,b) => a+b, 0) / dataArray.length / 255;

        // Background
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Grid
        ctx.strokeStyle = '#0f03';
        for (let i = 0; i < canvas.height; i += 50) {
          ctx.beginPath();
          ctx.moveTo(0, i);
          ctx.lineTo(canvas.width, i);
          ctx.stroke();
        }

        const cx = canvas.width / 2;
        const cy = 450;

        // Head
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(cx - 160, cy - 220, 320, 440);

        // Eyes
        ctx.shadowBlur = 40 + vol * 100;
        ctx.shadowColor = '#0f0';
        ctx.fillStyle = '#0f0';
        ctx.beginPath();
        ctx.arc(cx - 80, cy - 70, 50 + vol * 30, 0, Math.PI * 2);
        ctx.arc(cx + 80, cy - 70, 50 + vol * 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Mouth Wave
        ctx.strokeStyle = '#0f0';
        ctx.lineWidth = 10;
        ctx.beginPath();
        for (let i = 0; i < 30; i++) {
          const x = cx - 140 + i * 10;
          const y = cy + 100 + Math.sin(elapsed / 50 + i) * vol * 80;
          ctx[i === 0 ? 'moveTo' : 'lineTo'](x, y);
        }
        ctx.stroke();

        // Text
        ctx.font = 'bold 48px monospace';
        ctx.fillStyle = '#0f0';
        ctx.textAlign = 'center';
        const shown = words.slice(0, Math.floor(progress * words.length) + 1).join(' ');
        wrapText(shown, 18).forEach((line, i) => {
          ctx.fillText(line, cx, 850 + i * 70);
        });

        // Progress
        ctx.fillStyle = '#333';
        ctx.fillRect(100, 1150, canvas.width - 200, 30);
        ctx.fillStyle = '#0f0';
        ctx.fillRect(100, 1150, (canvas.width - 200) * progress, 30);

        if (elapsed < duration) requestAnimationFrame(draw);
        else setTimeout(() => recorder.stop(), 500);
      };
      requestAnimationFrame(draw);
    } catch (e) {
      console.error(e);
      setProcessing(false);
      alert("Video generation failed");
    }
  };

  // ------------------ Send Message ------------------
  const sendMessage = async () => {
    if (!previewVideo.blob || !targetUsername && !user) return;
    const recipient = targetUsername || user.username;
    const base64 = await blobToBase64(previewVideo.blob);
    mockDB.saveMessage(recipient, {
      id: Date.now().toString(),
      text: transcript || "Voice message",
      timestamp: new Date().toISOString(),
      duration: recordingTime,
      videoUrl: base64,
      mimeType: previewVideo.mimeType,
      blob: previewVideo.blob
    });
    setView('success');
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/u/${user.username}`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const shareVideo = async (blob) => {
    const file = new File([blob], "anon.mp4", { type: "video/mp4" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "Anonymous Voice Message" });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = "voiceanon.mp4";
      a.click();
    }
  };

  // ------------------ Views ------------------
  if (view === 'landing') return (
    <div className="min-h-screen bg-black text-green-400 font-mono flex flex-col items-center justify-center p-6" style={{minHeight: viewportHeight}}>
      <Video className="w-20 h-20 mb-8 animate-pulse" />
      <h1 className="text-5xl font-bold mb-4">VoiceAnon</h1>
      <p className="text-xl mb-12">Anonymous. Encrypted. Robotic.</p>
      <div className="space-y-4 w-full max-w-xs">
        <button onClick={() => setView('signin')} className="w-full py-4 border border-green-500 rounded text-xl">Login</button>
        <button onClick={() => setView('signup')} className="w-full py-4 bg-green-500 text-black font-bold rounded text-xl">Create Identity</button>
      </div>
    </div>
  );

  if (view === 'signin' || view === 'signup') {
    const isSignIn = view === 'signin';
    const submit = (e) => {
      e.preventDefault();
      const p = isSignIn 
        ? mockAuth.signIn(authEmail, authPassword)
        : mockAuth.signUp(authEmail, authPassword, authUsername);
      p.then(u => {
        setUser(u);
        setMessages(mockDB.getMessages(u.username));
        setView('dashboard');
      }).catch(e => alert(e.message));
    };
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6 font-mono" style={{minHeight: viewportHeight}}>
        <form onSubmit={submit} className="bg-gray-900 p-8 rounded-lg border border-green-800 space-y-6 w-full max-w-sm">
          <h2 className="text-3xl text-green-500 text-center">{isSignIn ? 'Access' : 'Initialize'}</h2>
          {!isSignIn && <input required placeholder="Username" value={authUsername} onChange={e => setAuthUsername(e.target.value)} className="w-full p-4 bg-black border border-green-800 rounded text-white" />}
          <input required type="email" placeholder="Email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} className="w-full p-4 bg-black border border-green-800 rounded text-white" />
          <input required type="password" placeholder="Password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} className="w-full p-4 bg-black border border-green-800 rounded text-white" />
          <button type="submit" className="w-full py-4 bg-green-500 text-black font-bold rounded text-xl">{isSignIn ? 'Enter' : 'Create'}</button>
          <button type="button" onClick={() => setView(isSignIn ? 'signup' : 'signin')} className="text-gray-500 text-sm">Switch to {isSignIn ? 'Sign Up' : 'Sign In'}</button>
        </form>
      </div>
    );
  }

  if (view === 'dashboard') return (
    <div className="min-h-screen bg-black text-white font-mono p-6" style={{minHeight: viewportHeight}}>
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
      <button onClick={() => { mockAuth.signOut(); setView('landing'); }} className="text-red-500 flex items-center gap-2">
        <LogOut /> Sign Out
      </button>
    </div>
  );

  if (view === 'record') return (
    <div className="bg-black text-white min-h-screen flex flex-col" style={{height: viewportHeight}}>
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
              <button onClick={() => setPreviewVideo({url:'',blob:null})} className="flex-1 py-4 bg-red-600 rounded"><Trash2 /></button>
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
              <button onClick={() => { previewAudioRef.current = new Audio(URL.createObjectURL(audioBlob)); previewAudioRef.current.play(); }} className="mb-4">
                <Play className="w-16 h-16 mx-auto" />
              </button>
              <p className="text-2xl">{formatTime(recordingTime)}</p>
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
            <p className="text-gray-500">Hold to record</p>
          </div>
        )}
      </div>

      {!audioBlob && !processing && (
        <div className="p-6">
          <button
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={stopRecording}
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
    <div className="min-h-screen bg-black text-white font-mono p-4" style={{height: viewportHeight}}>
      {view === 'success' && (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <CheckCircle className="w-32 h-32 text-green-500 mb-8" />
          <h1 className="text-4xl mb-8">Sent Anonymously</h1>
          <button onClick={() => { setView('record'); setPreviewVideo({url:'',blob:null}); setAudioBlob(null); }} className="px-8 py-4 bg-green-600 rounded text-xl">Send Another</button>
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
              <div key={m.id} className="bg-gray-900 rounded-xl overflow-hidden mb-8 border border-green-900">
                <video src={m.videoUrl} controls className="w-full aspect-[9/16]" />
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <button onClick={() => shareVideo(m.blob || URL.createObjectURL(m.blob))} className="bg-gradient-to-r from-purple-600 to-pink-600 py-4 rounded font-bold">TikTok</button>
                    <button onClick={() => shareVideo(m.blob)} className="bg-green-600 py-4 rounded font-bold">WhatsApp</button>
                    <button onClick={() => shareVideo(m.blob)} className="bg-blue-700 py-4 rounded font-bold">Facebook</button>
                    <button onClick={() => shareVideo(m.blob)} className="bg-gradient-to-r from-pink-500 to-orange-500 py-4 rounded font-bold col-span-2">Instagram</button>
                    <button onClick={() => shareVideo(m.blob)} className="bg-black border border-white py-4 rounded font-bold">X / Twitter</button>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => shareVideo(m.blob)} className="flex-1 py-3 bg-gray-800 rounded flex items-center justify-center gap-2">
                      <Download /> Save
                    </button>
                    <button onClick={() => {
                      mockDB.deleteMessage(user.username, m.id);
                      setMessages(mockDB.getMessages(user.username));
                    }} className="px-6 py-3 bg-red-900 rounded"><Trash2 /></button>
                  </div>
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );

  return null;
}
