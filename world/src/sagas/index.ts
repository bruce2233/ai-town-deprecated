
import { all, fork } from 'typed-redux-saga';
import { watchInbox, watchOutbox } from './io.js';
import { watchBrain } from './brain.js';

export function* rootSaga() {
    yield* all([
        fork(watchInbox),
        fork(watchOutbox),
        fork(watchBrain),
    ]);
}
