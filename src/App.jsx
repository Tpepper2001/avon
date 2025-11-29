// src/App.jsx — Pure JavaScript, Netlify/Vite compatible
import React, { useState, useEffect, useRef } from 'react';
import { Mic, Send, Trash2, Download, Share2, Copy, LogOut, Volume2, QrCode, Zap, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { format } from 'date-fns';

// ────────────────────────────────────────────────────────────────
// Secure Storage Wrapper (fallback to localStorage)
// ────────────────────────────────────────────────────────────────
const secureDB = {
  async get(key) {
    try {
      const item = await window.storage?.get(key);
      return item ? JSON.parse(item.value) : null;
    } catch (e) {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }
  },
  async set(key, value) {
    const data = JSON.stringify(value);
    try {
      await window.storage?.set(key, data);
    } catch (e) {
      localStorage.setItem(key, data);
    }
  },
};

// Simple SHA-256 hash (good enough for client-side, no plaintext passwords)
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ────────────────────────────────────────────────────────────────
// Utils
// ────────────────────────────────────────────────────────────────
const generateVoxKey = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let key = 'VX-';
  for (let i = 0; i < 8; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
};

const blobToDataURL = (blob) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });

// ────────────────────────────────────────────────────────────────
// Main App Component
// ────────────────────────────────────────────────────────────────
export default function VoxKey() {
  const [view, setView] = useState('landing');
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [recipientKey, setRecipientKey] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [videoDataUrl, setVideoDataUrl] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const mediaRecorder = useRef(null);
  const chunks = useRef([]);
  const animationFrame = useRef();

  // Load current user
  useEffect(() => {
    secureDB.get('voxkey_current_user').then(setUser);
  }, []);

  // Load messages + poll
  useEffect(() => {
    if (user) loadMessages();
    const interval = setInterval(() => user && loadMessages(), 8000);
    return () => clearInterval(interval);
  }, [user]);

  // Check URL for direct send link
  useEffect(() => {
    const pathKey = window.location.pathname.slice(1).toUpperCase();
    if (/^VX-[A-Z0-9]{8}$/.test(pathKey)) {
      setRecipientKey(pathKey);
      setView('landing');
    }
  }, []);

  const loadMessages = async () => {
    if (!user) return;
    const msgs = (await secureDB.get(`msgs_${user.voxKey}`)) || [];
    setMessages(msgs.sort((a, b) => b.timestamp - a.timestamp));
  };

  // ────────────────────────────────────────────────────────────────
  // Auth
  // ────────────────────────────────────────────────────────────────
  const signup = async (email, username, password) => {
    if (!email.includes('@') || password.length < 6) return alert('Invalid email or password too short');
    const hash = await hashPassword(password);
    const newUser = {
      id: Date.now() + Math.random(),
      email,
      username: username.trim(),
      passwordHash: hash,
      voxKey: generateVoxKey(),
      createdAt: Date.now(),
    };
    const users = (await secureDB.get('voxkey_users')) || [];
    if (users.some(u => u.email === email)) return alert('Email already registered');
    users.push(newUser);
    await secureDB.set('voxkey_users', users);
    await secureDB.set('voxkey_current_user', newUser);
    setUser(newUser);
    setView('inbox');
  };

  const login = async (email, password) => {
    const users = (await secureDB.get('voxkey_users')) || [];
    const hash = await hashPassword(password);
    const found = users.find(u => u.email === email && u.passwordHash === hash);
    if (!found) return alert('Wrong email or password');
    await secureDB.set('voxkey_current_user', found);
    setUser(found);
    setView('inbox');
  };

  const logout = () => {
    secureDB.set('voxkey_current_user', null);
    setUser(null);
    setView('landing');
  };

  // ────────────────────────────────────────────────────────────────
  // Recording
  // ────────────────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunks.current = [];

      recorder.ondataavailable = (e) => chunks.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      mediaRecorder.current = recorder;
      setIsRecording(true);
    } catch (err) {
      alert('Microphone access denied or unavailable');
    }
  };

  const stopRecording = () => {
    mediaRecorder.current?.stop();
    setIsRecording(false);
  };

  const cancelRecording = () => {
    stopRecording();
    setAudioBlob(null);
    setVideoDataUrl(null);
  };

  // ────────────────────────────────────────────────────────────────
  // VoxCast Generator
  // ────────────────────────────────────────────────────────────────
  const generateVoxCast = async () => {
    if (!audioBlob) return;
    setIsProcessing(true);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext('2d');
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaElementSource(audio);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      source.connect(analyser);
      analyser.connect(audioCtx.destination);

      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
      const videoChunks = [];

      recorder.ondataavailable = (e) => e.data.size > 0 && videoChunks.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(videoChunks, { type: 'video/webm' });
        const dataUrl = await blobToDataURL(blob);
        setVideoDataUrl(dataUrl);
        setIsProcessing(false);
        URL.revokeObjectURL(audioUrl);
        audioCtx.close();
      };

      let startTime = 0;
      const draw = (time) => {
        if (!startTime) startTime = time;
        const elapsed = (time - startTime) / 1000;

        analyser.getByteFrequencyData(dataArray);
        const intensity = dataArray.reduce((a, b) => a + b, 0) / (255 * bufferLength);

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 1080, 1920);

        ctx.strokeStyle = `rgba(0, 255, 255, ${0.1 + intensity * 0.4})`;
        ctx.lineWidth = 3;
        for (let i = 1; i < 10; i++) {
          ctx.beginPath();
          ctx.moveTo(0, i * 192);
          ctx.lineTo(1080, i * 192);
          ctx.moveTo(i * 108, 0);
          ctx.lineTo(i * 108, 1920);
          ctx.stroke();
        }

        const headY = 600 + Math.sin(elapsed * 2) * 30;
        ctx.fillStyle = `rgba(0, 255, 255, ${0.1 + intensity * 0.5})`;
        ctx.strokeStyle = '#00ffff';
        ctx.roundRect(340, headY, 400, 500, 30);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = `rgb(0, ${150 + intensity * 100}, ${150 + intensity * 100})`;
        ctx.ellipse(440, headY + 150, 50, 70, 0, 0, Math.PI * 2);
        ctx.ellipse(640, headY + 150, 50, 70, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#00ffff';
        ctx.beginPath();
        for (let i = 0; i < bufferLength; i++) {
          const x = 380 + (i / bufferLength) * 320;
          const y = headY + 350 + (dataArray[i] / 255) * 80;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();

        const progress = elapsed / audio.duration;
        ctx.fillStyle = '#00ffff';
        ctx.fillRect(200, 1750, 680 * progress, 40);

        if (elapsed < audio.duration) {
          animationFrame.current = requestAnimationFrame(draw);
        } else {
          recorder.stop();
          audio.pause();
        }
      };

      recorder.start();
      audio.play();
      animationFrame.current = requestAnimationFrame(draw);
    } catch (err) {
      console.error(err);
      alert('Failed to generate video');
      setIsProcessing(false);
    }
  };

  // ────────────────────────────────────────────────────────────────
  // Send
  // ────────────────────────────────────────────────────────────────
  const sendVoxCast = async () => {
    if (!videoDataUrl || !recipientKey) return;
    const key = recipientKey.toUpperCase();
    const users = (await secureDB.get('voxkey_users')) || [];
    const recipient = users.find(u => u.voxKey === key);
    if (!recipient) return alert('Invalid VoxKey');

    const msg = {
      id: Date.now() + Math.random(),
      videoDataUrl,
      timestamp: Date.now(),
    };

    const inbox = (await secureDB.get(`msgs_${key}`)) || [];
    inbox.push(msg);
    await secureDB.set(`msgs_${key}`, inbox);

    alert('VOXCAST TRANSMITTED');
    setVideoDataUrl(null);
    setAudioBlob(null);
    setRecipientKey('');
    history.replaceState(null, '', '/');
  };

  const deleteMessage = async (id) => {
    if (!user) return;
    const inbox = (await secureDB.get(`msgs_${user.voxKey}`)) || [];
    await secureDB.set(`msgs_${user.voxKey}`, inbox.filter(m => m.id !== id));
    loadMessages();
  };

  const shareVideo = async (dataUrl) => {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `voxcast-${Date.now()}.webm`, { type: 'video/webm' });
      await navigator.share({ files: [file], title: 'Anonymous VoxCast' });
    } catch {
      navigator.clipboard.writeText(dataUrl);
      alert('Link copied to clipboard');
    }
  };

  // ────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────
  if (view === 'landing') {
    return (
      <div className="min-h-screen bg-black text-cyan-400 font-mono flex flex-col items-center justify-center p-6">
        <div className="max-w-lg w-full space-y-8">
          <div className="text-center">
            <h1 className="text-6xl font-extrabold tracking-wider animate-pulse">VOXKEY</h1>
            <p className="text-cyan-300 mt-2">ANONYMOUS • ENCRYPTED • UNTRACEABLE</p>
          </div>

          {recipientKey && !user && (
            <div className="border-4 border-cyan-500 p-8 rounded-lg bg-cyan-950/30">
              <h2 className="text-2xl text-center mb-6">SEND TO {recipientKey}</h2>
              <Recorder
                isRecording={isRecording}
                audioBlob={audioBlob}
                videoDataUrl={videoDataUrl}
                isProcessing={isProcessing}
                onStart={startRecording}
                onStop={stopRecording}
                onCancel={cancelRecording}
                onGenerate={generateVoxCast}
                onSend={sendVoxCast}
              />
            </div>
          )}

          {!recipientKey && (
            <AuthOrSend
              user={user}
              recipientKey={recipientKey}
              setRecipientKey={setRecipientKey}
              onSignup={signup}
              onLogin={login}
              isRecording={isRecording}
              audioBlob={audioBlob}
              videoDataUrl={videoDataUrl}
              isProcessing={isProcessing}
              onStart={startRecording}
              onStop={stopRecording}
              onCancel={cancelRecording}
              onGenerate={generateVoxCast}
              onSend={sendVoxCast}
              goToInbox={() => setView('inbox')}
            />
          )}
        </div>
      </div>
    );
  }

  // Inbox View
  return (
    <div className="min-h-screen bg-black text-cyan-400 font-mono p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex justify-between items-center border-b-4 border-cyan-500 pb-4">
          <div>
            <h1 className="text-4xl font-bold">INBOX</h1>
            <p className="text-cyan-300">Agent: {user?.username}</p>
          </div>
          <button onClick={logout} className="p-3 border-2 border-cyan-500 hover:bg-cyan-500 hover:text-black transition">
            <LogOut className="w-6 h-6" />
          </button>
        </div>

        <div className="border-4 border-cyan-500 p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm">YOUR VOXKEY</p>
            <code className="text-2xl font-bold bg-cyan-500 text-black px-4 py-2">{user?.voxKey}</code>
          </div>
          <div className="flex gap-3">
            <button onClick={() => navigator.clipboard.writeText(`${location.origin}/${user?.voxKey}`)} className="p-3 border-2 border-cyan-500 hover:bg-cyan-500 hover:text-black">
              <Copy className="w-6 h-6" />
            </button>
            <button onClick={() => setShowQR(true)} className="p-3 border-2 border-cyan-500 hover:bg-cyan-500 hover:text-black">
              <QrCode className="w-6 h-6" />
            </button>
          </div>
        </div>

        {messages.length === 0 ? (
          <div className="text-center py-20 border-4 border-dashed border-cyan-600">
            <Volume2 className="w-20 h-20 mx-auto text-cyan-700 mb-4" />
            <p className="text-2xl text-cyan-600">NO TRANSMISSIONS YET</p>
          </div>
        ) : (
          <div className="space-y-6">
            {messages.map(msg => (
              <div key={msg.id} className="border-4 border-cyan-500 p-6 bg-cyan-950/20">
                <div className="flex justify-between text-sm text-cyan-300 mb-4">
                  <span>{format(msg.timestamp, 'PPp')}</span>
                  <button onClick={() => deleteMessage(msg.id)} className="text-red-500 hover:text-red-400">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
                <video src={msg.videoDataUrl} controls className="w-full max-w-2xl mx-auto border-2 border-cyan-500" />
                <div className="flex gap-4 mt-4">
                  <a href={msg.videoDataUrl} download={`voxcast-${msg.id}.webm`} className="flex-1 flex items-center justify-center gap-2 p-3 border-2 border-cyan-500 hover:bg-cyan-500 hover:text-black">
                    <Download /> DOWNLOAD
                  </a>
                  <button onClick={() => shareVideo(msg.videoDataUrl)} className="flex-1 flex items-center justify-center gap-2 p-3 border-2 border-cyan-500 hover:bg-cyan-500 hover:text-black">
                    <Share2 /> SHARE
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button onClick={() => setView('landing')} className="w-full py-6 bg-cyan-500 text-black text-xl font-bold hover:bg-cyan-400 transition">
          <Zap className="inline mr-2" /> SEND NEW VOXCAST
        </button>
      </div>

      {showQR && user && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50" onClick={() => setShowQR(false)}>
          <div className="p-10 bg-black border-4 border-cyan-500">
            <QRCodeSVG value={`${location.origin}/${user.voxKey}`} size={300} fgColor="#00ffff" bgColor="#000" />
            <p className="text-center mt-4 text-cyan-400">Scan to send anonymous voice</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────
function Recorder(props) {
  const { isRecording, audioBlob, videoDataUrl, isProcessing, onStart, onStop, onCancel, onGenerate, onSend } = props;

  return (
    <>
      {!audioBlob && !videoDataUrl && (
        <button
          onMouseDown={onStart}
          onMouseUp={onStop}
          onTouchStart={onStart}
          onTouchEnd={onStop}
          disabled={isRecording}
          className={`w-full py-16 text-2xl font-bold transition-all ${isRecording ? 'bg-red-600 animate-pulse' : 'border-4 border-cyan-500 hover:bg-cyan-500 hover:text-black'}`}
        >
          <Mic className="w-16 h-16 mx-auto mb-4" />
          {isRecording ? 'RELEASE TO STOP' : 'HOLD TO RECORD'}
        </button>
      )}

      {audioBlob && !videoDataUrl && !isProcessing && (
        <div className="space-y-4">
          <audio src={URL.createObjectURL(audioBlob)} controls className="w-full" />
          <div className="flex gap-4">
            <button onClick={onGenerate} className="flex-1 py-4 bg-cyan-500 text-black font-bold hover:bg-cyan-400">GENERATE VOXCAST</button>
            <button onClick={onCancel} className="px-6 py-4 border-2 border-red-500 text-red-500 hover:bg-red-500 hover:text-black">Cancel</button>
          </div>
        </div>
      )}

      {isProcessing && <div className="text-center py-12 text-3xl animate-pulse">APPLYING ROBOT MATRIX...</div>}

      {videoDataUrl && (
        <div className="space-y-6">
          <video src={videoDataUrl} controls autoPlay className="w-full border-4 border-cyan-500" />
          <button onClick={onSend} className="w-full py-6 bg-cyan-500 text-black text-2xl font-bold flex items-center justify-center gap-4 hover:bg-cyan-400">
            <Send /> TRANSMIT ANONYMOUSLY
          </button>
        </div>
      )}
    </>
  );
}

function AuthOrSend(props) {
  const { user, recipientKey, setRecipientKey, onSignup, onLogin, goToInbox } = props;
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  if (user) {
    return (
      <div className="border-4 border-cyan-500 p-8 space-y-6">
        <input
          type="text"
          placeholder="RECIPIENT VOXKEY (VX-XXXXXXXX)"
          value={recipientKey}
          onChange={(e) => setRecipientKey(e.target.value.toUpperCase())}
          className="w-full px-4 py-4 bg-black border-2 border-cyan-500 text-xl uppercase"
        />
        <Recorder {...props} />
        <button onClick={goToInbox} className="w-full py-4 border-2 border-cyan-500 hover:bg-cyan-500 hover:text-black text-xl font-bold">
          VIEW INBOX
        </button>
      </div>
    );
  }

  return (
    <div className="border-4 border-cyan-500 p-8 space-y-6">
      <h2 className="text-2xl text-center">ACCESS TERMINAL</h2>
      <input type="email" placeholder="EMAIL" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-4 bg-black border-2 border-cyan-500" />
      <input type="text" placeholder="USERNAME" value={username} onChange={e => setUsername(e.target.value)} className="w-full px-4 py-4 bg-black border-2 border-cyan-500" />
      <input type="password" placeholder="PASSWORD" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-4 bg-black border-2 border-cyan-500" />
      <div className="flex gap-4">
        <button onClick={() => onSignup(email, username, password)} className="flex-1 py-4 bg-cyan-500 text-black font-bold hover:bg-cyan-400">SIGN UP</button>
        <button onClick={() => onLogin(email, password)} className="flex-1 py-4 border-2 border-cyan-500 hover:bg-cyan-500 hover:text-black font-bold">LOGIN</button>
      </div>
    </div>
  );
}
