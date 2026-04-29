
import fs from 'fs';
import path from 'path';
import { AgentConfig } from './types.js';

export class AgentRegistry {
    private filePath: string;
    private agents: AgentConfig[] = [];

    constructor() {
        this.filePath = path.join(process.cwd(), 'data', 'agents.json');
        // Ensure data dir exists
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        this.load();
    }

    load() {
        if (fs.existsSync(this.filePath)) {
            try {
                const data = fs.readFileSync(this.filePath, 'utf-8');
                this.agents = JSON.parse(data);
                console.log(`Loaded ${this.agents.length} agents.`);
            } catch (e) {
                console.error('Failed to load registry', e);
            }
        }

        if (this.agents.length === 0) {
            this.agents = [
                { name: 'Alice', persona: 'Friendly gardener.' },
                { name: 'Bob', persona: 'Grumpy neighbor.' },
            ];
            this.save();
        }
    }

    save() {
        fs.writeFileSync(this.filePath, JSON.stringify(this.agents, null, 2));
    }

    getAgents() {
        return this.agents;
    }
}
