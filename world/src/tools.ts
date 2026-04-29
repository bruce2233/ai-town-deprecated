import { ToolDefinition } from './types.js';

export const TOOLS: ToolDefinition[] = [
    {
        name: 'broadcast_message',
        description: 'Broadcast a message to the town hall via the Admin.',
        parameters: {
            type: 'object',
            properties: {
                message: { type: 'string', description: 'The message content' },
            },
            required: ['message'],
        },
        // Note: The execution logic is technically a "Side Effect" that might assume Runtime capabilities.
        // For pure functional design, tools should arguably return values that trigger Effects.
        // But for this hybrid approach, we will allow tools to be async functions called by the Runtime.
        // However, since this tool just PUBLISHES, we might want to handle it specially?
        // For now, let's keep it simple: It returns a string that the LLM sees.
        execute: async ({ message }) => {
            return `Request to broadcast "${message}" has been sent (simulated).`;
        },
    },
];

export function getToolByName(name: string): ToolDefinition | undefined {
    return TOOLS.find(t => t.name === name);
}
