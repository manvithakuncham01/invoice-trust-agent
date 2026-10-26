from functools import lru_cache
from pathlib import Path
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")
    app_env: str = "local"
    demo_mode: bool = False
    app_secret: str = "local-only-change-before-deployment"
    database_url: str = "sqlite:///./invoice_trust.db"
    allowed_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    session_ttl_minutes: int = 60
    cookie_secure: bool = False
    llm_provider: str = "fake"
    llm_api_key: str = ""
    paypal_base_url: str = "https://api-m.sandbox.paypal.com"
    paypal_client_id: str = ""
    paypal_client_secret: str = ""

    @model_validator(mode="after")
    def validate_deployment(self):
        if self.session_ttl_minutes <= 0:
            raise ValueError("Session lifetime must be positive")
        if self.llm_provider != "fake":
            raise ValueError("Only the fake provider is implemented in ITA-02")
        if self.app_env != "local":
            if self.demo_mode:
                raise ValueError("Demo mode is restricted to the local environment")
            if not self.cookie_secure:
                raise ValueError("HTTPS secure cookies are required outside local mode")
            if len(self.app_secret) < 32 or self.app_secret.startswith(("local-only", "replace-with")):
                raise ValueError("Set a private random APP_SECRET before deployment")
        return self

@lru_cache
def get_settings() -> Settings:
    return Settings()
