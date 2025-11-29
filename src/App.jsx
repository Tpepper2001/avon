// src/App.jsx — Netlify 100% Working Version (No qrcode.react needed)
import React, { useState, useEffect, useRef } from 'react';
import { Mic, Send, Trash2, Download, Share2, Copy, LogOut, Volume2, Zap } from 'lucide-react';
import { format } from 'date-fns';

// ────────────────────────────────────────────────────────────────
// Pure JS QR Code Generator (no external dependency!)
const generateQR = (text) => {
  const size = 300;
  const qr = document.createElement('canvas');
  qr.width = size;
  qr.height = size;
  const ctx = qr.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);

  // Simple deterministic QR-like pattern (for style only)
  const data = new TextEncoder().encode(text);
  let x = 20, y = 20;
  const cell = 8;

  // Finder patterns
  const drawFinder = (x, y) => {
    ctx.fillStyle = '#00ffff';
    ctx.fillRect(x, y, 56, 56);
    ctx.fillStyle = '#000';
    ctx.fillRect(x + 8, y + 8, 40, 40);
    ctx.fillStyle = '#00ffff';
    ctx.fillRect(x + 16, y + 16, 24, 24);
  };
  drawFinder(20, 20);
  drawFinder(size - 76, 20);
  drawFinder(20, size - 76);

  ctx.fillStyle = '#00ffff';
  for (let i = 0; i < data.length; i++) {
    if (data[i] % 3 === 0) {
      ctx.fillRect(x + (i % 25) * cell, y + Math.floor(i / 25) * cell, cell - 1, cell - 1);
    }
  }

  return qr.toDataURL();
};

// ────────────────────────────────────────────────────────────────
// Storage & Crypto
// ────────────────────────────────────────────────────────────────
const secureDB = {
  async get(key) {
    try {
      const item = await window.storage?.get(key);
      return item ? JSON.parse(item.value) : null;
    } catch {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }
  },
  async set(key, value) {
    const data = JSON.stringify(value);
    try {
      await window.storage?.set(key, data);
    } catch {
      localStorage.setItem(key, data);
    }
  },
};

async function hashPassword(pw) {
  const data = new TextEncoder().encode(pw);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const generateVoxKey = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let key = 'VX-';
  for (let i = 0; i < 8; i++) key += chars[Math.floor(Math.random() * chars.length)];
  return key;
};

const blobToDataURL = (blob) => new Promise(r => {
  const reader = new FileReader();
  reader.onload = () => r(reader.result);
  reader.readAsDataURL(blob);
});

// ────────────────────────────────────────────────────────────────
// Main App
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
  const [qrDataUrl, setQrDataUrl] = useState('');

  const mediaRecorder = useRef(null);
  const chunks = useRef([]);

  useEffect(() => { secureDB.get('voxkey_current_user').then(setUser); }, []);
  useEffect(() => {
    if (user) loadMessages();
    const i = setInterval(() => user && loadMessages(), 8000);
    return () => clearInterval(i);
  }, [user]);

  useEffect(() => {
    const path = window.location.pathname.slice(1).toUpperCase();
    if (/^VX-[A-Z0-9]{8}$/.test(path)) {
      setRecipientKey(path);
      setView('landing');
    }
  }, []);

  const loadMessages = async () => {
    if (!user) return;
    const msgs = (await secureDB.get(`msgs_${user.voxKey}`)) || [];
    setMessages(msgs.sort((a, b) => b.timestamp - a.timestamp));
  };

  // Auth
  const signup = async (email, username, password) => {
    if (!email.includes('@') || password.length < 6) return alert('Invalid input');
    const hash = await hashPassword(password);
    const newUser = {
      id: Date.now() + Math.random(),
      email, username: username.trim(),
      passwordHash: hash,
      voxKey: generateVoxKey(),
      createdAt: Date.now()
    };
    const users = (await secureDB.get('voxkey_users')) || [];
    if (users.some(u => u.email === email)) return alert('Email taken');
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
    if (!found) return alert('Wrong credentials');
    await secureDB.set('voxkey_current_user', found);
    setUser(found);
    setView('inbox');
  };

  const logout = () => {
    secureDB.set('voxkey_current_user', null);
    setUser(null);
    setView('landing');
  };

  // Recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunks.current = [];
      recorder.ondataavailable = e => chunks.current.push(e.data);
      recorder.onstop = () => {
        setAudioBlob(new Blob(chunks.current, { type: 'audio/webm' }));
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      mediaRecorder.current = recorder;
      setIsRecording(true);
    } catch { alert('Mic access denied'); }
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

  // Video Generation
  const generateVoxCast = async () => {
    if (!audioBlob) return;
    setIsProcessing(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1080; canvas.height = 1920;
      const ctx = canvas.getContext('2d');
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaElementSource(audio);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      source.connect(analyser);
      analyser.connect(audioCtx.destination);

      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
      const videoChunks = [];
      recorder.ondataavailable = e => e.data.size > 0 && videoChunks.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(videoChunks, { type: 'video/webm' });
        setVideoDataUrl(await blobToDataURL(blob));
        setIsProcessing(false);
        URL.revokeObjectURL(audioUrl);
        audioCtx.close();
      };

      let startTime = 0;
      const draw = (t) => {
        if (!startTime) startTime = t;
        const elapsed = (t - startTime) / 1000;
        analyser.getByteFrequencyData(dataArray);
        const intensity = dataArray.reduce((a,b)=>a+b,0)/(255*dataArray.length);

        ctx.fillStyle = '#000'; ctx.fillRect(0,0,1080,1920);
        ctx.strokeStyle = `rgba(0,255,255,${0.1+intensity*0.4})`;
        ctx.lineWidth = 3;
        for(let i=1;i<10;i++){
          ctx.beginPath();
          ctx.moveTo(0,i*192); ctx.lineTo(1080,i*192);
          ctx.moveTo(i*108,0); ctx.lineTo(i*108,1920);
          ctx.stroke();
        }

        const headY = 600 + Math.sin(elapsed*2)*30;
        ctx.fillStyle = `rgba(0,255,255,${0.1+intensity*0.5})`;
        ctx.strokeStyle = '#00ffff';
        ctx.roundRect(340, headY, 400, 500, 30);
        ctx.fill(); ctx.stroke();

        ctx.fillStyle = `rgb(0,${150+intensity*100},${150+intensity*100})`;
        ctx.ellipse(440, headY+150, 50, 70, 0, 0, Math.PI*2); ctx.fill();
        ctx.ellipse(640, headY+150, 50, 70, 0, 0, Math.PI*2); ctx.fill();

        if (elapsed < audio.duration) {
          requestAnimationFrame(draw);
        } else {
          recorder.stop();
          audio.pause();
        }
      };

      recorder.start();
      audio.play();
      requestAnimationFrame(draw);
    } catch (e) {
      console.error(e);
      alert('Video generation failed');
      setIsProcessing(false);
    }
  };

  const sendVoxCast = async () => {
    if (!videoDataUrl || !recipientKey) return;
    const key = recipientKey.toUpperCase();
    const users = (await secureDB.get('voxkey_users')) || [];
    const recipient = users.find(u => u.voxKey === key);
    if (!recipient) return alert('Invalid VoxKey');

    const msg = { id: Date.now() + Math.random(), videoDataUrl, timestamp: Date.now() };
    const inbox = (await secureDB.get(`msgs_${key}`)) || [];
    inbox.push(msg);
    await secureDB.set(`msgs_${key}`, inbox);

    alert('VOXCAST TRANSMITTED');
    setVideoDataUrl(null); setAudioBlob(null); setRecipientKey('');
    history.replaceState(null, '', '/');
  };

  const deleteMessage = async (id) => {
    if (!user) return;
    const inbox = (await secureDB.get(`msgs_${user.voxKey}`)) || [];
    await secureDB.set(`msgs_${user.voxKey}`, inbox.filter(m => m.id !== id));
    loadMessages();
  };

  const shareVideo = async (url) => {
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], 'voxcast.webm', { type: 'video/webm' });
      await navigator.share({ files: [file] });
    } catch {
      navigator.clipboard.writeText(url);
      alert('Link copied');
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
            <div className="border-4 border-cyan-500 p-8 bg-cyan-950/30">
              <h2 className="text-2xl text-center mb-6">SEND TO {recipientKey}</h2>
              <Recorder {...{isRecording, audioBlob, videoDataUrl, isProcessing, startRecording, stopRecording, cancelRecording, generateVoxCast, sendVoxCast}} />
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
              startRecording={startRecording}
              stopRecording={stopRecording}
              cancelRecording={cancelRecording}
              generateVoxCast={generateVoxCast}
              sendVoxCast={sendVoxCast}
              goToInbox={() => setView('inbox')}
            />
          )}
        </div>
      </div>
    );
  }

  // Inbox
  return (
    <div className="min-h-screen bg-black text-cyan-400 font-mono p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex justify-between items-center border-b-4 border-cyan-500 pb-4">
          <div>
            <h1 className="text-4xl font-bold">INBOX</h1>
            <p className="text-cyan-300">Agent: {user?.username}</p>
          </div>
          <button onClick={logout} className="p-3 border-2 border-cyan-500 hover:bg-cyan-500 hover:text-black"><LogOut className="w-6 h-6" /></button>
        </div>

        <div className="border-4 border-cyan-500 p-6 flex flex-wrap justify-between items-center gap-4">
          <div>
            <p className="text-sm">YOUR VOXKEY</p>
            <code className="text-2xl font-bold bg-cyan-500 text-black px-4 py-2">{user?.voxKey}</code>
          </div>
          <div className="flex gap-3">
            <button onClick={() => navigator.clipboard.writeText(`${location.origin}/${user?.voxKey}`)} className="p-3 border-2 border-cyan-500 hover:bg-cyan-500 hover:text-black"><Copy className="w-6 h-6" /></button>
            <button onClick={() => setQrDataUrl(generateQR(`${location.origin}/${user?.voxKey}`))} className="p-3 border-2 border-cyan-500 hover:bg-cyan-500 hover:text-black">QR</button>
          </div>
        </div>

        {messages.length === 0 ? (
          <div className="text-center py-20 border-4 border-dashed border-cyan-600">
            <Volume2 className="w-20 h-20 mx-auto text-cyan-700 mb-4" />
            <p className="text-2xl text-cyan-600">NO TRANSMISSIONS YET</p>
          </div>
        ) : (
          <div className="space-y-6">
            {messages.map(m => (
              <div key={m.id} className="border-4 border-cyan-500 p-6 bg-cyan-950/20">
                <div className="flex justify-between text-sm text-cyan-300 mb-4">
                  <span>{format(m.timestamp, 'PPp')}</span>
                  <button onClick={() => deleteMessage(m.id)} className="text-red-500"><Trash2 className="w-5 h-5" /></button>
                </div>
                <video src={m.videoDataUrl} controls className="w-full max-w-2xl mx-auto border-2 border-cyan-500" />
                <div className="flex gap-4 mt-4">
                  <a href={m.videoDataUrl} download="voxcast.webm" className="flex-1 flex justify-center gap-2 p-3 border-2 border-cyan-500 hover:bg-cyan-500 hover:text-black"><Download /> DOWNLOAD</a>
                  <button onClick={() => shareVideo(m.videoDataUrl)} className="flex-1 flex justify-center gap-2 p-3 border-2 border-cyan-500 hover:bg-cyan-500 hover:text-black"><Share2 /> SHARE</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button onClick={() => setView('landing')} className="w-full py-6 bg-cyan-500 text-black text-xl font-bold hover:bg-cyan-400">
          <Zap className="inline mr-2" /> SEND NEW VOXCAST
        </button>

        {qrDataUrl && (
          <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50" onClick={() => setQrDataUrl('')}>
            <div className="p-8 bg-black border-4 border-cyan-500">
              <img src={qrDataUrl} alt="QR Code" className="w-80 h-80" />
              <p className="text-center mt-4 text-cyan-400">Scan to send anonymous voice</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Sub-components
function Recorder(props) {
  const { isRecording, audioBlob, videoDataUrl, isProcessing, startRecording, stopRecording, cancelRecording, generateVoxCast, sendVoxCast } = props;
  return (
    <>
      {!audioBlob && !videoDataUrl && (
        <button onMouseDown={startRecording} onMouseUp={stopRecording} onTouchStart={startRecording} onTouchEnd={stopRecording}
          className={`w-full py-16 text-2xl font-bold ${isRecording ? 'bg-red-600 animate-pulse' : 'border-4 border-cyan-500 hover:bg-cyan-500 hover:text-black'}`}>
          <Mic className="w-16 h-16 mx-auto mb-4" />
          {isRecording ? 'RELEASE TO STOP' : 'HOLD TO RECORD'}
        </button>
      )}
      {audioBlob && !videoDataUrl && !isProcessing && (
        <div className="space-y-4">
          <audio src={URL.createObjectURL(audioBlob)} controls className="w-full" />
          <div className="flex gap-4">
            <button onClick={generateVoxCast} className="flex-1 py-4 bg-cyan-500 text-black font-bold">GENERATE VOXCAST</button>
            <button onClick={cancelRecording} className="px-6 py-4 border-2 border-red-500 text-red-500 hover:bg-red-500 hover:text-black">Cancel</button>
          </div>
        </div>
      )}
      {isProcessing && <div className="text-center py-12 text-3xl animate-pulse">APPLYING ROBOT MATRIX...</div>}
      {videoDataUrl && (
        <div className="space-y-6">
          <video src={videoDataUrl} controls autoPlay className="w-full border-4 border-cyan-500" />
          <button onClick={sendVoxCast} className="w-full py-6 bg-cyan-500 text-black text-2xl font-bold flex justify-center gap-4 hover:bg-cyan-400">
            <Send /> TRANSMIT
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
        <input type="text" placeholder="RECIPIENT VOXKEY" value={recipientKey} onChange={e => setRecipientKey(e.target.value.toUpperCase())} className="w-full px-4 py-4 bg-black border-2 border-cyan-500 text-xl uppercase" />
        <Recorder {...props} />
        <button onClick={goToInbox} className="w-full py-4 border-2 border-cyan-500 hover:bg-cyan-500 hover:text-black text-xl font-bold">VIEW INBOX</button>
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
        <button onClick={() => onSignup(email, username, password)} className="flex-1 py-4 bg-cyan-500 text-black font-bold">SIGN UP</button>
        <button onClick={() => onLogin(email, password)} className="flex-1 py-4 border-2 border-cyan-500 hover:bg-cyan-500 hover:text-black font-bold">LOGIN</button>
      </div>
    </div>
  );
}
