import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Mic, Play, Send, Check, Inbox, Share2, LogOut, User, Sparkles, 
  Square, Trash2, Film, Download, Heart, Zap, Ghost, Instagram, 
  AlertCircle, Loader2, X, MessageCircle 
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// --- CONFIGURATION & CONSTANTS ---
const SUPABASE_URL = 'https://ghlnenmfwlpwlqdrbean.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdobG5lbm1md2xwd2xxZHJiZWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MTE0MDQsImV4cCI6MjA3OTk4NzQwNH0.rNILUdI035c4wl4kFkZFP4OcIM_t7bNMqktKm25d5Gg';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const MAX_RECORDING_TIME = 120; // 2 minutes
const REFRESH_INTERVAL = 10000; // 10 seconds

const AUDIO_CONSTRAINTS = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
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
  // --- STATE MANAGEMENT ---
  const [user, setUser] = useState(null);
  const [view, setView] = useState('landing'); // landing, auth, recorder, inbox
  const [authMode, setAuthMode] = useState('login'); // login, signup
  const [activeTab, setActiveTab] = useState('inbox');
  
  // Form State
  const [formData, setFormData] = useState({ username: '', password: '', recipient: '' });
  
  // Recording State
  const [recordingState, setRecordingState] = useState({
    isRecording: false,
    time: 0,
    blob: null,
    url: null,
    transcript: '',
    error: null
  });

  // App Status
  const [status, setStatus] = useState({ loading: false, error: null, success: null });
  const [messages, setMessages] = useState([]);
  const [referralCount, setReferralCount] = useState(0);
  
  // Video Generation State
  const [genState, setGenState] = useState({ id: null, progress: 0, status: '' });
  
  // --- REFS ---
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioContextRef = useRef(null);
  
  // --- INITIALIZATION & CLEANUP ---
  useEffect(() => {
    // Auth Check
    const savedUser = safeJSONParse(localStorage.getItem('anon-voice-user'));
    const savedRefs = parseInt(localStorage.getItem('anon-refs') || '0');
    
    // URL Params
    const params = new URLSearchParams(window.location.search);
    const sendTo = params.get('send_to');
    const refBy = params.get('ref');

    if (refBy && refBy !== savedUser?.username) {
      localStorage.setItem('referred_by', refBy);
    }
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

  // Auto-refresh messages
  useEffect(() => {
    if (!user || view !== 'inbox') return;
    const interval = setInterval(() => {
      if (!genState.id) fetchMessages(user.username);
    }, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [user, view, genState.id]);

  // Max recording time watcher
  useEffect(() => {
    if (recordingState.isRecording && recordingState.time >= MAX_RECORDING_TIME) {
      stopRecording();
      setStatus({ ...status, error: 'Max recording time reached' });
    }
  }, [recordingState.time, recordingState.isRecording]);

  // --- HELPER FUNCTIONS ---
  const safeJSONParse = (str) => {
    try { return JSON.parse(str); } catch { return null; }
  };

  const cleanupRecordingResources = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (timerRef.current) clearInterval(timerRef.current);
    if (recognitionRef.current) recognitionRef.current.stop();
    if (audioContextRef.current) audioContextRef.current.close();
  };

  // --- API INTERACTIONS ---
  const fetchMessages = useCallback(async (username) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('username', username)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      setMessages(prev => {
        // Smart merge to prevent flickering of videos being generated locally
        if (JSON.stringify(prev) === JSON.stringify(data)) return prev;
        return data;
      });
    } catch (err) {
      console.error('Fetch error:', err);
    }
  }, []);

  // --- AUTHENTICATION ---
  const handleAuth = async () => {
    const { username, password } = formData;
    
    // Validation
    if (!username.match(/^[a-zA-Z0-9_-]{3,20}$/)) {
      setStatus({ ...status, error: 'Username must be 3-20 alphanumeric characters' });
      return;
    }
    if (password.length < 6) {
      setStatus({ ...status, error: 'Password too short (min 6 chars)' });
      return;
    }

    setStatus({ loading: true, error: null, success: null });

    try {
      if (authMode === 'signup') {
        const { data: existing } = await supabase.from('users').select('username').eq('username', username).maybeSingle();
        if (existing) throw new Error('Username already taken');
        
        const { error: signError } = await supabase.from('users').insert({ username, password });
        if (signError) throw signError;
      } else {
        const { data: user } = await supabase.from('users').select('username').eq('username', username).eq('password', password).maybeSingle();
        if (!user) throw new Error('Invalid credentials');
      }

      const userData = { username };
      setUser(userData);
      localStorage.setItem('anon-voice-user', JSON.stringify(userData));
      setView('inbox');
      setFormData({ username: '', password: '', recipient: '' });
      fetchMessages(username);
    } catch (err) {
      setStatus({ ...status, error: err.message });
    } finally {
      setStatus(prev => ({ ...prev, loading: false }));
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('anon-voice-user');
    setView('landing');
    setMessages([]);
  };

  // --- RECORDING LOGIC ---
  const startRecording = async () => {
    setStatus({ ...status, error: null });
    try {
      // Feature detection
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Audio recording not supported on this device');
      }

      const stream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
      streamRef.current = stream;

      // Determine supported mime type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setRecordingState(prev => ({ ...prev, isRecording: false, blob, url }));
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start(100); // Collect 100ms chunks
      
      // Reset State
      setRecordingState({
        isRecording: true,
        time: 0,
        blob: null,
        url: null,
        transcript: '',
        error: null
      });

      // Start Timer
      timerRef.current = setInterval(() => {
        setRecordingState(prev => ({ ...prev, time: prev.time + 1 }));
      }, 1000);

      // Setup Speech Recognition (Optional enhancement)
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (e) => {
          const text = Array.from(e.results).map(r => r[0].transcript).join('');
          setRecordingState(prev => ({ ...prev, transcript: text }));
        };
        recognition.start();
        recognitionRef.current = recognition;
      }

    } catch (err) {
      console.error(err);
      setStatus({ ...status, error: `Microphone access denied: ${err.message}` });
    }
  };

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      if (timerRef.current) clearInterval(timerRef.current);
      if (recognitionRef.current) recognitionRef.current.stop();
    }
  }, []);

  const handleSendMessage = async () => {
    if (!recordingState.blob) return;
    setStatus({ loading: true, error: null, success: null });

    try {
      const fileName = `voice-${Date.now()}.${recordingState.blob.type.includes('mp4') ? 'mp4' : 'webm'}`;
      
      const { error: uploadError } = await supabase.storage
        .from('voices')
        .upload(fileName, recordingState.blob);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('voices').getPublicUrl(fileName);

      const { error: dbError } = await supabase.from('messages').insert({
        username: formData.recipient,
        text: recordingState.transcript || '[Voice Message]',
        audio_url: publicUrl
      });

      if (dbError) throw dbError;

      alert('Message sent successfully! 🚀');
      window.location.href = window.location.origin; // Reset app

    } catch (err) {
      setStatus({ ...status, error: `Send failed: ${err.message}`, loading: false });
    }
  };

  // --- VIDEO GENERATION (Optimized) ---
  const generateVideo = useCallback(async (msgId, audioUrl, text, voiceType) => {
    if (genState.id) return; // Prevent concurrent generations
    setGenState({ id: msgId, progress: 0, status: 'Initializing...' });

    try {
      // 1. Setup Audio Context & Source
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = ctx;
      
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      
      // 2. Prepare Canvas
      const width = 1080;
      const height = 1920; // 9:16 Aspect Ratio
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const canvasCtx = canvas.getContext('2d', { alpha: false }); // Optimization
      
      // 3. Render Frames
      const fps = 30;
      const duration = audioBuffer.duration;
      const totalFrames = Math.ceil(duration * fps);
      const frames = [];

      const voiceConfig = VOICE_TYPES[voiceType.toUpperCase()] || VOICE_TYPES.ROBOT;

      for (let i = 0; i < totalFrames; i++) {
        // Yield to event loop occasionally to prevent UI freeze
        if (i % 15 === 0) {
          setGenState({ id: msgId, progress: Math.round((i / totalFrames) * 100), status: 'Rendering...' });
          await new Promise(r => setTimeout(r, 0));
        }

        const time = i / fps;
        
        // --- DRAWING LOGIC ---
        // Gradient Background
        const grad = canvasCtx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, '#0f172a');
        grad.addColorStop(1, voiceConfig.color);
        canvasCtx.fillStyle = grad;
        canvasCtx.fillRect(0, 0, width, height);

        // Avatar Bobbing
        canvasCtx.save();
        canvasCtx.translate(width / 2, height / 2);
        const bob = Math.sin(time * 3) * 15;
        canvasCtx.translate(0, bob);

        // Head
        canvasCtx.fillStyle = '#e2e8f0';
        canvasCtx.beginPath();
        canvasCtx.roundRect(-200, -200, 400, 400, 40);
        canvasCtx.fill();

        // Eyes (Blinking)
        const isBlinking = (i % 90) < 5; // Blink every 3 seconds roughly
        const eyeHeight = isBlinking ? 10 : 60;
        
        canvasCtx.fillStyle = voiceConfig.color;
        canvasCtx.shadowBlur = 20;
        canvasCtx.shadowColor = voiceConfig.color;
        
        canvasCtx.fillRect(-120, -50, 80, eyeHeight); // Left Eye
        canvasCtx.fillRect(40, -50, 80, eyeHeight);  // Right Eye
        canvasCtx.shadowBlur = 0;

        // Mouth (Simulated Sync)
        // A simple sine wave modulation for prototype; in prod use AnalyserNode on offline context
        const talkingIntensity = Math.abs(Math.sin(time * 15) * Math.sin(time * 7));
        const mouthHeight = 10 + (talkingIntensity * 100);
        
        canvasCtx.fillStyle = '#1e293b';
        canvasCtx.fillRect(-100, 100, 200, mouthHeight);

        canvasCtx.restore();

        // Text Overlay
        canvasCtx.font = 'bold 60px sans-serif';
        canvasCtx.fillStyle = 'rgba(255,255,255,0.8)';
        canvasCtx.textAlign = 'center';
        canvasCtx.fillText('ANON VOX', width / 2, 200);

        if (text) {
          const words = text.split(' ');
          const wordIndex = Math.min(words.length - 1, Math.floor((time / duration) * words.length));
          const subtitle = words.slice(Math.max(0, wordIndex - 2), wordIndex + 3).join(' ');
          
          canvasCtx.font = '50px sans-serif';
          canvasCtx.fillStyle = '#fff';
          canvasCtx.fillText(subtitle, width / 2, height - 300);
        }

        // Store frame blob
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.7));
        frames.push(blob);
      }

      // 4. Encode Video & Mix Audio
      setGenState({ id: msgId, progress: 100, status: 'Encoding...' });
      
      const canvasStream = canvas.captureStream(fps);
      const dest = ctx.createMediaStreamDestination();
      
      // Process Audio (Effect Chain)
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.detune.value = voiceConfig.detune;
      source.playbackRate.value = voiceConfig.speed;
      
      const gainNode = ctx.createGain();
      gainNode.gain.value = 2.0; // Boost volume

      source.connect(gainNode);
      gainNode.connect(dest);
      
      const mixedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...dest.stream.getAudioTracks()
      ]);

      const mediaRecorder = new MediaRecorder(mixedStream, { 
        mimeType: 'video/webm;codecs=vp8,opus',
        videoBitsPerSecond: 2500000 
      });

      const chunks = [];
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      
      const videoBlob = await new Promise((resolve, reject) => {
        mediaRecorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
        mediaRecorder.onerror = reject;
        
        mediaRecorder.start();
        source.start(0);
        
        // Frame Draw Loop
        let frameIdx = 0;
        const drawFrame = async () => {
          if (frameIdx >= frames.length) {
            mediaRecorder.stop();
            return;
          }
          const img = await createImageBitmap(frames[frameIdx]);
          canvasCtx.drawImage(img, 0, 0);
          img.close(); // Prevent memory leak
          frameIdx++;
          setTimeout(drawFrame, 1000/fps);
        };
        drawFrame();
      });

      // 5. Upload
      setGenState({ id: msgId, progress: 100, status: 'Uploading...' });
      const fileName = `video-${msgId}-${Date.now()}.webm`;
      await supabase.storage.from('voices').upload(fileName, videoBlob);
      const { data: { publicUrl } } = supabase.storage.from('voices').getPublicUrl(fileName);
      await supabase.from('messages').update({ video_url: publicUrl }).eq('id', msgId);

      // Update Local State
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, video_url: publicUrl } : m));
      ctx.close();

    } catch (err) {
      console.error(err);
      setStatus({ ...status, error: 'Video generation failed: ' + err.message });
    } finally {
      setGenState({ id: null, progress: 0, status: '' });
    }
  }, [genState.id]);

  // --- COMPONENT RENDERERS ---

  const renderError = () => (
    status.error && (
      <div className="fixed top-4 left-4 right-4 z-50 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between shadow-lg max-w-lg mx-auto">
        <div className="flex items-center gap-2"><AlertCircle className="w-5 h-5"/><span>{status.error}</span></div>
        <button onClick={() => setStatus({ ...status, error: null })}><X className="w-4 h-4"/></button>
      </div>
    )
  );

  const renderLanding = () => (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900 via-gray-900 to-black opacity-80" />
      <div className="relative z-10 text-center max-w-md w-full animate-fade-in-up">
        <div className="w-24 h-24 mx-auto bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full flex items-center justify-center mb-6 shadow-[0_0_50px_rgba(124,58,237,0.5)]">
          <Sparkles className="w-12 h-12 text-white animate-pulse" />
        </div>
        <h1 className="text-5xl font-black mb-2 tracking-tight">AnonVox</h1>
        <p className="text-gray-400 mb-8 text-lg">Send anonymous audio. <br/>Receive robotic videos.</p>
        
        <div className="grid grid-cols-1 gap-4">
          <button onClick={() => { setView('auth'); setAuthMode('signup'); }} className="w-full py-4 bg-white text-black rounded-xl font-bold text-lg hover:scale-105 transition">
            Get Started
          </button>
          <button onClick={() => { setView('auth'); setAuthMode('login'); }} className="w-full py-4 bg-gray-800 text-gray-300 rounded-xl font-bold border border-gray-700 hover:bg-gray-700 transition">
            Log In
          </button>
        </div>
      </div>
    </div>
  );

  const renderRecorder = () => (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white text-center">
          <h2 className="text-sm uppercase tracking-widest opacity-80">Sending to</h2>
          <h1 className="text-3xl font-black mt-1">@{formData.recipient}</h1>
        </div>

        <div className="p-8">
          {!recordingState.blob ? (
            <div className="flex flex-col items-center">
              <div className="mb-6 w-full">
                <p className="text-xs font-bold text-gray-400 mb-2 uppercase">Ideas</p>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                  {MESSAGE_TEMPLATES.map((t, i) => (
                    <button key={i} onClick={() => setRecordingState(p => ({...p, transcript: t}))} className="whitespace-nowrap px-4 py-2 bg-gray-100 rounded-full text-xs text-gray-600 hover:bg-purple-100 border border-gray-200 transition">
                      {t.substring(0, 20)}...
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative">
                <button 
                  onClick={recordingState.isRecording ? stopRecording : startRecording}
                  className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl ${
                    recordingState.isRecording ? 'bg-red-500 scale-110' : 'bg-black hover:scale-105'
                  }`}
                >
                  {recordingState.isRecording ? <Square className="w-8 h-8 text-white"/> : <Mic className="w-8 h-8 text-white"/>}
                </button>
                {recordingState.isRecording && (
                  <div className="absolute -inset-4 border-4 border-red-500 rounded-full opacity-20 animate-ping"></div>
                )}
              </div>
              
              <div className="mt-6 text-center">
                <p className={`text-2xl font-mono font-bold ${recordingState.isRecording ? 'text-red-500' : 'text-gray-300'}`}>
                  {Math.floor(recordingState.time / 60)}:{(recordingState.time % 60).toString().padStart(2, '0')}
                </p>
                <p className="text-xs text-gray-400 mt-1">Max 2:00</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 animate-fade-in">
              <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-600">
                    <Check className="w-5 h-5"/>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-800">Recorded</p>
                    <p className="text-xs text-gray-500">{Math.floor(recordingState.time / 60)}:{(recordingState.time % 60).toString().padStart(2, '0')} duration</p>
                  </div>
                </div>
                <button onClick={() => { const a = new Audio(recordingState.url); a.play(); }} className="p-2 bg-white rounded-full shadow-sm hover:bg-gray-50">
                  <Play className="w-4 h-4 text-gray-700"/>
                </button>
              </div>

              <button 
                onClick={handleSendMessage} 
                disabled={status.loading}
                className="w-full py-4 bg-black text-white rounded-xl font-bold text-lg flex items-center justify-center gap-2 hover:bg-gray-800 transition disabled:opacity-50"
              >
                {status.loading ? <Loader2 className="w-5 h-5 animate-spin"/> : <><Send className="w-5 h-5"/> Send Now</>}
              </button>
              
              <button 
                onClick={() => setRecordingState({ isRecording: false, time: 0, blob: null, url: null, transcript: '' })}
                className="w-full py-3 text-red-500 font-bold text-sm hover:bg-red-50 rounded-xl transition"
              >
                Discard & Retry
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderInbox = () => (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="bg-white sticky top-0 z-20 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center"><Sparkles className="w-4 h-4 text-white"/></div>
            <h1 className="font-bold text-xl tracking-tight">AnonVox</h1>
          </div>
          <button onClick={logout} className="p-2 hover:bg-gray-100 rounded-full"><LogOut className="w-5 h-5 text-gray-500"/></button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-6">
        {/* Referral/Share Card */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-2xl font-bold">Get Messages</h2>
            <p className="text-indigo-100 mb-4 text-sm">Share your profile link to receive anonymous voice notes.</p>
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={() => {
                  const url = `${window.location.origin}?send_to=${user.username}&ref=${user.username}`;
                  if (navigator.share) navigator.share({ title: 'AnonVox', url });
                  else navigator.clipboard.writeText(url).then(() => alert('Link Copied!'));
                }}
                className="bg-white text-indigo-900 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-gray-100 transition"
              >
                <Share2 className="w-4 h-4"/> Share
              </button>

              {/* WHATSAPP BUTTON */}
              <button 
                onClick={() => {
                  const url = `${window.location.origin}?send_to=${user.username}&ref=${user.username}`;
                  const text = "Send me an anonymous voice message! 🤖";
                  window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`, '_blank');
                }}
                className="bg-green-500 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-green-600 transition"
              >
                <MessageCircle className="w-4 h-4"/> WhatsApp
              </button>
            </div>
          </div>
          <Ghost className="absolute -right-6 -bottom-6 w-32 h-32 text-white opacity-10 rotate-12"/>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-4 border-b border-gray-200">
          <button onClick={() => setActiveTab('inbox')} className={`pb-3 px-2 font-bold text-sm ${activeTab === 'inbox' ? 'text-black border-b-2 border-black' : 'text-gray-400'}`}>Inbox</button>
          <button onClick={() => setActiveTab('videos')} className={`pb-3 px-2 font-bold text-sm ${activeTab === 'videos' ? 'text-black border-b-2 border-black' : 'text-gray-400'}`}>My Videos</button>
        </div>

        {/* Message List */}
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-16">
              <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-3"/>
              <p className="text-gray-500">No messages yet.</p>
            </div>
          )}

          {messages.map(msg => {
            if (activeTab === 'videos' && !msg.video_url) return null;
            return (
              <div key={msg.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 transition hover:shadow-md">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${msg.video_url ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'}`}>
                    {msg.video_url ? <Film className="w-5 h-5"/> : <Mic className="w-5 h-5"/>}
                  </div>
                  <div>
                    <p className="font-bold text-sm">Anonymous</p>
                    <p className="text-xs text-gray-400">{new Date(msg.created_at).toLocaleDateString()}</p>
                  </div>
                </div>

                {msg.video_url ? (
                  <div className="relative rounded-xl overflow-hidden bg-black aspect-[9/16] max-h-[400px]">
                    <video src={msg.video_url} controls className="w-full h-full object-contain" />
                  </div>
                ) : (
                  <div className="bg-gray-50 p-4 rounded-xl">
                    <p className="text-gray-600 italic text-sm mb-4">"{msg.text || 'Audio Message'}"</p>
                    <div className="flex flex-wrap gap-2">
                       {/* Voice Selection Buttons */}
                       {Object.values(VOICE_TYPES).map(v => (
                         <button 
                           key={v.id}
                           onClick={() => generateVideo(msg.id, msg.audio_url, msg.text, v.id)}
                           disabled={genState.id !== null || referralCount < v.req}
                           className={`px-3 py-2 rounded-lg text-xs font-bold border flex items-center gap-2 ${
                             genState.id === msg.id ? 'opacity-50' : 'hover:bg-gray-200'
                           } ${referralCount < v.req ? 'opacity-50 cursor-not-allowed bg-gray-100' : 'bg-white'}`}
                         >
                           {genState.id === msg.id ? <Loader2 className="w-3 h-3 animate-spin"/> : (referralCount < v.req ? '🔒' : <Zap className="w-3 h-3"/>)}
                           {v.name}
                         </button>
                       ))}
                    </div>
                    {genState.id === msg.id && (
                       <div className="mt-3 w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 transition-all duration-300" style={{width: `${genState.progress}%`}}/>
                       </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );

  // --- MAIN RENDER ---
  return (
    <>
      {renderError()}
      {view === 'landing' && renderLanding()}
      {view === 'recorder' && renderRecorder()}
      {view === 'inbox' && user && renderInbox()}
      {view === 'auth' && (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
          <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl">
            <h2 className="text-2xl font-black mb-6 text-center">{authMode === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
            <input 
              className="w-full p-4 bg-gray-50 rounded-xl mb-4 border focus:border-black outline-none transition" 
              placeholder="Username" 
              value={formData.username} 
              onChange={e => setFormData({ ...formData, username: e.target.value })}
            />
            <input 
              className="w-full p-4 bg-gray-50 rounded-xl mb-6 border focus:border-black outline-none transition" 
              type="password" 
              placeholder="Password" 
              value={formData.password} 
              onChange={e => setFormData({ ...formData, password: e.target.value })}
            />
            <button 
              onClick={handleAuth} 
              disabled={status.loading}
              className="w-full py-4 bg-black text-white rounded-xl font-bold mb-4 flex justify-center"
            >
              {status.loading ? <Loader2 className="animate-spin"/> : (authMode === 'login' ? 'Log In' : 'Sign Up')}
            </button>
            <button onClick={() => setView('landing')} className="w-full text-gray-400 text-sm">Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}
