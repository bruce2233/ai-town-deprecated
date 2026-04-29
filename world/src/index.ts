import { WebSocketServer } from 'ws';
import { AgentRegistry } from './registry.js';
import { AgentRuntime } from './runtime.js';
import { globalRouter, TownEvent } from './town/router.js';

// Port for UI/Tests to connect
const PORT = parseInt(process.env.PORT || '8080', 10);

async function main() {
    console.log('--- AI Town (Serverless Actor Model) Starting ---');

    const registry = new AgentRegistry();
    const agents = registry.getAgents();

    console.log(`Booting ${agents.length} agents...`);

    const runtimeMap = new Map<string, AgentRuntime>();
    for (const config of agents) {
        const runtime = new AgentRuntime(config);
        runtime.start();
        runtimeMap.set(config.name, runtime);
    }

    // Keep basic in-memory history
    const history: TownEvent[] = [];

    // --- WebSocket Server (Output Adapter) ---
    const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });
    console.log(`WebSocket Server listening on port ${PORT} (0.0.0.0)`);

    wss.on('connection', (ws) => {
        console.log('New client connected');

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message.toString());
                // Handle basic protocol to keep client happy
                // For now, we just acknowledge or ignore.
                // In serverless, everyone subscribes to everything essentially for monitoring.
                if (data.type === 'identify') {
                    // console.log('Client identified:', data.payload.id);
                }
                if (data.type === 'get_state') {
                    const agentStates = Array.from(runtimeMap.values()).map(r => r.getState());
                    console.log(`[WebSocket] Handling get_state. Sending ${agentStates.length} agents.`);
                    // console.log('Sample Agent State:', JSON.stringify(agentStates[0])); 
                    ws.send(JSON.stringify({
                        type: 'system',
                        payload: {
                            type: 'state_update',
                            agents: agentStates,
                            topics: ['town_hall', 'system:status']
                        }
                    }));
                }
                if (data.type === 'get_history') {
                    ws.send(JSON.stringify({
                        type: 'system',
                        payload: {
                            type: 'history_replay',
                            events: history
                        }
                    }));
                }
                if (data.type === 'publish') {
                    // Inject into Router if admin sends message
                    globalRouter.publish({
                        type: 'message',
                        topic: data.topic || 'town_hall',
                        sender: data.sender || 'Admin',
                        payload: data.payload || {}
                    });
                }
            } catch (e) {
                console.error('WebSocket Handling Error:', e);
            }
        });
    });

    // Forward Router events to all clients
    globalRouter.asObservable().subscribe(evt => {
        // Add to history
        history.push(evt);
        if (history.length > 500) history.shift();

        const msg = JSON.stringify(evt);
        wss.clients.forEach(client => {
            if (client.readyState === 1) { // OPEN
                client.send(msg);
            }
        });
        console.log(`[Town] ${evt.sender || '?'} -> ${evt.topic}:`, evt.type);
    });

    console.log('--- Town is Live. Press Ctrl+C to stop ---');

    // Prevent process exit
    setInterval(() => { }, 10000);
}

main().catch(console.error);
