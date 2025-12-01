// src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Mic, Play, Send, Copy, Check, Inbox, Share2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// Put your own keys here
const supabaseUrl = 'https://ghlnenmfwlpwlqdrbean.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdobG5lbm1md2xwd2xxZHJiZWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MTE0MDQsImV4cCI6MjA3OTk4NzQwNH0.rNILUdI035c4wl4kFkZFP4OcIM_t7bNMqktKm25d5Gg';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function AnonymousVoiceApp() {
  const [username, setUsername] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [messages, setMessages] = useState([]);
  const [view, setView] = useState('create'); // 'create' or 'inbox'
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(null);
  const [loading, setLoading] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);

  // Load username from URL or localStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sendTo = params.get('send_to');

    if (sendTo) {
      setUsername(sendTo);
      localStorage.setItem('ngl-username', sendTo);
      fetchMessages(sendTo);
    } else {
      const saved = localStorage.getItem('ngl-username');
      if (saved) {
        setUsername(saved);
        fetchMessages(saved);
      }
    }
  }, []);

  const fetchMessages = async (user) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('username', user)
      .order('created_at', { ascending: false });

    setMessages(data || []);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);

      // Live transcription (works great on Chrome/Edge)
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (e) => {
          const text = Array.from(e.results)
            .map((r) => r[0].transcript)
            .join('');
          setTranscript(text);
        };
        recognition.start();
        recognitionRef.current = recognition;
      }
    } catch (err) {
      alert('Microphone access denied');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    if (recognitionRef.current) recognitionRef.current.stop();
  };

  const sendMessage = async () => {
    if (!audioBlob) return;

    setLoading(true);
    const recipient = prompt('Send to username (or leave empty for yourself):', username) || username;

    // Upload audio
    const fileName = `voice-${Date.now()}.webm`;
    const { error: uploadError } = await supabase.storage
      .from('voices')
      .upload(fileName, audioBlob, { contentType: 'audio/webm', upsert: false });

    if (uploadError) {
      alert('Upload failed: ' + uploadError.message);
      setLoading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from('voices').getPublicUrl(fileName);

    // Save message
    const { error } = await supabase
      .from('messages')
      .insert({
        username: recipient,
        text: transcript || null,
        audio_url: publicUrl,
      });

    if (error) {
      alert('Send failed: ' + error.message);
    } else {
      alert(`Sent to @${recipient}!`);
      setAudioBlob(null);
      setAudioUrl(null);
      setTranscript('');
      if (recipient === username) fetchMessages(username);
    }
    setLoading(false);
  };

  const playRobotic = (text, id) => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.85;
    u.pitch = 0.4;
    u.onstart = () => setIsPlaying(id);
    u.onend = () => setIsPlaying(null);
    window.speechSynthesis.speak(u);
  };

  const createUsername = () => {
    let name;
    do {
      name = prompt('Choose username (letters/numbers only):')?.trim();
    } while (name && !/^[a-zA-Z0-9_-]+$/.test(name));

    if (name) {
      setUsername(name);
      localStorage.setItem('ngl-username', name);
      window.location.search = `?send_to=${name}`;
    }
  };

  const copyLink = () => {
    const link = `${window.location.origin}?send_to=${username}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ────────────────────────────────────────────── UI ──────────────────────────────────────────────

  if (!username) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 via-pink-500 to-red-500 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-2xl p-12 max-w-md w-full text-center">
          <div className="w-28 h-28 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full mx-auto mb-8 flex items-center justify-center">
            <Mic className="w-16 h-16 text-white" />
          </div>
          <h1 className="text-5xl font-black mb-4 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            AnonVoice
          </h1>
          <p className="text-gray-600 text-lg mb-10">
            Get anonymous voice notes<br />with robotic playback
          </p>
          <button
            onClick={createUsername}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-6 rounded-2xl font-bold text-xl shadow-xl hover:scale-105 transition"
          >
            Create Your Link
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-pink-500 to-red-500 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-8 text-white">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-4xl font-bold">@{username}</h1>
              <button
                onClick={copyLink}
                className="flex items-center gap-3 bg-white/20 px-6 py-3 rounded-xl hover:bg-white/30 transition"
              >
                {copied ? <Check className="w-6 h-6" /> : <Share2 className="w-6 h-6" />}
                <span className="font-medium">{copied ? 'Copied!' : 'Share Link'}</span>
              </button>
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => setView('create')}
                className={`px-8 py-4 rounded-xl font-bold transition ${view === 'create' ? 'bg-white text-purple-600' : 'bg-white/20'}`}
              >
                Send
              </button>
              <button
                onClick={() => { setView('inbox'); fetchMessages(username); }}
                className={`px-8 py-4 rounded-xl font-bold flex items-center gap-3 transition ${view === 'inbox' ? 'bg-white text-purple-600' : 'bg-white/20'}`}
              >
                <Inbox className="w-6 h-6" />
                Inbox ({messages.length})
              </button>
            </div>
          </div>

          {/* Main Content */}
          <div className="p-10">
            {view === 'create' ? (
              <div className="max-w-lg mx-auto text-center">
                <button
                  onMouseDown={startRecording}
                  onMouseUp={stopRecording}
                  onTouchStart={startRecording}
                  onTouchEnd={stopRecording}
                  className={`w-48 h-48 rounded-full shadow-2xl transition-all ${
                    isRecording
                      ? 'bg-red-500 animate-pulse scale-110'
                      : 'bg-gradient-to-br from-purple-500 to-pink-500 hover:scale-110'
                  } flex items-center justify-center`}
                >
                  <Mic className="w-24 h-24 text-white" />
                </button>
                <p className="mt-8 text-xl text-gray-700">
                  {isRecording ? 'Recording… Release to stop' : 'Hold to record'}
                </p>

                {(audioUrl || transcript) && (
                  <div className="mt-10 bg-gray-50 rounded-3xl p-8">
                    {audioUrl && <audio controls src={audioUrl} className="w-full mb-6" />}
                    {transcript && <p className="text-left text-gray-800 font-medium mb-6">"{transcript}"</p>}
                    <button
                      onClick={sendMessage}
                      disabled={loading}
                      className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-5 rounded-2xl font-bold flex items-center justify-center gap-3 disabled:opacity-70"
                    >
                      <Send className="w-7 h-7" />
                      {loading ? 'Sending…' : 'Send Anonymously'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <h2 className="text-3xl font-bold text-gray-800 mb-8">Your Anonymous Inbox</h2>
                {messages.length === 0 ? (
                  <div className="text-center py-20 text-gray-500">
                    <p className="text-2xl mb-4">No messages yet</p>
                    <p className="font-mono bg-gray-100 px-4 py-2 rounded">
                      {window.location.origin}?send_to={username}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {messages.map((msg) => (
                      <div key={msg.id} className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-3xl p-8 shadow-lg">
                        {msg.audio_url && <audio controls src={msg.audio_url} className="w-full mb-6 rounded-xl" />}
                        {msg.text && <p className="text-xl text-gray-800 font-medium mb-6">"{msg.text}"</p>}
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-500">
                            {new Date(msg.created_at).toLocaleString()}
                          </span>
                          {msg.text && (
                            <button
                              onClick={() => playRobotic(msg.text, msg.id)}
                              disabled={isPlaying === msg.id}
                              className="bg-purple-600 text-white px-6 py-3 rounded-xl flex items-center gap-3 hover:bg-purple-700 disabled:opacity-60"
                            >
                              <Play className="w-5 h-5" />
                              {isPlaying === msg.id ? 'Playing…' : 'Robotic Voice'}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
