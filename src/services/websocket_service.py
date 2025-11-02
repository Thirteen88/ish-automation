"""
WebSocket service for real-time communication
"""
import asyncio
import json
import logging
from typing import Dict, List, Set, Optional
from datetime import datetime
import uuid
from fastapi import WebSocket, WebSocketDisconnect
from pydantic import BaseModel

logger = logging.getLogger(__name__)

class WebSocketMessage(BaseModel):
    """WebSocket message model"""
    type: str
    data: dict
    timestamp: str
    message_id: str = None

class ConnectionManager:
    """Manages WebSocket connections and message broadcasting"""

    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.connection_metadata: Dict[str, dict] = {}
        self.subscriptions: Dict[str, Set[str]] = {}  # topic -> connection_ids

    async def connect(self, websocket: WebSocket, connection_id: str = None) -> str:
        """Accept and register WebSocket connection"""
        await websocket.accept()

        if connection_id is None:
            connection_id = str(uuid.uuid4())

        self.active_connections[connection_id] = websocket
        self.connection_metadata[connection_id] = {
            "connected_at": datetime.utcnow(),
            "last_ping": datetime.utcnow(),
            "subscriptions": set()
        }

        logger.info(f"WebSocket connection established: {connection_id}")
        return connection_id

    def disconnect(self, connection_id: str):
        """Remove WebSocket connection"""
        if connection_id in self.active_connections:
            del self.active_connections[connection_id]

        if connection_id in self.connection_metadata:
            # Remove from all subscriptions
            subscriptions = self.connection_metadata[connection_id]["subscriptions"]
            for topic in subscriptions:
                if topic in self.subscriptions:
                    self.subscriptions[topic].discard(connection_id)
                    if not self.subscriptions[topic]:
                        del self.subscriptions[topic]

            del self.connection_metadata[connection_id]

        logger.info(f"WebSocket connection closed: {connection_id}")

    async def send_personal_message(self, message: dict, connection_id: str):
        """Send message to specific connection"""
        if connection_id in self.active_connections:
            websocket = self.active_connections[connection_id]
            try:
                await websocket.send_text(json.dumps(message, default=str))
                return True
            except Exception as e:
                logger.error(f"Failed to send message to {connection_id}: {e}")
                self.disconnect(connection_id)
                return False
        return False

    async def broadcast_to_topic(self, message: dict, topic: str):
        """Broadcast message to all connections subscribed to a topic"""
        if topic not in self.subscriptions:
            return

        disconnected = []
        for connection_id in self.subscriptions[topic].copy():
            if not await self.send_personal_message(message, connection_id):
                disconnected.append(connection_id)

        # Clean up disconnected connections
        for connection_id in disconnected:
            self.disconnect(connection_id)

    async def broadcast_to_all(self, message: dict):
        """Broadcast message to all active connections"""
        disconnected = []
        for connection_id in self.active_connections.keys():
            if not await self.send_personal_message(message, connection_id):
                disconnected.append(connection_id)

        # Clean up disconnected connections
        for connection_id in disconnected:
            self.disconnect(connection_id)

    def subscribe_to_topic(self, connection_id: str, topic: str):
        """Subscribe connection to a topic"""
        if connection_id not in self.connection_metadata:
            return False

        self.connection_metadata[connection_id]["subscriptions"].add(topic)

        if topic not in self.subscriptions:
            self.subscriptions[topic] = set()
        self.subscriptions[topic].add(connection_id)

        logger.info(f"Connection {connection_id} subscribed to topic: {topic}")
        return True

    def unsubscribe_from_topic(self, connection_id: str, topic: str):
        """Unsubscribe connection from a topic"""
        if connection_id not in self.connection_metadata:
            return False

        self.connection_metadata[connection_id]["subscriptions"].discard(topic)

        if topic in self.subscriptions:
            self.subscriptions[topic].discard(connection_id)
            if not self.subscriptions[topic]:
                del self.subscriptions[topic]

        logger.info(f"Connection {connection_id} unsubscribed from topic: {topic}")
        return True

    def get_connection_info(self, connection_id: str) -> Optional[dict]:
        """Get connection metadata"""
        return self.connection_metadata.get(connection_id)

    def get_all_connections(self) -> dict:
        """Get all connection metadata"""
        return self.connection_metadata.copy()

    def get_topic_stats(self) -> dict:
        """Get subscription statistics"""
        return {
            topic: len(connections)
            for topic, connections in self.subscriptions.items()
        }

class WebSocketService:
    """High-level WebSocket service for real-time updates"""

    def __init__(self, connection_manager: ConnectionManager):
        self.manager = connection_manager

    async def handle_connection(self, websocket: WebSocket, connection_id: str = None) -> str:
        """Handle new WebSocket connection with setup"""
        connection_id = await self.manager.connect(websocket, connection_id)

        # Send welcome message
        welcome_message = WebSocketMessage(
            type="connection_established",
            data={
                "connection_id": connection_id,
                "server_time": datetime.utcnow().isoformat(),
                "available_topics": [
                    "device_status",
                    "automation_logs",
                    "perplexity_updates",
                    "ai_responses",
                    "system_metrics"
                ]
            },
            timestamp=datetime.utcnow().isoformat(),
            message_id=str(uuid.uuid4())
        )

        await self.manager.send_personal_message(welcome_message.dict(), connection_id)
        return connection_id

    async def broadcast_device_status(self, device_status: dict):
        """Broadcast device status updates"""
        message = WebSocketMessage(
            type="device_status_update",
            data=device_status,
            timestamp=datetime.utcnow().isoformat(),
            message_id=str(uuid.uuid4())
        )

        await self.manager.broadcast_to_topic(message.dict(), "device_status")

    async def broadcast_automation_log(self, log_entry: dict):
        """Broadcast automation log updates"""
        message = WebSocketMessage(
            type="automation_log",
            data=log_entry,
            timestamp=datetime.utcnow().isoformat(),
            message_id=str(uuid.uuid4())
        )

        await self.manager.broadcast_to_topic(message.dict(), "automation_logs")

    async def broadcast_perplexity_update(self, update_data: dict):
        """Broadcast Perplexity app updates"""
        message = WebSocketMessage(
            type="perplexity_update",
            data=update_data,
            timestamp=datetime.utcnow().isoformat(),
            message_id=str(uuid.uuid4())
        )

        await self.manager.broadcast_to_topic(message.dict(), "perplexity_updates")

    async def broadcast_ai_response(self, response_data: dict):
        """Broadcast AI response updates"""
        message = WebSocketMessage(
            type="ai_response",
            data=response_data,
            timestamp=datetime.utcnow().isoformat(),
            message_id=str(uuid.uuid4())
        )

        await self.manager.broadcast_to_topic(message.dict(), "ai_responses")

    async def broadcast_system_metrics(self, metrics: dict):
        """Broadcast system performance metrics"""
        message = WebSocketMessage(
            type="system_metrics",
            data=metrics,
            timestamp=datetime.utcnow().isoformat(),
            message_id=str(uuid.uuid4())
        )

        await self.manager.broadcast_to_topic(message.dict(), "system_metrics")

    async def broadcast_event(self, event_type: str, event_data: dict):
        """Broadcast generic event updates"""
        message = WebSocketMessage(
            type=event_type,
            data=event_data,
            timestamp=datetime.utcnow().isoformat(),
            message_id=str(uuid.uuid4())
        )

        await self.manager.broadcast(message.dict())

    async def broadcast_session_update(self, session_data: dict):
        """Broadcast automation session updates"""
        message = WebSocketMessage(
            type="session_update",
            data=session_data,
            timestamp=datetime.utcnow().isoformat(),
            message_id=str(uuid.uuid4())
        )

        await self.manager.broadcast_to_topic(message.dict(), "automation_logs")

    async def handle_client_message(self, message: dict, connection_id: str):
        """Handle incoming message from client"""
        message_type = message.get("type")

        if message_type == "subscribe":
            topic = message.get("topic")
            if topic:
                self.manager.subscribe_to_topic(connection_id, topic)
                response = WebSocketMessage(
                    type="subscription_confirmed",
                    data={"topic": topic},
                    timestamp=datetime.utcnow().isoformat(),
                    message_id=str(uuid.uuid4())
                )
                await self.manager.send_personal_message(response.dict(), connection_id)

        elif message_type == "unsubscribe":
            topic = message.get("topic")
            if topic:
                self.manager.unsubscribe_from_topic(connection_id, topic)
                response = WebSocketMessage(
                    type="unsubscription_confirmed",
                    data={"topic": topic},
                    timestamp=datetime.utcnow().isoformat(),
                    message_id=str(uuid.uuid4())
                )
                await self.manager.send_personal_message(response.dict(), connection_id)

        elif message_type == "ping":
            # Update last ping time
            if connection_id in self.manager.connection_metadata:
                self.manager.connection_metadata[connection_id]["last_ping"] = datetime.utcnow()

            response = WebSocketMessage(
                type="pong",
                data={"server_time": datetime.utcnow().isoformat()},
                timestamp=datetime.utcnow().isoformat(),
                message_id=str(uuid.uuid4())
            )
            await self.manager.send_personal_message(response.dict(), connection_id)

        elif message_type == "get_stats":
            stats = {
                "active_connections": len(self.manager.active_connections),
                "topic_stats": self.manager.get_topic_stats(),
                "connection_info": self.manager.get_connection_info(connection_id)
            }

            response = WebSocketMessage(
                type="stats_response",
                data=stats,
                timestamp=datetime.utcnow().isoformat(),
                message_id=str(uuid.uuid4())
            )
            await self.manager.send_personal_message(response.dict(), connection_id)

# Global connection manager and WebSocket service
connection_manager = ConnectionManager()
websocket_service = WebSocketService(connection_manager)