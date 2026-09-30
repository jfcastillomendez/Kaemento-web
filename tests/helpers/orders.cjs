// Synthetic test data; not an actual customer and never delivered to an external provider.
const customer = {name:'Cliente de Prueba',documentType:'CC',document:'1234567890',
  email:'cliente@example.invalid',phone:'+573001234567',city:'Bogotá',address:'Calle de Prueba 123',privacyAccepted:true};
// Adapt existing save-order fakes; real stores always exercise atomic claimCheckout.
function checkoutStore(store={async saveOrder(){}}) {
  return {...store,claimCheckout:store.claimCheckout || (async (_id,record)=>{await store.saveOrder(record);return {status:'created',order:record};})};
}
module.exports = {customer, checkoutStore};
