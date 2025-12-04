import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Mic, Play, Send, Check, Inbox, Share2, LogOut, User, Sparkles, 
  Square, Trash2, Film, Download, Heart, Zap, Ghost, Instagram, 
  AlertCircle, Loader2, X, MessageCircle, Music2, BrainCircuit 
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// ==========================================
// --- CONFIGURATION ---
// ==========================================

const SUPABASE_URL = 'https://ghlnenmfwlpwlqdrbean.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdobG5lbm1md2xwd2xxZHJiZWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MTE0MDQsImV4cCI6MjA3OTk4NzQwNH0.rNILUdI035c4wl4kFkZFP4OcIM_t7bNMqktKm25d5Gg';

// 🔴 PASTE YOUR ASSEMBLY AI KEY INSIDE THE QUOTES BELOW 🔴
const ASSEMBLY_KEY = 'e923129f7dec495081e757c6fe82ea8b'; 

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
  const [transcribing, setTranscribing] = useState(false);
  
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

  // ==========================================
  // --- CORE FUNCTIONALITY ---
  // ==========================================

  // 1. Transcription (AssemblyAI)
  const handleAssemblyTranscribe = async () => {
    if (!ASSEMBLY_KEY || ASSEMBLY_KEY === '') {
      alert("⚠️ ERROR: Missing AssemblyAI API Key.\n\nPlease add your key in the code (line 17) to make this button work.");
      return;
    }
    
    if (!recordingState.blob) {
      alert("No audio recorded yet!");
      return;
    }

    setTranscribing(true);
    // Show user something is happening
    setRecordingState(prev => ({ ...prev, transcript: "⏳ Uploading audio to AI..." }));

    try {
        console.log("Starting AssemblyAI Upload...");

        // A. Upload to AssemblyAI
        const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
            method: 'POST',
            headers: { 
                'Authorization': ASSEMBLY_KEY 
            },
            body: recordingState.blob
        });

        if (!uploadResponse.ok) {
            const err = await uploadResponse.json();
            throw new Error(`Upload failed: ${err.error || uploadResponse.statusText}`);
        }
        
        const uploadData = await uploadResponse.json();
        setRecordingState(prev => ({ ...prev, transcript: "🧠 AI is processing text..." }));
        
        // B. Request Transcription
        const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
            method: 'POST',
            headers: { 
                'Authorization': ASSEMBLY_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                audio_url: uploadData.upload_url,
                language_detection: true // Auto-detect language
            })
        });

        if (!transcriptResponse.ok) throw new Error("AI Processing failed");

        const transcriptData = await transcriptResponse.json();
        const transcriptId = transcriptData.id;

        // C. Poll for Results
        const checkStatus = async () => {
            const pollingResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
                headers: { 'Authorization': ASSEMBLY_KEY }
            });
            const result = await pollingResponse.json();

            if (result.status === 'completed') {
                setRecordingState(prev => ({ ...prev, transcript: result.text || "" }));
                setTranscribing(false);
            } else if (result.status === 'error') {
                setRecordingState(prev => ({ ...prev, transcript: "❌ AI Error: " + result.error }));
                setTranscribing(false);
            } else {
                setTimeout(checkStatus, 1000); // Poll every 1s
            }
        };

        checkStatus();

    } catch (err) {
        console.error(err);
        setTranscribing(false);
        setRecordingState(prev => ({ ...prev, transcript: "❌ Transcription Failed. Please type manually." }));
        alert(`Transcription Error: ${err.message}`);
    }
  };

  // 2. Native Share (Files Only)
  const handleNativeShare = async (videoUrl, msgId) => {
    if (!navigator.share || !navigator.canShare) {
      alert("Sharing not supported. Downloading instead...");
      handleDownload(videoUrl, `anonvox-${msgId}.mp4`);
      return;
    }

    setSharingId(msgId);
    try {
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      
      const isMp4 = blob.type.includes('mp4');
      const ext = isMp4 ? 'mp4' : 'webm'; 
      const mimeType = isMp4 ? 'video/mp4' : 'video/webm';
      
      const file = new File([blob], `anonvox-${msgId}.${ext}`, { type: mimeType });
      const shareData = { files: [file] };

      if (navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else {
        throw new Error("Device refused file share.");
      }
    } catch (error) {
      if (error.name !== 'AbortError' && error.name !== 'NotAllowedError') {
        alert("Could not share file directly. Downloading instead...");
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
      
      // Native Speech Recognition (Try this first)
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        const r = new SR(); 
        r.continuous = true; 
        r.interimResults = true;
        r.lang = 'en-US'; // Explicitly set language
        
        r.onresult = e => {
            const text = Array.from(e.results).map(res => res[0].transcript).join('');
            setRecordingState(p => ({ ...p, transcript: text }));
        };
        r.onerror = e => console.log("Native Speech Error:", e.error);
        
        r.start(); 
        recognitionRef.current = r;
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

  // 3. Video Generation
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

      // Audio Graph
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

      // Canvas Setup
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
      
      // Determine Output Format (MP4 preferred for sharing)
      const mimeTypes = ['video/mp4', 'video/webm;codecs=h264', 'video/webm;codecs=vp8,opus'];
      const selectedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';

      const mediaRecorder = new MediaRecorder(mixedStream, { 
        mimeType: selectedMime,
        videoBitsPerSecond: 3000000 
      });
      
      const chunks = [];
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const duration = audioBuffer.duration / voiceConfig.speed;
      
      // Record Loop
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
           
           // Background Gradient
           const grad = canvasCtx.createLinearGradient(0,0,0,height);
           grad.addColorStop(0, '#0f172a');
           grad.addColorStop(1, voiceConfig.color);
           canvasCtx.fillStyle = grad;
           canvasCtx.fillRect(0,0,width,height);

           // Avatar Animation
           const t = Date.now()/1000;
           canvasCtx.save();
           canvasCtx.translate(width/2, height/2);
           canvasCtx.translate(0, Math.sin(t*3)*15);

           canvasCtx.fillStyle = '#e2e8f0';
           canvasCtx.beginPath(); canvasCtx.roundRect(-200,-200,400,400,40); canvasCtx.fill();

           // Eyes
           canvasCtx.fillStyle = voiceConfig.color;
           canvasCtx.shadowBlur=20; canvasCtx.shadowColor=voiceConfig.color;
           const blink = Math.sin(t*2)>0.95?5:60;
           canvasCtx.fillRect(-120,-50,80,blink);
           canvasCtx.fillRect(40,-50,80,blink);
           canvasCtx.shadowBlur=0;

           // Mouth (Reacts to Audio)
           const mouth = Math.max(10, avg*3);
           canvasCtx.fillStyle = '#1e293b';
           canvasCtx.fillRect(-100,100,200,mouth);
           canvasCtx.restore();

           // Branding
           canvasCtx.font='bold 60px sans-serif';
           canvasCtx.fillStyle='rgba(255,255,255,0.8)';
           canvasCtx.textAlign='center';
           canvasCtx.fillText('ANON VOX', width/2, 200);

           // Subtitles
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

      // Final Upload
      setGenState({ id: msgId, progress: 100, status: 'Uploading...' });
      
      const videoBlob = new Blob(chunks, { type: selectedMime });
      const ext = selectedMime.includes('mp4') ? 'mp4' : 'webm';
      const fileName = `video-${msgId}-${Date.now()}.${ext}`;
      
      const { error: upErr } = await supabase.storage.from('voices').upload(fileName, videoBlob);
      if (upErr) throw upErr;
      
      const { data: { publicUrl } } = supabase.storage.from('voices').getPublicUrl(fileName);
      
      const { data: updatedData, error: dbErr } = await supabase
        .from('messages')
        .update({ video_url: publicUrl })
        .eq('id', msgId)
        .select();
      
      if (dbErr || !updatedData || updatedData.length === 0) {
        console.error("DB Update Failed", dbErr);
        alert("Video generated, but failed to save. Check permissions.");
      }
      
      setMessages(p => p.map(m => m.id === msgId ? { ...m, video_url: publicUrl } : m));
      setActiveTab('videos');

    } catch (err) {
       console.error(err);
       setStatus({ ...status, error: 'Video generation failed: ' + err.message });
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
                  
                  {/* --- TRANSCRIPTION SECTION --- */}
                  <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 uppercase">Message Text</label>
                      <textarea 
                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm min-h-[80px]"
                        value={recordingState.transcript}
                        onChange={(e) => setRecordingState(p => ({...p, transcript: e.target.value}))}
                        placeholder={transcribing ? "AI is working..." : "Box empty? Native Speech not supported. Click 'Fix text with AI' below."}
                      />
                      <button 
                        onClick={handleAssemblyTranscribe}
                        disabled={transcribing}
                        className="text-xs font-bold text-purple-600 flex items-center gap-1 hover:underline"
                      >
                         {transcribing ? <Loader2 className="w-3 h-3 animate-spin"/> : <BrainCircuit className="w-3 h-3"/>}
                         {transcribing ? 'AI is processing...' : 'Fix text with AI (AssemblyAI)'}
                      </button>
                  </div>

                  <button onClick={handleSendMessage} disabled={status.loading || transcribing} className="w-full py-4 bg-black text-white rounded-xl font-bold flex justify-center">{status.loading ? <Loader2 className="animate-spin"/> : 'Send Now'}</button>
                  <button onClick={() => setRecordingState({ isRecording: false, time: 0, blob: null, url: null, transcript: '' })} className="w-full py-3 text-red-500 font-bold text-sm">Discard</button>
                </div>
              )}
            </div>
          </div>
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
