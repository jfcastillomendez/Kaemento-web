const variants = require('../../../bold-config.js');
const UNIT_PRICE = 365500;
const DOCUMENT_TYPES = new Set(['CC', 'NIT', 'CE', 'PASAPORTE', 'PPT']);
const CUSTOMER_KEYS = ['name', 'documentType', 'document', 'email', 'phone', 'city', 'address', 'privacyAccepted'];

function clean(value, min, max) {
  if (typeof value !== 'string' || value.length > max * 2 || /[\x00-\x1f\x7f<>]/.test(value)) return null;
  const text = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  return text.length >= min && text.length <= max && !/[\x00-\x1f\x7f<>]/.test(text) ? text : null;
}
function customerData(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== CUSTOMER_KEYS.length || CUSTOMER_KEYS.some(key => !Object.hasOwn(body, key))) return null;
  const name = clean(body.name, 2, 120), city = clean(body.city, 2, 100), address = clean(body.address, 5, 220);
  const email = clean(body.email, 5, 160)?.toLowerCase();
  const documentType = clean(body.documentType, 2, 10);
  const document = clean(body.document, 4, 30)?.replace(/[.\s-]/g, '').toUpperCase();
  const phone = clean(body.phone, 7, 30)?.replace(/[\s().-]/g, '');
  if (!name || !city || !address || !email || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(email) ||
      !DOCUMENT_TYPES.has(documentType) || !/^[A-Z0-9]{4,20}$/.test(document || '') ||
      (documentType !== 'PASAPORTE' && !/^\d{5,15}$/.test(document)) || !/^\+?\d{7,15}$/.test(phone || '') || body.privacyAccepted !== true) return null;
  return {name, documentType, document, email, phone, city, address, privacyAccepted:true};
}
function checkoutInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const {customer, ...configuration} = body;
  const selection = variants.normalizeOrder(configuration), buyer = customerData(customer);
  return selection && buyer ? {selection, customer:buyer} : null;
}
function record(orderId, selection, customer, now = Date.now()) {
  const buyer = customerData(customer);
  if (!buyer) throw new Error('Invalid customer');
  return {
    schemaVersion:selection.items ? 3 : 2, orderId, createdAt:now, updatedAt:now,
    productId:'microcemento-kaemento-launch', productName:'Microcemento KAEMENTO', quantity:variants.kitCount(selection),
    colorMode:selection.colorMode, standardColor:selection.colorMode === 'standard' ? selection.color : null,
    color1:selection.color1 || null, color1Percentage:selection.percentage1 || null,
    color2:selection.color2 || null, color2Percentage:selection.percentage2 || null, sealer:selection.sealer,
    ...(selection.items ? {items:selection.items.map(item=>({...item,productId:'microcemento-kaemento-launch',productName:'Microcemento KAEMENTO',unitPrice:UNIT_PRICE,subtotal:UNIT_PRICE*item.quantity}))} : {}),
    unitPrice:UNIT_PRICE, subtotal:UNIT_PRICE * variants.kitCount(selection), total:UNIT_PRICE * variants.kitCount(selection), currency:'COP',
    customerName:buyer.name, customerDocumentType:buyer.documentType, customerDocument:buyer.document,
    customerEmail:buyer.email, customerPhone:buyer.phone, shippingCity:buyer.city, shippingAddress:buyer.address,
    privacyAcceptedAt:now, privacyPolicyUrl:'/politica-datos.html',
    orderStatus:'created', paymentStatus:'pending', fulfillmentStatus:'pending', invoiceStatus:'pending',
    invoiceNumber:null, cufe:null, invoicePdfUrl:null, invoiceXmlUrl:null,
    emailStatus:'pending', paidAt:null, boldPaymentId:null, boldStatus:null, paymentMethod:null,
    source:'kaemento-web', promotion:'microcemento_kaemento_launch_2026'
  };
}
module.exports = {UNIT_PRICE, customerData, checkoutInput, record};
