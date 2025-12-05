import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Mic, Play, Send, Check, Share2, LogOut, Sparkles, 
  Square, Film, Download, Zap, Loader2, Gift, Snowflake, 
  FastForward, Music
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// ==========================================
// --- CONFIGURATION --
// ==========================================

const SUPABASE_URL = 'https://ghlnenmfwlpwlqdrbean.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdobG5lbm1md2xwd2xxZHJiZWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MTE0MDQsImV4cCI6MjA3OTk4NzQwNH0.rNILUdI035c4wl4kFkZFP4OcIM_t7bNMqktKm25d5Gg';

// 🔴 KEYS (As provided) 🔴
const ASSEMBLY_KEY = 'e923129f7dec495081e757c6fe82ea8b'; 
const VOICERSS_KEY = '747fd61f3e264f42b52bcd332823661e'; 

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const MAX_RECORDING_TIME = 120; 
const REFRESH_INTERVAL = 10000;

const AUDIO_CONSTRAINTS = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 44100
  }
};

// --- SUB-COMPONENT: VIDEO CARD (Handles Speed & Download) ---
const VideoMessageCard = ({ msg, handleDownload, handleNativeShare, sharingId }) => {
  const videoRef = useRef(null);
  const [speed, setSpeed] = useState(1.0);

  const toggleSpeed = () => {
    const newSpeed = speed === 1.0 ? 1.5 : (speed === 1.5 ? 2.0 : 1.0);
    setSpeed(newSpeed);
    if(videoRef.current) videoRef.current.playbackRate = newSpeed;
  };

  return (
    <div className="bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-2xl shadow-xl mb-6 relative overflow-hidden group">
      <div className="absolute -top-10 -right-10 bg-red-500 w-24 h-24 rounded-full blur-3xl opacity-20 pointer-events-none"></div>
      
      {/* Header */}
      <div className="flex gap-3 mb-4 items-center relative z-10">
         <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-green-700 text-white flex items-center justify-center shadow-lg border-2 border-green-300">
            <Gift className="w-6 h-6 animate-bounce"/>
         </div>
         <div>
           <p className="font-black text-white text-lg">Secret Santa</p>
           <p className="text-xs text-green-200 font-medium">{new Date(msg.created_at).toLocaleDateString()}</p>
         </div>
      </div>

      {/* Video Area */}
      {msg.video_url ? (
         <div className="flex flex-col gap-3 relative">
             <div className="relative rounded-xl overflow-hidden shadow-2xl border-2 border-white/10">
                <video 
                  ref={videoRef}
                  src={msg.video_url} 
                  controls={false} // Custom controls
                  className="w-full bg-black aspect-[9/16] object-cover"
                  onClick={(e) => e.target.paused ? e.target.play() : e.target.pause()}
                />
                
                {/* Custom Play Button Overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <Play className={`w-16 h-16 text-white/50 opacity-0 transition-opacity ${videoRef.current?.paused ? 'opacity-100' : ''}`} />
                </div>

                {/* Speed Toggle (Floating) */}
                <button 
                  onClick={toggleSpeed}
                  className="absolute top-2 right-2 bg-black/60 backdrop-blur text-white text-xs font-bold px-3 py-1 rounded-full border border-white/20 flex items-center gap-1 hover:bg-black/80 transition"
                >
                  <FastForward className="w-3 h-3 text-yellow-400" /> {speed}x
                </button>
             </div>

             {/* Action Bar */}
             <div className="grid grid-cols-5 gap-2">
                {/* Share (Viral Button) */}
                <button 
                  onClick={() => handleNativeShare(msg.video_url, msg.id)} 
                  className="col-span-3 bg-gradient-to-r from-yellow-400 to-orange-500 text-red-900 py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-lg hover:scale-[1.02] transition-transform"
                >
                  {sharingId === msg.id ? <Loader2 className="w-4 h-4 animate-spin"/> : <Share2 className="w-4 h-4"/>} 
                  SHARE CHEER
                </button>

                {/* Download */}
                <button 
                  onClick={() => handleDownload(msg.video_url, `anonvox-xmas-${msg.id}.mp4`)}
                  className="col-span-2 bg-white/10 hover:bg-white/20 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border border-white/20 transition-colors"
                >
                  <Download className="w-4 h-4"/> SAVE
                </button>
             </div>
         </div>
      ) : (
        <div className="bg-black/20 p-8 rounded-xl text-center border-2 border-dashed border-white/20">
          <Loader2 className="w-8 h-8 text-white mx-auto animate-spin mb-2"/>
          <p className="text-white/70 text-sm font-medium">Wrapping your gift...</p>
        </div>
      )}
    </div>
  );
};


export default function AnonymousVoiceApp() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('landing');
  const [authMode, setAuthMode] = useState('login');
  const [formData, setFormData] = useState({ username: '', password: '', recipient: '' });
  
  const [recordingState, setRecordingState] = useState({ 
    isRecording: false, 
    time: 0, 
    rawBlob: null, 
    rawUrl: null
  });

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
  // --- PIPELINE ---
  // ==========================================

  const startPipeline = async () => {
    if (!formData.recipient) return alert("Enter a recipient username first.");
    if (!recordingState.rawBlob) return alert("Record something first!");

    setPipeline({ active: true, step: 'transcribing', progress: 5, error: null });

    try {
      // 1. TRANSCRIBING
      const text = await performTranscription(recordingState.rawBlob);
      if (!text || text.trim().length === 0) throw new Error("Could not hear you. Try again.");
      
      // 2. GENERATING VOICE
      setPipeline({ active: true, step: 'voice', progress: 40, error: null });
      const ttsBlob = await generateVoiceRSSTTS(text);
      
      // 3. GENERATING VIDEO (FESTIVE EDITION)
      setPipeline({ active: true, step: 'video', progress: 70, error: null });
      const videoBlob = await generateVideoBlob(ttsBlob, text);

      // 4. UPLOADING
      setPipeline({ active: true, step: 'sending', progress: 90, error: null });
      const publicUrl = await uploadVideo(videoBlob);
      
      // 5. SAVING
      await saveMessageToDB(publicUrl, text);

      setPipeline({ active: true, step: 'sent', progress: 100, error: null });
      
      setTimeout(() => {
        alert("Merry Christmas! Message Sent! 🎅");
        window.location.href = window.location.origin;
      }, 1000);

    } catch (err) {
      console.error(err);
      setPipeline({ active: false, step: '', progress: 0, error: err.message });
      alert("Error: " + err.message);
    }
  };

  const performTranscription = async (blob) => {
    try {
      const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: { 'Authorization': ASSEMBLY_KEY },
        body: blob
      });
      if (!uploadRes.ok) throw new Error("Transcription Upload Failed");
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
      throw new Error("Transcription: " + e.message);
    }
  };

  const generateVoiceRSSTTS = async (text) => {
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

    if (!response.ok) throw new Error("Voice Gen Failed");
    return await response.blob();
  };

  // --- FESTIVE VIDEO GENERATION ---
  const generateVideoBlob = async (audioBlob, text) => {
    return new Promise(async (resolve, reject) => {
      let canvas = null;
      let ctx = null;
      let recorder = null;

      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        ctx = new AudioContext();
        if (ctx.state === 'suspended') await ctx.resume();

        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioBufferData = await ctx.decodeAudioData(arrayBuffer);

        const source = ctx.createBufferSource();
        source.buffer = audioBufferData; 
        const dest = ctx.createMediaStreamDestination();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64; 

        source.connect(dest);
        source.connect(analyser); 

        const width = 360; 
        const height = 640; 
        canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        Object.assign(canvas.style, {
            position: 'fixed', top: '0', left: '0', opacity: '0.01', pointerEvents: 'none', zIndex: '-1'
        });
        document.body.appendChild(canvas);

        const canvasCtx = canvas.getContext('2d', { alpha: false });

        const stream = canvas.captureStream(30); 
        const combinedStream = new MediaStream([
            ...stream.getVideoTracks(),
            ...dest.stream.getAudioTracks()
        ]);
        
        const mimeTypes = [
            'video/mp4; codecs="avc1.424028, mp4a.40.2"',
            'video/webm;codecs=h264', 
            'video/webm'
        ];
        const selectedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m));

        recorder = new MediaRecorder(combinedStream, { 
            mimeType: selectedMime,
            videoBitsPerSecond: 2500000 
        });
        
        const chunks = [];
        recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
        
        recorder.onstop = () => {
           const finalBlob = new Blob(chunks, { type: selectedMime.split(';')[0] });
           if(document.body.contains(canvas)) document.body.removeChild(canvas);
           ctx.close();
           resolve(finalBlob);
        };

        recorder.start(100); 
        await new Promise(r => setTimeout(r, 100));
        source.start(0);

        // --- ANIMATION SETUP ---
        const duration = audioBufferData.duration;
        const startTime = ctx.currentTime;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        // Snowflake setup
        const flakes = Array(40).fill().map(() => ({
            x: Math.random() * width,
            y: Math.random() * height,
            radius: Math.random() * 2 + 1,
            speed: Math.random() * 2 + 1
        }));

        const draw = () => {
          if (!ctx || ctx.state === 'closed') return;
          const elapsed = ctx.currentTime - startTime;
          
          if (elapsed >= duration + 0.8) {
            if (recorder.state !== 'inactive') recorder.stop();
            return;
          }

          analyser.getByteFrequencyData(dataArray);
          const volume = dataArray.reduce((a,b) => a+b, 0) / dataArray.length; // 0-255

          // 1. Festive Background (Deep Red)
          const grad = canvasCtx.createLinearGradient(0,0,0,height);
          grad.addColorStop(0, '#450a0a'); // Dark Red
          grad.addColorStop(1, '#1a0505'); // Blackish Red
          canvasCtx.fillStyle = grad;
          canvasCtx.fillRect(0,0,width,height);

          // 2. Draw Snow
          canvasCtx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          flakes.forEach(f => {
              canvasCtx.beginPath();
              canvasCtx.arc(f.x, f.y, f.radius, 0, Math.PI*2);
              canvasCtx.fill();
              f.y += f.speed;
              if (f.y > height) f.y = 0;
          });

          // 3. Robot Face
          const cx = width / 2;
          const cy = height / 2 - 20;
          
          // Head
          canvasCtx.fillStyle = '#e2e8f0';
          canvasCtx.beginPath();
          canvasCtx.roundRect(cx - 100, cy - 100, 200, 200, 30);
          canvasCtx.fill();

          // SANTA HAT 🎅
          canvasCtx.fillStyle = '#ef4444'; // Red Hat
          canvasCtx.beginPath();
          canvasCtx.moveTo(cx - 100, cy - 90);
          canvasCtx.lineTo(cx, cy - 200);
          canvasCtx.lineTo(cx + 100, cy - 90);
          canvasCtx.fill();
          // Hat PomPom
          canvasCtx.fillStyle = '#ffffff';
          canvasCtx.beginPath();
          canvasCtx.arc(cx, cy - 200, 20, 0, Math.PI*2);
          canvasCtx.fill();
          // Hat Rim
          canvasCtx.beginPath();
          canvasCtx.roundRect(cx - 110, cy - 100, 220, 30, 15);
          canvasCtx.fill();

          // Visor (Eyes)
          canvasCtx.fillStyle = '#0f172a';
          canvasCtx.fillRect(cx - 80, cy - 50, 160, 50);

          // Glowing Eyes (Gold for Christmas)
          canvasCtx.fillStyle = '#facc15'; 
          canvasCtx.shadowColor = '#facc15';
          canvasCtx.shadowBlur = 20;
          const eyeH = 10 + (volume / 10); 
          canvasCtx.fillRect(cx - 60, cy - 35, 40, eyeH); 
          canvasCtx.fillRect(cx + 20, cy - 35, 40, eyeH); 
          canvasCtx.shadowBlur = 0;

          // Mouth
          canvasCtx.fillStyle = '#334155';
          canvasCtx.fillRect(cx - 60, cy + 40, 120, 30);
          // Talking Bar (Green)
          canvasCtx.fillStyle = '#22c55e';
          const mouthW = (volume / 255) * 100;
          canvasCtx.fillRect(cx - mouthW/2, cy + 45, mouthW, 20);

          // 4. Subtitles
          if (text) {
             canvasCtx.font='bold 24px Arial';
             canvasCtx.fillStyle='#ffffff';
             canvasCtx.textAlign = 'center';
             canvasCtx.shadowColor="black";
             canvasCtx.shadowBlur=4;
             const words = text.split(' ');
             const p = Math.min(elapsed / duration, 1);
             const idx = Math.floor(p * words.length);
             const segment = words.slice(Math.max(0, idx-2), idx+3).join(' ');
             canvasCtx.fillText(segment, width/2, height - 150);
             canvasCtx.shadowBlur=0;
          }
          
          // 5. Branding
          canvasCtx.font='bold 20px monospace';
          canvasCtx.fillStyle='#fbbf24'; // Gold
          canvasCtx.fillText("ANON VOX", width/2, height - 50);

          requestAnimationFrame(draw);
        };
        draw();

      } catch (err) {
        if(canvas && document.body.contains(canvas)) document.body.removeChild(canvas);
        if(ctx) ctx.close();
        reject("Video Gen Error: " + err.message);
      }
    });
  };

  const uploadVideo = async (blob) => {
    const fileName = `anonvox-festive-${Date.now()}.mp4`;
    const { error } = await supabase.storage.from('voices').upload(fileName, blob, { contentType: blob.type });
    if (error) throw new Error("Upload Failed: " + error.message);
    const { data } = supabase.storage.from('voices').getPublicUrl(fileName);
    return data.publicUrl;
  };

  const saveMessageToDB = async (url, text) => {
    const { error } = await supabase.from('messages').insert({
      username: formData.recipient, 
      text: text || '[Holiday Message]',
      video_url: url 
    });
    if (error) throw new Error("DB Save Failed");
  };

  const handleNativeShare = async (videoUrl, msgId) => {
    setSharingId(msgId);
    try {
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      const file = new File([blob], `anonvox-gift-${msgId}.mp4`, { type: 'video/mp4' });
      
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ 
              files: [file],
              title: "A Holiday Secret Message",
              text: "Someone sent you a secret voice message! 🎅"
          });
      } else {
          // Fallback
          handleDownload(videoUrl, `anonvox-gift-${msgId}.mp4`);
      }
    } catch (e) { 
        console.error(e);
        handleDownload(videoUrl, `anonvox-gift-${msgId}.mp4`);
    } 
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
        setRecordingState(p => ({ ...p, isRecording: false, rawBlob: blob, rawUrl: URL.createObjectURL(blob), }));
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start(1000); 
      setRecordingState({ isRecording: true, time: 0, rawBlob: null, rawUrl: null });
      timerRef.current = setInterval(() => setRecordingState(p => ({ ...p, time: p.time + 1 })), 1000);
    } catch (err) { alert("Please allow microphone access"); }
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
    if (!username || !password) return alert("Fill all fields");
    
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
    <div className="min-h-screen bg-[#2a0a0a] font-sans text-gray-100 selection:bg-red-500 selection:text-white">
      {/* Background Ambience */}
      <div className="fixed inset-0 z-0 opacity-20 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-600 via-black to-black pointer-events-none" />
      
      {pipeline.error && <div className="fixed top-0 w-full bg-red-600 text-white p-3 text-center z-50 font-bold shadow-lg animate-pulse">{pipeline.error}</div>}
      
      {view === 'landing' && (
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-6 text-center">
          <Snowflake className="w-16 h-16 text-white mb-4 animate-spin-slow opacity-80" />
          <h1 className="text-6xl font-black mb-2 text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-yellow-400 to-red-500">AnonVox</h1>
          <p className="text-xl text-red-200 mb-8 font-medium">Send secret holiday wishes.<br/>They hear the robot, not you.</p>
          <div className="grid gap-4 w-full max-w-xs">
            <button onClick={() => { setView('auth'); setAuthMode('signup'); }} className="w-full py-4 bg-gradient-to-r from-green-600 to-green-800 text-white rounded-2xl font-bold shadow-lg shadow-green-900/50 hover:scale-105 transition-transform flex items-center justify-center gap-2"><Gift className="w-5 h-5"/> Start Gifting</button>
            <button onClick={() => { setView('auth'); setAuthMode('login'); }} className="w-full py-4 bg-white/10 backdrop-blur text-white border border-white/20 rounded-2xl font-bold hover:bg-white/20 transition-all">Log In</button>
          </div>
        </div>
      )}

      {view === 'recorder' && (
        <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden min-h-[550px] flex flex-col relative">
            {/* Decorative Lights */}
            <div className="absolute top-0 w-full flex justify-around opacity-50">
               <div className="w-2 h-10 bg-red-500 blur-lg rounded-b-full"></div>
               <div className="w-2 h-8 bg-green-500 blur-lg rounded-b-full"></div>
               <div className="w-2 h-10 bg-yellow-500 blur-lg rounded-b-full"></div>
            </div>

            <div className="p-6 text-center border-b border-white/10 mt-4">
              <h2 className="text-xs font-bold text-red-300 tracking-widest uppercase mb-1">Sending Cheer To</h2>
              {formData.recipient ? (
                  <h1 className="text-4xl font-black text-white drop-shadow-lg">@{formData.recipient}</h1>
              ) : (
                  <input 
                    placeholder="Enter Username" 
                    className="mt-2 bg-white/10 text-white placeholder-white/40 p-3 rounded-xl text-center font-bold w-full outline-none focus:ring-2 ring-red-500 transition-all"
                    onChange={(e) => setFormData(p => ({...p, recipient: e.target.value}))}
                  />
              )}
            </div>
            
            <div className="p-8 flex-1 flex flex-col justify-center relative">
              
              {pipeline.active ? (
                <div className="space-y-6 text-center animate-in fade-in zoom-in">
                  <div className="w-24 h-24 mx-auto bg-gradient-to-br from-red-500 to-red-800 rounded-full flex items-center justify-center shadow-lg shadow-red-900/50">
                     {pipeline.step === 'sent' ? <Check className="text-white w-10 h-10"/> : <Sparkles className="text-yellow-300 w-10 h-10 animate-pulse"/>}
                  </div>
                  <div>
                    <h2 className="text-xl font-black uppercase tracking-tight mb-3 text-red-100">
                      {pipeline.step === 'transcribing' && "Listening..."}
                      {pipeline.step === 'voice' && "Wrapping Voice..."}
                      {pipeline.step === 'video' && "Building Robot..."}
                      {pipeline.step === 'sending' && "Flying to North Pole..."}
                      {pipeline.step === 'sent' && "Delivered! 🎁"}
                    </h2>
                    <div className="w-full bg-white/10 h-3 rounded-full overflow-hidden">
                      <div className="bg-gradient-to-r from-green-400 to-green-600 h-full transition-all duration-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" style={{ width: `${pipeline.progress}%` }} />
                    </div>
                  </div>
                </div>
              ) : (
                !recordingState.rawBlob ? (
                  <div className="flex flex-col items-center">
                     <div className="mb-8 w-full text-center">
                        <p className="text-red-200 font-bold animate-pulse">HOLD TO RECORD</p>
                     </div>
                     <button 
                        onClick={recordingState.isRecording ? stopRecording : startRecording} 
                        className={`w-28 h-28 rounded-full flex items-center justify-center transition-all shadow-2xl ${recordingState.isRecording ? 'bg-red-600 scale-110 shadow-red-500/50' : 'bg-gradient-to-br from-gray-800 to-black border-2 border-white/20 hover:scale-105 hover:border-red-500'}`}
                     >
                      {recordingState.isRecording ? <Square className="w-10 h-10 text-white fill-current"/> : <Mic className="w-10 h-10 text-red-500"/>}
                    </button>
                    <p className="mt-6 font-mono font-bold text-2xl text-white/80">{Math.floor(recordingState.time / 60)}:{(recordingState.time % 60).toString().padStart(2, '0')}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-white/5 border border-white/10 p-6 rounded-2xl flex flex-col items-center gap-4">
                      <div className="flex w-full items-center justify-between border-b border-white/10 pb-3">
                        <span className="text-xs font-bold text-gray-400 uppercase">Review</span>
                        <button onClick={() => { const a = new Audio(recordingState.rawUrl); a.play(); }} className="bg-green-600 hover:bg-green-500 p-2 rounded-full shadow-lg transition-colors"><Play className="w-4 h-4 text-white fill-current"/></button>
                      </div>
                      <div className="text-xs text-gray-400 text-center italic">
                        "Your voice will be masked by Santa's Tech Robot."
                      </div>
                    </div>

                    <button onClick={startPipeline} className="w-full py-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-red-900 rounded-xl font-black text-lg flex justify-center items-center gap-2 shadow-lg hover:scale-[1.02] transition-transform">
                       <Zap className="w-5 h-5 fill-current" /> GENERATE MAGIC
                    </button>
                    
                    <button onClick={() => setRecordingState({ isRecording: false, time: 0, rawBlob: null, rawUrl: null })} className="w-full py-3 text-red-400 font-bold hover:text-red-300">Discard</button>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {view === 'inbox' && user && (
        <div className="min-h-screen relative z-10 pb-20">
          <header className="bg-black/30 backdrop-blur-md sticky top-0 z-50 border-b border-white/10 p-4">
            <div className="max-w-3xl mx-auto flex justify-between items-center">
                <h1 className="font-bold text-xl flex items-center gap-2 text-white"><Snowflake className="text-red-500 animate-spin-slow"/> AnonVox</h1>
                <button onClick={logout} className="text-gray-400 hover:text-white"><LogOut size={20}/></button>
            </div>
          </header>
          
          <main className="max-w-3xl mx-auto p-4 space-y-6 mt-4">
            <div className="bg-gradient-to-r from-red-900 to-red-600 rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden">
              <Sparkles className="absolute top-4 right-4 text-yellow-300 opacity-50 w-12 h-12"/>
              <h2 className="text-3xl font-black mb-2">Holiday Inbox</h2>
              <p className="text-red-100 mb-6">Receive secret messages from friends.</p>
              
              <button onClick={() => {
                   const url = `${window.location.origin}?send_to=${user.username}`;
                   if(navigator.share) navigator.share({ title: 'Send me a secret message', url });
                   else { navigator.clipboard.writeText(url); alert('Link Copied!'); }
                }} className="bg-white text-red-900 px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-gray-100 transition-colors shadow-lg">
                <Share2 className="w-4 h-4"/> SHARE MY LINK
              </button>
            </div>

            <div className="space-y-4">
            {messages.map(msg => (
                <VideoMessageCard 
                    key={msg.id} 
                    msg={msg} 
                    handleDownload={handleDownload}
                    handleNativeShare={handleNativeShare}
                    sharingId={sharingId}
                />
            ))}
            {messages.length === 0 && (
                <div className="text-center py-20 opacity-50">
                    <Music className="w-12 h-12 mx-auto mb-4"/>
                    <p>No messages yet...</p>
                </div>
            )}
            </div>
          </main>
        </div>
      )}

      {view === 'auth' && (
        <div className="min-h-screen flex items-center justify-center p-4 relative z-20">
          <div className="max-w-md w-full bg-black/60 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl">
             <h2 className="text-2xl font-bold text-white mb-6 text-center">{authMode==='login'?'Welcome Back':'Join the Party'}</h2>
             <input className="w-full p-4 bg-white/5 border border-white/10 text-white rounded-xl mb-4 focus:border-red-500 outline-none transition-colors" placeholder="Username" value={formData.username} onChange={e=>setFormData({...formData, username:e.target.value})}/>
             <input className="w-full p-4 bg-white/5 border border-white/10 text-white rounded-xl mb-6 focus:border-red-500 outline-none transition-colors" type="password" placeholder="Password" value={formData.password} onChange={e=>setFormData({...formData, password:e.target.value})}/>
             <button onClick={handleAuth} className="w-full py-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold mb-4 shadow-lg shadow-red-900/40 transition-all">{authMode==='login'?'Log In':'Sign Up'}</button>
             <button onClick={()=>setView('landing')} className="w-full text-gray-400 text-sm hover:text-white">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
