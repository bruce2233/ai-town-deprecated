
import { eventChannel, EventChannel } from 'redux-saga';
import { take, call, put, fork, takeEvery, select } from 'typed-redux-saga';
import { globalRouter, TownEvent } from '../town/router.js';
import { messageReceived } from '../store.js';
import { PayloadAction } from '@reduxjs/toolkit';
import { RootState } from '../store.js';

// Create a Saga Channel from the Router source
function createTownChannel(agentId: string): EventChannel<TownEvent> {
    return eventChannel(emit => {
        // Subscribe to public topics (town_hall) and private inbox
        const publicSub = globalRouter.subscribe('town_hall').subscribe(evt => emit(evt));
        const privateSub = globalRouter.subscribe(`agent:${agentId}:inbox`).subscribe(evt => emit(evt));

        return () => {
            publicSub.unsubscribe();
            privateSub.unsubscribe();
        };
    });
}

// Watch for incoming messages from the Town
export function* watchInbox() {
    // We need the Agent ID to subscribe to the right topics
    const state: RootState = yield* select();
    const agentId = state.agent.id;

    if (!agentId) return; // Not initialized yet

    const townChannel = yield* call(createTownChannel, agentId);

    try {
        while (true) {
            const event: TownEvent = yield* take(townChannel);
            // Dispatch into Redux
            if (event.type === 'message') {
                yield* put(messageReceived({
                    type: 'message',
                    topic: event.topic,
                    sender: event.sender,
                    payload: event.payload
                }));
            }
        }
    } finally {
        // Channel closed
        console.log(`[${agentId}] Inbox closed`);
    }
}

// Watch for specific Redux actions that need to PUBLISH to the town
// We'll define a specific action for publishing later, or derive it from state changes.
// For now, let's assume valid output comes from a custom action 'agent/publish'
// But wait, our slice uses 'effects'. We are refactoring away from effects.
// Let's introduce a dedicated action: `publishMessage`
export function* watchOutbox() {
    yield* takeEvery('agent/publishMessage', function* (action: PayloadAction<{ topic: string, content: string }>) {
        const state: RootState = yield* select();
        const sender = state.agent.id;

        const event: TownEvent = {
            type: 'message',
            topic: action.payload.topic,
            payload: { content: action.payload.content },
            sender
        };

        yield* call([globalRouter, globalRouter.publish], event);
    });
}
