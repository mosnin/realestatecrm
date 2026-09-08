import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const {ignoreCommand}=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
for (const [environment,branch,expected] of [['preview','codex/autonomous-product-rebuild',1],['preview','other',0],['production','main',1]]) {
 test(`build decision for ${environment}/${branch}`,()=>{
  const result=spawnSync('/bin/sh',['-c',ignoreCommand],{env:{...process.env,VERCEL_ENV:environment,VERCEL_GIT_COMMIT_REF:branch}});
  assert.equal(result.status,expected);
 });
}
