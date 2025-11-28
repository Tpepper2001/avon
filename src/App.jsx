import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Mic, Play, Pause, Trash2, Send, Loader2, CheckCircle, LogOut, Video } from 'lucide-react';

// ==================== Message DB ====================
const MAX_VIDEO_BASE64 = 18 * 1024 * 1024;
const MAX_MESSAGES = 100;

const msgDB = {
async save(voxKey, msg) {
if (!voxKey) throw new Error('No VoxKey');
if (msg.videoBase64.length > MAX_VIDEO_BASE64) throw new Error('Video too large');
const key = `vox_msgs_${voxKey}`;
let list = JSON.parse(localStorage.getItem(key) || '[]');
list.unshift({ ...msg, id: crypto.randomUUID() });
if (list.length > MAX_MESSAGES) list = list.slice(0, MAX_MESSAGES);
localStorage.setItem(key, JSON.stringify(list));
},

get(voxKey) {
if (!voxKey) return [];
return JSON.parse(localStorage.getItem(`vox_msgs_${voxKey}`) || '[]');
},

delete(voxKey, id) {
const key = `vox_msgs_${voxKey}`;
let list = JSON.parse(localStorage.getItem(key) || '[]');
list = list.filter(m => m.id !== id);
localStorage.setItem(key, JSON.stringify(list));
},
};

// ==================== Auth ====================
const auth = {
currentVoxKey: null,
init() {
const vk = localStorage.getItem('vox_session');
if (vk) this.currentVoxKey = vk;
},
signOut() {
this.currentVoxKey = null;
localStorage.removeItem('vox_session');
},
};

// ==================== Utils ====================
const blobToBase64 = (blob) => new Promise((res, rej) => {
const reader = new FileReader();
reader.onload = () => res(reader.result);
reader.onerror = rej;
reader.readAsDataURL(blob);
});

const base64ToBlob = (dataUrl) => fetch(dataUrl).then(r => r.blob());
const formatTime = (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;
const detectBestMime = () => {
const types = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'];
for (const t of types) if (MediaRecorder.isTypeSupported(t)) return t;
return 'video/webm';
};

const generateVoxKey = () => `VX-${Math.random().toString(36).substring(2,6).toUpperCase()}`;

// ==================== Main App ====================
export default function App() {
const [voxKey, setVoxKey] = useState(auth.currentVoxKey);
const [view, setView] = useState('landing');
const [messages, setMessages] = useState([]);

const [isRecording, setIsRecording] = useState(false);
const [recordTime, setRecordTime] = useState(0);
const [audioBlob, setAudioBlob] = useState(null);
const [transcript, setTranscript] = useState('');
const [processing, setProcessing] = useState(false);
const [previewVideo, setPreviewVideo] = useState(null);
const [isPlaying, setIsPlaying] = useState(false);

const canvasRef = useRef(null);
const mediaRecorderRef = useRef(null);
const audioChunksRef = useRef([]);
const timerRef = useRef(null);
const recognitionRef = useRef(null);
const animationRef = useRef(0);
const objectUrlsRef = useRef(new Set());
const previewAudioRef = useRef(null);

const createObjectURL = (blob) => {
const url = URL.createObjectURL(blob);
objectUrlsRef.current.add(url);
return url;
};

const revokeAllURLs = () => {
objectUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
objectUrlsRef.current.clear();
};

useEffect(() => () => revokeAllURLs(), []);

useLayoutEffect(() => {
auth.init();
if (auth.currentVoxKey) {
setVoxKey(auth.currentVoxKey);
setMessages(msgDB.get(auth.currentVoxKey));
setView('inbox');
}

```
const path = window.location.pathname;  
if (path.startsWith('/key/')) {  
  const key = path.slice(5).toUpperCase();  
  if (key) {  
    setVoxKey(key);  
    setView('send');  
  }  
}  
```

}, []);

useEffect(() => {
if (!voxKey || view !== 'inbox') return;
const interval = setInterval(() => setMessages(msgDB.get(voxKey)), 1000);
return () => clearInterval(interval);
}, [voxKey, view]);

// ==================== Recording ====================
const startRecording = async () => {
try {
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
audioChunksRef.current = [];
setTranscript('');
const mimeType = detectBestMime();
const recorder = new MediaRecorder(stream, { mimeType });
mediaRecorderRef.current = recorder;

```
  recorder.ondataavailable = e => e.data.size && audioChunksRef.current.push(e.data);  
  recorder.onstop = () => {  
    const blob = new Blob(audioChunksRef.current, { type: mimeType });  
    setAudioBlob(blob);  
    stream.getTracks().forEach(t => t.stop());  
  };  

  recorder.start();  
  setIsRecording(true);  
  setRecordTime(0);  
  timerRef.current = setInterval(() => setRecordTime(t => t + 1), 1000);  

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;  
  if (SR) {  
    const rec = new SR();  
    rec.continuous = true;  
    rec.interimResults = false;  
    rec.onresult = e => {  
      for (let i = e.resultIndex; i < e.results.length; i++) {  
        if (e.results[i].isFinal) setTranscript(prev => prev + e.results[i][0].transcript + ' ');  
      }  
    };  
    rec.start();  
    recognitionRef.current = rec;  
  }  
} catch { alert('Microphone access denied'); }  
```

};

const stopRecording = () => {
mediaRecorderRef.current?.stop();
recognitionRef.current?.stop();
clearInterval(timerRef.current);
setIsRecording(false);
};

const cancelRecording = () => {
stopRecording();
setAudioBlob(null);
setPreviewVideo(null);
setTranscript('');
setRecordTime(0);
revokeAllURLs();
};

// ==================== Generate Robot Video ====================
const generatePreview = async () => {
if (!audioBlob) return;
setProcessing(true);
revokeAllURLs();

```
const canvas = canvasRef.current;  
const ctx = canvas.getContext('2d');  
canvas.width = 720; canvas.height = 1280;  

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();  
if (audioCtx.state === 'suspended') await audioCtx.resume();  

try {  
  const audioBuffer = await audioCtx.decodeAudioData(await audioBlob.arrayBuffer());  
  const source = audioCtx.createBufferSource();  
  source.buffer = audioBuffer;  

  const analyser = audioCtx.createAnalyser(); analyser.fftSize = 256;  
  const dest = audioCtx.createMediaStreamDestination();  
  source.connect(analyser); analyser.connect(dest); source.connect(dest); source.start();  

  const videoStream = canvas.captureStream(30);  
  const combined = new MediaStream([...videoStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);  
  const recorder = new MediaRecorder(combined, { mimeType: detectBestMime() });  
  const chunks = [];  
  recorder.ondataavailable = e => e.data.size && chunks.push(e.data);  
  recorder.onstop = () => {  
    const blob = new Blob(chunks, { type: chunks[0]?.type || 'video/webm' });  
    setPreviewVideo({ blob, url: createObjectURL(blob) });  
    setProcessing(false);  
  };  

  recorder.start();  

  const words = transcript.trim().split(/\s+/) || ['VoxKey','Message'];  
  const startTime = performance.now();  
  const duration = audioBuffer.duration * 1000 + 1200;  
  const dataArray = new Uint8Array(analyser.frequencyBinCount);  

  const draw = (now) => {  
    const elapsed = now - startTime;  
    const progress = Math.min(elapsed/duration,1);  
    analyser.getByteFrequencyData(dataArray);  
    const volume = dataArray.reduce((a,b)=>a+b,0)/dataArray.length/255;  

    ctx.fillStyle='#000'; ctx.fillRect(0,0,720,1280);  
    ctx.strokeStyle='rgba(0,255,0,0.07)'; ctx.lineWidth=2;  
    for(let i=0;i<1280;i+=80){ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(720,i);ctx.stroke();}  

    ctx.font='bold 46px monospace'; ctx.fillStyle='#0f0'; ctx.textAlign='center';  
    const text = words.slice(0,Math.floor(progress*words.length)+2).join(' ')+'...';  
    const lines = text.match(/.{1,22}(\s|$)/g)||[];  
    lines.forEach((line,i)=>ctx.fillText(line.trim(),360,900+i*68));  

    if(elapsed<duration){ animationRef.current=requestAnimationFrame(draw); }  
    else setTimeout(()=>recorder.stop(),800);  
  };  

  animationRef.current=requestAnimationFrame(draw);  
} catch { alert('Video generation failed'); setProcessing(false); }  
```

};

// ==================== Send Message ====================
const sendMessage = async () => {
if (!previewVideo || !voxKey) return;
setProcessing(true);
try {
const base64 = await blobToBase64(previewVideo.blob);
const msg = {
id: crypto.randomUUID(),
text: transcript.trim() || 'Vox message',
timestamp: new Date().toISOString(),
duration: recordTime,
videoBase64: base64,
mimeType: previewVideo.blob.type
};
await msgDB.save(voxKey, msg);
cancelRecording();
setView('sent');
} catch { alert('Failed to send'); }
finally { setProcessing(false); }
};

// ==================== Render ====================
if(view==='landing'){
return ( <div className="min-h-screen bg-black text-green-400 font-mono flex flex-col items-center justify-center p-6"> <Video className="w-32 h-32 mb-8 animate-pulse"/> <h1 className="text-7xl font-bold mb-4">VoxKey</h1> <p className="text-3xl mb-12">Hear anonymous robot voices about you</p>
<button onClick={()=>{const key=generateVoxKey();localStorage.setItem('vox_session',key);auth.currentVoxKey=key;setVoxKey(key);setView('inbox');}}
className="px-12 py-6 bg-green-600 rounded-2xl text-3xl font-bold">Create Your VoxKey</button> </div>
);
}

// ==================== Send Voice ====================
if(view==='send'){
return ( <div className="bg-black text-white min-h-screen flex flex-col items-center justify-center p-8"> <canvas ref={canvasRef} className="hidden"/> <h2 className="text-3xl font-bold mb-2">Send an anonymous VoxCast to {voxKey}</h2>
{!audioBlob ? <button onClick={()=>isRecording?stopRecording():startRecording()}
className={`w-40 h-40 rounded-full flex items-center justify-center text-7xl font-bold ${isRecording?'bg-red-600 animate-pulse scale-110':'bg-green-600'}`}>{isRecording?'Stop':'Rec'}</button>
: previewVideo? <div className="w-full max-w-sm"><video src={previewVideo.url} controls className="w-full rounded-2xl shadow-2xl"/> <div className="flex gap-4 mt-8"> <button onClick={cancelRecording} className="flex-1 py-5 bg-red-600 rounded-xl"><Trash2 className="mx-auto"/></button> <button onClick={sendMessage} disabled={processing} className="flex-1 py-5 bg-green-600 rounded-xl font-bold text-xl">{processing?<Loader2 className="mx-auto animate-spin"/>:<Send className="mx-auto"/>} Send</button> </div></div>
: <button onClick={generatePreview} className="flex-1 py-5 bg-green-600 rounded-xl text-xl font-bold">Convert to Robot Video</button>
} </div>
);
}

// ==================== Sent ====================
if(view==='sent'){
return ( <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 text-center"> <CheckCircle className="w-32 h-32 text-green-500 mb-8"/> <h1 className="text-5xl font-bold mb-6">VoxCast Sent!</h1> <p className="text-xl text-gray-400 mb-12">{voxKey} will receive it</p>
<button onClick={()=>{cancelRecording();setView('send');}} className="px-12 py-6 bg-green-600 rounded-xl text-2xl">Send Another</button> </div>
);
}

// ==================== Inbox ====================
if(view==='inbox' && voxKey){
return ( <div className="min-h-screen bg-black text-white font-mono p-6"> <div className="flex items-center justify-between mb-8"> <h1 className="text-4xl">Your VoxKey Inbox ({messages.length})</h1>
<button onClick={()=>{auth.signOut();setVoxKey(null);setView('landing');}}><LogOut className="w-8 h-8"/></button> </div>
{messages.length===0?<p className="text-center text-gray-500 text-2xl mt-32">No VoxCasts yet</p>:<div className="space-y-8">{messages.map(m=><MessageCard key={m.id} message={m} voxKey={voxKey}/>)}</div>} </div>
);
}

return null;
}

// ==================== MessageCard ====================
function MessageCard({ message, voxKey }){
const [videoUrl,setVideoUrl]=useState('');

useEffect(()=>{let mounted=true;base64ToBlob(message.videoBase64).then(blob=>{if(mounted)setVideoUrl(URL.createObjectURL(blob));});return()=>{mounted=false;videoUrl&&URL.revokeObjectURL(videoUrl);};},[message.videoBase64]);

const share=async()=>{const blob=await base64ToBlob(message.videoBase64);const file=new File([blob],'voxcast.webm',{type:blob.type});if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file]});}else{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='voxcast.webm';a.click();}};

return ( <div className="bg-gray-900 rounded-2xl overflow-hidden border border-green-900">
{videoUrl?<video src={videoUrl} controls className="w-full aspect-[9/16]"/>:<div className="w-full aspect-[9/16] bg-black flex items-center justify-center"><Loader2 className="w-16 h-16 animate-spin text-green-500"/></div>} <div className="p-5 space-y-4"> <p className="text-sm text-gray-400">{new Date(message.timestamp).toLocaleString()}</p> <button onClick={share} className="w-full py-4 bg-green-600 rounded-xl font-bold">Share</button>
<button onClick={()=>{msgDB.delete(voxKey,message.id);window.location.reload();}} className="w-full py-4 bg-red-900 rounded-xl"><Trash2 className="mx-auto"/></button> </div> </div>
);
}
