import { useEffect, useState, useRef } from 'react'
import './App.css'

interface Message {
  type: string;
  topic?: string;
  payload?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  sender?: string;
  timestamp?: number;
}

interface AgentStatus {
  id: string;
  name?: string;
  subscriptions: string[];
  isSystem?: boolean;
  lastSeen?: number;
  queueLength?: number;
  processing?: boolean;
  history?: Message[];
}

import { ProviderSettings } from './ProviderSettings';

type View = 'dashboard' | 'topics' | 'agents' | 'settings';

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [allEvents, setAllEvents] = useState<Message[]>([]); // Firehose
  const [connected, setConnected] = useState(false);
  const [agents, setAgents] = useState<Map<string, AgentStatus>>(new Map());
  const [topics, setTopics] = useState<Set<string>>(new Set(['town_hall']));
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const ws = useRef<WebSocket | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const eventBarRef = useRef<HTMLDivElement>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    // Use env var if available, otherwise default to same host on port 8080
    const wsUrl = import.meta.env.VITE_BROKER_URL || `${protocol}//${host}:8080`;

    // Debounce connection to handle React Strict Mode double-mount
    const connectTimer = setTimeout(() => {
      console.log('Initiating WS Connection...');
      const socket = new WebSocket(wsUrl);
      ws.current = socket;

      socket.onopen = () => {
        console.log('WS Connected');
        setConnected(true);
        socket.send(JSON.stringify({ type: 'identify', payload: { id: 'Observer' } }));
        socket.send(JSON.stringify({ type: 'subscribe', topic: 'town_hall' }));
        socket.send(JSON.stringify({ type: 'subscribe', topic: '*' }));
        socket.send(JSON.stringify({ type: 'get_state' }));
        socket.send(JSON.stringify({ type: 'get_history' }));
      };

      socket.onclose = (event) => {
        console.log('WS Closed', event.code, event.reason);
        setConnected(false);
      };

      socket.onerror = (error) => {
        console.error('WS Error', error);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Firehose
          if (data.type === 'message' || data.type === 'system') {
            if (data.payload?.type === 'history_replay') {
              console.log('Received history:', data.payload.events.length);
              const history = data.payload.events;
              setAllEvents(prev => [...history, ...prev].sort((a: Message, b: Message) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 500));
              if (feedRef.current) {
                feedRef.current.scrollTop = feedRef.current.scrollHeight;
              }
            }, [messages]);

    const handleAdminBroadcast = (e: React.FormEvent) => {
      e.preventDefault();
      const input = (e.target as HTMLFormElement).elements.namedItem('broadcast') as HTMLInputElement;
      const topicSelect = (e.target as HTMLFormElement).elements.namedItem('topic') as HTMLSelectElement;
      const topic = topicSelect.value;

      if (input.value && ws.current) {
        ws.current.send(JSON.stringify({
          type: 'publish',
          topic: topic,
          sender: 'admin',
          payload: { content: input.value, sender: 'admin' }
        }));
        input.value = '';
      }
    };

    const renderDashboard = () => (
      <main className="main-feed" ref={feedRef}>
        <div className="admin-controls">
          <form onSubmit={handleAdminBroadcast} className="broadcast-form">
            <select name="topic" defaultValue="town_hall" style={{ marginRight: '8px', padding: '8px' }}>
              <option value="town_hall">Town Hall</option>
              <option value="town:create_character">Create Character</option>
            </select>
            <input name="broadcast" type="text" placeholder="Message..." autoComplete="off" />
            <button type="submit">Send</button>
          </form>
        </div>
        {messages.map((msg, i) => {
          const isSystem = !msg.sender;
          const content = typeof msg.payload === 'string' ? msg.payload :
            (msg.payload?.content || JSON.stringify(msg.payload));

          return (
            <div key={i} className={`message-bubble ${msg.sender === 'Alice' ? 'self' : ''} ${msg.sender === 'admin' ? 'admin' : ''}`}>
              {!isSystem && <div className="agent-avatar">{msg.sender?.[0]}</div>}
              <div className="bubble-content">
                <div className="msg-header">
                  <span className="msg-sender">{msg.sender || 'System'}</span>
                  <span className="topic-tag">{msg.topic}</span>
                  <span className="msg-time">
                    {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ''}
                  </span>
                </div>
                <div className="msg-text">{content}</div>
              </div>
            </div>
          );
        })}
      </main>
    );

    const [topicFilter, setTopicFilter] = useState('');

    const renderTopics = () => (
      <main className="main-feed">
        <div className="filter-bar" style={{ padding: '0 24px', marginBottom: '-10px' }}>
          <input
            type="text"
            placeholder="Filter topics..."
            value={topicFilter}
            onChange={(e) => setTopicFilter(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '8px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--glass-border)',
              color: 'white'
            }}
          />
        </div>
        <div className="grid-view">
          {Array.from(topics)
            .filter(t => {
              const k = typeof t === 'string';
              const i = k && t.toLowerCase().includes(topicFilter.toLowerCase());
              return i;
            })
            .map(topic => (
              <div key={topic} className={`card ${selectedTopic === topic ? 'selected' : ''}`} onClick={() => setSelectedTopic(topic)}>
                <h3>#{topic}</h3>
                <p>{messages.filter(m => m.topic === topic).length} messages</p>
              </div>
            ))}
        </div>
        {selectedTopic && (
          <div className="topic-detail">
            <h3>Messages in #{selectedTopic}</h3>
            {messages.filter(m => m.topic === selectedTopic).slice(-20).map((msg, i) => (
              <div key={i} className="mini-msg" style={{ padding: '8px', borderBottom: '1px solid #333' }}>
                <b style={{ color: 'var(--accent-primary)' }}>{msg.sender}:</b> {typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload)}
              </div>
            ))}
          </div>
        )}
      </main>
    );

    const renderAgents = () => (
      <main className="main-feed">
        <div className="grid-view">
          {Array.from(agents.values()).map(agent => (
            <div key={agent.id} className={`card ${selectedAgent === agent.id ? 'selected' : ''}`} onClick={() => setSelectedAgent(agent.id)}>
              <div className="agent-avatar large">{agent.name?.[0] || '?'}</div>
              <h3>{agent.name || agent.id}</h3>
              <div className="status-badge">
                <span className={`status-dot ${Date.now() - (agent.lastSeen || 0) < 60000 ? 'active' : 'away'}`}></span>
                {Date.now() - (agent.lastSeen || 0) < 60000 ? 'Active' : 'Away'}
              </div>
            </div>
          ))}
        </div>
        {selectedAgent && (
          <div className="agent-detail-panel">
            {(() => {
              const agent = agents.get(selectedAgent);
              if (!agent) return null;
              return (
                <>
                  <h2>{agent.name || agent.id} Details</h2>
                  <div className="detail-grid">
                    <div className="detail-box">
                      <h4>Subscriptions</h4>
                      <div className="tags">
                        {agent.subscriptions.map(s => <span key={s} className="tag">{s}</span>)}
                      </div>
                    </div>
                    <div className="detail-box">
                      <h4>Internal State</h4>
                      <p>Queue Length: <b>{agent.queueLength ?? 'Unknown'}</b></p>
                      <p>Processing: <b>{agent.processing ? 'Yes' : 'No'}</b></p>
                    </div>
                    <div className="event-stream">
                      <h4>Message History (Last 10)</h4>
                      {agent.history?.map((msg, i) => (
                        <div key={i} className="stream-item">
                          <span className="time">{new Date(msg.timestamp || 0).toLocaleTimeString()}</span>
                          <span className="actor">{msg.sender}</span>
                          <span className="payload">{typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="event-stream" style={{ marginTop: '16px' }}>
                      <h4>Event Stream (Last 20)</h4>
                      {allEvents.filter(e => e.sender === agent.id || (e.topic && agent.subscriptions.includes(e.topic))).slice(0, 20).map((e, i) => (
                        <div key={i} className="stream-item">
                          <span className="time">{new Date(e.timestamp || 0).toLocaleTimeString()}</span>
                          <span className="type">{e.type}</span>
                          <span className="topic">{e.topic}</span>
                          <span className="payload">{JSON.stringify(e.payload).substring(0, 50)}...</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </main>
    );

    return (
      <div className="app-container">
        <div className="global-event-bar" ref={eventBarRef}>
          <div className="timeline-track">
            {allEvents.filter(e => e.topic !== 'system:status').slice(0, 20).map((e, i) => (
              <div key={i} className="timeline-node">
                <div className="timeline-dot"></div>
                <div className="timeline-content">
                  <span className="time">{new Date(e.timestamp || 0).toLocaleTimeString()}</span>
                  <span className="actor">{e.sender || 'System'}</span>
                  <span className="action">{e.topic}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Header */}
        <header className="header">
          <div className="brand">AI Town Observer</div>
          <nav className="nav-links">
            <button className={currentView === 'dashboard' ? 'active' : ''} onClick={() => setCurrentView('dashboard')}>Dashboard</button>
            <button className={currentView === 'topics' ? 'active' : ''} onClick={() => setCurrentView('topics')}>Topics</button>
            <button className={currentView === 'agents' ? 'active' : ''} onClick={() => setCurrentView('agents')}>Agents</button>
            <button className={currentView === 'settings' ? 'active' : ''} onClick={() => setCurrentView('settings')}>Settings</button>
          </nav>
          <div className={`status-indicator ${connected ? 'online' : 'offline'}`}>
            <div className="dot"></div>
            {connected ? 'System Online' : 'Disconnected'}
          </div>
        </header>

        {/* Sidebar */}
        <aside className="sidebar">
          <div className="section-title">Residents</div>
          <div className="agent-list">
            {Array.from(agents.values()).map(agent => (
              <div key={agent.id} className={`agent-card ${selectedAgent === agent.id ? 'active' : ''}`} onClick={() => { setCurrentView('agents'); setSelectedAgent(agent.id); }}>
                <div className="agent-avatar">{agent.name?.[0] || '?'}</div>
                <div className="agent-info">
                  <div className="agent-name">{agent.name || agent.id.substring(0, 8)}</div>
                  <div className="agent-status">
                    {agent.processing ? 'Thinking...' : (currentTime - (agent.lastSeen || 0) < 60000 ? 'Idle' : 'Away')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Main Content */}
        <div className="content-area">
          {currentView === 'dashboard' && renderDashboard()}
          {currentView === 'topics' && renderTopics()}
          {currentView === 'agents' && renderAgents()}
          {currentView === 'settings' && <ProviderSettings />}
        </div>

        {/* Visualizer / Stats */}
        <aside className="visualizer">
          <div className="section-title">Stats</div>
          <div className="stat-card">
            <div className="stat-value">{messages.length}</div>
            <div className="stat-label">Total Messages</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{allEvents.length}</div>
            <div className="stat-label">Total Events</div>
          </div>
        </aside>
      </div >
    )
  }

export default App
