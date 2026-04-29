import { jest } from '@jest/globals';

const WebSocket = jest.fn(() => ({
    on: jest.fn(),
    send: jest.fn(),
    close: jest.fn(),
    terminate: jest.fn(),
}));

export default WebSocket;
