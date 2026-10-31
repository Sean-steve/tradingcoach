import test from "node:test";
import assert from "node:assert/strict";
import { splitAllocationCents } from "../src/lib/money-allocation.ts";
const cents=(n)=>Math.round(n*100);

test("F1: allocations sum exactly to the source cent amount",()=>{
  for(const amount of [0,0.01,0.02,5.01,100.03,100000.57]){
    const allocations=splitAllocationCents(amount,[30,40,20,10]);
    assert.equal(allocations.reduce((s,x)=>s+cents(x),0),cents(amount));
    assert.equal(allocations.length,4);
    assert.ok(allocations.every(x=>x>=0));
  }
});
test("F1: ties allocated deterministically in canonical bucket order",()=>{
  assert.deepEqual(splitAllocationCents(0.01,[25,25,25,25]),[0.01,0,0,0]);
});
test("F1: no invalid precision, negative amounts, infinity or invalid weights",()=>{
  for(const amount of [-1,1.001,Number.POSITIVE_INFINITY,NaN])
    assert.throws(()=>splitAllocationCents(amount,[50,50]));
  for(const weights of [[30,30],[30,NaN,70],[-1,101],[]])
    assert.throws(()=>splitAllocationCents(100,weights));
});
