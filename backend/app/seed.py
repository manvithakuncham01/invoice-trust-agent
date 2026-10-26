from sqlalchemy.orm import Session
from .settings import get_settings
from .db import build_engine
from .models import User

DEMO_USERS = [
    {"id": "seller-a", "role": "SELLER", "seller_id": "seller-a", "display_name": "Maya · seller A", "email": "seller-a@example.test"},
    {"id": "seller-b", "role": "SELLER", "seller_id": "seller-b", "display_name": "Leo · seller B", "email": "seller-b@example.test"},
    {"id": "buyer-one", "role": "BUYER", "seller_id": None, "display_name": "Daniel · demo buyer", "email": "buyer-one@example.test"},
    {"id": "buyer-two", "role": "BUYER", "seller_id": None, "display_name": "Priya · demo buyer", "email": "buyer-two@example.test"},
    {"id": "reviewer-one", "role": "REVIEWER", "seller_id": None, "display_name": "Demo reviewer", "email": "reviewer@example.test"},
]

def seed(engine, settings):
    if settings.app_env != "local" or not settings.demo_mode:
        raise RuntimeError("Seeding requires APP_ENV=local and DEMO_MODE=true")
    with Session(engine) as db:
        for row in DEMO_USERS:
            if db.get(User, row["id"]) is None:
                db.add(User(**row))
        db.commit()

if __name__ == "__main__":
    config = get_settings()
    seed(build_engine(config.database_url), config)
    print("Demo identities ready. Re-running does not duplicate users.")
