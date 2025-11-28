```jsx
import React, { useState, useRef, useEffect } from 'react';
import {
  Mic, Square, Download, Share2, Copy, CheckCircle,
  MessageSquare, LogOut, Inbox, Smartphone, Play, Pause,
  Trash2, Send, X, Video
} from 'lucide-react';

// ------------------ Mock Auth & DB ------------------
const mockAuth = {
  isAuthenticated: true,
  user: { name: 'Anonymous', id: 'user_1' },
};

const voxDB = {
  save(voxKey, msg) {
    const key = `vox_${voxKey}`;
    let list = JSON.parse(localStorage.getItem(key) || '[]');
    list.unshift({ ...msg, id: crypto.randomUUID() });
    localStorage.setItem(key, JSON.stringify(list));
  },
  get(voxKey) {
    const key = `vox_${voxKey}`;
    return JSON.parse(localStorage.getItem(key) || '[]');
  },
  delete(voxKey, id) {
    const key = `vox_${voxKey}`;
    let list = JSON.parse(localStorage.getItem(key) || '[]');
    list = list.filter(item => item.id !== id);
    localStorage.setItem(key, JSON.stringify(list));
  },
};

// ------------------ App Component ------------------
export default function App() {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [playingId, setPlayingId] = useState(null);
  const audioRefs = useRef({});

  const voxKey = mockAuth.user.id;

  useEffect(() => {
    setMessages(voxDB.get(voxKey));
  }, []);

  const handleSend = () => {
    if (!message.trim()) return;
    const msg = { text: message, date: new Date().toISOString() };
    voxDB.save(voxKey, msg);
    setMessages(voxDB.get(voxKey));
    setMessage('');
  };

  const handleDelete = (id) => {
    voxDB.delete(voxKey, id);
    setMessages(voxDB.get(voxKey));
  };

  const handlePlay = (id) => {
    const audio = audioRefs.current[id];
    if (!audio) return;
    if (playingId === id) {
      audio.pause();
      setPlayingId(null);
    } else {
      if (playingId && audioRefs.current[playingId]) {
        audioRefs.current[playingId].pause();
      }
      audio.play();
      setPlayingId(id);
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    alert('Copied!');
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <header className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">VoxDrop – Anonymous Voice Box</h1>
        <button className="flex items-center gap-1" onClick={() => alert('Logging out')}>
          <LogOut /> Logout
        </button>
      </header>

      <div className="mb-4 flex gap-2">
        <input
          className="flex-1 p-2 border rounded"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message..."
        />
        <button
          className="p-2 bg-blue-500 text-white rounded flex items-center gap-1"
          onClick={handleSend}
        >
          <Send /> Send
        </button>
      </div>

      <div className="space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className="p-4 bg-white rounded shadow flex justify-between items-center"
          >
            <div>
              <p className="mb-1">{msg.text}</p>
              <small className="text-gray-500">{new Date(msg.date).toLocaleString()}</small>
            </div>
            <div className="flex gap-2 items-center">
              <button onClick={() => handlePlay(msg.id)}>
                {playingId === msg.id ? <Pause /> : <Play />}
              </button>
              <button onClick={() => handleCopy(msg.text)}>
                <Copy />
              </button>
              <button onClick={() => handleDelete(msg.id)}>
                <Trash2 />
              </button>
              <audio
                ref={(el) => (audioRefs.current[msg.id] = el)}
                src={msg.audio || ''}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```
