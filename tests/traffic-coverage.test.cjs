const {test}=require('node:test');
const assert=require('node:assert/strict');
const {estimate}=require('../pintura-rendimiento.js');

test('70 metros de franja de 10 cm equivalen a 7 m² y un galón',()=>{
  assert.deepEqual(estimate('70'),{gallons:1,area:7,quantity:70});
  assert.deepEqual(estimate('7','area'),{gallons:1,area:7,quantity:7});
});
test('redondea hacia arriba sin galones adicionales en límites exactos',()=>{
  for(const [meters,gallons] of [['0',0],['0.01',1],['69.99',1],['70',1],['70.01',2],['140',2],['140.01',3],['2100',30]])assert.equal(estimate(meters).gallons,gallons);
  for(const [area,gallons] of [['6.99',1],['7',1],['7.01',2],['14',2],['14.01',3]])assert.equal(estimate(area,'area').gallons,gallons);
});
test('rechaza medidas vacías, negativas, inválidas o fuera de precisión segura',()=>{
  for(const value of ['',null,undefined,'-1','abc','Infinity','NaN','70.001','1e4','9007199254740991'])assert.equal(estimate(value),null);
  assert.equal(estimate('70','desconocido'),null);
});
