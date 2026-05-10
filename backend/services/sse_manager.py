"""
In-process SSE broadcast: sensor readings pushed to all connected clients.
"""
import asyncio
import json
from typing import AsyncGenerator


class SSEManager:
    def __init__(self):
        self._queues: list[asyncio.Queue] = []

    def add_client(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=50)
        self._queues.append(q)
        return q

    def remove_client(self, q: asyncio.Queue):
        try:
            self._queues.remove(q)
        except ValueError:
            pass

    async def broadcast(self, data: dict):
        payload = f"data: {json.dumps(data)}\n\n"
        dead = []
        for q in self._queues:
            try:
                q.put_nowait(payload)
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            self.remove_client(q)

    async def stream(self, q: asyncio.Queue) -> AsyncGenerator[str, None]:
        try:
            while True:
                msg = await asyncio.wait_for(q.get(), timeout=30)
                yield msg
        except asyncio.TimeoutError:
            yield "data: {\"type\":\"ping\"}\n\n"
        except asyncio.CancelledError:
            pass


sse_manager = SSEManager()
