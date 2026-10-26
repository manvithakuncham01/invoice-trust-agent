from typing import Protocol
from pydantic import BaseModel, ConfigDict

class AgentReply(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str
    missing_fields: list[str]
    provider: str = "fake"

class AgentProvider(Protocol):
    def clarify(self, invoice: dict) -> AgentReply: ...

class FakeProvider:
    """Deterministic test adapter, not a trained model or production assessment."""
    def clarify(self, invoice: dict) -> AgentReply:
        scope = str(invoice.get("description", "")).strip()
        return AgentReply(
            message="What service does this invoice cover?" if not scope else "What supports the buyer's agreement to these terms?",
            missing_fields=["service_scope"] if not scope else ["buyer_agreement"],
        )

def create_provider(name: str = "fake") -> AgentProvider:
    if name != "fake":
        raise ValueError("Provider is not implemented")
    return FakeProvider()
