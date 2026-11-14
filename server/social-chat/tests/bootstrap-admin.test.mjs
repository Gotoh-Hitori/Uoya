import test from 'node:test';
import assert from 'node:assert/strict';
import {createDB} from '../src/db.mjs';
import {initializeAdmin} from '../src/bootstrap-admin.mjs';
test('production empty database requires owner credentials before registration becomes reachable',()=>{
 const db=createDB(':memory:');try{
  assert.throws(()=>initializeAdmin(db,{NODE_ENV:'production'}),/BOOTSTRAP_ADMIN/);
  assert.throws(()=>initializeAdmin(db,{NODE_ENV:'production',BOOTSTRAP_ADMIN_USERNAME:'owner',BOOTSTRAP_ADMIN_PASSWORD:'short'}),/BOOTSTRAP_ADMIN/);
  assert.equal(db.userCount(),0);
  initializeAdmin(db,{NODE_ENV:'production',BOOTSTRAP_ADMIN_USERNAME:'owner',BOOTSTRAP_ADMIN_PASSWORD:'test-only-password-123'});
  assert.equal(db.validateLogin('owner','test-only-password-123').role,'admin');
  assert.equal(db.register({username:'visitor',displayName:'Visitor',password:'visitor-password'}).role,'member');
  initializeAdmin(db,{NODE_ENV:'production',BOOTSTRAP_ADMIN_USERNAME:'replacement',BOOTSTRAP_ADMIN_PASSWORD:'replacement-password'});
  assert.equal(db.userCount(),2);assert.equal(db.validateLogin('replacement','replacement-password'),null);
 }finally{db.close();}
});
