
import { jest } from '@jest/globals';

// 1. Define Mock Factory
const mockOpenAI = jest.fn().mockImplementation(() => ({
    chat: {
        completions: {
            create: jest.fn().mockImplementation(async (params) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const messages = (params as any).messages;
                const lastMsg = messages[messages.length - 1].content;

                // Fake Logic for Tests
                if (typeof lastMsg === 'string') {
                    if (lastMsg.includes('Hello')) {
                        return {
                            choices: [{ message: { content: 'Hi there!' } }]
                        };
                    }
                    if (lastMsg.includes('Whisper')) {
                        return {
                            choices: [{ message: { content: '>>> TO: Alice Secret message' } }]
                        };
                    }
                    if (lastMsg.includes('Broadcast')) {
                        return {
                            choices: [{ message: { content: 'Announcement for everyone!' } }]
                        };
                    }
                }
                return { choices: [{ message: { content: '...' } }] };
            })
        }
    }
}));

// 2. Register Mock (Must be before imports)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
jest.unstable_mockModule('openai', () => ({
    default: mockOpenAI
}));

// 3. Dynamic Imports
const { globalRouter } = await import('../src/town/router.js');
const { createAgentStore } = await import('../src/store.js');
const { firstValueFrom, filter } = await import('rxjs');

describe('Simulation Integration Tests', () => {
    // Helpers to create test agents
    const createdStores: any[] = [];

    // Helpers to create test agents
    const createTestAgent = (name: string) => {
        const store = createAgentStore({ name, persona: 'Test Bot' });
        createdStores.push(store);
        return store;
    };

    afterEach(() => {
        createdStores.forEach(store => {
            if (store.rootTask) {
                store.rootTask.cancel();
            }
        });
        createdStores.length = 0;
    });

    it('Scenario 1: Town Hall Broadcast', async () => {
        const alice = createTestAgent('Alice');

        const receivedMessages: string[] = [];

        // Listen to global router to verify broadcast
        const sub = globalRouter.subscribe('town_hall').subscribe(evt => {
            receivedMessages.push(`[${evt.topic}] ${evt.sender}: ${evt.payload.content}`);
        });

        // Simulate User sending a broadcast
        globalRouter.publish({
            type: 'message',
            topic: 'town_hall',
            sender: 'User',
            payload: { content: 'Announcement!' }
        });

        // Wait a bit for Sagas to process included in the store creation
        await new Promise(r => setTimeout(r, 100));

        // Agents should have processed it (Internal state check)
        const aliceState = alice.getState().agent;
        expect(aliceState.workingMemory[0]?.content).toContain('Announcement!');

        sub.unsubscribe();
    });

    it('Scenario 2: Private Messaging (Whisper)', async () => {
        const alice = createTestAgent('Alice');

        // Setup a promise to catch the outgoing message from Alice
        const replyPromise = firstValueFrom(
            globalRouter.asObservable().pipe(
                filter(e => e.sender === 'Alice' && e.topic === 'agent:Bob:inbox')
            )
        );

        // Send a message that triggers Alice to whisper to Bob (via Mock LLM)
        globalRouter.publish({
            type: 'message',
            topic: 'agent:Alice:inbox', // DM to Alice
            sender: 'Bob',
            payload: { content: 'Whisper to me please' } // Keyword 'Whisper' triggers mock
        });

        const reply = await replyPromise;
        expect(reply.payload.content).toBe('Secret message');
        expect(reply.topic).toBe('agent:Bob:inbox');
    });

    it('Scenario 3: Agent Broadcasting', async () => {
        const charlie = createTestAgent('Charlie');

        const broadcastPromise = firstValueFrom(
            globalRouter.asObservable().pipe(
                filter(e => e.sender === 'Charlie' && e.topic === 'town_hall')
            )
        );

        // Send message to Charlie triggering a broadcast
        globalRouter.publish({
            type: 'message',
            topic: 'town_hall',
            sender: 'User',
            payload: { content: 'Broadcast something' } // Keyword 'Broadcast' triggers mock
        });

        const broadcast = await broadcastPromise;
        expect(broadcast.payload.content).toBe('Announcement for everyone!');
    });

    it('Scenario 4: Multi-Agent Conversation', async () => {
        // A talks to B
        const agentA = createTestAgent('AgentA');
        const agentB = createTestAgent('AgentB');

        globalRouter.publish({
            type: 'message',
            topic: 'town_hall',
            sender: 'AgentA',
            payload: { content: 'Hello everyone' }
        });

        await new Promise(r => setTimeout(r, 50));

        const stateB = agentB.getState().agent;
        // B should be THINKING or have processed it.
        // Since 'Hello' makes mock return 'Hi there!', B might have already responded or be in process.
        // We just check that B received it.
        expect(stateB.workingMemory.length).toBeGreaterThan(0);
        expect(stateB.workingMemory[0].content).toContain('AgentA');
    });
});
