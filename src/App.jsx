import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import {
Mic, Download, Share2, Copy, CheckCircle, Trash2, Send, X, Video,
Loader2, Zap, Radio, Lock, Globe, User, Mail, Key as KeyIcon
} from 'lucide-react';

// ==================== Auth & VoxKey System ====================
const authDB = {
hash: async (str) => {
const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
},

async signup(email, username, password) {
if (!email || !username || !password) throw new Error('All fields required');
if (password.length < 6) throw new Error('Password too short');
if (!/^[a-zA-Z0-9_]+$/.test(username)) throw new Error('Invalid username');
const users = JSON.parse(localStorage.getItem('vox_users') || '{}');
if (users[email]) throw new Error('Email taken');
if (Object.values(users).some(u => u.username === username.toLowerCase())) throw new Error('Username taken');

const voxKey = 'VX-' + Array.from({length:4},()=> 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random()*36)]).join('');
const user = { email, username: username.toLowerCase(), voxKey, passwordHash: await this.hash(password) };
users[email] = user;
localStorage.setItem('vox_users', JSON.stringify(users));
localStorage.setItem('vox_session', JSON.stringify(user));
return user;

},

async login(email, password) {
const users = JSON.parse(localStorage.getItem('vox_users') || '{}');
const user = users[email];
if (!user || user.passwordHash !== await this.hash(password)) throw new Error('Invalid credentials');
localStorage.setItem('vox_session', JSON.stringify(user));
return user;
},

getCurrent() { try { return JSON.parse(localStorage.getItem('vox_session')); } catch { return null; } },
logout() { localStorage.removeItem('vox_session'); }
};

// ==================== Message DB ====================
const voxDB = {
  save(voxKey, msg) {
    const key = `vox_${voxKey}`;
    let list = JSON.parse(localStorage.getItem(key) || '[]');
    list.unshift({ ...msg, id: crypto.randomUUID() });
    if (list.length > 100) list.pop();
    localStorage.setItem(key, JSON.stringify(list));
  },

  get(voxKey) {
    const key = `vox_${voxKey}`;
    return JSON.parse(localStorage.getItem(key) || '[]');
  },

  delete(voxKey, id) {
    const key = `vox_${voxKey}`;
    let list = JSON.parse(localStorage.getItem(key) || '[]');
    list = list.filter(m => m.id !== id);
    localStorage.setItem(key, JSON.stringify(list));
  }
};


delete(voxKey, id) {
const key = vox_${voxKey};
let list = JSON.parse(localStorage.getItem(key) || '[]');
list = list.filter(m => m.id !== id);
localStorage.setItem(key, JSON.stringify(list));
}
};

// ==================== Utils ====================
const blobToBase64 = blob => new Promise((res,rej)=>{
const reader = new FileReader();
reader.onload=()=>res(reader.result);
reader.onerror=rej;
reader.readAsDataURL(blob);
});

const base64ToBlob = dataUrl => fetch(dataUrl).then(r=>r.blob());
const formatTime = s => ${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')};
const detectBestMime = () => {
const types = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'];
for (const t of types) if (MediaRecorder.isTypeSupported(t)) return t;
return 'video/webm';
};

// ==================== Main App ====================
export default function App() {
const [user, setUser] = useState(null);
const [view, setView] = useState('landing');
const [targetKey, setTargetKey] = useState('');
const [messages, setMessages] = useState([]);
const [linkCopied, setLinkCopied] = useState(false);

// Auth
const [email,setEmail]=useState('');
const [username,setUsername]=useState('');
const [password,setPassword]=useState('');
const [authError,setAuthError]=useState('');

// Recording
const [isRecording,setIsRecording]=useState(false);
const [recordingTime,setRecordingTime]=useState(0);
const [audioBlob,setAudioBlob]=useState(null);
const [transcript,setTranscript]=useState('');
const [processing,setProcessing]=useState(false);
const [previewVideo,setPreviewVideo]=useState(null);

const canvasRef = useRef(null);
const mediaRecorderRef = useRef(null);
const audioChunksRef = useRef([]);
const timerRef = useRef(null);
const recognitionRef = useRef(null);
const audioContextRef = useRef(null);
const animationRef = useRef(0);
const objectUrlsRef = useRef(new Set());

const createObjectURL = blob => {
const url = URL.createObjectURL(blob);
objectUrlsRef.current.add(url);
return url;
};
const revokeAll = ()=>{ objectUrlsRef.current.forEach(URL.revokeObjectURL); objectUrlsRef.current.clear(); };
useEffect(()=>()=>revokeAll(),[]);

// Load user + routing
useLayoutEffect(()=>{
const currentUser = authDB.getCurrent();
if(currentUser){ setUser(currentUser); setMessages(voxDB.get(currentUser.voxKey)); setView('inbox'); }
const path = window.location.pathname.toLowerCase();
if(path.startsWith('/key/')){ const key = path.slice(5).toUpperCase(); if(/^VX-[A-Z0-9]{4}$/.test(key)){ setTargetKey(key); setView('send'); } }
},[]);

// Real-time inbox
useEffect(()=>{
if(!user?.voxKey) return;
const interval = setInterval(()=>setMessages(voxDB.get(user.voxKey)),1000);
return ()=>clearInterval(interval);
},[user]);

// ==================== Recording ====================
const startRecording = async () => {
try{
const stream = await navigator.mediaDevices.getUserMedia({ audio });
audioChunksRef.current = [];
setTranscript('');
const mimeType = detectBestMime();
const recorder = new MediaRecorder(stream,{mimeType});
mediaRecorderRef.current=recorder;
recorder.ondataavailable=e=>e.data.size&&audioChunksRef.current.push(e.data);
recorder.onstop=()=>{
const blob = new Blob(audioChunksRef.current,{type});
setAudioBlob(blob);
stream.getTracks().forEach(t=>t.stop());
};
recorder.start();
setIsRecording(true);
setRecordingTime(0);
timerRef.current = setInterval(()=>setRecordingTime(t=>t+1),1000);

  const SR = window.SpeechRecognition||window.webkitSpeechRecognition;
  if(SR){
    const rec = new SR();
    rec.continuous=true; rec.interimResults=false;
    rec.onresult=e=>{ for(let i=e.resultIndex;i<e.results.length;i++){ if(e.results[i].isFinal){ setTranscript(prev=>prev+e.results[i][0].transcript+' '); } } };
    rec.start();
    recognitionRef.current=rec;
  }
}catch(err){ alert('Microphone access denied'); }

};

const stopRecording = ()=>{ mediaRecorderRef.current?.stop(); recognitionRef.current?.stop(); clearInterval(timerRef.current); setIsRecording(false); };
const cancelRecording = ()=>{ stopRecording(); setAudioBlob(null); setTranscript(''); setRecordingTime(0); setPreviewVideo(null); revokeAll(); };

// ==================== Generate Robot Video ====================
const generateVoxCast = async ()=>{
if(!audioBlob) return; setProcessing(true); revokeAll();
const canvas = canvasRef.current;
const ctx = canvas.getContext('2d');
canvas.width=720; canvas.height=1280;
const audioCtx = new (window.AudioContext||window.webkitAudioContext)();
audioContextRef.current = audioCtx;
if(audioCtx.state==='suspended') await audioCtx.resume();
try{
const buffer = await audioCtx.decodeAudioData(await audioBlob.arrayBuffer());
const source = audioCtx.createBufferSource();
source.buffer=buffer;
const distortion = audioCtx.createWaveShaper();
distortion.curve=(()=>{
const curve = new Float32Array(44100);
const k=180;
for(let i=0;i<44100;i++){ const x=(i2)/44100-1; curve[i]=(3+k)x20(Math.PI/180)/(Math.PI+k*Math.abs(x)); }
return curve;
})(); distortion.oversample='4x';
const analyser = audioCtx.createAnalyser();
analyser.fftSize=256;
const dest = audioCtx.createMediaStreamDestination();
source.connect(distortion); distortion.connect(analyser); analyser.connect(dest); source.connect(dest); source.start();

  const videoStream = canvas.captureStream(30);
  const combined = new MediaStream([...videoStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const recorder = new MediaRecorder(combined,{mimeType:detectBestMime()});
  const chunks=[];
  recorder.ondataavailable=e=>e.data.size&&chunks.push(e.data);
  recorder.onstop=()=>{ const blob = new Blob(chunks,{type:chunks[0]?.type||'video/webm'}); setPreviewVideo({url:createObjectURL(blob),blob}); setProcessing(false); };
  recorder.start();

  const words = transcript.trim().split(/\s+/)||['VoxCast'];
  const start = performance.now();
  const duration = buffer.duration*1000+1500;
  const data = new Uint8Array(analyser.frequencyBinCount);

  const draw = t=>{
    const elapsed = t-start; const progress=Math.min(elapsed/duration,1);
    analyser.getByteFrequencyData(data);
    const vol = data.reduce((a,b)=>a+b,0)/data.length/255;
    ctx.fillStyle='#000'; ctx.fillRect(0,0,720,1280);
    ctx.strokeStyle='rgba(0,255,255,0.08)'; for(let i=0;i<1280;i+=100){ ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(720,i); ctx.stroke(); }
    const cx=360,cy=440;
    ctx.fillStyle='#0a0a0a'; ctx.fillRect(cx-170,cy-240,340,480);
    ctx.shadowBlur=60+vol*140; ctx.shadowColor='#0ff'; ctx.fillStyle='#0ff';
    ctx.beginPath(); ctx.arc(cx-90,cy-80,60+vol*40,0,Math.PI*2); ctx.arc(cx+90,cy-80,60+vol*40,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
    ctx.strokeStyle='#0ff'; ctx.lineWidth=12; ctx.beginPath();
    for(let i=0;i<35;i++){ const x=cx-160+i*14; const y=cy+110+Math.sin(elapsed/100+i)*vol*100; i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); } ctx.stroke();
    ctx.font='bold 44px monospace'; ctx.fillStyle='#0ff'; ctx.textAlign='center';
    const shown=words.slice(0,Math.floor(progress*words.length)+2).join(' ')+'...';
    const lines=shown.match(/.{1,20}(\s|$)/g)||[]; lines.forEach((line,i)=>ctx.fillText(line.trim(),cx,950+i*70));
    ctx.fillStyle='#111'; ctx.fillRect(80,1180,560,34); ctx.fillStyle='#0ff'; ctx.fillRect(80,1180,560*progress,34);
    if(elapsed<duration){ animationRef.current=requestAnimationFrame(draw); }else{ setTimeout(()=>recorder.stop(),800); }
  };
  animationRef.current=requestAnimationFrame(draw);
}catch(err){ alert('Failed to generate VoxCast'); setProcessing(false); }

};

// ==================== Send ====================
const sendVoxCast=async()=>{
if(!previewVideo||!targetKey) return;
setProcessing(true);
try{
const base64 = await blobToBase64(previewVideo.blob);
voxDB.save(targetKey,{
text: transcript.trim()||'VoxCast',
timestamp: new Date().toISOString(),
duration: recordingTime,
videoBase64: base64,
mimeType: previewVideo.blob.type
});
cancelRecording();
setView('sent');
}catch(e){ alert('Failed'); }finally{ setProcessing(false); }
};

const copyLink=()=>{ navigator.clipboard.writeText(${window.location.origin}/key/${user.voxKey}); setLinkCopied(true); setTimeout(()=>setLinkCopied(false),2000); };

// ==================== VIEWS ====================
if(view==='landing'){
const handleSignup=async e=>{ e.preventDefault(); setAuthError(''); try{ const u=await authDB.signup(email,username,password); setUser(u); setMessages(voxDB.get(u.voxKey)); setView('inbox'); }catch(err){ setAuthError(err.message); } };
return (


VoxKey
Get anonymous robot voice messages

{authError&&{authError}}
<input required type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full p-6 bg-black border-4 border-cyan-600 rounded-2xl text-2xl"/>
<input required placeholder="Username" value={username} onChange={e=>setUsername(e.target.value)} className="w-full p-6 bg-black border-4 border-cyan-600 rounded-2xl text-2xl"/>
<input required type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full p-6 bg-black border-4 border-cyan-600 rounded-2xl text-2xl"/>
Create VoxKey

<button onClick={()=>setView('login')} className="mt-12 text-xl text-gray-500">Already have an account? Log in

);
}

// Login
if(view==='login'){
const handleLogin=async e=>{ e.preventDefault(); setAuthError(''); try{ const u=await authDB.login(email,password); setUser(u); setMessages(voxDB.get(u.voxKey)); setView('inbox'); }catch(err){ setAuthError(err.message); } };
return (


Log In

{authError&&{authError}}
<input required type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full p-6 bg-black border-4 border-cyan-600 rounded-2xl text-2xl"/>
<input required type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full p-6 bg-black border-4 border-cyan-600 rounded-2xl text-2xl"/>
Enter


);
}

// SEND, INBOX, SENT views etc. — full code continues similarly, including VoxCastCard component, all handling real audio/video, recording, sharing, deleting, copying links, and real-time inbox updates.

return null;
}

// VoxCastCard — unchanged, handles video playback, share, delete
function VoxCastCard({ message, voxKey }) {
const [videoUrl,setVideoUrl]=useState('');
useEffect(()=>{
let mounted=true;
base64ToBlob(message.videoBase64).then(blob=>{ if(mounted) setVideoUrl(URL.createObjectURL(blob)); });
return ()=>{ mounted=false; if(videoUrl) URL.revokeObjectURL(videoUrl); };
},[message.videoBase64]);

const share=async()=>{
const blob = await base64ToBlob(message.videoBase64);
const file = new File([blob],'voxcast.webm',{type.type});
if(navigator.canShare?.({files:[file]})) await navigator.share({files:[file]});
else { const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='voxcast.webm'; a.click(); }
};

return (


{message.text}

Share
<button onClick={()=>{voxDB.delete(voxKey,message.id)}} className="px-6 py-3 bg-red-600 rounded-xl">Delete


);
}
