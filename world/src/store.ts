import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { AgentState, AgentConfig, Message } from './types.js';
import { TOOLS, getToolByName } from './tools.js';
import { ChatCompletionMessage } from 'openai/resources/chat/completions';
import { rootSaga } from './sagas/index.js';

// ... helper buildSystemPrompt ...
const SYSTEM_TEMPLATE = "You are ${name}. Persona: ${persona}.\n" +
    "You are in AI Town. \n" +
    "Received message from \"${sender}\" on topic \"${topic}\": \"${content}\"\n" +
    "\n" +
    "INSTRUCTIONS:\n" +
    "- If you want to send a message to a specific topic, start your message with:\n" +
    "  >>> TO: <topic_name>\n" +
    "  followed by your message content.\n" +
    "- If you just want to reply to the current topic context, simply type your message.\n";

function buildSystemPrompt(config: AgentConfig, msg: Message): string {
    let p = SYSTEM_TEMPLATE.replace('${name}', config.name).replace('${persona}', config.persona);
    p = p.replace('${sender}', msg.sender || 'unknown');
    p = p.replace('${topic}', msg.topic || 'unknown');
    p = p.replace('${content}', JSON.stringify(msg.payload || ''));
    return p;
}

const MAX_TURNS = 5;

// Removed 'effects' from State
const initialState: AgentState = {
    id: '',
    config: { name: '', persona: '' },
    status: 'IDLE',
    workingMemory: [],
    history: [],
    turnsInCurrentRequest: 0,
};

const agentSlice = createSlice({
    name: 'agent',
    initialState,
    reducers: {
        init: (state, action: PayloadAction<AgentConfig>) => {
            state.id = action.payload.name;
            state.config = action.payload;
            state.status = 'IDLE';
        },
        messageReceived: (state, action: PayloadAction<Message>) => {
            const message = action.payload;
            // Basic Busy Check
            if (state.status !== 'IDLE') {
                return;
            }
            if (message.sender === state.id) return;
            if (message.topic === 'system:status') return;

            // Start Thinking
            state.status = 'THINKING';
            state.turnsInCurrentRequest = 0;
            const sysPrompt = buildSystemPrompt(state.config, message);
            state.workingMemory = [
                { role: 'system', content: sysPrompt },
                { role: 'user', content: 'How do you respond?' }
            ];
            // Saga listens for this action and triggers API call
        },
        llmCompleted: (state, action: PayloadAction<ChatCompletionMessage>) => {
            if (state.status !== 'THINKING') return;

            const response = action.payload;
            state.workingMemory.push(response);

            if (response.tool_calls && response.tool_calls.length > 0) {
                state.status = 'EXECUTING_TOOL';
                // Saga listens for this action and executes tool
            } else {
                state.status = 'IDLE';
                state.workingMemory = [];
                // Saga listens for this and publishes if content exists
            }
        },
        toolCompleted: (state, action: PayloadAction<{ callId: string, result: string }>) => {
            if (state.status !== 'EXECUTING_TOOL') return;
            const { callId, result } = action.payload;

            state.workingMemory.push({ role: 'tool', tool_call_id: callId, content: result });
            state.turnsInCurrentRequest++;

            if (state.turnsInCurrentRequest >= MAX_TURNS) {
                state.status = 'IDLE';
                // Maybe log max turns?
            } else {
                state.status = 'THINKING';
                // Saga loops back to LLM
            }
        },
        errorOccurred: (state, action: PayloadAction<string>) => {
            state.status = 'IDLE';
        },
        // We no longer need consumeEffects
    }
});

export const { init, messageReceived, llmCompleted, toolCompleted, errorOccurred } = agentSlice.actions;

export const createAgentStore = (config: AgentConfig, runSagas = true) => {
    const sagaMiddleware = createSagaMiddleware();
    const store = configureStore({
        reducer: {
            agent: agentSlice.reducer
        },
        preloadedState: {
            agent: {
                ...initialState,
                id: config.name,
                config: config
            }
        },
        // Disable all default middleware (Thunk, ImmutableCheck, SerializableCheck)
        // to prevent performance issues with large LLM objects and avoid Invariant errors in tests.
        middleware: () => [sagaMiddleware] as any
    });

    // Run the Saga
    if (runSagas) {
        const task = sagaMiddleware.run(rootSaga);
        (store as any).rootTask = task;
    }

    return store;
};

export type AppStore = ReturnType<typeof createAgentStore>;
export type RootState = ReturnType<AppStore['getState']>;
