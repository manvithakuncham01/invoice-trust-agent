from alembic import context
from app.settings import get_settings
from app.db import Base, build_engine
from app import models  # register metadata

target_metadata = Base.metadata
config = context.config
url = get_settings().database_url
if context.is_offline_mode():
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    engine = build_engine(url)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
