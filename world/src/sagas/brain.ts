
import { takeEvery, select, call, put } from 'typed-redux-saga';
import OpenAI from 'openai';
import { RootState, messageReceived, llmCompleted, toolCompleted, errorOccurred } from '../store.js';
import { TOOLS, getToolByName } from '../tools.js';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { PayloadAction } from '@reduxjs/toolkit';

// Env Config
const LLM_API_URL = process.env.LLM_API_URL || 'http://localhost:11434/v1'; // Default to Ollama/Local
const LLM_API_KEY = process.env.LLM_API_KEY || 'dummy';
const MODEL_NAME = process.env.MODEL_NAME || 'qwen2.5-coder-7b-instruct'; // Example

const openai = new OpenAI({
    baseURL: LLM_API_URL,
    apiKey: LLM_API_KEY,
});

function* callLlmSaga() {
    try {
        const state: RootState = yield* select();
        const messages = state.agent.workingMemory;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tools: any[] = TOOLS.map(({ execute, ...rest }) => rest);

        const completion = yield* call([openai.chat.completions, openai.chat.completions.create], {
            model: MODEL_NAME,
            messages,
            tools: tools.length > 0 ? tools : undefined,
            stream: false
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const msg = (completion as any).choices[0]?.message;
        if (msg) {
            yield* put(llmCompleted(msg));
        }
    } catch (e: any) {
        console.error('LLM Failed', e);
        yield* put(errorOccurred(e.message || 'Unknown LLM error'));
    }
}

// executeToolSaga handles the logic *after* the reducer has updated state to EXECUTING_TOOL
function* executeToolSaga(action: PayloadAction<import('openai/resources/chat/completions').ChatCompletionMessage>) {
    const response = action.payload;
    if (response.tool_calls && response.tool_calls.length > 0) {
        for (const toolCall of response.tool_calls) {
            const toolName = toolCall.function.name;
            const def = getToolByName(toolName);

            if (def) {
                try {
                    const args = JSON.parse(toolCall.function.arguments);
                    const result = yield* call(def.execute, args);
                    yield* put(toolCompleted({ callId: toolCall.id, result }));
                } catch (e: any) {
                    yield* put(toolCompleted({ callId: toolCall.id, result: `Error: ${e.message}` }));
                }
            } else {
                yield* put(toolCompleted({ callId: toolCall.id, result: 'Error: Tool not found' }));
            }
        }
    } else {
        // It's a text reply. We need to publish it.
        // We'll dispatch a custom action that the IO Saga listens to.
        const content = response.content;
        if (content) {
            const state: RootState = yield* select();
            // Determine topic from content or context
            // For now, simpler logic: if it has >>> TO: use that, else check working memory?
            // Actually, the Store reducer used to handle this extraction.
            // We should let the Store reducer extract the topic? 
            // OR, we do it here.
            // The Store Reducer has `effects.push({ type: 'PUBLISH' ... })`.
            // We are replacing effects.
            // So we should dispatch a `publishMessage` action.

            let topic = 'town_hall'; // Default
            if (content.includes('>>> TO:')) {
                const match = content.match(/>>> TO: (\S+)/);
                if (match) topic = match[1];
            } else {
                // Reply to the topic of the last user message?
                // We can find it in history or pass it along.
                // For now, let's just default to 'town_hall' or specific logic later.
                // Ideally, the 'messageReceived' payload had the topic.
                // We can inspect state.agent.workingMemory[0] (System prompt) or just assume context.
                // Let's keep it simple: publish to town_hall unless specified.
            }

            yield* put({ type: 'agent/publishMessage', payload: { topic, content } });
        }
    }
}

export function* watchBrain() {
    // When a message arrives, the reducer updates state to THINKING
    // We listen to that action and trigger LLM
    yield* takeEvery(messageReceived.type, function* (action) {
        // Optimization: only think if addressed to us or relevant?
        // The reducer already filters `if (message.sender === state.id) return;`
        // But we need to check if the reducer actually switched to THINKING.
        const state: RootState = yield* select();
        if (state.agent.status === 'THINKING') {
            yield* call(callLlmSaga);
        }
    });

    // When tool completes, we loop back to LLM if status is THINKING
    yield* takeEvery(toolCompleted.type, function* () {
        const state: RootState = yield* select();
        if (state.agent.status === 'THINKING') {
            yield* call(callLlmSaga);
        }
    });

    // When LLM completes, we either execute tool or publish
    yield* takeEvery(llmCompleted.type, executeToolSaga);
}
