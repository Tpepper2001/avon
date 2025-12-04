import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Mic, Play, Send, Check, Inbox, Share2, LogOut, User, Sparkles, 
  Square, Trash2, Film, Download, Heart, Zap, Ghost, Instagram, 
  AlertCircle, Loader2, X, MessageCircle, Music2, BrainCircuit, Cpu 
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
  
  // Recording State
  const [recordingState, setRecordingState] = useState({ 
    isRecording: false, 
    time: 0, 
    blob: null, 
    url: null
  });

  // Pipeline State (The Progress Bar Logic)
  const [pipeline, setPipeline] = useState({
    active: false,
    step: '', // 'transcribing', 'robotic', 'video', 'sending', 'sent'
    progress: 0,
    error: null
  });

  const [messages, setMessages] = useState([]);
  const [sharingId, setSharingId] = useState(null);
  
  // --- REFS ---
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);

  // --- INIT ---
  useEffect(() => {
    const savedUser = safeJSONParse(localStorage.getItem('anon-voice-user'));
    if (savedUser) {
      setUser(savedUser);
      setView('inbox');
      fetchMessages(savedUser.username);
    }
    
    const params = new URLSearchParams(window.location.search);
    const sendTo = params.get('send_to');
    if (sendTo) {
      setFormData(prev => ({ ...prev, recipient: sendTo }));
      setView('recorder');
    }
    
    return () => cleanupRecordingResources();
  }, []);

  useEffect(() => {
    if (!user || view !== 'inbox') return;
    const interval = setInterval(() => { fetchMessages(user.username); }, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [user, view]);

  useEffect(() => {
    if (recordingState.isRecording && recordingState.time >= MAX_RECORDING_TIME) {
      stopRecording();
    }
  }, [recordingState.time, recordingState.isRecording]);

  // --- HELPERS ---
  const safeJSONParse = (str) => { try { return JSON.parse(str); } catch { return null; } };
  
  const cleanupRecordingResources = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    if (timerRef.current) clearInterval(timerRef.current);
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
      alert("Download failed.");
    }
  };

  // ==========================================
  // --- THE MASTER PIPELINE ---
  // ==========================================

  const startPipeline = async () => {
    if (!recordingState.blob) return;
    if (!ASSEMBLY_KEY) { alert("Missing AssemblyAI API Key"); return; }

    setPipeline({ active: true, step: 'transcribing', progress: 10, error: null });

    try {
      // 1. TRANSCRIBING...
      const text = await performTranscription(recordingState.blob);
      setPipeline({ active: true, step: 'robotic', progress: 40, error: null });
      
      // 2. TURNING TO ROBOTIC VOICE... (Simulated delay for effect, actual processing happens in video step)
      await new Promise(r => setTimeout(r, 1500)); 
      setPipeline({ active: true, step: 'video', progress: 60, error: null });

      // 3. TURNING TO VIDEO...
      const videoBlob = await generateVideoBlob(recordingState.blob, text);
      setPipeline({ active: true, step: 'sending', progress: 80, error: null });

      // 4. VIDEO SENT
      const publicUrl = await uploadVideo(videoBlob);
      await saveMessageToDB(publicUrl, text);

      setPipeline({ active: true, step: 'sent', progress: 100, error: null });
      
      // Reset after success
      setTimeout(() => {
        alert("Video Sent! 🚀");
        window.location.href = window.location.origin;
      }, 1000);

    } catch (err) {
      console.error(err);
      setPipeline({ active: false, step: '', progress: 0, error: err.message });
    }
  };

  // --- PIPELINE STEP 1: TRANSCRIPTION ---
  const performTranscription = async (blob) => {
    // Upload
    const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
      method: 'POST',
      headers: { 'Authorization': ASSEMBLY_KEY },
      body: blob
    });
    if (!uploadRes.ok) throw new Error("Upload to AI failed");
    const uploadData = await uploadRes.json();

    // Start Job
    const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: { 'Authorization': ASSEMBLY_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio_url: uploadData.upload_url, language_detection: true })
    });
    const transcriptData = await transcriptRes.json();
    const id = transcriptData.id;

    // Poll
    while (true) {
      const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
        headers: { 'Authorization': ASSEMBLY_KEY }
      });
      const result = await pollRes.json();
      if (result.status === 'completed') return result.text;
      if (result.status === 'error') throw new Error(result.error);
      await new Promise(r => setTimeout(r, 1000));
    }
  };

  // --- PIPELINE STEP 3: VIDEO GENERATION ---
  const generateVideoBlob = async (audioBlob, text) => {
    return new Promise(async (resolve, reject) => {
      let ctx = new (window.AudioContext || window.webkitAudioContext)();
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBufferData = await ctx.decodeAudioData(arrayBuffer);

      // Setup Nodes (Robotic Effect)
      const source = ctx.createBufferSource();
      source.buffer = audioBufferData;
      const dest = ctx.createMediaStreamDestination();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;

      // Robot Settings
      source.detune.value = -800; // Low pitch
      
      const gainNode = ctx.createGain();
      gainNode.gain.value = 2.0;

      source.connect(gainNode);
      gainNode.connect(analyser);
      gainNode.connect(dest);

      // Canvas
      const width = 720; // 720p is faster for mobile generation
      const height = 1280;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const canvasCtx = canvas.getContext('2d', { alpha: false });

      const stream = canvas.captureStream(30);
      const combinedStream = new MediaStream([...stream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
      
      const mime = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm';
      const recorder = new MediaRecorder(combinedStream, { mimeType: mime, videoBitsPerSecond: 2500000 });
      const chunks = [];

      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
         const blob = new Blob(chunks, { type: mime });
         ctx.close();
         resolve(blob);
      };

      recorder.start();
      source.start(0);

      // Animation Loop
      const duration = audioBufferData.duration;
      const startTime = ctx.currentTime;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const draw = () => {
        if (ctx.state === 'closed') return;
        const elapsed = ctx.currentTime - startTime;
        if (elapsed >= duration + 0.5) {
          recorder.stop();
          return;
        }

        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a,b)=>a+b) / dataArray.length;

        // Draw visuals
        const grad = canvasCtx.createLinearGradient(0,0,0,height);
        grad.addColorStop(0, '#0f172a');
        grad.addColorStop(1, '#667eea'); // Robot Color
        canvasCtx.fillStyle = grad;
        canvasCtx.fillRect(0,0,width,height);

        const t = Date.now()/1000;
        canvasCtx.save();
        canvasCtx.translate(width/2, height/2);
        canvasCtx.translate(0, Math.sin(t*3)*15);

        // Robot Face
        canvasCtx.fillStyle = '#e2e8f0';
        canvasCtx.beginPath(); canvasCtx.roundRect(-150,-150,300,300,30); canvasCtx.fill();

        // Eyes
        canvasCtx.fillStyle = '#667eea';
        canvasCtx.shadowBlur=20; canvasCtx.shadowColor='#667eea';
        canvasCtx.fillRect(-90,-40,60,40);
        canvasCtx.fillRect(30,-40,60,40);
        canvasCtx.shadowBlur=0;

        // Mouth
        const mouthHeight = Math.max(5, avg * 2);
        canvasCtx.fillStyle = '#1e293b';
        canvasCtx.fillRect(-75, 80, 150, mouthHeight);
        canvasCtx.restore();

        // Branding
        canvasCtx.font='bold 40px sans-serif';
        canvasCtx.fillStyle='rgba(255,255,255,0.8)';
        canvasCtx.textAlign='center';
        canvasCtx.fillText('ANON VOX', width/2, 150);

        // Subtitles (Transcript)
        if (text) {
           canvasCtx.font='30px sans-serif';
           canvasCtx.fillStyle='#fff';
           const words = text.split(' ');
           const p = elapsed / duration;
           const idx = Math.floor(p * words.length);
           const segment = words.slice(Math.max(0, idx-2), idx+3).join(' ');
           canvasCtx.fillText(segment, width/2, height - 200);
        }

        requestAnimationFrame(draw);
      };
      draw();
    });
  };

  // --- PIPELINE STEP 4 & 5: UPLOAD & SAVE ---
  const uploadVideo = async (blob) => {
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const fileName = `final-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('voices').upload(fileName, blob);
    if (error) throw error;
    const { data } = supabase.storage.from('voices').getPublicUrl(fileName);
    return data.publicUrl;
  };

  const saveMessageToDB = async (url, text) => {
    const { error } = await supabase.from('messages').insert({
      username: formData.recipient,
      text: text || '[Voice Message]',
      video_url: url // We send the video URL directly now
    });
    if (error) throw error;
  };


  // --- NATIVE SHARE (Viewer Side) ---
  const handleNativeShare = async (videoUrl, msgId) => {
    if (!navigator.share) {
      alert("Sharing not supported. Downloading...");
      handleDownload(videoUrl, `anonvox-${msgId}.mp4`);
      return;
    }
    setSharingId(msgId);
    try {
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      const mime = blob.type.includes('mp4') ? 'video/mp4' : 'video/webm';
      const file = new File([blob], `msg-${msgId}.${mime.includes('mp4')?'mp4':'webm'}`, { type: mime });
      await navigator.share({ files: [file] });
    } catch (e) { console.error(e); } 
    finally { setSharingId(null); }
  };

  // --- RECORDING UI LOGIC ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setRecordingState(p => ({ ...p, isRecording: false, blob, url: URL.createObjectURL(blob) }));
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start(1000); 
      setRecordingState({ isRecording: true, time: 0, blob: null, url: null });
      timerRef.current = setInterval(() => setRecordingState(p => ({ ...p, time: p.time + 1 })), 1000);
    } catch (err) { alert("Mic access denied"); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      clearInterval(timerRef.current);
    }
  };

  const fetchMessages = useCallback(async (username) => {
    const { data } = await supabase.from('messages').select('*').eq('username', username).order('created_at', { ascending: false });
    if(data) setMessages(data);
  }, []);

  const handleAuth = async () => {
    const { username, password } = formData;
    if (authMode === 'signup') {
        const { error } = await supabase.from('users').insert({ username, password });
        if (error) return alert(error.message);
    } else {
        const { data } = await supabase.from('users').select('username').eq('username', username).eq('password', password).maybeSingle();
        if (!data) return alert("Invalid credentials");
    }
    const u = { username };
    setUser(u);
    localStorage.setItem('anon-voice-user', JSON.stringify(u));
    setView('inbox');
  };

  const logout = () => { setUser(null); localStorage.removeItem('anon-voice-user'); setView('landing'); };

  return (
    <>
      {pipeline.error && <div className="fixed top-0 w-full bg-red-500 text-white p-2 text-center z-50">{pipeline.error}</div>}
      
      {view === 'landing' && (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 relative">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-900 to-black opacity-80" />
          <div className="relative z-10 text-center max-w-md w-full">
            <h1 className="text-5xl font-black mb-2">AnonVox</h1>
            <p className="text-gray-400 mb-8">Send anonymous messages.<br/>They see a robot, not you.</p>
            <div className="grid gap-4">
              <button onClick={() => { setView('auth'); setAuthMode('signup'); }} className="w-full py-4 bg-white text-black rounded-xl font-bold">Get Started</button>
              <button onClick={() => { setView('auth'); setAuthMode('login'); }} className="w-full py-4 bg-gray-800 text-gray-300 rounded-xl font-bold">Log In</button>
            </div>
          </div>
        </div>
      )}

      {view === 'recorder' && (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden min-h-[500px] flex flex-col">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white text-center">
              <h2 className="text-sm opacity-80">SENDING TO</h2>
              <h1 className="text-3xl font-black">@{formData.recipient}</h1>
            </div>
            
            <div className="p-8 flex-1 flex flex-col justify-center">
              
              {/* --- PIPELINE PROGRESS VIEW (When Processing) --- */}
              {pipeline.active ? (
                <div className="space-y-6 text-center animate-in fade-in zoom-in">
                  <div className="w-24 h-24 mx-auto bg-black rounded-full flex items-center justify-center">
                     {pipeline.step === 'sent' ? <Check className="text-green-500 w-10 h-10"/> : <Loader2 className="text-white w-10 h-10 animate-spin"/>}
                  </div>
                  
                  <div>
                    <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">
                      {pipeline.step === 'transcribing' && "Transcribing..."}
                      {pipeline.step === 'robotic' && "Turning to robotic voice..."}
                      {pipeline.step === 'video' && "Turning to video..."}
                      {pipeline.step === 'sending' && "Video Sent"}
                      {pipeline.step === 'sent' && "Video Sent"}
                    </h2>
                    <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-purple-600 h-full transition-all duration-500" style={{ width: `${pipeline.progress}%` }} />
                    </div>
                  </div>
                </div>
              ) : (
                /* --- RECORDING VIEW --- */
                !recordingState.blob ? (
                  <div className="flex flex-col items-center">
                     <div className="mb-6 w-full text-center"><p className="text-gray-400 font-bold">HOLD TO RECORD</p></div>
                     <button onClick={recordingState.isRecording ? stopRecording : startRecording} className={`w-24 h-24 rounded-full flex items-center justify-center transition-all ${recordingState.isRecording ? 'bg-red-500 scale-110' : 'bg-black hover:scale-105'}`}>
                      {recordingState.isRecording ? <Square className="w-8 h-8 text-white"/> : <Mic className="w-8 h-8 text-white"/>}
                    </button>
                    <p className="mt-4 font-mono font-bold text-xl">{Math.floor(recordingState.time / 60)}:{(recordingState.time % 60).toString().padStart(2, '0')}</p>
                  </div>
                ) : (
                  /* --- REVIEW VIEW (No Text Shown) --- */
                  <div className="space-y-4">
                    <div className="bg-purple-50 p-6 rounded-2xl flex flex-col items-center gap-4">
                      <div className="flex items-center gap-2 text-purple-700 font-bold">
                        <Check className="w-5 h-5"/> <span>Recorded Successfully</span>
                      </div>
                      <button onClick={() => { const a = new Audio(recordingState.url); a.play(); }} className="bg-white p-3 rounded-full shadow-sm"><Play className="w-6 h-6 text-black"/></button>
                    </div>

                    <button onClick={startPipeline} className="w-full py-4 bg-black text-white rounded-xl font-bold text-lg flex justify-center items-center gap-2">
                       <Zap className="w-5 h-5" /> Transform & Send
                    </button>
                    
                    <button onClick={() => setRecordingState({ isRecording: false, time: 0, blob: null })} className="w-full py-3 text-red-500 font-bold">Discard</button>
                  </div>
                )
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
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 text-white shadow-lg">
              <h2 className="text-2xl font-bold">Get Messages</h2>
              <div className="flex gap-2 mt-4">
                <button onClick={() => {
                   const url = `${window.location.origin}?send_to=${user.username}&ref=${user.username}`;
                   if(navigator.share) navigator.share({ title: 'AnonVox', url });
                   else { navigator.clipboard.writeText(url); alert('Copied!'); }
                }} className="bg-white text-indigo-900 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2"><Share2 className="w-4 h-4"/> Share Link</button>
              </div>
            </div>

            {messages.map(msg => (
               <div key={msg.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                  <div className="flex gap-3 mb-4 items-center">
                     <div className="w-10 h-10 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center"><Film className="w-5 h-5"/></div>
                     <div><p className="font-bold text-sm">Anonymous</p><p className="text-xs text-gray-400">{new Date(msg.created_at).toLocaleDateString()}</p></div>
                  </div>
                  {msg.video_url ? (
                     <div className="flex flex-col gap-4">
                         <video src={msg.video_url} controls className="w-full rounded-xl bg-black aspect-[9/16] max-h-[400px] object-contain"/>
                         <button onClick={() => handleNativeShare(msg.video_url, msg.id)} className="w-full bg-black text-white py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2">
                           {sharingId === msg.id ? <Loader2 className="w-4 h-4 animate-spin"/> : <Share2 className="w-4 h-4"/>} Share Video
                         </button>
                     </div>
                  ) : (
                    <div className="bg-gray-100 p-4 rounded-xl text-center"><p className="text-gray-500 text-sm">Processing Video...</p></div>
                  )}
               </div>
            ))}
          </main>
        </div>
      )}

      {view === 'auth' && (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
          <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl">
             <input className="w-full p-4 bg-gray-50 rounded-xl mb-4" placeholder="Username" value={formData.username} onChange={e=>setFormData({...formData, username:e.target.value})}/>
             <input className="w-full p-4 bg-gray-50 rounded-xl mb-6" type="password" placeholder="Password" value={formData.password} onChange={e=>setFormData({...formData, password:e.target.value})}/>
             <button onClick={handleAuth} className="w-full py-4 bg-black text-white rounded-xl font-bold mb-4">{authMode==='login'?'Log In':'Sign Up'}</button>
             <button onClick={()=>setView('landing')} className="w-full text-gray-400 text-sm">Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}
