import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, Play, Send, Check, Inbox, Share2, LogOut, User, Sparkles, 
  Square, Trash2, Film, Download, Heart, Zap, Ghost, Music, 
  Users, Copy, Instagram, Linkedin, MessageCircle 
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// Setup Supabase
const supabaseUrl = 'https://ghlnenmfwlpwlqdrbean.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdobG5lbm1md2xwd2xxZHJiZWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MTE0MDQsImV4cCI6MjA3OTk4NzQwNH0.rNILUdI035c4wl4kFkZFP4OcIM_t7bNMqktKm25d5Gg';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- CONSTANTS & TEMPLATES ---
const VOICE_TYPES = {
  ROBOT: { id: 'robot', name: 'Classic Bot', color: '#667eea', detune: -800, speed: 1.0, icon: <Sparkles className="w-4 h-4"/>, req: 0 },
  ALIEN: { id: 'alien', name: 'Area 51', color: '#10B981', detune: 1200, speed: 1.2, icon: <Zap className="w-4 h-4"/>, req: 3 },
  DEMON: { id: 'demon', name: 'Underworld', color: '#EF4444', detune: -1800, speed: 0.8, icon: <Ghost className="w-4 h-4"/>, req: 5 },
};

const MESSAGE_TEMPLATES = [
  "Confession: I've had a crush on you since...",
  "Truth Bomb: You need to hear this...",
  "Compliment: Your energy is literally...",
  "Question: What was that thing you posted...",
];

export default function AnonymousVoiceApp() {
  // Auth & User State
  const [currentUser, setCurrentUser] = useState(null);
  const [authView, setAuthView] = useState('landing'); // landing, login, signup, try-it
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [recipientUsername, setRecipientUsername] = useState('');
  const [referralCount, setReferralCount] = useState(0); // Mock referral system
  
  // App States
  const [activeTab, setActiveTab] = useState('inbox'); 
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [messages, setMessages] = useState([]);
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recordingTime, setRecordingTime] = useState(0);
  const [selectedVoice, setSelectedVoice] = useState('robot');
  const [videoFormat, setVideoFormat] = useState('tiktok'); // tiktok (9:16) or square (1:1)

  // Video Generation States
  const [generatingVideo, setGeneratingVideo] = useState(null);
  const [videoProgress, setVideoProgress] = useState('');
  const [isRefreshingAfterGeneration, setIsRefreshingAfterGeneration] = useState(false);

  // Refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sendTo = params.get('send_to');
    const refBy = params.get('ref');

    // Simulate Referral Tracking
    if (refBy) {
      localStorage.setItem('referred_by', refBy);
    }
    
    // Load local data
    const savedUser = localStorage.getItem('anon-voice-user');
    const savedRefs = localStorage.getItem('anon-refs');
    if (savedRefs) setReferralCount(parseInt(savedRefs));

    if (sendTo) {
      setRecipientUsername(sendTo);
      setAuthView('');
    } else if (savedUser) {
      const user = JSON.parse(savedUser);
      setCurrentUser(user);
      fetchMessages(user.username);
      setAuthView('');
    }
  }, []);

  // --- MOCK REFERRAL LOGIC ---
  const incrementReferrals = () => {
    // In a real app, this comes from DB
    const newCount = referralCount + 1;
    setReferralCount(newCount);
    localStorage.setItem('anon-refs', newCount.toString());
    alert(`🚀 Referral simulated! You now have ${newCount} referrals.`);
  };

  // --- CORE FUNCTIONS (Auth/Fetch) ---
  // (Kept largely the same, just condensed for brevity)
  const fetchMessages = async (user) => {
    const { data } = await supabase.from('messages').select('*').eq('username', user).order('created_at', { ascending: false });
    if (data) {
      setMessages(prev => data.map(newMsg => {
        const local = prev.find(p => p.id === newMsg.id);
        return (local?.video_url && !newMsg.video_url) ? { ...newMsg, video_url: local.video_url } : newMsg;
      }));
    }
  };

  const handleAuth = async (type) => {
    setError(''); setLoading(true);
    if (type === 'signup') {
      if (!username.match(/^[a-zA-Z0-9_-]{3,20}$/)) { setError('Invalid username'); setLoading(false); return; }
      const { data: ex } = await supabase.from('users').select('username').eq('username', username).maybeSingle();
      if (ex) { setError('Username taken'); setLoading(false); return; }
      await supabase.from('users').insert({ username, password });
    } else {
      const { data } = await supabase.from('users').select('username').eq('username', username).eq('password', password).maybeSingle();
      if (!data) { setError('Invalid credentials'); setLoading(false); return; }
    }
    const user = { username };
    setCurrentUser(user);
    localStorage.setItem('anon-voice-user', JSON.stringify(user));
    setLoading(false); setAuthView(''); fetchMessages(user.username);
  };

  const handleLogout = () => {
    setCurrentUser(null); localStorage.removeItem('anon-voice-user'); setMessages([]); setAuthView('landing');
  };

  // --- RECORDING LOGIC ---
  const toggleRecording = async () => { isRecording ? stopRecording() : startRecording(); };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob); setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true); setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(p => p + 1), 1000);

      // Speech Recog
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        const rec = new SR();
        rec.continuous = true; rec.interimResults = true;
        rec.onresult = (e) => setTranscript(Array.from(e.results).map(r => r[0].transcript).join(''));
        rec.start(); recognitionRef.current = rec;
      }
    } catch (err) { alert('Mic access required'); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop(); setIsRecording(false);
      recognitionRef.current?.stop(); clearInterval(timerRef.current);
    }
  };

  // --- AUDIO PROCESSING & VIDEO GEN ---
  const getProcessedAudioStream = async (url, voiceId) => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const resp = await fetch(url);
    const buf = await ctx.decodeAudioData(await resp.arrayBuffer());
    
    const source = ctx.createBufferSource();
    source.buffer = buf;
    const dest = ctx.createMediaStreamDestination();
    const analyser = ctx.createAnalyser(); // For lip sync
    analyser.fftSize = 256;

    const settings = VOICE_TYPES[voiceId?.toUpperCase()] || VOICE_TYPES.ROBOT;
    
    // 1. Pitch Shift
    source.detune.value = settings.detune;
    source.playbackRate.value = settings.speed;

    // 2. Effects Chain
    const mainGain = ctx.createGain();
    mainGain.gain.value = 2.0;

    if (voiceId === 'robot') {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth'; osc.frequency.value = 50; osc.start();
      const oscGain = ctx.createGain(); oscGain.gain.value = 0.05;
      osc.connect(oscGain).connect(dest);
    } 
    else if (voiceId === 'alien') {
      const delay = ctx.createDelay();
      delay.delayTime.value = 0.1;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.4;
      source.connect(delay).connect(feedback).connect(delay);
      delay.connect(mainGain);
    }

    source.connect(mainGain);
    mainGain.connect(analyser); // Analyser taps into audio
    mainGain.connect(dest);

    return { stream: dest.stream, duration: buf.duration, source, ctx, analyser };
  };

  const generateVideo = async (msgId, audioUrl, text, voiceType) => {
    setGeneratingVideo(msgId);
    setVideoProgress('Preparing Studio...');
    setIsRefreshingAfterGeneration(true);

    try {
      const width = videoFormat === 'tiktok' ? 1080 : 1080;
      const height = videoFormat === 'tiktok' ? 1920 : 1080;
      
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      let audioData = null;
      if (audioUrl) {
         setVideoProgress('Processing Voice...');
         audioData = await getProcessedAudioStream(audioUrl, voiceType);
      }
      
      const duration = audioData ? audioData.duration : 5;
      const totalFrames = Math.ceil(duration * 30);
      const frames = [];

      // Render Loop
      const dataArray = new Uint8Array(audioData?.analyser.frequencyBinCount || 0);
      
      // We need to simulate real-time analysis for the pre-render
      // Since we can't easily analyze buffer offline without OfflineAudioContext (complex),
      // we will simulate mouth movement based on a sine wave modulated by "pseudo-randomness" 
      // if we are pre-rendering frames fast.
      // BETTER APPROACH: Use OfflineAudioContext to get amplitude data for frames.
      // SIMPLIFIED APPROACH: Randomized mouth movement active only when audio exists.

      setVideoProgress('Rendering Animation...');
      
      for (let i = 0; i < totalFrames; i++) {
        const time = i / 30;
        
        // --- DRAWING THE AVATAR ---
        // Gradient BG
        const voiceConfig = VOICE_TYPES[voiceType.toUpperCase()];
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, '#1a1a2e');
        grad.addColorStop(1, voiceConfig.color);
        ctx.fillStyle = grad; ctx.fillRect(0, 0, width, height);

        // TikTok Header
        if (videoFormat === 'tiktok') {
           ctx.fillStyle = "rgba(255,255,255,0.1)";
           ctx.fillRect(100, 200, width-200, 100);
           ctx.font = "bold 40px Arial";
           ctx.fillStyle = "#fff";
           ctx.textAlign = "center";
           ctx.fillText("ANONYMOUS MESSAGE", width/2, 265);
        }

        ctx.save();
        ctx.translate(width/2, height/2);
        
        const bob = Math.sin(time * 2) * 20;
        ctx.translate(0, bob);

        // Head
        ctx.fillStyle = '#e0e5ee';
        ctx.beginPath(); ctx.roundRect(-200, -200, 400, 400, 40); ctx.fill();

        // Eyes (Blink)
        const blink = (Math.floor(time * 3) % 10 === 0) ? 0.1 : 1;
        ctx.fillStyle = voiceConfig.color;
        ctx.shadowBlur = 30; ctx.shadowColor = voiceConfig.color;
        ctx.fillRect(-120, -50, 80, 80 * blink);
        ctx.fillRect(40, -50, 80, 80 * blink);
        ctx.shadowBlur = 0;

        // Mouth (Simulate Lip Sync)
        // Pseudo-random "talking" amplitude
        const talkAmp = Math.sin(time * 20) * Math.sin(time * 5) * 60 + 20;
        const mouthOpen = Math.max(10, Math.abs(talkAmp));
        
        ctx.fillStyle = '#2c3e50';
        ctx.fillRect(-100, 100, 200, mouthOpen);

        ctx.restore();

        // Subtitles
        if (text) {
          ctx.font = "bold 50px Arial";
          ctx.fillStyle = "white";
          ctx.strokeStyle = "black";
          ctx.lineWidth = 4;
          ctx.textAlign = "center";
          const words = text.split(' ');
          const chunk = words.slice(Math.floor((i/totalFrames)*words.length), Math.floor((i/totalFrames)*words.length)+3).join(' ');
          ctx.strokeText(chunk, width/2, height - 200);
          ctx.fillText(chunk, width/2, height - 200);
        }

        await new Promise(r => canvas.toBlob(b => { frames.push(b); r(); }, 'image/jpeg', 0.8));
        if (i % 10 === 0) setVideoProgress(`Rendering ${Math.round((i/totalFrames)*100)}%`);
      }

      // Combine & Upload (Similar to previous logic)
      setVideoProgress('Encoding & Uploading...');
      const canvasStream = canvas.captureStream(30);
      let finalStream = canvasStream;
      if (audioData) {
         // Re-create source for recording
         const mixedDest = audioData.ctx.createMediaStreamDestination();
         const newSource = audioData.ctx.createBufferSource();
         newSource.buffer = audioData.source.buffer;
         newSource.detune.value = audioData.source.detune.value;
         newSource.playbackRate.value = audioData.source.playbackRate.value;
         newSource.connect(mixedDest);
         
         finalStream = new MediaStream([...canvasStream.getVideoTracks(), ...mixedDest.stream.getAudioTracks()]);
         newSource.start(0);
      }

      const recorder = new MediaRecorder(finalStream, { mimeType: 'video/webm;codecs=vp8,opus' });
      const chunks = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      
      const videoBlob = await new Promise((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
        recorder.start();
        
        let idx = 0;
        const draw = async () => {
          if (idx >= frames.length) { recorder.stop(); return; }
          const img = await createImageBitmap(frames[idx++]);
          ctx.drawImage(img, 0, 0);
          setTimeout(draw, 33);
        };
        draw();
      });

      const fileName = `vid-${msgId}-${Date.now()}.webm`;
      await supabase.storage.from('voices').upload(fileName, videoBlob);
      const { data: { publicUrl } } = supabase.storage.from('voices').getPublicUrl(fileName);
      await supabase.from('messages').update({ video_url: publicUrl }).eq('id', msgId);
      
      setMessages(p => p.map(m => m.id === msgId ? { ...m, video_url: publicUrl } : m));
      setGeneratingVideo(null); setActiveTab('videos'); 
      setTimeout(() => alert('Viral Video Ready! 🎬'), 500);

    } catch (e) { console.error(e); setGeneratingVideo(null); alert('Error generating video'); }
  };

  // --- SOCIAL SHARE ---
  const handleShare = async () => {
    const shareData = {
      title: 'AnonVox',
      text: 'Send me an anonymous voice message! 🤖',
      url: `${window.location.origin}?send_to=${currentUser.username}&ref=${currentUser.username}`
    };
    if (navigator.share) {
      await navigator.share(shareData);
      incrementReferrals(); // Self-referral hack for demo
    } else {
      navigator.clipboard.writeText(shareData.url);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSendMessage = async () => {
    setLoading(true);
    let upUrl = null;
    if (audioBlob) {
      const fn = `voice-${Date.now()}.webm`;
      await supabase.storage.from('voices').upload(fn, audioBlob);
      const { data } = supabase.storage.from('voices').getPublicUrl(fn);
      upUrl = data.publicUrl;
    }
    await supabase.from('messages').insert({ username: recipientUsername, text: transcript || '[Voice]', audio_url: upUrl });
    setLoading(false);
    alert('Message Sent! 📨');
    window.location.href = window.location.origin; // Reload to landing
  };

  // --- VIEWS ---

  // 1. LANDING PAGE
  if (!currentUser && authView === 'landing' && !recipientUsername) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-purple-900 via-black to-black opacity-50 animate-pulse"></div>
        
        <div className="z-10 text-center max-w-md w-full">
          <div className="w-24 h-24 mx-auto bg-gradient-to-br from-cyan-400 to-purple-600 rounded-full flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(139,92,246,0.5)]">
            <Sparkles className="w-12 h-12 text-white animate-spin-slow" />
          </div>
          <h1 className="text-5xl font-black mb-2 tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-500">AnonVox</h1>
          <p className="text-gray-400 text-lg mb-8">Send anonymous audio. <br/>Receive <span className="text-cyan-400 font-bold">Robotic Videos</span>.</p>
          
          <div className="space-y-4">
            <button onClick={() => setAuthView('try-it')} className="w-full bg-white text-black py-4 rounded-xl font-bold text-lg hover:scale-105 transition shadow-[0_0_20px_rgba(255,255,255,0.3)] flex items-center justify-center gap-2">
              <Mic className="w-5 h-5"/> Try Voice Effect
            </button>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setAuthView('signup')} className="py-4 rounded-xl font-bold bg-gray-900 border border-gray-800 hover:border-purple-500 transition text-gray-300">New Account</button>
              <button onClick={() => setAuthView('login')} className="py-4 rounded-xl font-bold bg-gray-900 border border-gray-800 hover:border-cyan-500 transition text-gray-300">Login</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. TRY IT MODE (Onboarding)
  if (authView === 'try-it') {
     return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
           <div className="w-full max-w-md bg-gray-900 rounded-3xl p-8 border border-gray-800">
              <h2 className="text-2xl font-bold mb-6 text-center">Test the Robot 🤖</h2>
              <div className="flex flex-col items-center gap-6">
                 <button onClick={toggleRecording} className={`w-24 h-24 rounded-full flex items-center justify-center transition-all ${isRecording ? 'bg-red-500 scale-110 animate-pulse' : 'bg-gray-800 hover:bg-gray-700'}`}>
                    {isRecording ? <Square className="w-10 h-10"/> : <Mic className="w-10 h-10 text-cyan-400"/>}
                 </button>
                 {audioUrl && (
                    <div className="w-full bg-gray-800 p-4 rounded-xl text-center">
                       <p className="text-sm text-gray-400 mb-3">Recording captured!</p>
                       <button onClick={() => {const a = new Audio(audioUrl); a.playbackRate=0.8; a.play();}} className="bg-purple-600 px-6 py-2 rounded-lg font-bold flex items-center justify-center gap-2 mx-auto"><Play className="w-4 h-4"/> Hear Robotic Preview</button>
                    </div>
                 )}
                 <button onClick={() => setAuthView('signup')} className="w-full py-4 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-xl font-bold text-lg mt-4 animate-bounce">
                    Create Account to Send It 🚀
                 </button>
                 <button onClick={() => setAuthView('landing')} className="text-gray-500 text-sm">Back</button>
              </div>
           </div>
        </div>
     )
  }

  // 3. SEND MESSAGE VIEW
  if (recipientUsername && !currentUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-6 text-white text-center">
             <h2 className="text-xl font-medium opacity-90">Send anonymously to</h2>
             <h1 className="text-3xl font-black">@{recipientUsername}</h1>
          </div>
          
          <div className="p-6">
            {!audioBlob ? (
               <div className="text-center">
                  <div className="mb-8">
                    <p className="text-gray-500 text-sm mb-3 uppercase tracking-wider font-bold">Need Inspiration?</p>
                    <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                       {MESSAGE_TEMPLATES.map((t,i) => (
                          <button key={i} onClick={() => setTranscript(t)} className="whitespace-nowrap px-4 py-2 bg-gray-100 rounded-full text-sm text-gray-600 hover:bg-purple-100 hover:text-purple-600 transition border border-gray-200">{t.substring(0, 25)}...</button>
                       ))}
                    </div>
                  </div>
                  
                  <div className="h-48 flex flex-col items-center justify-center">
                     <button onClick={toggleRecording} className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${isRecording ? 'bg-red-500 shadow-[0_0_30px_rgba(239,68,68,0.5)]' : 'bg-black hover:scale-110'}`}>
                        {isRecording ? <div className="w-8 h-8 bg-white rounded"/> : <Mic className="w-8 h-8 text-white"/>}
                     </button>
                     <p className="mt-4 font-mono text-purple-600">{isRecording ? formatTime(recordingTime) : 'Tap to Record'}</p>
                  </div>
               </div>
            ) : (
               <div className="space-y-4">
                  <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                     <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-purple-600">CAPTURED</span>
                        <span className="text-xs text-purple-400">{formatTime(recordingTime)}</span>
                     </div>
                     <div className="h-8 bg-purple-200 rounded-full overflow-hidden w-full relative">
                        <div className="absolute inset-0 bg-purple-400 w-2/3 animate-pulse opacity-50"></div>
                     </div>
                  </div>
                  <button onClick={handleSendMessage} disabled={loading} className="w-full py-4 bg-black text-white rounded-xl font-bold text-lg flex items-center justify-center gap-2">
                     {loading ? 'Encrypting...' : <><Send className="w-5 h-5"/> Send Anonymously</>}
                  </button>
                  <button onClick={() => {setAudioBlob(null); setTranscript('');}} className="w-full py-3 text-red-500 font-bold text-sm">Discard</button>
               </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 4. MAIN APP (Inbox)
  if (currentUser) {
    const isInbox = activeTab === 'inbox';
    const unlockProgress = Math.min(100, (referralCount / 5) * 100);

    return (
      <div className="min-h-screen bg-gray-100 pb-20 sm:pb-0">
        <header className="bg-white sticky top-0 z-20 shadow-sm border-b border-gray-200">
           <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
              <h1 className="font-black text-xl tracking-tight flex items-center gap-2"><div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center"><Sparkles className="text-white w-4 h-4"/></div> AnonVox</h1>
              <div className="flex items-center gap-3">
                 <button onClick={incrementReferrals} className="text-xs bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full font-bold border border-yellow-200">🏆 {referralCount} Refs</button>
                 <button onClick={handleLogout}><LogOut className="w-5 h-5 text-gray-400"/></button>
              </div>
           </div>
        </header>

        <main className="max-w-4xl mx-auto p-4 space-y-6">
           {/* REFERRAL CARD */}
           <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
              <div className="relative z-10">
                 <h2 className="text-2xl font-bold mb-2">Unlock Premium Voices</h2>
                 <p className="text-indigo-100 mb-4 text-sm max-w-sm">Invite friends to unlock the Alien and Demon voice modulators for your videos.</p>
                 
                 <div className="flex items-center gap-4 mb-4">
                    <div className="flex-1 h-3 bg-black/30 rounded-full overflow-hidden"><div style={{width: `${unlockProgress}%`}} className="h-full bg-cyan-400 transition-all duration-1000"></div></div>
                    <span className="font-mono font-bold text-sm">{referralCount}/5</span>
                 </div>

                 <div className="flex gap-2">
                    <button onClick={handleShare} className="bg-white text-indigo-900 px-6 py-2 rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-gray-100 transition"><Share2 className="w-4 h-4"/> Invite Friends</button>
                    {copied && <span className="bg-black/20 px-3 py-2 rounded-lg text-xs font-medium animate-fade-in">Link Copied!</span>}
                 </div>
              </div>
              <Ghost className="absolute -right-6 -bottom-6 w-40 h-40 text-white opacity-10 rotate-12"/>
           </div>

           {/* TABS */}
           <div className="flex gap-4 border-b border-gray-200">
              <button onClick={() => setActiveTab('inbox')} className={`pb-3 px-2 font-bold text-sm ${isInbox ? 'text-black border-b-2 border-black' : 'text-gray-400'}`}>Inbox ({messages.length})</button>
              <button onClick={() => setActiveTab('videos')} className={`pb-3 px-2 font-bold text-sm ${!isInbox ? 'text-black border-b-2 border-black' : 'text-gray-400'}`}>Videos</button>
           </div>

           {/* CONTENT */}
           <div className="space-y-4">
              {messages.length === 0 && (
                 <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300">
                    <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-2"/>
                    <p className="text-gray-500">Your inbox is empty</p>
                    <button onClick={handleShare} className="mt-4 text-purple-600 font-bold text-sm">Share your link to get messages</button>
                 </div>
              )}

              {messages.map(msg => (
                (!isInbox && !msg.video_url) ? null : 
                <div key={msg.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-4">
                   <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                         <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                            {msg.video_url ? <Film className="w-5 h-5 text-pink-500"/> : <Mic className="w-5 h-5 text-gray-500"/>}
                         </div>
                         <div>
                            <p className="font-bold text-sm text-gray-800">Anonymous</p>
                            <p className="text-xs text-gray-400">{new Date(msg.created_at).toLocaleDateString()}</p>
                         </div>
                      </div>
                   </div>

                   {/* Video Section */}
                   {msg.video_url ? (
                      <div className="relative group">
                         <video src={msg.video_url} controls className="w-full rounded-xl bg-black max-h-[400px] object-contain" />
                         <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition">
                            <a href={msg.video_url} download className="p-2 bg-black/50 text-white rounded-full"><Download className="w-4 h-4"/></a>
                            <button onClick={() => navigator.share({url: msg.video_url})} className="p-2 bg-green-500 text-white rounded-full"><Share2 className="w-4 h-4"/></button>
                         </div>
                      </div>
                   ) : (
                      <div className="bg-gray-50 p-4 rounded-xl">
                         <p className="italic text-gray-600 text-sm mb-4">"{msg.text || 'Voice Message'}"</p>
                         
                         <div className="flex flex-wrap gap-2 items-center">
                            {/* Voice Selector */}
                            <div className="flex bg-white rounded-lg border border-gray-200 p-1">
                               {Object.values(VOICE_TYPES).map(v => (
                                  <button 
                                    key={v.id} 
                                    disabled={referralCount < v.req}
                                    onClick={() => setSelectedVoice(v.id)}
                                    className={`p-2 rounded-md transition relative group ${selectedVoice === v.id ? 'bg-black text-white' : 'text-gray-400 hover:text-gray-600'}`}
                                  >
                                     {v.icon}
                                     {referralCount < v.req && <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white"/>}
                                  </button>
                               ))}
                            </div>

                            <button 
                               onClick={() => setVideoFormat(f => f === 'tiktok' ? 'square' : 'tiktok')}
                               className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-600 flex items-center gap-1"
                            >
                               {videoFormat === 'tiktok' ? <Instagram className="w-3 h-3"/> : <Square className="w-3 h-3"/>}
                               {videoFormat === 'tiktok' ? '9:16' : '1:1'}
                            </button>

                            <button 
                              onClick={() => generateVideo(msg.id, msg.audio_url, msg.text, selectedVoice)}
                              disabled={generatingVideo === msg.id}
                              className="flex-1 bg-gradient-to-r from-pink-500 to-orange-500 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md hover:shadow-lg transition active:scale-95 disabled:opacity-50"
                            >
                              {generatingVideo === msg.id ? videoProgress : 'Generate Video'}
                            </button>
                         </div>
                      </div>
                   )}
                </div>
              ))}
           </div>
        </main>
      </div>
    );
  }

  // Auth Forms (Simplified for brevity)
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
       <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl">
          <h2 className="text-2xl font-black mb-6 text-center">{authView === 'login' ? 'Welcome Back' : 'Join AnonVox'}</h2>
          <input className="w-full p-4 bg-gray-50 rounded-xl mb-4" placeholder="Username" value={username} onChange={e=>setUsername(e.target.value)}/>
          <input className="w-full p-4 bg-gray-50 rounded-xl mb-6" type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)}/>
          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
          <button onClick={() => handleAuth(authView)} disabled={loading} className="w-full py-4 bg-black text-white rounded-xl font-bold mb-4">{loading ? '...' : (authView==='login'?'Log In':'Sign Up')}</button>
          <button onClick={() => setAuthView('landing')} className="w-full text-gray-400 text-sm">Cancel</button>
       </div>
    </div>
  );
}

const formatTime = (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;
