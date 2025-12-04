import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Mic, Play, Send, Check, Inbox, Share2, LogOut, User, Sparkles, 
  Square, Trash2, Film, Download, Heart, Zap, Ghost, Instagram, 
  AlertCircle, Loader2, X, MessageCircle, Music2 
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// --- CONFIGURATION ---
const SUPABASE_URL = 'https://ghlnenmfwlpwlqdrbean.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdobG5lbm1md2xwd2xxZHJiZWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MTE0MDQsImV4cCI6MjA3OTk4NzQwNH0.rNILUdI035c4wl4kFkZFP4OcIM_t7bNMqktKm25d5Gg';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const MAX_RECORDING_TIME = 120; // 2 minutes
const REFRESH_INTERVAL = 10000;

const AUDIO_CONSTRAINTS = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  }
};

const VOICE_TYPES = {
  ROBOT: { id: 'robot', name: 'Bot', color: '#667eea', detune: -800, speed: 1.0, req: 0 },
  ALIEN: { id: 'alien', name: 'Alien', color: '#10B981', detune: 1200, speed: 1.2, req: 3 },
  DEMON: { id: 'demon', name: 'Demon', color: '#EF4444', detune: -1800, speed: 0.8, req: 5 },
};

const MESSAGE_TEMPLATES = [
  "Confession: I've had a crush on you since...",
  "Truth Bomb: You need to hear this...",
  "Question: What was that thing you posted...",
];

export default function AnonymousVoiceApp() {
  // --- STATE ---
  const [user, setUser] = useState(null);
  const [view, setView] = useState('landing');
  const [authMode, setAuthMode] = useState('login');
  const [activeTab, setActiveTab] = useState('inbox');
  const [formData, setFormData] = useState({ username: '', password: '', recipient: '' });
  const [recordingState, setRecordingState] = useState({ isRecording: false, time: 0, blob: null, url: null, transcript: '', error: null });
  const [status, setStatus] = useState({ loading: false, error: null, success: null });
  const [messages, setMessages] = useState([]);
  const [referralCount, setReferralCount] = useState(0);
  const [genState, setGenState] = useState({ id: null, progress: 0, status: '' });
  const [sharingId, setSharingId] = useState(null);
  
  // --- REFS ---
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);

  // --- INIT ---
  useEffect(() => {
    const savedUser = safeJSONParse(localStorage.getItem('anon-voice-user'));
    const savedRefs = parseInt(localStorage.getItem('anon-refs') || '0');
    const params = new URLSearchParams(window.location.search);
    const sendTo = params.get('send_to');
    const refBy = params.get('ref');

    if (refBy && refBy !== savedUser?.username) localStorage.setItem('referred_by', refBy);
    setReferralCount(savedRefs);

    if (sendTo) {
      setFormData(prev => ({ ...prev, recipient: sendTo }));
      setView('recorder');
    } else if (savedUser) {
      setUser(savedUser);
      setView('inbox');
      fetchMessages(savedUser.username);
    }
    return () => cleanupRecordingResources();
  }, []);

  useEffect(() => {
    if (!user || view !== 'inbox') return;
    const interval = setInterval(() => { if (!genState.id) fetchMessages(user.username); }, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [user, view, genState.id]);

  useEffect(() => {
    if (recordingState.isRecording && recordingState.time >= MAX_RECORDING_TIME) {
      stopRecording();
      setStatus({ ...status, error: 'Max recording time reached' });
    }
  }, [recordingState.time, recordingState.isRecording]);

  // --- HELPERS ---
  const safeJSONParse = (str) => { try { return JSON.parse(str); } catch { return null; } };
  
  const cleanupRecordingResources = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    if (timerRef.current) clearInterval(timerRef.current);
    if (recognitionRef.current) recognitionRef.current.stop();
  };

  const handleDownload = async (url, filename) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      alert("Download failed. Please try again.");
    }
  };

 // --- DIRECT VIDEO FILE SHARING (Browser Optimized) ---
  const handleNativeShare = async (videoUrl, msgId) => {
    setSharingId(msgId);
    
    try {
      // Fetch the video file first
      const response = await fetch(videoUrl);
      if (!response.ok) throw new Error('Failed to fetch video');
      
      const blob = await response.blob();
      
      // Force MP4 MIME type for maximum compatibility
      const mimeType = 'video/mp4';
      const fileName = `anonvox-${msgId}.mp4`;
      const videoFile = new File([blob], fileName, { type: mimeType });

      // Try Web Share API with the actual video file
      if (navigator.share) {
        const shareData = {
          files: [videoFile],
          title: 'AnonVox',
          text: 'Anonymous voice message 🎤'
        };

        // Check if sharing this file is supported
        if (navigator.canShare && navigator.canShare(shareData)) {
          await navigator.share(shareData);
          return; // Successfully shared the video file!
        }
        
        // If file sharing not supported, try without files
        if (navigator.canShare({ text: shareData.text, url: videoUrl })) {
          await navigator.share({
            title: shareData.title,
            text: shareData.text,
            url: videoUrl
          });
          return;
        }
      }

      // Fallback: Download the file
      // Create a download link
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      
      alert("✅ Video downloaded! You can now share it from your device.");
      
    } catch (error) {
      console.error('Share error:', error);
      
      // Don't show error if user cancelled
      if (error.name === 'AbortError') return;
      
      // For other errors, suggest download
      if (error.name !== 'NotAllowedError') {
        alert("⚠️ Direct sharing failed. Downloading video instead...");
        handleDownload(videoUrl, `anonvox-${msgId}.mp4`);
      }
    } finally {
      setSharingId(null);
    }
  };

  const fetchMessages = useCallback(async (username) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('username', username)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      if (data) {
        setMessages(prev => {
          const merged = data.map(remoteMsg => {
            const localMsg = prev.find(p => p.id === remoteMsg.id);
            if (localMsg?.video_url && !remoteMsg.video_url) {
                return { ...remoteMsg, video_url: localMsg.video_url };
            }
            return remoteMsg;
          });
          if (JSON.stringify(prev) === JSON.stringify(merged)) return prev;
          return merged;
        });
      }
    } catch (err) { console.error('Fetch error:', err); }
  }, []);

  // --- AUTH ---
  const handleAuth = async () => {
    const { username, password } = formData;
    if (!username.match(/^[a-zA-Z0-9_-]{3,20}$/)) return setStatus({ ...status, error: 'Invalid username' });
    if (password.length < 6) return setStatus({ ...status, error: 'Password too short' });

    setStatus({ loading: true, error: null });
    try {
      if (authMode === 'signup') {
        const { data: ex } = await supabase.from('users').select('username').eq('username', username).maybeSingle();
        if (ex) throw new Error('Username taken');
        const { error } = await supabase.from('users').insert({ username, password });
        if (error) throw error;
      } else {
        const { data } = await supabase.from('users').select('username').eq('username', username).eq('password', password).maybeSingle();
        if (!data) throw new Error('Invalid credentials');
      }
      const u = { username };
      setUser(u);
      localStorage.setItem('anon-voice-user', JSON.stringify(u));
      setView('inbox');
      setFormData({ username: '', password: '', recipient: '' });
      fetchMessages(username);
    } catch (err) { setStatus({ ...status, error: err.message }); }
    finally { setStatus(prev => ({ ...prev, loading: false })); }
  };

  const logout = () => { setUser(null); localStorage.removeItem('anon-voice-user'); setView('landing'); setMessages([]); };

  // --- RECORDING ---
  const startRecording = async () => {
    setStatus({ ...status, error: null });
    try {
      if (!navigator.mediaDevices) throw new Error('Audio not supported');
      const stream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
      streamRef.current = stream;

      const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
      let selectedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || '';
      
      const recorder = new MediaRecorder(stream, { mimeType: selectedMime });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: selectedMime || 'audio/webm' });
        if (blob.size < 1000) {
          setStatus({ ...status, error: 'Recording too short' });
          return;
        }
        setRecordingState(p => ({ ...p, isRecording: false, blob, url: URL.createObjectURL(blob) }));
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start(1000); 
      setRecordingState({ isRecording: true, time: 0, blob: null, url: null, transcript: '', error: null });
      timerRef.current = setInterval(() => setRecordingState(p => ({ ...p, time: p.time + 1 })), 1000);
      
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        const r = new SR(); r.continuous = true; r.interimResults = true;
        r.onresult = e => setRecordingState(p => ({ ...p, transcript: Array.from(e.results).map(res => res[0].transcript).join('') }));
        r.start(); recognitionRef.current = r;
      }
    } catch (err) { 
        console.error(err);
        setStatus({ ...status, error: 'Mic access denied or not supported' }); 
    }
  };

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      if (timerRef.current) clearInterval(timerRef.current);
      if (recognitionRef.current) recognitionRef.current.stop();
    }
  }, []);

  const handleSendMessage = async () => {
    if (!recordingState.blob) return;
    setStatus({ loading: true, error: null });
    try {
      const ext = recordingState.blob.type.includes('mp4') ? 'mp4' : 'webm';
      const fileName = `voice-${Date.now()}.${ext}`;
      
      const { error: upErr } = await supabase.storage
          .from('voices')
          .upload(fileName, recordingState.blob, { contentType: recordingState.blob.type });
          
      if (upErr) throw upErr;
      
      const { data: { publicUrl } } = supabase.storage.from('voices').getPublicUrl(fileName);
      const { error: dbErr } = await supabase.from('messages').insert({
        username: formData.recipient, text: recordingState.transcript || '[Voice Message]', audio_url: publicUrl
      });
      if (dbErr) throw dbErr;

      alert('Message sent! 🚀');
      window.location.href = window.location.origin;
    } catch (err) { setStatus({ ...status, error: 'Send failed', loading: false }); }
  };

  // --- VIDEO GENERATION (UPDATED FOR MP4 SUPPORT) ---
  const generateVideo = useCallback(async (msgId, remoteAudioUrl, text, voiceType) => {
    if (genState.id) return;
    setGenState({ id: msgId, progress: 0, status: 'Processing Audio...' });
    
    let ctx = null;

    try {
      const response = await fetch(remoteAudioUrl);
      if (!response.ok) throw new Error("Failed to fetch audio file");
      const audioBufferData = await response.arrayBuffer();

      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await ctx.decodeAudioData(audioBufferData);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      const dest = ctx.createMediaStreamDestination();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      
      const voiceConfig = VOICE_TYPES[voiceType.toUpperCase()] || VOICE_TYPES.ROBOT;
      source.detune.value = voiceConfig.detune;
      source.playbackRate.value = voiceConfig.speed;
      
      const gainNode = ctx.createGain();
      gainNode.gain.value = 2.0;

      source.connect(gainNode);
      gainNode.connect(analyser);
      gainNode.connect(dest);

      const width = 1080;
      const height = 1920;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const canvasCtx = canvas.getContext('2d', { alpha: false });
      
      const canvasStream = canvas.captureStream(30);
      const mixedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...dest.stream.getAudioTracks()
      ]);
      
      // CHECK IF MP4 IS SUPPORTED (Better for Sharing)
      let mimeType = 'video/webm;codecs=vp8,opus';
      if (MediaRecorder.isTypeSupported('video/mp4')) {
        mimeType = 'video/mp4';
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=h264')) {
        mimeType = 'video/webm;codecs=h264';
      }

      const mediaRecorder = new MediaRecorder(mixedStream, { 
        mimeType: mimeType,
        videoBitsPerSecond: 3000000 
      });
      
      const chunks = [];
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const duration = audioBuffer.duration / voiceConfig.speed;
      
      await new Promise((resolve, reject) => {
        mediaRecorder.onstop = resolve;
        mediaRecorder.onerror = reject;
        mediaRecorder.start();
        source.start(0);

        const startTime = ctx.currentTime;
        const draw = () => {
           const elapsedTime = ctx.currentTime - startTime;
           if (elapsedTime >= duration + 0.5) { 
              mediaRecorder.stop();
              return;
           }

           analyser.getByteFrequencyData(dataArray);
           const avg = dataArray.reduce((a,b)=>a+b) / dataArray.length;
           
           const grad = canvasCtx.createLinearGradient(0,0,0,height);
           grad.addColorStop(0, '#0f172a');
           grad.addColorStop(1, voiceConfig.color);
           canvasCtx.fillStyle = grad;
           canvasCtx.fillRect(0,0,width,height);

           const t = Date.now()/1000;
           canvasCtx.save();
           canvasCtx.translate(width/2, height/2);
           canvasCtx.translate(0, Math.sin(t*3)*15);

           canvasCtx.fillStyle = '#e2e8f0';
           canvasCtx.beginPath(); canvasCtx.roundRect(-200,-200,400,400,40); canvasCtx.fill();

           canvasCtx.fillStyle = voiceConfig.color;
           canvasCtx.shadowBlur=20; canvasCtx.shadowColor=voiceConfig.color;
           const blink = Math.sin(t*2)>0.95?5:60;
           canvasCtx.fillRect(-120,-50,80,blink);
           canvasCtx.fillRect(40,-50,80,blink);
           canvasCtx.shadowBlur=0;

           const mouth = Math.max(10, avg*3);
           canvasCtx.fillStyle = '#1e293b';
           canvasCtx.fillRect(-100,100,200,mouth);
           canvasCtx.restore();

           canvasCtx.font='bold 60px sans-serif';
           canvasCtx.fillStyle='rgba(255,255,255,0.8)';
           canvasCtx.textAlign='center';
           canvasCtx.fillText('ANON VOX', width/2, 200);

           if (text) {
             canvasCtx.font='40px sans-serif';
             canvasCtx.fillStyle='#fff';
             const words = text.split(' ');
             const p = elapsedTime / duration;
             const i = Math.floor(p*words.length);
             const sub = words.slice(Math.max(0,i-2), i+3).join(' ');
             canvasCtx.fillText(sub||text.substring(0,25)+'...', width/2, height-300);
           }

           setGenState({ id: msgId, progress: Math.min(100, Math.round((elapsedTime/duration)*100)), status: 'Recording...' });
           requestAnimationFrame(draw);
        };
        draw();
      });

      setGenState({ id: msgId, progress: 100, status: 'Finalizing...' });
      
      const finalBlob = new Blob(chunks, { type: mimeType });
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const fileName = `video-${msgId}-${Date.now()}.${ext}`;
      
      const { error: upErr } = await supabase.storage.from('voices').upload(fileName, finalBlob);
      if (upErr) throw upErr;
      
      const { data: { publicUrl } } = supabase.storage.from('voices').getPublicUrl(fileName);
      
      const { data: updatedData, error: dbErr } = await supabase
        .from('messages')
        .update({ video_url: publicUrl })
        .eq('id', msgId)
        .select();
      
      if (dbErr || !updatedData || updatedData.length === 0) {
        console.error("DB Update Failed", dbErr);
        alert("Video generated! But we couldn't save it to your history. Please check your Database Permissions (Row Level Security).");
      }
      
      setMessages(p => p.map(m => m.id === msgId ? { ...m, video_url: publicUrl } : m));
      setActiveTab('videos');

    } catch (err) {
       console.error(err);
       setStatus({ ...status, error: 'Video failed: ' + err.message });
    } finally {
       if (ctx) ctx.close();
       setGenState({ id: null, progress: 0, status: '' });
    }
  }, [genState.id]);

  // --- RENDERERS ---
  const renderError = () => (
    status.error && (
      <div className="fixed top-4 left-4 right-4 z-50 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between shadow-lg max-w-lg mx-auto">
        <div className="flex items-center gap-2"><AlertCircle className="w-5 h-5"/><span>{status.error}</span></div>
        <button onClick={() => setStatus({ ...status, error: null })}><X className="w-4 h-4"/></button>
      </div>
    )
  );

  return (
    <>
      {renderError()}
      {view === 'landing' && (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 relative">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-900 to-black opacity-80" />
          <div className="relative z-10 text-center max-w-md w-full">
            <div className="w-24 h-24 mx-auto bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full flex items-center justify-center mb-6 shadow-2xl">
              <Sparkles className="w-12 h-12 text-white animate-pulse" />
            </div>
            <h1 className="text-5xl font-black mb-2">AnonVox</h1>
            <p className="text-gray-400 mb-8">Send anonymous audio.<br/>Receive robotic videos.</p>
            <div className="grid gap-4">
              <button onClick={() => { setView('auth'); setAuthMode('signup'); }} className="w-full py-4 bg-white text-black rounded-xl font-bold hover:scale-105 transition">Get Started</button>
              <button onClick={() => { setView('auth'); setAuthMode('login'); }} className="w-full py-4 bg-gray-800 text-gray-300 rounded-xl font-bold hover:bg-gray-700 transition">Log In</button>
            </div>
          </div>
        </div>
      )}

      {view === 'recorder' && (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white text-center">
              <h2 className="text-sm opacity-80">SENDING TO</h2>
              <h1 className="text-3xl font-black">@{formData.recipient}</h1>
            </div>
            <div className="p-8">
              {!recordingState.blob ? (
                <div className="flex flex-col items-center">
                  <div className="mb-6 w-full">
                    <p className="text-xs font-bold text-gray-400 mb-2 uppercase">Ideas</p>
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                      {MESSAGE_TEMPLATES.map((t, i) => (
                        <button key={i} onClick={() => setRecordingState(p => ({...p, transcript: t}))} className="whitespace-nowrap px-4 py-2 bg-gray-100 rounded-full text-xs hover:bg-purple-100 transition">{t.substring(0, 20)}...</button>
                      ))}
                    </div>
                  </div>
                  <button onClick={recordingState.isRecording ? stopRecording : startRecording} className={`w-24 h-24 rounded-full flex items-center justify-center transition-all ${recordingState.isRecording ? 'bg-red-500 scale-110' : 'bg-black hover:scale-105'}`}>
                    {recordingState.isRecording ? <Square className="w-8 h-8 text-white"/> : <Mic className="w-8 h-8 text-white"/>}
                  </button>
                  <p className="mt-4 font-mono font-bold">{Math.floor(recordingState.time / 60)}:{(recordingState.time % 60).toString().padStart(2, '0')}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-purple-50 p-4 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3"><Check className="text-purple-600"/><span className="font-bold text-sm">Recorded</span></div>
                    <button onClick={() => { const a = new Audio(recordingState.url); a.play(); }}><Play className="text-gray-700"/></button>
                  </div>
                  <button onClick={handleSendMessage} disabled={status.loading} className="w-full py-4 bg-black text-white rounded-xl font-bold flex justify-center">{status.loading ? <Loader2 className="animate-spin"/> : 'Send Now'}</button>
                  <button onClick={() => setRecordingState({ isRecording: false, time: 0, blob: null, url: null, transcript: '' })} className="w-full py-3 text-red-500 font-bold text-sm">Discard</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {view === 'inbox' && user && (
        <div className="min-h-screen bg-gray-50 pb-20">
          <header className="bg-white sticky top-0 z-20 shadow-sm p-4 flex justify-between items-center max-w-3xl mx-auto w-full">
            <h1 className="font-bold text-xl flex items-center gap-2"><Sparkles className="text-purple-600"/> AnonVox</h1>
            <button onClick={logout}><LogOut className="text-gray-400"/></button>
          </header>
          <main className="max-w-3xl mx-auto p-4 space-y-6">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
              <h2 className="text-2xl font-bold">Get Messages</h2>
              <p className="text-indigo-100 mb-4 text-sm">Share your profile link.</p>
              <div className="flex gap-2">
                <button onClick={() => {
                   const url = `${window.location.origin}?send_to=${user.username}&ref=${user.username}`;
                   if(navigator.share) navigator.share({ title: 'AnonVox', url });
                   else { navigator.clipboard.writeText(url); alert('Copied!'); }
                }} className="bg-white text-indigo-900 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2"><Share2 className="w-4 h-4"/> Share</button>
                <button onClick={() => {
                   const url = `${window.location.origin}?send_to=${user.username}&ref=${user.username}`;
                   window.open(`https://wa.me/?text=${encodeURIComponent("Send me an anonymous voice msg! 🤖 " + url)}`, '_blank');
                }} className="bg-green-500 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2"><MessageCircle className="w-4 h-4"/> WhatsApp</button>
              </div>
            </div>
            
            <div className="flex gap-4 border-b border-gray-200">
               <button onClick={() => setActiveTab('inbox')} className={`pb-3 px-2 font-bold text-sm ${activeTab==='inbox'?'border-b-2 border-black':''}`}>Inbox</button>
               <button onClick={() => setActiveTab('videos')} className={`pb-3 px-2 font-bold text-sm ${activeTab==='videos'?'border-b-2 border-black':''}`}>Videos</button>
            </div>

            {messages.map(msg => {
               if(activeTab === 'videos' && !msg.video_url) return null;
               return (
                 <div key={msg.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex gap-3 mb-4 items-center">
                       <div className={`w-10 h-10 rounded-full flex items-center justify-center ${msg.video_url?'bg-pink-100 text-pink-600':'bg-gray-100 text-gray-600'}`}>{msg.video_url?<Film className="w-5 h-5"/>:<Mic className="w-5 h-5"/>}</div>
                       <div><p className="font-bold text-sm">Anonymous</p><p className="text-xs text-gray-400">{new Date(msg.created_at).toLocaleDateString()}</p></div>
                    </div>
                    {msg.video_url ? (
                       <div className="flex flex-col gap-4">
                           <video src={msg.video_url} controls className="w-full rounded-xl bg-black aspect-[9/16] max-h-[400px] object-contain"/>
                           
                           <div className="grid grid-cols-2 gap-2">
                             {/* SHARE BUTTON */}
                             <button 
                               onClick={() => handleNativeShare(msg.video_url, msg.id)} 
                               disabled={sharingId === msg.id}
                               className="col-span-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 shadow-md hover:scale-[1.02] transition"
                             >
                               {sharingId === msg.id ? <Loader2 className="w-4 h-4 animate-spin"/> : <Share2 className="w-4 h-4"/>}
                               {sharingId === msg.id ? 'Preparing...' : 'Share Video'}
                             </button>

                             <button onClick={() => handleDownload(msg.video_url, `anonvox-${msg.id}.mp4`)} className="bg-gray-100 text-gray-800 py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-2 hover:bg-gray-200">
                               <Download className="w-3 h-3"/> Save
                             </button>
                             <button onClick={() => {
                                handleDownload(msg.video_url, `tiktok-anonvox-${msg.id}.mp4`);
                                alert("Video saved! Open TikTok and upload the file.");
                             }} className="bg-black text-white py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-2 hover:bg-gray-800">
                               <Music2 className="w-3 h-3"/> TikTok
                             </button>
                           </div>
                       </div>
                    ) : (
                       <div className="bg-gray-50 p-4 rounded-xl">
                          <p className="text-gray-600 italic text-sm mb-4">"{msg.text || 'Voice Message'}"</p>
                          <div className="flex gap-2 flex-wrap">
                             {Object.values(VOICE_TYPES).map(v => (
                                <button key={v.id} onClick={() => generateVideo(msg.id, msg.audio_url, msg.text, v.id)} disabled={genState.id !== null || referralCount < v.req} className={`px-3 py-2 rounded-lg text-xs font-bold border flex items-center gap-2 ${genState.id===msg.id?'opacity-50':'hover:bg-gray-200'} ${referralCount<v.req?'opacity-50 cursor-not-allowed':''}`}>
                                   {genState.id===msg.id?<Loader2 className="w-3 h-3 animate-spin"/>:(referralCount<v.req?'🔒':<Zap className="w-3 h-3"/>)} {v.name}
                                </button>
                             ))}
                          </div>
                          {genState.id === msg.id && <div className="mt-3 bg-gray-200 h-1.5 rounded-full overflow-hidden"><div className="h-full bg-blue-500 transition-all duration-300" style={{width:`${genState.progress}%`}}/></div>}
                       </div>
                    )}
                 </div>
               );
            })}
          </main>
        </div>
      )}

      {view === 'auth' && (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
          <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl">
            <h2 className="text-2xl font-black mb-6 text-center">{authMode==='login'?'Welcome':'Join'}</h2>
            <input className="w-full p-4 bg-gray-50 rounded-xl mb-4" placeholder="Username" value={formData.username} onChange={e=>setFormData({...formData, username:e.target.value})}/>
            <input className="w-full p-4 bg-gray-50 rounded-xl mb-6" type="password" placeholder="Password" value={formData.password} onChange={e=>setFormData({...formData, password:e.target.value})}/>
            <button onClick={handleAuth} disabled={status.loading} className="w-full py-4 bg-black text-white rounded-xl font-bold mb-4">{status.loading?<Loader2 className="animate-spin mx-auto"/>:(authMode==='login'?'Log In':'Sign Up')}</button>
            <button onClick={()=>setView('landing')} className="w-full text-gray-400 text-sm">Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}
