import asyncio
import json
import websockets
import logging
from .config import BROKER_URL, LLM_API_URL, LLM_API_KEY, MODEL_NAME
from openai import OpenAI

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class Agent:
    def __init__(self, name, persona):
        self.name = name
        self.persona = persona
        self.ws = None
        self.input_queue = asyncio.Queue()
        self.client = OpenAI(base_url=LLM_API_URL, api_key=LLM_API_KEY)
        self.subscriptions = set()

    async def connect(self):
        try:
            self.ws = await websockets.connect(BROKER_URL)
            logger.info(f"{self.name} connected to broker")
            
            # Start listening task
            asyncio.create_task(self.listen())
            
            # Subscribe to Town Hall (mandatory, but broker might auto-sub, good to be explicit)
            await self.subscribe("town_hall")
            
        except Exception as e:
            logger.error(f"Connection failed: {e}")

    async def listen(self):
        try:
            async for message in self.ws:
                data = json.loads(message)
                if data.get('type') == 'message':
                    await self.input_queue.put(data)
                    logger.info(f"{self.name} received: {data}")
        except Exception as e:
            logger.error(f"Listen error: {e}")

    async def subscribe(self, topic):
        if self.ws:
            msg = {"type": "subscribe", "topic": topic}
            await self.ws.send(json.dumps(msg))
            self.subscriptions.add(topic)

    async def publish(self, topic, content):
        if self.ws:
            msg = {
                "type": "publish",
                "topic": topic,
                "payload": {
                    "content": content,
                    "sender": self.name
                }
            }
            await self.ws.send(json.dumps(msg))

    async def think(self):
        """
        Main loop for the agent. 
        Reads from input_queue, decides what to do using LLM, and acts.
        """
        while True:
            # Process incoming messages
            if not self.input_queue.empty():
                msg = await self.input_queue.get()
                # React to message
                response = await self.ask_llm(f"You received a message on topic {msg.get('topic')}: {msg.get('payload')}. How do you reply?")
                if response:
                    # For simplicity, reply to town_hall or the same topic
                    target_topic = msg.get('topic')
                    await self.publish(target_topic, response)
            
            await asyncio.sleep(1)

    async def ask_llm(self, prompt):
        try:
            response = self.client.chat.completions.create(
                model=MODEL_NAME,
                messages=[
                    {"role": "system", "content": f"You are {self.name}. Persona: {self.persona}"},
                    {"role": "user", "content": prompt}
                ]
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"LLM error: {e}")
            return None

    async def run(self):
        await self.connect()
        await self.think()
