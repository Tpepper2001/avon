// src/App.jsx — VoxKey v8.0 — FINAL & PERFECT (No Firebase, Pure localStorage)
import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { Mic, Share2, Copy, CheckCircle, Trash2, Send, X, Loader2, Zap, Radio, Lock, Globe } from 'lucide-react';

const generateVoxKey = () => 'VX-' + Math.random().toString(36).substring(2, 6).toUpperCase();

const voxDB = {
  save(key, msg) {
    const storageKey = `vox_${key}`;
    let list = JSON.parse(localStorage.getItem(storageKey) || '[]');
    list.unshift({ ...msg, id: crypto.randomUUID() });
    if (list.length > 100) list.pop();
    localStorage.setItem(storageKey, JSON.stringify(list));
  },
  get(key) {
    return JSON.parse(localStorage.getItem(`vox_${key}`) || '[]');
  },
  delete(key, id) {
    const storageKey = `vox_${key}`;
    let list = JSON.parse(localStorage.getItem(storageKey) || '[]');
    list = list.filter(m => m.id !== id);
    localStorage.setItem(storageKey, JSON.stringify(list));
  }
};

const blobToBase64 = (blob) => new Promise((res, rej) => {
  const reader = new FileReader();
  reader.onload = () => res(reader.result.split(',')[1]);
  reader.onerror = rej;
  reader.readAsDataURL(blob);
});

const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

export default function App() {
  const [myKey, setMyKey] = useState(null);
  const [view, setView] = useState('landing');
  const [targetKey, setTargetKey] = useState('');
  const [messages, setMessages] = useState([]);
  const [linkCopied, setLinkCopied] = useState(false);

  // Recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [previewVideo, setPreviewVideo] = useState(null);

  const canvasRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const animationId = useRef(0);
  const objectUrls = useRef(new Set());

  const createURL = (blob) => {
    const url = URL.createObjectURL(blob);
    objectUrls.current.add(url);
    return url;
  };

  const cleanup = () => {
    objectUrls.current.forEach(URL.revokeObjectURL);
    objectUrls.current.clear();
  };

  useEffect(() => () => cleanup(), []);

  // === Routing & Key Handling ===
  useLayoutEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/key/')) {
      const key = path.slice(5).toUpperCase();
      if (/^VX-[A-Z0-9]{4}$/.test(key)) {
        setTargetKey(key);
        setView('send');
        return;
      }
    }

    const saved = localStorage.getItem('voxkey_my');
    if (saved) {
      setMyKey(saved);
      setMessages(voxDB.get(saved));
      setView('inbox');
    } else {
      setView('landing');
    }
  }, []);

  // Real-time inbox (localStorage polling)
  useEffect(() => {
    if (!myKey) return;
    const interval = setInterval(() => {
      setMessages(voxDB.get(myKey));
    }, 1000);
    return () => clearInterval(interval);
  }, [myKey]);

  // === Recording & Robot Video ===
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mime = 'audio/webm';
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
      animateRobot();
    } catch (err) {
      alert('Microphone access denied');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    clearInterval(timerRef.current);
    setIsRecording(false);
    if (animationId.current) cancelAnimationFrame(animationId.current);
  };

  const cancelRecording = () => {
    stopRecording();
    setAudioBlob(null);
    setRecordingTime(0);
    setPreviewVideo(null);
    cleanup();
  };

  const animateRobot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 8;
    ctx.strokeRect(w * 0.2, h * 0.3, w * 0.6, h * 0.4);

    ctx.fillStyle = '#22d3ee';
    ctx.shadowBlur = 50;
    ctx.shadowColor = '#22d3ee';
    ctx.beginPath();
    ctx.arc(w * 0.35, h * 0.45, 50, 0, Math.PI * 2);
    ctx.arc(w * 0.65, h * 0.45, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 12;
    ctx.beginPath();
    for (let i = 0; i < 25; i++) {
      const x = w * 0.25 + i * 12;
      const y = h * 0.6 + Math.sin(Date.now() / 100 + i) * 40;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#06b6d4';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('VOXKEY ACTIVE', w / 2, h * 0.8);

    if (isRecording) {
      const elapsed = recordingTime;
      ctx.fillStyle = '#22d3ee';
      ctx.fillRect(w * 0.1, h * 0.9, w * 0.8 * Math.min(elapsed / 15, 1), 20);
      if (elapsed >= 15) stopRecording();
    }

    animationId.current = requestAnimationFrame(animateRobot);
  };

  const sendMessage = async () => {
    if (!audioBlob || !targetKey) return;
    setProcessing(true);
    try {
      const base64 = await blobToBase64(audioBlob);
      voxDB.save(targetKey, {
        audioData: base64,
        mimeType: audioBlob.type,
        transcript: '[[ ANONYMOUS ]]',
        timestamp: new Date().toISOString(),
      });
      cancelRecording();
      setView('sent');
    } catch (e) {
      alert('Send failed');
    } finally {
      setProcessing(false);
    }
  };

  // === VIEWS ===
  if (view === 'landing') {
    return (
      <div className="min-h-screen bg-black text-cyan-400 flex flex-col items-center justify-center p-8 text-center">
        <Zap className="w-32 h-32 mb-8 animate-pulse" />
        <h1 className="text-8xl font-bold mb-12">VoxKey</h1>
        <p className="text-3xl mb-16">Get anonymous robot voice messages</p>
        <button
          onClick={() => {
            const key = generateVoxKey();
            localStorage.setItem('voxkey_my', key);
            window.location.href = '/key/' + key;
          }}
          className="px-32 py-16 bg-cyan-600 rounded-3xl text-5xl font-bold hover:bg-cyan-500 transition"
        >
          Create My VoxKey
        </button>
      </div>
    );
  }

  if (view === 'send') {
    return (
      <div className="min-h-screen bg-black text-cyan-400 flex flex-col">
        <canvas ref={canvasRef} width="400" height="711" className="mx-auto mt-8 border-8 border-cyan-600 rounded-3xl" />
        <div className="p-8 text-center">
          <h2 className="text-5xl font-bold mb-4">Sending to</h2>
          <code className="text-7xl text-cyan-300">{targetKey}</code>
        </div>
        <div className="p-8">
          {previewVideo ? (
            <div className="space-y-8">
              <audio src={previewVideo.url} controls className="w-full" />
              <div className="flex gap-6">
                <button onClick={cancelRecording} className="flex-1 py-10 bg-red-600 rounded-3xl text-4xl font-bold">Discard</button>
                <button onClick={sendMessage} disabled={processing} className="flex-1 py-10 bg-cyan-600 rounded-3xl text-4xl font-bold">
                  {processing ? 'Sending...' : 'Transmit'}
                </button>
              </div>
            </div>
          ) : audioBlob ? (
            <button onClick={() => setPreviewVideo({ url: createURL(audioBlob) })} className="w-full py-12 bg-cyan-600 rounded-3xl text-5xl font-bold">
              Preview & Send
            </button>
          ) : (
            <button
              onClick={() => isRecording ? stopRecording() : startRecording()}
              className={`w-full py-20 text-8xl font-bold rounded-3xl ${isRecording ? 'bg-red-600 animate-pulse' : 'bg-cyan-600'}`}
            >
              {isRecording ? 'STOP' : 'RECORD'}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (view === 'sent') {
    return (
      <div className="min-h-screen bg-black text-cyan-400 flex flex-col items-center justify-center p-8 text-center">
        <CheckCircle className="w-40 h-40 mb-12 text-cyan-400" />
        <h1 className="text-8xl font-bold mb-12">Sent!</h1>
        <button onClick={() => { cancelRecording(); setView('send'); }} className="px-32 py-16 bg-cyan-600 rounded-3xl text-5xl font-bold">
          Send Another
        </button>
      </div>
    );
  }

  if (view === 'inbox' && myKey) {
    return (
      <div className="min-h-screen bg-black text-cyan-400 p-8">
        <div className="text-center mb-12">
          <h1 className="text-7xl font-bold">{myKey}</h1>
          <p className="text-4xl mt-4">Your Inbox</p>
        </div>
        <div className="bg-gray-900 border-4 border-cyan-600 p-10 rounded-3xl mb-12">
          <code className="text-3xl break-all block mb-8">{window.location.origin}/key/{myKey}</code>
          <button onClick={() => {
            navigator.clipboard.writeText(`${window.location.origin}/key/${myKey}`);
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 2000);
          }} className="w-full py-10 bg-cyan-600 rounded-3xl text-4xl font-bold">
            {linkCopied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
        {messages.length === 0 ? (
          <p className="text-center text-5xl text-gray-600 mt-40">No messages yet</p>
        ) : (
          <div className="space-y-12">
            {messages.map(m => (
              <div key={m.id} className="bg-gray-900 border-4 border-cyan-600 rounded-3xl p-8">
                <audio src={`data:${m.mimeType};base64,${m.audioData}`} controls className="w-full mb-6" />
                <button onClick={() => {
                  voxDB.delete(myKey, m.id);
                  setMessages(voxDB.get(myKey));
                }} className="w-full py-8 bg-red-900 rounded-3xl text-4xl font-bold">
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

}
