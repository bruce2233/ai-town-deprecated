import asyncio
from sdk.agent import Agent

async def main():
    alice = Agent("Alice", "A friendly resident who loves gardening.")
    bob = Agent("Bob", "A grumpy neighbor who complains about noise.")
    
    # Run them concurrently
    await asyncio.gather(
        alice.run(),
        bob.run()
    )

if __name__ == "__main__":
    asyncio.run(main())
