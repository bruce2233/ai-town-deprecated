
import { ChatCompletionMessageParam, ChatCompletionMessage } from 'openai/resources/chat/completions';

// --- State ---

export type AgentStatus = 'IDLE' | 'THINKING' | 'EXECUTING_TOOL';

export interface Message {
    type: string;
    topic?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload?: any;
    sender?: string;
    timestamp?: number;
}

export interface AgentConfig {
    name: string;
    persona: string;
}

export interface ToolCall {
    id: string;
    function: {
        name: string;
        arguments: string; // JSON string
    };
}

export interface ToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: (args: any) => Promise<string>;
}

export interface AgentState {
    id: string; // The agent's name
    config: AgentConfig;

    // Status of the state machine
    status: AgentStatus;

    // Working Memory for the current turn (Short-term)
    // Contains system prompt, user message, partial assistant thoughts, tool calls
    workingMemory: ChatCompletionMessageParam[];

    // Long-term history (persisted log of what happened)
    // We keep the raw messages here
    history: Message[];

    // Counters
    turnsInCurrentRequest: number;
}

// --- Events (Input to Reducer) ---

export type AgentEvent =
    // Triggered when a message arrives from the Broker
    | { type: 'MESSAGE_RECEIVED'; message: Message }

    // Triggered when LLM finishes generation
    | { type: 'LLM_COMPLETED'; response: ChatCompletionMessage }

    // Triggered when a Tool execution finishes
    | { type: 'TOOL_COMPLETED'; callId: string; result: string }

    // Triggered when an error occurs in a side effect
    | { type: 'ERROR'; error: string };

// --- Effects (Output of Reducer) ---

export type Effect =
    | { type: 'PUBLISH'; topic: string; content: string }
    | { type: 'SUBSCRIBE'; topic: string }
    // CALL_LLM: Ask Runtime to call OpenAI with these messages
    | { type: 'CALL_LLM'; messages: ChatCompletionMessageParam[]; tools?: Omit<ToolDefinition, 'execute'>[] }
    // EXEC_TOOL: Ask Runtime to execute this specific function
    | { type: 'EXECUTE_TOOL'; toolCall: ToolCall }
    | { type: 'LOG'; message: string };
