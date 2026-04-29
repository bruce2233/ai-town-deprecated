
import { createAgentStore, messageReceived, llmCompleted, toolCompleted } from '../src/store.js';
import { AgentConfig, Message } from '../src/types.js';
import { ChatCompletionMessage } from 'openai/resources/chat/completions';

describe('Agent Store (Functional Logic)', () => {
    const config: AgentConfig = { name: 'TestBot', persona: 'Tester' };

    // Helper to get typed state
    const getState = (store: ReturnType<typeof createAgentStore>) => store.getState().agent;

    it('should initialize with IDLE status', () => {
        const store = createAgentStore(config, false); // No Sagas
        const state = getState(store);
        expect(state.status).toBe('IDLE');
        expect(state.id).toBe('TestBot');
    });

    it('should transition to THINKING when message received', () => {
        const store = createAgentStore(config, false);
        const msg: Message = { type: 'message', sender: 'User', payload: { content: 'Hello' }, topic: 'town_hall' };

        store.dispatch(messageReceived(msg));

        const state = getState(store);
        expect(state.status).toBe('THINKING');
        // Verify system prompt is built
        const systemMsg = state.workingMemory.find(m => m.role === 'system');
        expect(systemMsg?.content).toContain('You are TestBot');
    });

    it('should transition to EXECUTING_TOOL when LLM requests a tool', () => {
        const store = createAgentStore(config, false);
        // Manually set state to THINKING for test by sending message
        const msg: Message = { type: 'message', sender: 'User', payload: { content: 'Broadcast this' }, topic: 'town_hall' };
        store.dispatch(messageReceived(msg));

        const toolMsg: ChatCompletionMessage = {
            role: 'assistant',
            content: null,
            refusal: null,
            tool_calls: [{
                id: 'call_123',
                type: 'function',
                function: { name: 'broadcast_message', arguments: '{"message":"Hello World"}' }
            }]
        };

        store.dispatch(llmCompleted(toolMsg));

        const state = getState(store);
        expect(state.status).toBe('EXECUTING_TOOL');
        // Note: We cannot verify 'effects' anymore as it is handled by Saga listening to actions
    });

    it('should loop back to THINKING after tool completion', () => {
        const store = createAgentStore(config, false);
        const msg: Message = { type: 'message', sender: 'User', topic: 'town_hall' };
        store.dispatch(messageReceived(msg));

        // Mock LLM result triggering tool
        const toolMsg: ChatCompletionMessage = {
            role: 'assistant',
            content: null,
            refusal: null,
            tool_calls: [{ id: 'call_123', type: 'function', function: { name: 'broadcast_message', arguments: '{}' } }]
        };
        store.dispatch(llmCompleted(toolMsg));

        // Tool finishes
        store.dispatch(toolCompleted({ callId: 'call_123', result: 'Broadcast sent' }));

        const state = getState(store);
        expect(state.status).toBe('THINKING');
        expect(state.workingMemory.length).toBeGreaterThan(2);
    });

    it('should go back to IDLE when LLM replies with text', () => {
        const store = createAgentStore(config, false);
        store.dispatch(messageReceived({ type: 'message', sender: 'User', topic: 'town_hall' }));

        const replyMsg: ChatCompletionMessage = {
            role: 'assistant',
            content: 'I agree!',
            refusal: null,
            tool_calls: []
        };

        store.dispatch(llmCompleted(replyMsg));

        const state = getState(store);
        expect(state.status).toBe('IDLE');
        expect(state.workingMemory).toHaveLength(0);
    });
});
