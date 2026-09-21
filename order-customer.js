(() => {
  if (window.KaementoOrderCustomer) return;
  const format = amount => new Intl.NumberFormat('es-CO', {style:'currency',currency:'COP',maximumFractionDigits:0}).format(amount);
  window.KaementoOrderCustomer = {
    open(selection, prepare) {
      return new Promise(resolve => {
        const dialog = document.createElement('dialog');
        dialog.className = 'kae-order-dialog';
        dialog.setAttribute('aria-labelledby','kae-order-title');
        dialog.setAttribute('aria-describedby','kae-order-intro');
        // Only static markup; buyer data never enters innerHTML, analytics or browser storage.
        dialog.innerHTML = `<form class="kae-order-form" action="/api/bold/checkout" method="post">
          <div class="kae-order-heading"><span>KAEMENTO</span><button type="button" class="kae-order-close" aria-label="Cerrar datos del pedido">×</button></div>
          <h2 id="kae-order-title" tabindex="-1">Datos de tu pedido</h2>
          <p id="kae-order-intro">Los usaremos para confirmar tu compra y coordinar la entrega. El pago se realiza en Bold.</p>
          <p class="kae-order-summary"></p>
          <div class="kae-order-fields">
            <label class="kae-order-wide">Nombre completo o razón social<input name="name" autocomplete="name" minlength="2" maxlength="120" required></label>
            <label>Tipo de identificación<select name="documentType" required><option value="">Selecciona</option><option value="CC">Cédula de ciudadanía</option><option value="NIT">NIT</option><option value="CE">Cédula de extranjería</option><option value="PASAPORTE">Pasaporte</option><option value="PPT">PPT</option></select></label>
            <label>Identificación / NIT<input name="document" minlength="4" maxlength="30" required></label>
            <label>Correo electrónico<input name="email" type="email" autocomplete="email" maxlength="160" required></label>
            <label>Teléfono<input name="phone" type="tel" autocomplete="tel" minlength="7" maxlength="30" required></label>
            <label class="kae-order-wide">Ciudad de entrega<input name="city" autocomplete="address-level2" minlength="2" maxlength="100" required></label>
            <label class="kae-order-wide">Dirección de entrega<input name="address" autocomplete="street-address" minlength="5" maxlength="220" required></label>
          </div>
          <label class="kae-order-consent"><input type="checkbox" name="privacyAccepted" required><span>Autorizo el tratamiento de mis datos para gestionar este pedido conforme a la <a href="/politica-datos.html" target="_blank" rel="noopener">política de datos</a>.</span></label>
          <p class="kae-order-message" role="status" aria-live="polite"></p>
          <button type="submit" class="kae-order-continue">CONTINUAR AL PAGO SEGURO</button>
          <p class="kae-order-footnote">El transporte no está incluido y su valor es asumido por el cliente.</p>
        </form>`;
        const form = dialog.querySelector('form'), status = dialog.querySelector('.kae-order-message');
        dialog.querySelector('.kae-order-summary').textContent = `${selection.quantity} ${selection.quantity === 1 ? 'kit' : 'kits'} · ${window.KaementoBoldConfig.formula(selection)} · Sellador ${window.KaementoBoldConfig.sealers.get(selection.sealer)} · ${format(selection.quantity * 365500)} IVA incluido`;
        let busy = false, finished = false;
        function finish(value) {
          if (finished) return;
          finished = true;
          dialog.close();
          form.reset();
          dialog.remove();
          resolve(value);
        }
        dialog.querySelector('.kae-order-close').addEventListener('click',()=>{if (!busy) finish(null);});
        dialog.addEventListener('cancel',event=>{event.preventDefault();if (!busy) finish(null);});
        form.addEventListener('submit',async event=>{
          event.preventDefault();
          event.stopPropagation();
          if (busy || !form.reportValidity()) return;
          const values = new FormData(form), customer = {};
          for (const key of ['name','documentType','document','email','phone','city','address']) customer[key] = String(values.get(key) || '').trim();
          customer.privacyAccepted = values.has('privacyAccepted');
          busy = true;
          const controls = [...form.querySelectorAll('input, select, button')];
          controls.forEach(el=>el.disabled = true);
          form.setAttribute('aria-busy','true');
          status.textContent = 'Guardando tu pedido…';
          try { finish(await prepare(customer)); }
          catch (error) {
            // Display only fixed application errors supplied by our caller, never provider responses.
            status.textContent = error.code === 'INVALID_CUSTOMER' ? 'Revisa tus datos: identificación válida, correo, teléfono de 7 a 15 dígitos y dirección completa.' : 'No pudimos guardar tu pedido. Intenta nuevamente o contáctanos en kaemento@gmail.com.';
          } finally {
            busy = false;
            controls.forEach(el=>el.disabled = false);
            form.removeAttribute('aria-busy');
          }
        });
        document.body.appendChild(dialog);
        dialog.showModal();
        dialog.querySelector('h2').focus({preventScroll:true});
        dialog.scrollTop = 0;
      });
    }
  };
})();
