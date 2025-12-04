import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Mic, Play, Send, Check, Inbox, Share2, LogOut, User, Sparkles, 
  Square, Trash2, Film, Download, Heart, Zap, Ghost, Instagram, 
  AlertCircle, Loader2, X, MessageCircle, Music2, BrainCircuit, Cpu, Volume2, Mic2 
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// ==========================================
// --- CONFIGURATION ---
// ==========================================

const SUPABASE_URL = 'https://ghlnenmfwlpwlqdrbean.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdobG5lbm1md2xwd2xxZHJiZWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MTE0MDQsImV4cCI6MjA3OTk4NzQwNH0.rNILUdI035c4wl4kFkZFP4OcIM_t7bNMqktKm25d5Gg';

// 🔴 1. PASTE ASSEMBLY AI KEY HERE 🔴
const ASSEMBLY_KEY = 'e923129f7dec495081e757c6fe82ea8b'; 

// 🔴 2. PASTE VOICE RSS KEY HERE (Get free at voicerss.org) 🔴
const VOICERSS_KEY = '747fd61f3e264f42b52bcd332823661e'; 

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const MAX_RECORDING_TIME = 120; 
const REFRESH_INTERVAL = 10000;

// Mobile-friendly audio constraints
const AUDIO_CONSTRAINTS = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 44100, // Standard sample rate
  }
};

export default function AnonymousVoiceApp() {
  // --- STATE ---
  const [user, setUser] = useState(null);
  const [view, setView] = useState('landing');
  const [authMode, setAuthMode] = useState('login');
  const [formData, setFormData] = useState({ username: '', password: '', recipient: '' });
  
  // Recording State
  const [recordingState, setRecordingState] = useState({ 
    isRecording: false, 
    time: 0, 
    rawBlob: null, 
    rawUrl: null
  });

  // Pipeline State
  const [pipeline, setPipeline] = useState({
    active: false,
    step: '', 
    progress: 0,
    error: null
  });

  const [messages, setMessages] = useState([]);
  const [sharingId, setSharingId] = useState(null);
  
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
    if (!formData.recipient) return alert("Enter a recipient username first.");
    if (!recordingState.rawBlob) return alert("Record something first!");
    if (!ASSEMBLY_KEY) return alert("Missing AssemblyAI API Key");
    if (!VOICERSS_KEY) return alert("Missing VoiceRSS API Key");

    setPipeline({ active: true, step: 'transcribing', progress: 5, error: null });

    try {
      // 1. TRANSCRIBING (AssemblyAI)
      const text = await performTranscription(recordingState.rawBlob);
      if (!text || text.trim().length === 0) throw new Error("Could not understand audio. Try speaking clearer.");
      console.log("Transcribed Text:", text);

      // 2. GENERATING VOICE (VoiceRSS)
      setPipeline({ active: true, step: 'voice', progress: 40, error: null });
      const ttsBlob = await generateVoiceRSSTTS(text);
      
      // 3. GENERATING VIDEO (Mobile-Robust Version)
      setPipeline({ active: true, step: 'video', progress: 70, error: null });
      // We pass the raw recorded blob just for duration reference if needed, but we use ttsBlob for audio
      const videoBlob = await generateVideoBlob(ttsBlob, text);

      // 4. UPLOADING
      setPipeline({ active: true, step: 'sending', progress: 90, error: null });
      const publicUrl = await uploadVideo(videoBlob);
      
      // 5. SAVING
      await saveMessageToDB(publicUrl, text);

      setPipeline({ active: true, step: 'sent', progress: 100, error: null });
      
      setTimeout(() => {
        alert("Video Sent Successfully! 🚀");
        window.location.href = window.location.origin;
      }, 1000);

    } catch (err) {
      console.error(err);
      setPipeline({ active: false, step: '', progress: 0, error: err.message });
      alert("Error: " + err.message);
    }
  };

  // --- STEP 1: TRANSCRIPTION (AssemblyAI) ---
  const performTranscription = async (blob) => {
    try {
      const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: { 'Authorization': ASSEMBLY_KEY },
        body: blob
      });
      if (!uploadRes.ok) throw new Error("AssemblyAI Upload Failed");
      const uploadData = await uploadRes.json();

      const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: { 'Authorization': ASSEMBLY_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_url: uploadData.upload_url, language_detection: true })
      });
      const transcriptData = await transcriptRes.json();
      const id = transcriptData.id;

      while (true) {
        const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
          headers: { 'Authorization': ASSEMBLY_KEY }
        });
        const result = await pollRes.json();
        if (result.status === 'completed') return result.text;
        if (result.status === 'error') throw new Error(result.error);
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (e) {
      throw new Error("Transcription Error: " + e.message);
    }
  };

  // --- STEP 2: GENERATE TTS (VoiceRSS) ---
  const generateVoiceRSSTTS = async (text) => {
    if (!VOICERSS_KEY) throw new Error("Missing VoiceRSS Key");

    const params = new URLSearchParams();
    params.append('key', VOICERSS_KEY);
    params.append('src', text);
    params.append('hl', 'en-us');
    params.append('v', 'Mike'); 
    params.append('r', '0');
    params.append('c', 'MP3');
    params.append('f', '44khz_16bit_stereo');

    const response = await fetch('https://api.voicerss.org/', {
      method: 'POST',
      body: params
    });

    if (!response.ok) throw new Error("VoiceRSS API Failed");
    
    return await response.blob();
  };

  // --- STEP 3: VIDEO GENERATION (MOBILE ROBUST) ---
  const generateVideoBlob = async (audioBlob, text) => {
    return new Promise(async (resolve, reject) => {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        
        // 1. MOBILE FIX: Resume AudioContext (must be triggered by the user click that called this)
        if (ctx.state === 'suspended') {
            await ctx.resume();
        }

        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioBufferData = await ctx.decodeAudioData(arrayBuffer);

        const source = ctx.createBufferSource();
        source.buffer = audioBufferData;
        
        const dest = ctx.createMediaStreamDestination();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;

        source.connect(analyser);
        source.connect(dest); 

        // 2. MOBILE FIX: Use compatible canvas dimensions
        const width = 360; 
        const height = 640;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const canvasCtx = canvas.getContext('2d', { alpha: false });

        // 3. MOBILE FIX: Draw INITIAL frame before recording starts
        // This prevents the "Black Screen / 0s" issue on iOS
        canvasCtx.fillStyle = '#000000';
        canvasCtx.fillRect(0,0,width,height);
        
        const stream = canvas.captureStream(30);
        
        // Combine audio and video tracks
        const combinedStream = new MediaStream([
            ...stream.getVideoTracks(),
            ...dest.stream.getAudioTracks()
        ]);
        
        // 4. MOBILE FIX: Aggressive MIME type checking
        const mimeTypes = [
            'video/mp4',
            'video/webm;codecs=h264',
            'video/webm;codecs=vp8',
            'video/webm'
        ];
        const selectedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || '';

        const recorder = new MediaRecorder(combinedStream, { 
            mimeType: selectedMime,
            videoBitsPerSecond: 1500000 // Lower bitrate for mobile stability
        });
        
        const chunks = [];
        recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
        
        recorder.onstop = () => {
           const blob = new Blob(chunks, { type: selectedMime });
           ctx.close();
           resolve(blob);
        };

        // 5. MOBILE FIX: Start recording with small timeslice to force chunk creation
        recorder.start(100); 
        source.start(0);

        const duration = audioBufferData.duration;
        const startTime = ctx.currentTime;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const draw = () => {
          if (ctx.state === 'closed') return;
          const elapsed = ctx.currentTime - startTime;
          
          // Add 0.5s buffer
          if (elapsed >= duration + 0.5) {
            if (recorder.state !== 'inactive') recorder.stop();
            return;
          }

          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a,b)=>a+b) / dataArray.length;

          // Draw Visuals
          const grad = canvasCtx.createLinearGradient(0,0,0,height);
          grad.addColorStop(0, '#000000');
          grad.addColorStop(1, '#16a34a'); // Green theme 
          canvasCtx.fillStyle = grad;
          canvasCtx.fillRect(0,0,width,height);

          const t = Date.now()/1000;
          canvasCtx.save();
          canvasCtx.translate(width/2, height/2);
          
          // Robot Head
          canvasCtx.fillStyle = '#e2e8f0';
          canvasCtx.beginPath(); canvasCtx.roundRect(-75,-75,150,150,15); canvasCtx.fill();

          // Eyes
          canvasCtx.fillStyle = '#1e293b';
          canvasCtx.fillRect(-50, -25, 100, 30);
          
          // Glowing Eye Bar
          canvasCtx.fillStyle = '#ef4444'; // Red eye
          canvasCtx.shadowBlur = 10;
          canvasCtx.shadowColor = '#ef4444';
          const eyeWidth = 90 * Math.abs(Math.sin(t * 3)); 
          canvasCtx.fillRect(-eyeWidth/2, -20, eyeWidth, 20);
          canvasCtx.shadowBlur = 0;

          // Mouth (Spectrum)
          canvasCtx.fillStyle = '#334155';
          const mouthOpen = Math.max(2, avg * 0.8);
          canvasCtx.fillRect(-40, 40, 80, mouthOpen);

          canvasCtx.restore();

          // Subtitles
          if (text) {
             canvasCtx.font='bold 16px sans-serif';
             canvasCtx.fillStyle='#fff';
             canvasCtx.textAlign = 'center';
             const words = text.split(' ');
             const p = elapsed / duration;
             const idx = Math.floor(p * words.length);
             const segment = words.slice(Math.max(0, idx-3), idx+4).join(' ');
             
             canvasCtx.shadowColor="black";
             canvasCtx.shadowBlur=2;
             canvasCtx.fillText(segment, width/2, height - 100);
             canvasCtx.shadowBlur=0;
          }

          requestAnimationFrame(draw);
        };
        draw();
      } catch (err) {
        reject("Video Gen Error: " + err.message);
      }
    });
  };

  // --- STEP 4 & 5: UPLOAD & SAVE ---
  const uploadVideo = async (blob) => {
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const fileName = `voicerss-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('voices').upload(fileName, blob);
    if (error) throw new Error("Storage Upload Failed: " + error.message);
    const { data } = supabase.storage.from('voices').getPublicUrl(fileName);
    return data.publicUrl;
  };

  const saveMessageToDB = async (url, text) => {
    const { error } = await supabase.from('messages').insert({
      username: formData.recipient, 
      text: text || '[AI Voice Message]',
      video_url: url 
    });
    if (error) throw new Error("DB Save Failed: " + error.message);
  };

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
        setRecordingState(p => ({ 
            ...p, 
            isRecording: false, 
            rawBlob: blob, 
            rawUrl: URL.createObjectURL(blob),
        }));
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start(1000); 
      setRecordingState({ isRecording: true, time: 0, rawBlob: null, rawUrl: null });
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
    fetchMessages(username);
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
            <p className="text-gray-400 mb-8">Send anonymous audio.<br/>They see a robot, not you.</p>
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
              {formData.recipient ? (
                  <h1 className="text-3xl font-black">@{formData.recipient}</h1>
              ) : (
                  <input 
                    placeholder="Enter Username" 
                    className="mt-2 text-black p-2 rounded text-center font-bold"
                    onChange={(e) => setFormData(p => ({...p, recipient: e.target.value}))}
                  />
              )}
            </div>
            
            <div className="p-8 flex-1 flex flex-col justify-center">
              
              {pipeline.active ? (
                <div className="space-y-6 text-center animate-in fade-in zoom-in">
                  <div className="w-24 h-24 mx-auto bg-black rounded-full flex items-center justify-center">
                     {pipeline.step === 'sent' ? <Check className="text-green-500 w-10 h-10"/> : <Loader2 className="text-white w-10 h-10 animate-spin"/>}
                  </div>
                  <div>
                    <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">
                      {pipeline.step === 'transcribing' && "Understanding Audio..."}
                      {pipeline.step === 'voice' && "Generating Voice (VoiceRSS)..."}
                      {pipeline.step === 'video' && "Generating Video..."}
                      {pipeline.step === 'sending' && "Sending..."}
                      {pipeline.step === 'sent' && "Sent!"}
                    </h2>
                    <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-purple-600 h-full transition-all duration-500" style={{ width: `${pipeline.progress}%` }} />
                    </div>
                  </div>
                </div>
              ) : (
                !recordingState.rawBlob ? (
                  <div className="flex flex-col items-center">
                     <div className="mb-6 w-full text-center"><p className="text-gray-400 font-bold">HOLD TO RECORD</p></div>
                     <button onClick={recordingState.isRecording ? stopRecording : startRecording} className={`w-24 h-24 rounded-full flex items-center justify-center transition-all ${recordingState.isRecording ? 'bg-red-500 scale-110' : 'bg-black hover:scale-105'}`}>
                      {recordingState.isRecording ? <Square className="w-8 h-8 text-white"/> : <Mic className="w-8 h-8 text-white"/>}
                    </button>
                    <p className="mt-4 font-mono font-bold text-xl">{Math.floor(recordingState.time / 60)}:{(recordingState.time % 60).toString().padStart(2, '0')}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-gray-100 p-6 rounded-2xl flex flex-col items-center gap-4">
                      <div className="flex w-full items-center justify-between border-b border-gray-300 pb-3">
                        <span className="text-xs font-bold text-gray-500 uppercase">Your Voice</span>
                        <button onClick={() => { const a = new Audio(recordingState.rawUrl); a.play(); }} className="bg-white p-2 rounded-full shadow-sm"><Play className="w-4 h-4 text-black"/></button>
                      </div>
                      <div className="text-xs text-gray-500 text-center">
                        This audio will be transcribed, converted to speech, and then sent as a video.
                      </div>
                    </div>

                    <button onClick={startPipeline} className="w-full py-4 bg-black text-white rounded-xl font-bold text-lg flex justify-center items-center gap-2 animate-in fade-in">
                       <Zap className="w-5 h-5" /> Generate & Send
                    </button>
                    
                    <button onClick={() => setRecordingState({ isRecording: false, time: 0, rawBlob: null, rawUrl: null })} className="w-full py-3 text-red-500 font-bold">Discard</button>
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
