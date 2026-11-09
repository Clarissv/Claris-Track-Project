import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectPlan} from './audit-plans.mjs';
const report=JSON.parse(fs.readFileSync(new URL('plan-comparison.json',import.meta.url)));
test('pit comparison agrees with the successful Monza prefix and RBR placement order',()=>{
  assert.equal(report.knownMonzaEvidence.pitRoadPartsInSuccessfulPrefix,report.knownMonzaEvidence.successfulTrackPrefix-report.monza.groups.pitLane.firstPart+1);
  assert.equal(report.redBullRing.groups.pitLane.parts,314);assert.equal(report.monza.groups.pitLane.parts,346);
  assert.equal(report.redBullRing.groups.terrain.firstPart,6456);assert(report.redBullRing.groups.pitMarkings.lastPart<report.redBullRing.groups.terrain.firstPart);
  assert.deepEqual(report.redBullRing.invalid,[]);assert.deepEqual(report.monza.invalid,[]);
  assert(Object.values(report.sharedRuntime).every(Boolean));
});
test('save geometry audit catches non-finite values, invalid sizes and rotation bases',()=>{
  const p=[0,0,0,12,.5,10,1,1,0,0,0,1,0],plan={meta:{palette:[{name:'asphalt'}],groups:{pitLane:[0]}},parts:[p]};
  assert.equal(inspectPlan(plan).invalid.length,0);
  for(const [index,value] of [[1,NaN],[3,2049],[7,.5]]){const altered=structuredClone(plan);altered.parts[0][index]=value;assert.equal(inspectPlan(altered).invalid.length,1);}
});
