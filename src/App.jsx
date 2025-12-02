import React, { useState, useEffect, useRef } from 'react';
import { Mic, Play, Send, Check, Inbox, Share2, LogOut, User, Sparkles, Square, Trash2, Film, Loader2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ghlnenmfwlpwlqdrbean.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdobG5lbm1md2xwd2xxZHJiZWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MTE0MDQsImV4cCI6MjA3OTk4NzQwNH0.rNILUdI035c4wl4kFkZFP4OcIM_t7bNMqktKm25d5Gg';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function AnonymousVoiceApp() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authView, setAuthView] = useState('landing');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [recipientUsername, setRecipientUsername] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [messages, setMessages] = useState([]);
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(null);
  const [error, setError] = useState('');
  const [recordingTime, setRecordingTime] = useState(0);

  // Status system
  const [status, setStatus] = useState(''); // idle, recording, transcribing, generating, sent
  const [statusMessage, setStatusMessage] = useState('');

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sendTo = params.get('send_to');
    if (sendTo) {
      setRecipientUsername(sendTo);
      setAuthView('');
    } else {
      const savedUser = localStorage.getItem('anon-voice-user');
      if (savedUser) {
        try {
          const user = JSON.parse(savedUser);
          setCurrentUser(user);
          fetchMessages(user.username);
          setAuthView('');
        } catch (e) {
          localStorage.removeItem('anon-voice-user');
        }
      }
    }
  }, []);

  const fetchMessages = async (user) => {
    try {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('username', user)
        .order('created_at', { ascending: false });
      setMessages(data || []);
    } catch (err) {
      console.error('Fetch error:', err);
    }
  };

  // AUTH HANDLERS (unchanged)
  const handleSignup = async () => { /* ... same as before ... */ };
  const handleLogin = async () => { /* ... same as before ... */ };
  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('anon-voice-user');
    setMessages([]);
    setAuthView('landing');
    setRecipientUsername('');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      setStatus('recording');
      setStatusMessage('Recording...');

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (e) => {
          const text = Array.from(e.results).map(r => r[0].transcript).join('');
          setTranscript(text);
        };
        recognition.start();
        recognitionRef.current = recognition;
      }
    } catch (err) {
      alert('Microphone access denied.');
    }
  };

  const stopRecording = async () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recognitionRef.current) recognitionRef.current.stop();
      if (timerRef.current) clearInterval(timerRef.current);

      setStatus('transcribing');
      setStatusMessage('Transcribing voice...');

      setTimeout(async () => {
        if (audioChunksRef.current.length > 0) {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const text = await transcribeAudioWithAssemblyAI(blob);
          if (text) setTranscript(text);

          // AUTO GENERATE VIDEO + SEND
          await sendAndGenerateVideo(blob, text || '[No text]');
        }
      }, 300);
    }
  };

  const transcribeAudioWithAssemblyAI = async (audioBlob) => {
    try {
      const ASSEMBLY_AI_API_KEY = 'e923129f7dec495081e757c6fe82ea8b';
      const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: { 'authorization': ASSEMBLY_AI_API_KEY },
        body: audioBlob,
      });
      const { upload_url } = await uploadRes.json();

      const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: { 'authorization': ASSEMBLY_AI_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ audio_url: upload_url }),
      });
      const { id } = await transcriptRes.json();

      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const res = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
          headers: { 'authorization': ASSEMBLY_AI_API_KEY }
        });
        const result = await res.json();
        if (result.status === 'completed') return result.text;
        if (result.status === 'error') break;
      }
      return null;
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  // AUTO GENERATE VIDEO + SEND
  const sendAndGenerateVideo = async (audioBlob, text) => {
    setStatus('generating');
    setStatusMessage('Generating your avatar video...');

    // Upload audio
    const audioFileName = `voice-${Date.now()}.webm`;
    await supabase.storage.from('voices').upload(audioFileName, audioBlob, { contentType: 'audio/webm' });
    const { data: { publicUrl: audioUrl } } = supabase.storage.from('voices').getPublicUrl(audioFileName);

    // Generate video
    const videoBlob = await generateAvatarVideoBlob(audioBlob);
    const videoFileName = `avatar-${Date.now()}.webm`;
    await supabase.storage.from('voices').upload(videoFileName, videoBlob, { contentType: 'video/webm' });
    const { data: { publicUrl: videoUrl } } = supabase.storage.from('voices').getPublicUrl(videoFileName);

    // Save message
    const { error } = await supabase.from('messages').insert({
      username: recipientUsername.trim(),
      text: text,
      audio_url: audioUrl,
      video_url: videoUrl,
    });

    if (!error) {
      setStatus('sent');
      setStatusMessage('Sent with video!');
      setTimeout(() => {
        setStatus('idle');
        setStatusMessage('');
        setAudioBlob(null);
        setAudioUrl(null);
        setTranscript('');
        setRecordingTime(0);
        if (currentUser && recipientUsername === currentUser.username) {
          fetchMessages(currentUser.username);
        }
      }, 2000);
    }
  };

  // GENERATE VIDEO BLOB (100% WORKING WITH SOUND)
  const generateAvatarVideoBlob = async (audioBlob) => {
    return new Promise((resolve) => {
      const audioElement = document.createElement('audio');
      audioElement.src = URL.createObjectURL(audioBlob);

      audioElement.onloadedmetadata = () => {
        const duration = audioElement.duration || 10;
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');
        const videoStream = canvas.captureStream(30);

        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaElementSource(audioElement);
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(dest);

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const combinedStream = new MediaStream([
          ...videoStream.getVideoTracks(),
          ...dest.stream.getAudioTracks()
        ]);

        const recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm;codecs=vp8,opus' });
        const chunks = [];

        recorder.ondataavailable = e => e.data.size > 0 && chunks.push(e.data);
        recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));

        recorder.start(100);

        setTimeout(() => {
          audioElement.play();
          let frame = 0;
          const animate = () => {
            analyser.getByteFrequencyData(dataArray);
            const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
            const intensity = Math.min(avg / 60, 1);

            const grad = ctx.createLinearGradient(0, 0, 400, 400);
            grad.addColorStop(0, '#667eea');
            grad.addColorStop(1, '#764ba2');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 400, 400);

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(100, 100, 200, 200);

            const blink = Math.floor(frame / 15) % 20 === 0;
            const eyeH = blink ? 5 : 20 + intensity * 10;
            ctx.fillStyle = '#667eea';
            ctx.fillRect(130, 150, 30, eyeH);
            ctx.fillRect(240, 150, 30, eyeH);

            if (avg > 15) {
              const w = 80 + intensity * 60;
              const h = 10 + intensity * 50;
              ctx.fillRect(200 - w/2, 230, w, h);
            } else {
              ctx.fillRect(160, 240, 80, 8);
            }

            frame++;
            if (frame < duration * 30 && !audioElement.ended) {
              requestAnimationFrame(animate);
            } else {
              setTimeout(() => recorder.stop(), 500);
            }
          };
          animate();
        }, 250);
      };
    });
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  const cancelRecording = () => {
    if (isRecording) stopRecording();
    setAudioBlob(null);
    setAudioUrl(null);
    setTranscript('');
    setRecordingTime(0);
    setStatus('idle');
    setStatusMessage('');
  };

  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const playRobotic = (text, id) => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.7; u.pitch = 0.3; u.volume = 0.9;
    u.onstart = () => setIsPlaying(id);
    u.onend = () => setIsPlaying(null);
    window.speechSynthesis.speak(u);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}?send_to=${currentUser?.username}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // RENDER
  if (!currentUser && authView === 'landing' && !recipientUsername) {
    return (/* ... same landing page ... */);
  
  if (recipientUsername && !currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-3xl shadow-2xl p-10">
            <div className="text-center mb-8">
              <h1 className="text-5xl font-black bg-gradient-to-r from-indigo-600 to-pink-600 bg-clip-text text-transparent">
                Send to @{recipientUsername}
              </h1>
            </div>

            {/* STATUS BAR */}
            {status !== 'idle' && (
              <div className="mb-8 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-2xl p-6 text-center">
                <div className="flex items-center justify-center gap-3">
                  {status === 'recording' && <Mic className="w-6 h-6 animate-pulse" />}
                  {status === 'transcribing' && <Loader2 className="w-6 h-6 animate-spin" />}
                  {status === 'generating' && <Film className="w-6 h-6 animate-pulse" />}
                  {status === 'sent' && <Check className="w-6 h-6" />}
                  <span className="text-xl font-bold">{statusMessage}</span>
                </div>
                {status === 'recording' && <div className="text-4xl font-bold mt-4">{formatTime(recordingTime)}</div>}
              </div>
            )}

            {!audioBlob ? (
              <div className="text-center">
                <button
                  onClick={toggleRecording}
                  disabled={status !== 'idle' && status !== 'recording'}
                  className={`w-64 h-64 rounded-full shadow-2xl mx-auto flex items-center justify-center transition-all ${
                    isRecording ? 'bg-red-500 animate-pulse' : 'bg-gradient-to-br from-indigo-500 to-purple-500 hover:scale-105'
                  }`}
                >
                  {isRecording ? <Square className="w-32 h-32 text-white" /> : <Mic className="w-32 h-32 text-white" />}
                </button>
                {!isRecording && status === 'idle' && <p className="mt-8 text-2xl text-gray-700">Tap to record</p>}
              </div>
            ) : (
              <div className="text-center">
                <div className="bg-green-100 border-4 border-green-500 rounded-3xl p-8">
                  <Check className="w-24 h-24 text-green-600 mx-auto mb-4" />
                  <p className="text-2xl font-bold text-green-800">Message sent with video!</p>
                </div>
                <button onClick={cancelRecording} className="mt-6 text-purple-600 font-bold">Record Another</button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // INBOX (unchanged except video now appears immediately)
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-8 text-white">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <User className="w-8 h-8" />
                <h1 className="text-4xl font-bold">@{currentUser.username}</h1>
              </div>
              <div className="flex gap-3">
                <button onClick={copyLink} className="bg-white/20 px-5 py-3 rounded-xl flex items-center gap-2">
                  {copied ? <Check /> : <Share2 />} Share
                </button>
                <button onClick={handleLogout} className="bg-white/20 px-5 py-3 rounded-xl"><LogOut /></button>
              </div>
            </div>
          </div>

          <div className="p-10">
            <h2 className="text-3xl font-bold mb-8">Your Inbox</h2>
            {messages.length === 0 ? (
              <div className="text-center py-20 bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl">
                <Inbox className="w-24 h-24 text-gray-300 mx-auto mb-6" />
                <p className="text-2xl text-gray-600">No messages yet</p>
                <p className="text-purple-600 font-mono mt-4 break-all">
                  {window.location.origin}?send_to={currentUser.username}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map(msg => (
                  <div key={msg.id} className="bg-gradient-to-br from-indigo-50 to-pink-50 rounded-3xl p-8 shadow-lg">
                    {msg.video_url ? (
                      <video controls src={msg.video_url} className="w-full rounded-xl shadow-md mb-4" />
                    ) : (
                      <div className="bg-white rounded-xl p-8 text-center">
                        <Mic className="w-16 h-16 text-purple-600 mx-auto" />
                        <p className="text-gray-600 mt-4">Voice message (video generating...)</p>
                      </div>
                    )}
                    <div className="flex justify-between items-center mt-4">
                      <span className="text-sm text-gray-500">{new Date(msg.created_at).toLocaleString()}</span>
                      {msg.text && (
                        <button onClick={() => playRobotic(msg.text, msg.id)} className="bg-purple-600 text-white px-6 py-3 rounded-xl flex items-center gap-2">
                          <Play /> Play Robotic
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}import React, { useState, useEffect, useRef } from 'react';
import { Mic, Play, Send, Check, Inbox, Share2, LogOut, User, Sparkles, Square, Trash2, Film, Loader2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ghlnenmfwlpwlqdrbean.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdobG5lbm1md2xwd2xxZHJiZWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MTE0MDQsImV4cCI6MjA3OTk4NzQwNH0.rNILUdI035c4wl4kFkZFP4OcIM_t7bNMqktKm25d5Gg';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function AnonymousVoiceApp() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authView, setAuthView] = useState('landing');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [recipientUsername, setRecipientUsername] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [messages, setMessages] = useState([]);
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(null);
  const [error, setError] = useState('');
  const [recordingTime, setRecordingTime] = useState(0);

  // Status system
  const [status, setStatus] = useState(''); // idle, recording, transcribing, generating, sent
  const [statusMessage, setStatusMessage] = useState('');

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sendTo = params.get('send_to');
    if (sendTo) {
      setRecipientUsername(sendTo);
      setAuthView('');
    } else {
      const savedUser = localStorage.getItem('anon-voice-user');
      if (savedUser) {
        try {
          const user = JSON.parse(savedUser);
          setCurrentUser(user);
          fetchMessages(user.username);
          setAuthView('');
        } catch (e) {
          localStorage.removeItem('anon-voice-user');
        }
      }
    }
  }, []);

  const fetchMessages = async (user) => {
    try {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('username', user)
        .order('created_at', { ascending: false });
      setMessages(data || []);
    } catch (err) {
      console.error('Fetch error:', err);
    }
  };

  // AUTH HANDLERS (unchanged)
  const handleSignup = async () => { /* ... same as before ... */ };
  const handleLogin = async () => { /* ... same as before ... */ };
  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('anon-voice-user');
    setMessages([]);
    setAuthView('landing');
    setRecipientUsername('');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      setStatus('recording');
      setStatusMessage('Recording...');

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (e) => {
          const text = Array.from(e.results).map(r => r[0].transcript).join('');
          setTranscript(text);
        };
        recognition.start();
        recognitionRef.current = recognition;
      }
    } catch (err) {
      alert('Microphone access denied.');
    }
  };

  const stopRecording = async () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recognitionRef.current) recognitionRef.current.stop();
      if (timerRef.current) clearInterval(timerRef.current);

      setStatus('transcribing');
      setStatusMessage('Transcribing voice...');

      setTimeout(async () => {
        if (audioChunksRef.current.length > 0) {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const text = await transcribeAudioWithAssemblyAI(blob);
          if (text) setTranscript(text);

          // AUTO GENERATE VIDEO + SEND
          await sendAndGenerateVideo(blob, text || '[No text]');
        }
      }, 300);
    }
  };

  const transcribeAudioWithAssemblyAI = async (audioBlob) => {
    try {
      const ASSEMBLY_AI_API_KEY = 'e923129f7dec495081e757c6fe82ea8b';
      const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: { 'authorization': ASSEMBLY_AI_API_KEY },
        body: audioBlob,
      });
      const { upload_url } = await uploadRes.json();

      const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: { 'authorization': ASSEMBLY_AI_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ audio_url: upload_url }),
      });
      const { id } = await transcriptRes.json();

      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const res = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
          headers: { 'authorization': ASSEMBLY_AI_API_KEY }
        });
        const result = await res.json();
        if (result.status === 'completed') return result.text;
        if (result.status === 'error') break;
      }
      return null;
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  // AUTO GENERATE VIDEO + SEND
  const sendAndGenerateVideo = async (audioBlob, text) => {
    setStatus('generating');
    setStatusMessage('Generating your avatar video...');

    // Upload audio
    const audioFileName = `voice-${Date.now()}.webm`;
    await supabase.storage.from('voices').upload(audioFileName, audioBlob, { contentType: 'audio/webm' });
    const { data: { publicUrl: audioUrl } } = supabase.storage.from('voices').getPublicUrl(audioFileName);

    // Generate video
    const videoBlob = await generateAvatarVideoBlob(audioBlob);
    const videoFileName = `avatar-${Date.now()}.webm`;
    await supabase.storage.from('voices').upload(videoFileName, videoBlob, { contentType: 'video/webm' });
    const { data: { publicUrl: videoUrl } } = supabase.storage.from('voices').getPublicUrl(videoFileName);

    // Save message
    const { error } = await supabase.from('messages').insert({
      username: recipientUsername.trim(),
      text: text,
      audio_url: audioUrl,
      video_url: videoUrl,
    });

    if (!error) {
      setStatus('sent');
      setStatusMessage('Sent with video!');
      setTimeout(() => {
        setStatus('idle');
        setStatusMessage('');
        setAudioBlob(null);
        setAudioUrl(null);
        setTranscript('');
        setRecordingTime(0);
        if (currentUser && recipientUsername === currentUser.username) {
          fetchMessages(currentUser.username);
        }
      }, 2000);
    }
  };

  // GENERATE VIDEO BLOB (100% WORKING WITH SOUND)
  const generateAvatarVideoBlob = async (audioBlob) => {
    return new Promise((resolve) => {
      const audioElement = document.createElement('audio');
      audioElement.src = URL.createObjectURL(audioBlob);

      audioElement.onloadedmetadata = () => {
        const duration = audioElement.duration || 10;
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');
        const videoStream = canvas.captureStream(30);

        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaElementSource(audioElement);
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(dest);

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const combinedStream = new MediaStream([
          ...videoStream.getVideoTracks(),
          ...dest.stream.getAudioTracks()
        ]);

        const recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm;codecs=vp8,opus' });
        const chunks = [];

        recorder.ondataavailable = e => e.data.size > 0 && chunks.push(e.data);
        recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));

        recorder.start(100);

        setTimeout(() => {
          audioElement.play();
          let frame = 0;
          const animate = () => {
            analyser.getByteFrequencyData(dataArray);
            const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
            const intensity = Math.min(avg / 60, 1);

            const grad = ctx.createLinearGradient(0, 0, 400, 400);
            grad.addColorStop(0, '#667eea');
            grad.addColorStop(1, '#764ba2');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 400, 400);

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(100, 100, 200, 200);

            const blink = Math.floor(frame / 15) % 20 === 0;
            const eyeH = blink ? 5 : 20 + intensity * 10;
            ctx.fillStyle = '#667eea';
            ctx.fillRect(130, 150, 30, eyeH);
            ctx.fillRect(240, 150, 30, eyeH);

            if (avg > 15) {
              const w = 80 + intensity * 60;
              const h = 10 + intensity * 50;
              ctx.fillRect(200 - w/2, 230, w, h);
            } else {
              ctx.fillRect(160, 240, 80, 8);
            }

            frame++;
            if (frame < duration * 30 && !audioElement.ended) {
              requestAnimationFrame(animate);
            } else {
              setTimeout(() => recorder.stop(), 500);
            }
          };
          animate();
        }, 250);
      };
    });
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  const cancelRecording = () => {
    if (isRecording) stopRecording();
    setAudioBlob(null);
    setAudioUrl(null);
    setTranscript('');
    setRecordingTime(0);
    setStatus('idle');
    setStatusMessage('');
  };

  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const playRobotic = (text, id) => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.7; u.pitch = 0.3; u.volume = 0.9;
    u.onstart = () => setIsPlaying(id);
    u.onend = () => setIsPlaying(null);
    window.speechSynthesis.speak(u);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}?send_to=${currentUser?.username}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // RENDER
  if (!currentUser && authView === 'landing' && !recipientUsername) {
    return (/* ... same landing page ... */);
  }

  if (recipientUsername && !currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-3xl shadow-2xl p-10">
            <div className="text-center mb-8">
              <h1 className="text-5xl font-black bg-gradient-to-r from-indigo-600 to-pink-600 bg-clip-text text-transparent">
                Send to @{recipientUsername}
              </h1>
            </div>

            {/* STATUS BAR */}
            {status !== 'idle' && (
              <div className="mb-8 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-2xl p-6 text-center">
                <div className="flex items-center justify-center gap-3">
                  {status === 'recording' && <Mic className="w-6 h-6 animate-pulse" />}
                  {status === 'transcribing' && <Loader2 className="w-6 h-6 animate-spin" />}
                  {status === 'generating' && <Film className="w-6 h-6 animate-pulse" />}
                  {status === 'sent' && <Check className="w-6 h-6" />}
                  <span className="text-xl font-bold">{statusMessage}</span>
                </div>
                {status === 'recording' && <div className="text-4xl font-bold mt-4">{formatTime(recordingTime)}</div>}
              </div>
            )}

            {!audioBlob ? (
              <div className="text-center">
                <button
                  onClick={toggleRecording}
                  disabled={status !== 'idle' && status !== 'recording'}
                  className={`w-64 h-64 rounded-full shadow-2xl mx-auto flex items-center justify-center transition-all ${
                    isRecording ? 'bg-red-500 animate-pulse' : 'bg-gradient-to-br from-indigo-500 to-purple-500 hover:scale-105'
                  }`}
                >
                  {isRecording ? <Square className="w-32 h-32 text-white" /> : <Mic className="w-32 h-32 text-white" />}
                </button>
                {!isRecording && status === 'idle' && <p className="mt-8 text-2xl text-gray-700">Tap to record</p>}
              </div>
            ) : (
              <div className="text-center">
                <div className="bg-green-100 border-4 border-green-500 rounded-3xl p-8">
                  <Check className="w-24 h-24 text-green-600 mx-auto mb-4" />
                  <p className="text-2xl font-bold text-green-800">Message sent with video!</p>
                </div>
                <button onClick={cancelRecording} className="mt-6 text-purple-600 font-bold">Record Another</button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // INBOX (unchanged except video now appears immediately)
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-8 text-white">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <User className="w-8 h-8" />
                <h1 className="text-4xl font-bold">@{currentUser.username}</h1>
              </div>
              <div className="flex gap-3">
                <button onClick={copyLink} className="bg-white/20 px-5 py-3 rounded-xl flex items-center gap-2">
                  {copied ? <Check /> : <Share2 />} Share
                </button>
                <button onClick={handleLogout} className="bg-white/20 px-5 py-3 rounded-xl"><LogOut /></button>
              </div>
            </div>
          </div>

          <div className="p-10">
            <h2 className="text-3xl font-bold mb-8">Your Inbox</h2>
            {messages.length === 0 ? (
              <div className="text-center py-20 bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl">
                <Inbox className="w-24 h-24 text-gray-300 mx-auto mb-6" />
                <p className="text-2xl text-gray-600">No messages yet</p>
                <p className="text-purple-600 font-mono mt-4 break-all">
                  {window.location.origin}?send_to={currentUser.username}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map(msg => (
                  <div key={msg.id} className="bg-gradient-to-br from-indigo-50 to-pink-50 rounded-3xl p-8 shadow-lg">
                    {msg.video_url ? (
                      <video controls src={msg.video_url} className="w-full rounded-xl shadow-md mb-4" />
                    ) : (
                      <div className="bg-white rounded-xl p-8 text-center">
                        <Mic className="w-16 h-16 text-purple-600 mx-auto" />
                        <p className="text-gray-600 mt-4">Voice message (video generating...)</p>
                      </div>
                    )}
                    <div className="flex justify-between items-center mt-4">
                      <span className="text-sm text-gray-500">{new Date(msg.created_at).toLocaleString()}</span>
                      {msg.text && (
                        <button onClick={() => playRobotic(msg.text, msg.id)} className="bg-purple-600 text-white px-6 py-3 rounded-xl flex items-center gap-2">
                          <Play /> Play Robotic
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}import React, { useState, useEffect, useRef } from 'react';
import { Mic, Play, Send, Check, Inbox, Share2, LogOut, User, Sparkles, Square, Trash2, Film, Loader2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ghlnenmfwlpwlqdrbean.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdobG5lbm1md2xwd2xxZHJiZWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MTE0MDQsImV4cCI6MjA3OTk4NzQwNH0.rNILUdI035c4wl4kFkZFP4OcIM_t7bNMqktKm25d5Gg';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function AnonymousVoiceApp() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authView, setAuthView] = useState('landing');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [recipientUsername, setRecipientUsername] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [messages, setMessages] = useState([]);
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(null);
  const [error, setError] = useState('');
  const [recordingTime, setRecordingTime] = useState(0);

  // Status system
  const [status, setStatus] = useState(''); // idle, recording, transcribing, generating, sent
  const [statusMessage, setStatusMessage] = useState('');

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sendTo = params.get('send_to');
    if (sendTo) {
      setRecipientUsername(sendTo);
      setAuthView('');
    } else {
      const savedUser = localStorage.getItem('anon-voice-user');
      if (savedUser) {
        try {
          const user = JSON.parse(savedUser);
          setCurrentUser(user);
          fetchMessages(user.username);
          setAuthView('');
        } catch (e) {
          localStorage.removeItem('anon-voice-user');
        }
      }
    }
  }, []);

  const fetchMessages = async (user) => {
    try {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('username', user)
        .order('created_at', { ascending: false });
      setMessages(data || []);
    } catch (err) {
      console.error('Fetch error:', err);
    }
  };

  // AUTH HANDLERS (unchanged)
  const handleSignup = async () => { /* ... same as before ... */ };
  const handleLogin = async () => { /* ... same as before ... */ };
  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('anon-voice-user');
    setMessages([]);
    setAuthView('landing');
    setRecipientUsername('');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      setStatus('recording');
      setStatusMessage('Recording...');

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (e) => {
          const text = Array.from(e.results).map(r => r[0].transcript).join('');
          setTranscript(text);
        };
        recognition.start();
        recognitionRef.current = recognition;
      }
    } catch (err) {
      alert('Microphone access denied.');
    }
  };

  const stopRecording = async () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recognitionRef.current) recognitionRef.current.stop();
      if (timerRef.current) clearInterval(timerRef.current);

      setStatus('transcribing');
      setStatusMessage('Transcribing voice...');

      setTimeout(async () => {
        if (audioChunksRef.current.length > 0) {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const text = await transcribeAudioWithAssemblyAI(blob);
          if (text) setTranscript(text);

          // AUTO GENERATE VIDEO + SEND
          await sendAndGenerateVideo(blob, text || '[No text]');
        }
      }, 300);
    }
  };

  const transcribeAudioWithAssemblyAI = async (audioBlob) => {
    try {
      const ASSEMBLY_AI_API_KEY = 'e923129f7dec495081e757c6fe82ea8b';
      const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: { 'authorization': ASSEMBLY_AI_API_KEY },
        body: audioBlob,
      });
      const { upload_url } = await uploadRes.json();

      const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: { 'authorization': ASSEMBLY_AI_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ audio_url: upload_url }),
      });
      const { id } = await transcriptRes.json();

      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const res = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
          headers: { 'authorization': ASSEMBLY_AI_API_KEY }
        });
        const result = await res.json();
        if (result.status === 'completed') return result.text;
        if (result.status === 'error') break;
      }
      return null;
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  // AUTO GENERATE VIDEO + SEND
  const sendAndGenerateVideo = async (audioBlob, text) => {
    setStatus('generating');
    setStatusMessage('Generating your avatar video...');

    // Upload audio
    const audioFileName = `voice-${Date.now()}.webm`;
    await supabase.storage.from('voices').upload(audioFileName, audioBlob, { contentType: 'audio/webm' });
    const { data: { publicUrl: audioUrl } } = supabase.storage.from('voices').getPublicUrl(audioFileName);

    // Generate video
    const videoBlob = await generateAvatarVideoBlob(audioBlob);
    const videoFileName = `avatar-${Date.now()}.webm`;
    await supabase.storage.from('voices').upload(videoFileName, videoBlob, { contentType: 'video/webm' });
    const { data: { publicUrl: videoUrl } } = supabase.storage.from('voices').getPublicUrl(videoFileName);

    // Save message
    const { error } = await supabase.from('messages').insert({
      username: recipientUsername.trim(),
      text: text,
      audio_url: audioUrl,
      video_url: videoUrl,
    });

    if (!error) {
      setStatus('sent');
      setStatusMessage('Sent with video!');
      setTimeout(() => {
        setStatus('idle');
        setStatusMessage('');
        setAudioBlob(null);
        setAudioUrl(null);
        setTranscript('');
        setRecordingTime(0);
        if (currentUser && recipientUsername === currentUser.username) {
          fetchMessages(currentUser.username);
        }
      }, 2000);
    }
  };

  // GENERATE VIDEO BLOB (100% WORKING WITH SOUND)
  const generateAvatarVideoBlob = async (audioBlob) => {
    return new Promise((resolve) => {
      const audioElement = document.createElement('audio');
      audioElement.src = URL.createObjectURL(audioBlob);

      audioElement.onloadedmetadata = () => {
        const duration = audioElement.duration || 10;
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');
        const videoStream = canvas.captureStream(30);

        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaElementSource(audioElement);
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(dest);

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const combinedStream = new MediaStream([
          ...videoStream.getVideoTracks(),
          ...dest.stream.getAudioTracks()
        ]);

        const recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm;codecs=vp8,opus' });
        const chunks = [];

        recorder.ondataavailable = e => e.data.size > 0 && chunks.push(e.data);
        recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));

        recorder.start(100);

        setTimeout(() => {
          audioElement.play();
          let frame = 0;
          const animate = () => {
            analyser.getByteFrequencyData(dataArray);
            const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
            const intensity = Math.min(avg / 60, 1);

            const grad = ctx.createLinearGradient(0, 0, 400, 400);
            grad.addColorStop(0, '#667eea');
            grad.addColorStop(1, '#764ba2');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 400, 400);

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(100, 100, 200, 200);

            const blink = Math.floor(frame / 15) % 20 === 0;
            const eyeH = blink ? 5 : 20 + intensity * 10;
            ctx.fillStyle = '#667eea';
            ctx.fillRect(130, 150, 30, eyeH);
            ctx.fillRect(240, 150, 30, eyeH);

            if (avg > 15) {
              const w = 80 + intensity * 60;
              const h = 10 + intensity * 50;
              ctx.fillRect(200 - w/2, 230, w, h);
            } else {
              ctx.fillRect(160, 240, 80, 8);
            }

            frame++;
            if (frame < duration * 30 && !audioElement.ended) {
              requestAnimationFrame(animate);
            } else {
              setTimeout(() => recorder.stop(), 500);
            }
          };
          animate();
        }, 250);
      };
    });
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  const cancelRecording = () => {
    if (isRecording) stopRecording();
    setAudioBlob(null);
    setAudioUrl(null);
    setTranscript('');
    setRecordingTime(0);
    setStatus('idle');
    setStatusMessage('');
  };

  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const playRobotic = (text, id) => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.7; u.pitch = 0.3; u.volume = 0.9;
    u.onstart = () => setIsPlaying(id);
    u.onend = () => setIsPlaying(null);
    window.speechSynthesis.speak(u);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}?send_to=${currentUser?.username}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // RENDER
  if (!currentUser && authView === 'landing' && !recipientUsername) {
    return (/* ... same landing page ... */);
  }

  if (recipientUsername && !currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-3xl shadow-2xl p-10">
            <div className="text-center mb-8">
              <h1 className="text-5xl font-black bg-gradient-to-r from-indigo-600 to-pink-600 bg-clip-text text-transparent">
                Send to @{recipientUsername}
              </h1>
            </div>

            {/* STATUS BAR */}
            {status !== 'idle' && (
              <div className="mb-8 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-2xl p-6 text-center">
                <div className="flex items-center justify-center gap-3">
                  {status === 'recording' && <Mic className="w-6 h-6 animate-pulse" />}
                  {status === 'transcribing' && <Loader2 className="w-6 h-6 animate-spin" />}
                  {status === 'generating' && <Film className="w-6 h-6 animate-pulse" />}
                  {status === 'sent' && <Check className="w-6 h-6" />}
                  <span className="text-xl font-bold">{statusMessage}</span>
                </div>
                {status === 'recording' && <div className="text-4xl font-bold mt-4">{formatTime(recordingTime)}</div>}
              </div>
            )}

            {!audioBlob ? (
              <div className="text-center">
                <button
                  onClick={toggleRecording}
                  disabled={status !== 'idle' && status !== 'recording'}
                  className={`w-64 h-64 rounded-full shadow-2xl mx-auto flex items-center justify-center transition-all ${
                    isRecording ? 'bg-red-500 animate-pulse' : 'bg-gradient-to-br from-indigo-500 to-purple-500 hover:scale-105'
                  }`}
                >
                  {isRecording ? <Square className="w-32 h-32 text-white" /> : <Mic className="w-32 h-32 text-white" />}
                </button>
                {!isRecording && status === 'idle' && <p className="mt-8 text-2xl text-gray-700">Tap to record</p>}
              </div>
            ) : (
              <div className="text-center">
                <div className="bg-green-100 border-4 border-green-500 rounded-3xl p-8">
                  <Check className="w-24 h-24 text-green-600 mx-auto mb-4" />
                  <p className="text-2xl font-bold text-green-800">Message sent with video!</p>
                </div>
                <button onClick={cancelRecording} className="mt-6 text-purple-600 font-bold">Record Another</button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // INBOX (unchanged except video now appears immediately)
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-8 text-white">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <User className="w-8 h-8" />
                <h1 className="text-4xl font-bold">@{currentUser.username}</h1>
              </div>
              <div className="flex gap-3">
                <button onClick={copyLink} className="bg-white/20 px-5 py-3 rounded-xl flex items-center gap-2">
                  {copied ? <Check /> : <Share2 />} Share
                </button>
                <button onClick={handleLogout} className="bg-white/20 px-5 py-3 rounded-xl"><LogOut /></button>
              </div>
            </div>
          </div>

          <div className="p-10">
            <h2 className="text-3xl font-bold mb-8">Your Inbox</h2>
            {messages.length === 0 ? (
              <div className="text-center py-20 bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl">
                <Inbox className="w-24 h-24 text-gray-300 mx-auto mb-6" />
                <p className="text-2xl text-gray-600">No messages yet</p>
                <p className="text-purple-600 font-mono mt-4 break-all">
                  {window.location.origin}?send_to={currentUser.username}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map(msg => (
                  <div key={msg.id} className="bg-gradient-to-br from-indigo-50 to-pink-50 rounded-3xl p-8 shadow-lg">
                    {msg.video_url ? (
                      <video controls src={msg.video_url} className="w-full rounded-xl shadow-md mb-4" />
                    ) : (
                      <div className="bg-white rounded-xl p-8 text-center">
                        <Mic className="w-16 h-16 text-purple-600 mx-auto" />
                        <p className="text-gray-600 mt-4">Voice message (video generating...)</p>
                      </div>
                    )}
                    <div className="flex justify-between items-center mt-4">
                      <span className="text-sm text-gray-500">{new Date(msg.created_at).toLocaleString()}</span>
                      {msg.text && (
                        <button onClick={() => playRobotic(msg.text, msg.id)} className="bg-purple-600 text-white px-6 py-3 rounded-xl flex items-center gap-2">
                          <Play /> Play Robotic
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}import React, { useState, useEffect, useRef } from 'react';
import { Mic, Play, Send, Check, Inbox, Share2, LogOut, User, Sparkles, Square, Trash2, Film, Loader2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ghlnenmfwlpwlqdrbean.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdobG5lbm1md2xwd2xxZHJiZWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MTE0MDQsImV4cCI6MjA3OTk4NzQwNH0.rNILUdI035c4wl4kFkZFP4OcIM_t7bNMqktKm25d5Gg';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function AnonymousVoiceApp() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authView, setAuthView] = useState('landing');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [recipientUsername, setRecipientUsername] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [messages, setMessages] = useState([]);
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(null);
  const [error, setError] = useState('');
  const [recordingTime, setRecordingTime] = useState(0);

  // Status system
  const [status, setStatus] = useState(''); // idle, recording, transcribing, generating, sent
  const [statusMessage, setStatusMessage] = useState('');

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sendTo = params.get('send_to');
    if (sendTo) {
      setRecipientUsername(sendTo);
      setAuthView('');
    } else {
      const savedUser = localStorage.getItem('anon-voice-user');
      if (savedUser) {
        try {
          const user = JSON.parse(savedUser);
          setCurrentUser(user);
          fetchMessages(user.username);
          setAuthView('');
        } catch (e) {
          localStorage.removeItem('anon-voice-user');
        }
      }
    }
  }, []);

  const fetchMessages = async (user) => {
    try {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('username', user)
        .order('created_at', { ascending: false });
      setMessages(data || []);
    } catch (err) {
      console.error('Fetch error:', err);
    }
  };

  // AUTH HANDLERS (unchanged)
  const handleSignup = async () => { /* ... same as before ... */ };
  const handleLogin = async () => { /* ... same as before ... */ };
  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('anon-voice-user');
    setMessages([]);
    setAuthView('landing');
    setRecipientUsername('');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      setStatus('recording');
      setStatusMessage('Recording...');

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (e) => {
          const text = Array.from(e.results).map(r => r[0].transcript).join('');
          setTranscript(text);
        };
        recognition.start();
        recognitionRef.current = recognition;
      }
    } catch (err) {
      alert('Microphone access denied.');
    }
  };

  const stopRecording = async () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recognitionRef.current) recognitionRef.current.stop();
      if (timerRef.current) clearInterval(timerRef.current);

      setStatus('transcribing');
      setStatusMessage('Transcribing voice...');

      setTimeout(async () => {
        if (audioChunksRef.current.length > 0) {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const text = await transcribeAudioWithAssemblyAI(blob);
          if (text) setTranscript(text);

          // AUTO GENERATE VIDEO + SEND
          await sendAndGenerateVideo(blob, text || '[No text]');
        }
      }, 300);
    }
  };

  const transcribeAudioWithAssemblyAI = async (audioBlob) => {
    try {
      const ASSEMBLY_AI_API_KEY = 'e923129f7dec495081e757c6fe82ea8b';
      const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: { 'authorization': ASSEMBLY_AI_API_KEY },
        body: audioBlob,
      });
      const { upload_url } = await uploadRes.json();

      const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: { 'authorization': ASSEMBLY_AI_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ audio_url: upload_url }),
      });
      const { id } = await transcriptRes.json();

      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const res = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
          headers: { 'authorization': ASSEMBLY_AI_API_KEY }
        });
        const result = await res.json();
        if (result.status === 'completed') return result.text;
        if (result.status === 'error') break;
      }
      return null;
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  // AUTO GENERATE VIDEO + SEND
  const sendAndGenerateVideo = async (audioBlob, text) => {
    setStatus('generating');
    setStatusMessage('Generating your avatar video...');

    // Upload audio
    const audioFileName = `voice-${Date.now()}.webm`;
    await supabase.storage.from('voices').upload(audioFileName, audioBlob, { contentType: 'audio/webm' });
    const { data: { publicUrl: audioUrl } } = supabase.storage.from('voices').getPublicUrl(audioFileName);

    // Generate video
    const videoBlob = await generateAvatarVideoBlob(audioBlob);
    const videoFileName = `avatar-${Date.now()}.webm`;
    await supabase.storage.from('voices').upload(videoFileName, videoBlob, { contentType: 'video/webm' });
    const { data: { publicUrl: videoUrl } } = supabase.storage.from('voices').getPublicUrl(videoFileName);

    // Save message
    const { error } = await supabase.from('messages').insert({
      username: recipientUsername.trim(),
      text: text,
      audio_url: audioUrl,
      video_url: videoUrl,
    });

    if (!error) {
      setStatus('sent');
      setStatusMessage('Sent with video!');
      setTimeout(() => {
        setStatus('idle');
        setStatusMessage('');
        setAudioBlob(null);
        setAudioUrl(null);
        setTranscript('');
        setRecordingTime(0);
        if (currentUser && recipientUsername === currentUser.username) {
          fetchMessages(currentUser.username);
        }
      }, 2000);
    }
  };

  // GENERATE VIDEO BLOB (100% WORKING WITH SOUND)
  const generateAvatarVideoBlob = async (audioBlob) => {
    return new Promise((resolve) => {
      const audioElement = document.createElement('audio');
      audioElement.src = URL.createObjectURL(audioBlob);

      audioElement.onloadedmetadata = () => {
        const duration = audioElement.duration || 10;
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');
        const videoStream = canvas.captureStream(30);

        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaElementSource(audioElement);
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(dest);

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const combinedStream = new MediaStream([
          ...videoStream.getVideoTracks(),
          ...dest.stream.getAudioTracks()
        ]);

        const recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm;codecs=vp8,opus' });
        const chunks = [];

        recorder.ondataavailable = e => e.data.size > 0 && chunks.push(e.data);
        recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));

        recorder.start(100);

        setTimeout(() => {
          audioElement.play();
          let frame = 0;
          const animate = () => {
            analyser.getByteFrequencyData(dataArray);
            const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
            const intensity = Math.min(avg / 60, 1);

            const grad = ctx.createLinearGradient(0, 0, 400, 400);
            grad.addColorStop(0, '#667eea');
            grad.addColorStop(1, '#764ba2');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 400, 400);

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(100, 100, 200, 200);

            const blink = Math.floor(frame / 15) % 20 === 0;
            const eyeH = blink ? 5 : 20 + intensity * 10;
            ctx.fillStyle = '#667eea';
            ctx.fillRect(130, 150, 30, eyeH);
            ctx.fillRect(240, 150, 30, eyeH);

            if (avg > 15) {
              const w = 80 + intensity * 60;
              const h = 10 + intensity * 50;
              ctx.fillRect(200 - w/2, 230, w, h);
            } else {
              ctx.fillRect(160, 240, 80, 8);
            }

            frame++;
            if (frame < duration * 30 && !audioElement.ended) {
              requestAnimationFrame(animate);
            } else {
              setTimeout(() => recorder.stop(), 500);
            }
          };
          animate();
        }, 250);
      };
    });
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  const cancelRecording = () => {
    if (isRecording) stopRecording();
    setAudioBlob(null);
    setAudioUrl(null);
    setTranscript('');
    setRecordingTime(0);
    setStatus('idle');
    setStatusMessage('');
  };

  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const playRobotic = (text, id) => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.7; u.pitch = 0.3; u.volume = 0.9;
    u.onstart = () => setIsPlaying(id);
    u.onend = () => setIsPlaying(null);
    window.speechSynthesis.speak(u);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}?send_to=${currentUser?.username}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // RENDER
  if (!currentUser && authView === 'landing' && !recipientUsername) {
    return (/* ... same landing page ... */);
  }

  if (recipientUsername && !currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-3xl shadow-2xl p-10">
            <div className="text-center mb-8">
              <h1 className="text-5xl font-black bg-gradient-to-r from-indigo-600 to-pink-600 bg-clip-text text-transparent">
                Send to @{recipientUsername}
              </h1>
            </div>

            {/* STATUS BAR */}
            {status !== 'idle' && (
              <div className="mb-8 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-2xl p-6 text-center">
                <div className="flex items-center justify-center gap-3">
                  {status === 'recording' && <Mic className="w-6 h-6 animate-pulse" />}
                  {status === 'transcribing' && <Loader2 className="w-6 h-6 animate-spin" />}
                  {status === 'generating' && <Film className="w-6 h-6 animate-pulse" />}
                  {status === 'sent' && <Check className="w-6 h-6" />}
                  <span className="text-xl font-bold">{statusMessage}</span>
                </div>
                {status === 'recording' && <div className="text-4xl font-bold mt-4">{formatTime(recordingTime)}</div>}
              </div>
            )}

            {!audioBlob ? (
              <div className="text-center">
                <button
                  onClick={toggleRecording}
                  disabled={status !== 'idle' && status !== 'recording'}
                  className={`w-64 h-64 rounded-full shadow-2xl mx-auto flex items-center justify-center transition-all ${
                    isRecording ? 'bg-red-500 animate-pulse' : 'bg-gradient-to-br from-indigo-500 to-purple-500 hover:scale-105'
                  }`}
                >
                  {isRecording ? <Square className="w-32 h-32 text-white" /> : <Mic className="w-32 h-32 text-white" />}
                </button>
                {!isRecording && status === 'idle' && <p className="mt-8 text-2xl text-gray-700">Tap to record</p>}
              </div>
            ) : (
              <div className="text-center">
                <div className="bg-green-100 border-4 border-green-500 rounded-3xl p-8">
                  <Check className="w-24 h-24 text-green-600 mx-auto mb-4" />
                  <p className="text-2xl font-bold text-green-800">Message sent with video!</p>
                </div>
                <button onClick={cancelRecording} className="mt-6 text-purple-600 font-bold">Record Another</button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // INBOX (unchanged except video now appears immediately)
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-8 text-white">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <User className="w-8 h-8" />
                <h1 className="text-4xl font-bold">@{currentUser.username}</h1>
              </div>
              <div className="flex gap-3">
                <button onClick={copyLink} className="bg-white/20 px-5 py-3 rounded-xl flex items-center gap-2">
                  {copied ? <Check /> : <Share2 />} Share
                </button>
                <button onClick={handleLogout} className="bg-white/20 px-5 py-3 rounded-xl"><LogOut /></button>
              </div>
            </div>
          </div>

          <div className="p-10">
            <h2 className="text-3xl font-bold mb-8">Your Inbox</h2>
            {messages.length === 0 ? (
              <div className="text-center py-20 bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl">
                <Inbox className="w-24 h-24 text-gray-300 mx-auto mb-6" />
                <p className="text-2xl text-gray-600">No messages yet</p>
                <p className="text-purple-600 font-mono mt-4 break-all">
                  {window.location.origin}?send_to={currentUser.username}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map(msg => (
                  <div key={msg.id} className="bg-gradient-to-br from-indigo-50 to-pink-50 rounded-3xl p-8 shadow-lg">
                    {msg.video_url ? (
                      <video controls src={msg.video_url} className="w-full rounded-xl shadow-md mb-4" />
                    ) : (
                      <div className="bg-white rounded-xl p-8 text-center">
                        <Mic className="w-16 h-16 text-purple-600 mx-auto" />
                        <p className="text-gray-600 mt-4">Voice message (video generating...)</p>
                      </div>
                    )}
                    <div className="flex justify-between items-center mt-4">
                      <span className="text-sm text-gray-500">{new Date(msg.created_at).toLocaleString()}</span>
                      {msg.text && (
                        <button onClick={() => playRobotic(msg.text, msg.id)} className="bg-purple-600 text-white px-6 py-3 rounded-xl flex items-center gap-2">
                          <Play /> Play Robotic
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
