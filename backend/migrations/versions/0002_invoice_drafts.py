"""Seller cases and append-only invoice versions."""
from alembic import op
import sqlalchemy as sa
revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('cases', sa.Column('id',sa.String(36),primary_key=True),
        sa.Column('seller_id',sa.String(50),sa.ForeignKey('users.id'),nullable=False),
        sa.Column('operation_key',sa.String(128),nullable=False),
        sa.Column('current_version',sa.Integer(),nullable=False),
        sa.Column('review_state',sa.String(20),nullable=False),
        sa.Column('created_at',sa.DateTime(timezone=True),nullable=False),
        sa.UniqueConstraint('seller_id','operation_key'))
    op.create_index('ix_cases_seller_id','cases',['seller_id'])
    op.create_table('invoice_versions',
        sa.Column('case_id',sa.String(36),sa.ForeignKey('cases.id'),primary_key=True),
        sa.Column('version',sa.Integer(),primary_key=True),
        sa.Column('payload',sa.JSON(),nullable=False),
        sa.Column('content_hash',sa.String(64),nullable=False),
        sa.Column('created_at',sa.DateTime(timezone=True),nullable=False))

def downgrade():
    op.drop_table('invoice_versions')
    op.drop_index('ix_cases_seller_id',table_name='cases')
    op.drop_table('cases')
