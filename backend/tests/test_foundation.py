from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.db import Base, build_engine
from app.models import SessionRecord, User
from app.main import create_app
from app.settings import Settings
from app.seed import seed
from app.agent.provider import FakeProvider

@pytest.fixture
def runtime(tmp_path):
    config = Settings(_env_file=None, database_url=f"sqlite:///{tmp_path/'test.db'}", demo_mode=True)
    engine = build_engine(config.database_url)
    Base.metadata.create_all(engine)
    seed(engine, config)
    app = create_app(config, engine)
    with TestClient(app) as client:
        yield client, app, config
    engine.dispose()

def login(client, who="seller-a"):
    response = client.post("/api/demo/session",json={"demo_user_id":who})
    assert response.status_code==200
    return response.json()

def test_health_and_readiness(runtime):
    c,_,_=runtime
    assert c.get('/health').json()['status']=='ok'
    assert c.get('/ready').status_code==200
    assert 'paypal_client_secret' not in c.get('/api/config').text

def test_readiness_requires_migrations(tmp_path):
    config=Settings(_env_file=None,database_url=f"sqlite:///{tmp_path/'empty.db'}")
    app=create_app(config)
    with TestClient(app) as c:
        assert c.get('/health').status_code==200
        assert c.get('/ready').status_code==503
    app.state.engine.dispose()

def test_seed_idempotent(runtime):
    _,app,config=runtime
    seed(app.state.engine,config)
    with app.state.session_factory() as db:
        assert len(list(db.scalars(select(User))))==5

def test_anonymous_and_role_boundary(runtime):
    c,_,_=runtime
    assert c.get('/api/seller/workspace').status_code==401
    login(c)
    assert c.get('/api/seller/workspace').status_code==200
    assert c.get('/api/reviewer/workspace').status_code==403
    login(c,'reviewer-one')
    assert c.get('/api/reviewer/workspace').status_code==200
    assert c.get('/api/seller/workspace').status_code==403

def test_buyer_boundary(runtime):
    c,_,_=runtime
    login(c,'buyer-one')
    assert c.get('/api/buyer/workspace').status_code==200
    assert c.get('/api/reviewer/workspace').status_code==403

def test_demo_disabled_and_no_role_body(runtime):
    c,app,_=runtime
    app.state.config.demo_mode=False
    assert c.post('/api/demo/session',json={'demo_user_id':'reviewer-one'}).status_code==403
    assert c.get('/api/demo/users').status_code==403
    app.state.config.demo_mode=True
    assert c.post('/api/demo/session',json={'demo_user_id':'seller-a','role':'REVIEWER'}).status_code==422
    assert c.post('/api/demo/session',json={'demo_user_id':'arbitrary-user'}).status_code==422

def test_session_cookie_and_hash(runtime):
    c,app,_=runtime
    res=c.post('/api/demo/session',json={'demo_user_id':'seller-a'})
    assert 'HttpOnly' in res.headers['set-cookie']
    assert 'SameSite=lax' in res.headers['set-cookie']
    token=c.cookies.get('ita_session')
    assert token not in res.text
    with app.state.session_factory() as db:
        assert db.get(SessionRecord, token) is None
        assert len(list(db.scalars(select(SessionRecord))))==1

def test_expired_and_revoked_sessions(runtime):
    c,app,_=runtime
    login(c)
    with app.state.session_factory() as db:
        rec=db.scalar(select(SessionRecord))
        rec.expires_at=datetime.now(timezone.utc)-timedelta(seconds=1)
        db.commit()
    assert c.get('/api/auth/session').status_code==401
    new=login(c)
    assert c.post('/api/auth/logout',headers={'X-CSRF-Token':new['csrf_token']}).status_code==204
    assert c.get('/api/auth/session').status_code==401

def test_csrf_and_origin(runtime):
    c,_,_=runtime
    state=login(c)
    assert c.post('/api/auth/logout').status_code==403
    assert c.post('/api/auth/logout',headers={'X-CSRF-Token':state['csrf_token'],'Origin':'https://evil.example'}).status_code==403
    assert c.post('/api/demo/session',json={'demo_user_id':'reviewer-one'},headers={'Origin':'https://evil.example'}).status_code==403
    assert c.post('/api/demo/session',data='demo_user_id=seller-a').status_code==415

def test_rotation_revokes_previous(runtime):
    c,app,_=runtime
    login(c)
    login(c,'seller-b')
    with app.state.session_factory() as db:
        assert len([x for x in db.scalars(select(SessionRecord)) if x.revoked_at is not None])==1
    assert c.get('/api/auth/session').json()['user']['id']=='seller-b'

def test_fake_provider_has_no_send_permission():
    provider=FakeProvider()
    assert provider.clarify({}).missing_fields==['service_scope']
    assert provider.clarify({'description':'Website'}).missing_fields==['buyer_agreement']
    assert 'can_send' not in provider.clarify({}).model_dump()

def test_deployment_rejects_demo_and_insecure_cookies():
    with pytest.raises(ValueError):
        Settings(_env_file=None,app_env='production',demo_mode=True)
    with pytest.raises(ValueError):
        Settings(_env_file=None,app_env='production',demo_mode=False,cookie_secure=False)
