
import { AgentConfig } from './types.js';
import { createAgentStore, AppStore } from './store.js';

export class AgentRuntime {
    private store: AppStore;

    constructor(config: AgentConfig) {
        this.store = createAgentStore(config);
    }

    public start() {
        // The Sagas are already running as soon as the store is created.
        const state = this.store.getState();
        console.log(`[${state.agent.id}] Agent started.`);
    }

    public getState() {
        return this.store.getState().agent;
    }
}
