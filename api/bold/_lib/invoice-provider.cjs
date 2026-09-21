// Future electronic-invoicing adapter. Payment confirmation deliberately never invokes it.
const invoiceProvider = {
  async createInvoice(_order) {
    const error = new Error('Electronic invoice provider has not been configured');
    error.code = 'INVOICE_PROVIDER_NOT_CONFIGURED';
    throw error;
  }
};
module.exports = {invoiceProvider};
