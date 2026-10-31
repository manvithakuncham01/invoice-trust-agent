import copy
import pytest
from sqlalchemy import select, func, event
from sqlalchemy.exc import SQLAlchemyError
from app.models import InvoiceCase, InvoiceVersion
from test_foundation import runtime, login
BODY={'buyer_email':'buyer@example.com','currency':'USD','items':[{'name':'Website design','description':'Homepage','quantity':1,'unit_price':'200.00'}],'note':''}
def post(c,t,b=None,key='save-1'):
    return c.post('/api/invoices',json=b or BODY,headers={'X-CSRF-Token':t,'Idempotency-Key':key})
def test_save_read_list_retry_and_conflict(runtime):
    c,app,_=runtime;t=login(c)['csrf_token'];r=post(c,t);assert r.status_code==201,r.text
    d=r.json();assert d['total']=='200.00' and d['version']==1 and d['paypal_invoice_id'] is None
    assert c.get('/api/invoices/'+d['case_id']).json()==d
    assert c.get('/api/seller/workspace').json()['invoices'][0]['case_id']==d['case_id']
    r=post(c,t);assert r.status_code==200 and r.json()==d
    b=copy.deepcopy(BODY);b['note']='Different';assert post(c,t,b).status_code==409
    with app.state.session_factory() as db:
        assert db.scalar(select(func.count()).select_from(InvoiceCase))==1
        assert db.scalar(select(func.count()).select_from(InvoiceVersion))==1

def test_exact_decimal_and_optional_fields(runtime):
    c,_,_=runtime;t=login(c)['csrf_token'];b=copy.deepcopy(BODY);b.pop('note')
    b['items']=[{'name':' A ','quantity':3,'unit_price':'0.10'},{'name':'B','quantity':1,'unit_price':'0.20'}]
    d=post(c,t,b).json();assert d['total']=='0.50' and d['items'][0]['line_total']=='0.30'
    assert d['items'][0]['name']=='A' and d['items'][0]['description']=='' and d['note']==''

@pytest.mark.parametrize('field,value',[('buyer_email','bad'),('currency','EUR'),('items',[]),('note','x'*2001),('seller_id','seller-b'),('total','1.00')])
def test_invalid_invoice(runtime,field,value):
    c,_,_=runtime;t=login(c)['csrf_token'];b=copy.deepcopy(BODY);b[field]=value
    r=post(c,t,b);assert r.status_code==422;assert field in r.json()['error']['fields']

@pytest.mark.parametrize('field,value',[('name','  '),('name','x'*201),('quantity',0),('quantity',-1),('quantity',1.5),('quantity',True),('unit_price','0'),('unit_price','NaN'),('unit_price','Infinity'),('unit_price','1.234'),('unit_price',1.2),('description','x'*2001)])
def test_invalid_items(runtime,field,value):
    c,_,_=runtime;t=login(c)['csrf_token'];b=copy.deepcopy(BODY);b['items'][0][field]=value
    r=post(c,t,b);assert r.status_code==422;assert 'items.0.'+field in r.json()['error']['fields']

def test_ownership_roles_auth_csrf_and_key(runtime):
    c,_,_=runtime;assert post(c,'').status_code==401
    t=login(c)['csrf_token'];assert post(c,'bad').status_code==403
    assert c.post('/api/invoices',json=BODY,headers={'X-CSRF-Token':t}).status_code==422
    d=post(c,t).json();t=login(c,'seller-b')['csrf_token']
    assert c.get('/api/invoices/'+d['case_id']).status_code==404
    assert c.get('/api/seller/workspace').json()['invoices']==[]
    assert post(c,t).status_code==201
    for role in ['buyer-one','reviewer-one']:
        t=login(c,role)['csrf_token'];assert post(c,t).status_code==403

def test_failure_atomicity_and_retry(runtime):
    c,app,_=runtime;t=login(c)['csrf_token']
    def fail(mapper,connection,target):raise SQLAlchemyError('private database detail')
    event.listen(InvoiceVersion,'before_insert',fail)
    try:
        r=post(c,t);assert r.status_code==503 and 'private database detail' not in r.text
    finally:event.remove(InvoiceVersion,'before_insert',fail)
    with app.state.session_factory() as db:
        assert db.scalar(select(func.count()).select_from(InvoiceCase))==0
        assert db.scalar(select(func.count()).select_from(InvoiceVersion))==0
    assert post(c,t).status_code==201

def test_no_edit_endpoint(runtime):
    c,_,_=runtime;t=login(c)['csrf_token'];case=post(c,t).json()['case_id']
    assert c.put('/api/invoices/'+case,json=BODY,headers={'X-CSRF-Token':t}).status_code==405
    assert c.get('/api/invoices/'+case).json()['version']==1

@pytest.mark.parametrize('field,value',[('quantity',1000001),('unit_price','1000000000.00')])
def test_item_upper_bounds(runtime,field,value):
    c,_,_=runtime;t=login(c)['csrf_token'];b=copy.deepcopy(BODY);b['items'][0][field]=value
    assert post(c,t,b).status_code==422

def test_item_count_limit_and_unknown_case(runtime):
    c,_,_=runtime;t=login(c)['csrf_token'];b=copy.deepcopy(BODY);b['items']=b['items']*101
    assert post(c,t,b).status_code==422
    assert c.get('/api/invoices/does-not-exist').status_code==404

def test_valid_boundary_lengths_and_exact_large_total(runtime):
    c,_,_=runtime;t=login(c)['csrf_token'];b=copy.deepcopy(BODY)
    b['items'][0].update(name='x'*200,description='x'*2000,quantity=1000000,unit_price='999999999.99');b['note']='x'*2000
    r=post(c,t,b);assert r.status_code==201,r.text
    assert r.json()['total']=='999999999990000.00'
