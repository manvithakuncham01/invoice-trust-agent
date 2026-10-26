"""Local identities and opaque sessions."""
from alembic import op
import sqlalchemy as sa
revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("users", sa.Column("id",sa.String(50),primary_key=True),
        sa.Column("role",sa.String(20),nullable=False),sa.Column("seller_id",sa.String(50),nullable=True),
        sa.Column("display_name",sa.String(100),nullable=False),sa.Column("email",sa.String(254),nullable=False))
    op.create_table("sessions",sa.Column("token_hash",sa.String(64),primary_key=True),
        sa.Column("user_id",sa.String(50),sa.ForeignKey("users.id"),nullable=False),
        sa.Column("csrf_token",sa.String(64),nullable=False),sa.Column("expires_at",sa.DateTime(timezone=True),nullable=False),
        sa.Column("revoked_at",sa.DateTime(timezone=True),nullable=True))

def downgrade():
    op.drop_table("sessions")
    op.drop_table("users")
